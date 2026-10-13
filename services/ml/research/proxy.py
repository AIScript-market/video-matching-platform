"""대리 검증 (docs/hit-features.md 2단계): 공공 저작물 소설로 "같은 작가의 작품 중 영상화된 작품은 무엇이 다른가".

데이터
- 목록: 위키데이터(CC0). 구텐베르크 번호가 있는 문학 작품, 저자 1963년 전 사망, 영화·드라마로 각색된 횟수.
- 본문: 프로젝트 구텐베르크. 사이트를 자동으로 긁지 말라는 정책이 있어 미러에서 2초 간격으로 받는다.
- 둘 다 research/data/proxy/에 두고 저장소에 넣지 않는다.

분석
- 영상화된 작품과 안 된 작품이 모두 있는 작가만 쓴다. 비교는 언제나 같은 작가 안에서 한다.
- 요소마다 AUC와 순열 검정(작가 안에서 섞기), 홀름 보정.
- 요소 전체 + 벡터 모델을 "작가 빼고 맞히기"로 본다.
"""

from __future__ import annotations

import csv
import json
import math
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from hitmodel.embedders import Embedder
from hitmodel.model import choose_lambda, fit_model

from .feasibility import bootstrap_auc, channel_folds, grouped_auc, grouped_lift, out_of_fold, permute_within
from .story_features import STORY_FEATURES, VERSION, feature_matrix, strip_gutenberg

USER_AGENT = "vmp-research/0.1 (https://github.com/zerohoon123/video-matching-platform)"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
DEFAULT_MIRROR = "https://aleph.pglaf.org"
# 한국에서 보호 기간이 끝난 범위: 1962년까지 사망한 저자
MAX_AUTHOR_DEATH_YEAR = 1962
MANIFEST_COLUMNS = ["work", "title", "author", "author_name", "died", "gutenberg", "adaptations", "file"]

SPARQL = """
SELECT ?work ?title ?author ?authorName (YEAR(MAX(?died)) AS ?diedYear) (SAMPLE(?g) AS ?gutenberg) (COUNT(DISTINCT ?ad) AS ?adaptations) WHERE {
  VALUES ?kind { wd:Q7725634 wd:Q8261 wd:Q49084 wd:Q25379 }
  ?work wdt:P31 ?kind ; wdt:P2034 ?g ; wdt:P50 ?author .
  ?author wdt:P570 ?died .
  FILTER(YEAR(?died) <= %d)
  OPTIONAL { ?work wdt:P407 ?lang . }
  FILTER(!BOUND(?lang) || ?lang = wd:Q1860)
  OPTIONAL {
    VALUES ?adKind { wd:Q11424 wd:Q5398426 wd:Q506240 wd:Q1259759 }
    ?ad wdt:P144 ?work ; wdt:P31 ?adKind .
  }
  ?work rdfs:label ?title . FILTER(LANG(?title) = "en")
  ?author rdfs:label ?authorName . FILTER(LANG(?authorName) = "en")
}
GROUP BY ?work ?title ?author ?authorName
"""


@dataclass
class ProxyWork:
    work: str
    title: str
    author: str
    author_name: str
    died: int
    gutenberg: str
    adaptations: int
    file: str = ""

    @property
    def adapted(self) -> bool:
        return self.adaptations > 0


# ---------- 목록 ----------


def _qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def parse_sparql(payload: dict) -> list[ProxyWork]:
    out: dict[str, ProxyWork] = {}
    for b in payload["results"]["bindings"]:
        work = _qid(b["work"]["value"])
        g = b["gutenberg"]["value"]
        if not g.isdigit():
            continue
        w = ProxyWork(
            work=work,
            title=b["title"]["value"],
            author=_qid(b["author"]["value"]),
            author_name=b["authorName"]["value"],
            died=int(b["diedYear"]["value"]),
            gutenberg=g,
            adaptations=int(b["adaptations"]["value"]),
            file=f"pg{g}.txt",
        )
        # 공저 작품은 첫 저자 하나로만 센다 (작가 안 비교가 겹치지 않게)
        out.setdefault(work, w)
    return sorted(out.values(), key=lambda w: (w.author, w.work))


def fetch_manifest(max_death_year: int = MAX_AUTHOR_DEATH_YEAR, timeout: float = 120.0) -> list[ProxyWork]:
    query = SPARQL % max_death_year
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return parse_sparql(json.load(r))


def informative(works: list[ProxyWork]) -> list[ProxyWork]:
    """영상화된 작품과 안 된 작품이 모두 있는 작가의 작품만"""
    by_author: dict[str, list[ProxyWork]] = {}
    for w in works:
        by_author.setdefault(w.author, []).append(w)
    return [w for ws in by_author.values() if any(x.adapted for x in ws) and not all(x.adapted for x in ws) for w in ws]


def write_manifest(works: list[ProxyWork], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(MANIFEST_COLUMNS)
        for x in works:
            w.writerow([x.work, x.title, x.author, x.author_name, x.died, x.gutenberg, x.adaptations, x.file])


def read_manifest(path: Path) -> list[ProxyWork]:
    with path.open(encoding="utf-8", newline="") as f:
        return [
            ProxyWork(r["work"], r["title"], r["author"], r["author_name"], int(r["died"]), r["gutenberg"], int(r["adaptations"]), r["file"])
            for r in csv.DictReader(f)
        ]


# ---------- 본문 ----------


def mirror_paths(gutenberg_id: str) -> list[str]:
    """구텐베르크 미러의 디렉터리 구조: 1342 → 1/3/4/1342/1342-0.txt (한 자리 번호는 0/5/)"""
    d = gutenberg_id
    folder = f"0/{d}" if len(d) == 1 else "/".join(d[:-1]) + f"/{d}"
    return [f"{folder}/{d}-0.txt", f"{folder}/{d}.txt", f"{folder}/{d}-8.txt"]


def fetch_texts(works: list[ProxyWork], out_dir: Path, *, mirror: str = DEFAULT_MIRROR, delay: float = 2.0, log=print) -> dict:
    """이미 받은 파일은 건너뛴다. 요청 사이에 delay초 쉰다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    got = skipped = failed = 0
    for w in works:
        target = out_dir / w.file
        if target.exists():
            skipped += 1
            continue
        for rel in mirror_paths(w.gutenberg):
            time.sleep(delay)
            req = urllib.request.Request(f"{mirror.rstrip('/')}/{rel}", headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    raw = r.read()
            except Exception:  # noqa: BLE001 - 없는 경로는 다음 후보로
                continue
            enc = "utf-8" if rel.endswith("-0.txt") or rel.endswith(f"{w.gutenberg}.txt") else "latin-1"
            target.write_text(raw.decode(enc, errors="replace"), encoding="utf-8")
            got += 1
            break
        else:
            failed += 1
            log(f"받지 못함: {w.gutenberg} {w.title}")
    return {"downloaded": got, "skipped": skipped, "failed": failed}


def load_texts(works: list[ProxyWork], text_dir: Path, min_chars: int = 20_000) -> tuple[list[ProxyWork], list[str]]:
    kept, texts = [], []
    for w in works:
        p = text_dir / w.file
        if not p.exists():
            continue
        body = strip_gutenberg(p.read_text(encoding="utf-8"))
        if len(body) < min_chars:
            continue  # 너무 짧은 글(시, 단편 조각)은 곡선을 그릴 수 없다
        kept.append(w)
        texts.append(body)
    return kept, texts


# ---------- 분석 ----------


def holm(p_values: list[float]) -> list[float]:
    order = np.argsort(p_values)
    m = len(p_values)
    adjusted = np.empty(m)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p_values[i]))
        adjusted[i] = running
    return adjusted.tolist()


def feature_tests(x: np.ndarray, y: np.ndarray, groups: np.ndarray, names: list[str], permutations: int = 2000, seed: int = 0) -> list[dict]:
    """요소마다 같은 작가 안 AUC (0.5보다 크면 영상화된 작품 쪽이 값이 크다)와 양쪽 순열 검정.

    홀름 보정을 넘을 수 있으려면 순열 횟수가 (요소 수 ÷ 0.05)보다 커야 한다 (요소 19개면 380회 이상). 기본 2,000회.
    """
    rng = np.random.default_rng(seed)
    # 정답 행렬: 0행은 실제 정답, 나머지는 작가 안에서 섞은 정답
    labels = np.stack([y] + [permute_within(y, groups, rng) for _ in range(permutations)])
    members = [np.where(groups == g)[0] for g in np.unique(groups)]
    rows = []
    for j, name in enumerate(names):
        wins = np.zeros(len(labels))
        pairs = np.zeros(len(labels))
        for idx in members:
            v = x[idx, j]
            cmp = (v[:, None] > v[None, :]) + 0.5 * (v[:, None] == v[None, :])  # cmp[i, k] = i가 k보다 큰가
            yy = labels[:, idx]
            wins += np.einsum("pi,ik,pk->p", yy, cmp, 1 - yy)
            pairs += yy.sum(axis=1) * (1 - yy).sum(axis=1)
        if pairs[0] == 0:
            continue
        aucs = wins / pairs
        a = float(aucs[0])
        p = float((1 + (np.abs(aucs[1:] - 0.5) >= abs(a - 0.5) - 1e-12).sum()) / (1 + permutations))
        rows.append({"feature": name, "auc": a, "p": p})
    for r, adj in zip(rows, holm([r["p"] for r in rows]), strict=True):
        r["pHolm"] = adj
        r["signal"] = "신호 있음" if adj <= 0.05 else ("약한 신호" if r["p"] <= 0.05 else "없음")
        r["direction"] = "영상화된 작품이 높음" if r["auc"] > 0.5 else "영상화된 작품이 낮음"
    rows.sort(key=lambda r: (r["p"], -abs(r["auc"] - 0.5)))
    return rows


def _pool(texts: list[str], embedder: Embedder, segments: int = 20) -> np.ndarray:
    out = []
    for t in texts:
        size = max(1, len(t) // segments)
        vecs = embedder.embed([t[i * size : (i + 1) * size] for i in range(segments)])
        v = vecs.mean(axis=0)
        out.append(v / (np.linalg.norm(v) or 1.0))
    return np.stack(out)


def analyze_proxy(
    works: list[ProxyWork], texts: list[str], embedder: Embedder, *, permutations: int = 2000, model_permutations: int = 99, seed: int = 0
) -> dict:
    y = np.array([1.0 if w.adapted else 0.0 for w in works])
    groups = np.array([w.author for w in works])
    report: dict = {
        "lexicon": VERSION,
        "embedder": embedder.name,
        "works": len(works),
        "authors": len(set(groups.tolist())),
        "adapted": int(y.sum()),
    }
    if len(works) < 20 or y.min() == y.max():
        report["note"] = "분석할 수 없을 만큼 작품이 적습니다"
        return report

    feats = feature_matrix(texts, ["en"] * len(texts))
    log_chars = np.array([[math.log1p(len(t))] for t in texts])
    names = [*STORY_FEATURES, "log_chars"]
    report["features"] = feature_tests(np.hstack([feats, log_chars]), y, groups, names, permutations=permutations, seed=seed)

    pooled = _pool(texts, embedder)
    folds = channel_folds(groups.tolist(), seed=seed)
    kw = {"embedder": embedder.name, "feature_names": STORY_FEATURES}
    lam = choose_lambda(pooled, feats, y, seed=seed, **kw)

    def predict(yy: np.ndarray, use_vectors: bool) -> np.ndarray:
        def one(tr: np.ndarray, te: np.ndarray) -> np.ndarray:
            vec = pooled if use_vectors else np.zeros((len(y), 1))
            m = fit_model(vec[tr], feats[tr], yy[tr], bootstrap=1, lam=lam, **kw)
            return m.predict(vec[te], feats[te])[0]

        return out_of_fold(one, yy, folds)

    models = {}
    for key, use_vectors in (("storyFeatures", False), ("storyFeaturesAndVector", True)):
        s = predict(y, use_vectors)
        mask = ~np.isnan(s)
        a = grouped_auc(s[mask], y[mask], groups[mask])
        entry = {"auc": a, "lift": grouped_lift(s[mask], y[mask], groups[mask])}
        if a is not None:
            entry["ci"] = bootstrap_auc(s[mask], y[mask], groups[mask], seed=seed)
            if model_permutations:
                rng = np.random.default_rng(seed + 1)
                hits = 0
                for _ in range(model_permutations):
                    yp = permute_within(y, groups, rng)
                    sp = predict(yp, use_vectors)
                    mp = ~np.isnan(sp)
                    ap = grouped_auc(sp[mp], yp[mp], groups[mp])
                    hits += ap is not None and ap >= a
                entry["permutationP"] = (hits + 1) / (model_permutations + 1)
        models[key] = entry
    report["leaveAuthorsOut"] = models
    report["lambda"] = lam
    return report


def render_markdown(report: dict) -> str:
    lines = [
        "# 대리 검증 결과: 같은 작가의 작품 중 영상화된 소설은 무엇이 다른가",
        "",
        f"- 작품 {report['works']}편 (영상화 {report['adapted']}편), 작가 {report['authors']}명, 사전 `{report['lexicon']}`, 임베더 `{report['embedder']}`",
        '- 소설 → 영화·드라마의 "이야기 매력"을 본 것이다. 단편 영상 성과가 아니다 (docs/hit-features.md).',
        "",
    ]
    if "note" in report:
        return "\n".join([*lines, report["note"], ""])
    lines += ["## 요소별 (같은 작가 안 AUC, 0.5 = 차이 없음)", "| 요소 | AUC | 방향 | p | 홀름 보정 p | 판정 |", "|---|---|---|---|---|---|"]
    for r in report["features"]:
        lines.append(f"| `{r['feature']}` | {r['auc']:.3f} | {r['direction']} | {r['p']:.4f} | {r['pHolm']:.4f} | {r['signal']} |")
    lines += ["", "## 모델 (작가 빼고 맞히기)", "| 모델 | AUC | 95% 구간 | 리프트 | 순열 p |", "|---|---|---|---|---|"]
    for key, label in (("storyFeatures", "이야기 요소만"), ("storyFeaturesAndVector", "이야기 요소 + 벡터")):
        m = report["leaveAuthorsOut"][key]
        ci = m.get("ci", {})
        lines.append(
            f"| {label} | {m['auc']:.3f} | {ci.get('low', float('nan')):.3f}~{ci.get('high', float('nan')):.3f} | {m['lift']:.2f} | {m.get('permutationP')} |"
        )
    lines += ["", "`log_chars`(글 길이)는 비교용이다. 길이 차이만으로 설명되는 요소는 조심해서 읽는다.", ""]
    return "\n".join(lines)
