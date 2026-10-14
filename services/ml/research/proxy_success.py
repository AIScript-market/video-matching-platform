"""대리 검증 2단계: 영상화된 작품끼리 "어느 원작의 영상이 흥행했나".

1단계(proxy.py)는 "PD가 고르는가"를 봤다. 여기서는 이미 영상이 된 작품만 놓고 흥행을 가른다.
A급 PD는 평균적인 PD보다 "만들어진 것 중 무엇이 잘될지"를 더 잘 가려내는 사람이기 때문이다.

흥행 점수 (원작 하나에 영상이 여러 편이면 모아서):
- 재영상화: log(1 + 영상화 횟수). 잘된 이야기는 다시 만들어진다.
- 인지도: 영상마다 위키백과 언어판 수 log(1 + n)에서 개봉 연대·형식(영화/드라마 등)으로 기대되는 몫을 뺀 나머지, 원작별 평균
- 지금의 관심: 영상마다 영어 위키백과 조회수(최근 5년) log(1 + n)에서 같은 방식으로 뺀 나머지, 원작별 평균
- 점수 = 세 z값의 평균, 상위 1/3 = 흥행

자료: 위키데이터(CC0), 위키미디어 조회수 API(공개 자료). 박스오피스·평점은 기록이 2~18%뿐이라 쓰지 않는다. IMDb는 비상업 약관이라 쓰지 않는다.
"""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

from .proxy import USER_AGENT, WIKIDATA_SPARQL, ProxyWork

ADAPTATION_KINDS = {"Q11424": "영화", "Q5398426": "드라마 시리즈", "Q506240": "TV 영화", "Q1259759": "미니시리즈"}
PAGEVIEW_API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{title}/monthly/{start}/{end}"
PAGEVIEW_START, PAGEVIEW_END = "2021010100", "2025123100"
HIT_SHARE = 1 / 3


def _sparql(query: str, timeout: float = 180.0) -> list[dict]:
    body = urllib.parse.urlencode({"query": query, "format": "json"}).encode()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded"}
    with urllib.request.urlopen(urllib.request.Request(WIKIDATA_SPARQL, data=body, headers=headers), timeout=timeout) as r:
        return json.load(r)["results"]["bindings"]


def _qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def fetch_adaptations(work_qids: list[str]) -> list[dict]:
    """원작 → 영상(영화·드라마) 목록: 형식, 첫 공개 연도, 위키백과 언어판 수, 영어 위키백과 제목"""
    kinds = " ".join("wd:" + k for k in ADAPTATION_KINDS)
    out: dict[str, dict] = {}
    for i in range(0, len(work_qids), 150):
        values = " ".join("wd:" + q for q in work_qids[i : i + 150])
        rows = _sparql(
            f"""SELECT ?work ?ad ?kind ?links (YEAR(MIN(?date)) AS ?year) (SAMPLE(?article) AS ?enwiki) WHERE {{
              VALUES ?work {{ {values} }} VALUES ?kind {{ {kinds} }}
              ?ad wdt:P144 ?work ; wdt:P31 ?kind ; wikibase:sitelinks ?links .
              OPTIONAL {{ ?ad wdt:P577 ?date . }}
              OPTIONAL {{ ?article schema:about ?ad ; schema:isPartOf <https://en.wikipedia.org/> . }}
            }} GROUP BY ?work ?ad ?kind ?links"""
        )
        for b in rows:
            ad = _qid(b["ad"]["value"])
            key = f"{_qid(b['work']['value'])}|{ad}"
            if key in out:
                continue
            title = urllib.parse.unquote(b["enwiki"]["value"].rsplit("/wiki/", 1)[-1]) if "enwiki" in b else None
            out[key] = {
                "work": _qid(b["work"]["value"]),
                "ad": ad,
                "kind": ADAPTATION_KINDS[_qid(b["kind"]["value"])],
                "year": int(b["year"]["value"]) if "year" in b else None,
                "sitelinks": int(b["links"]["value"]),
                "enwiki": title,
            }
        time.sleep(1)
    return list(out.values())


def fetch_pageviews(titles: list[str], cache: dict[str, int] | None = None, delay: float = 0.2, log=print) -> dict[str, int]:
    """영어 위키백과 문서별 사람 조회수 합 (2021~2025). 없는 문서는 0"""
    views = dict(cache or {})
    todo = [t for t in sorted(set(titles)) if t not in views]
    for n, title in enumerate(todo, start=1):
        url = PAGEVIEW_API.format(title=urllib.parse.quote(title.replace(" ", "_"), safe=""), start=PAGEVIEW_START, end=PAGEVIEW_END)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60) as r:
                views[title] = sum(item["views"] for item in json.load(r)["items"])
        except Exception:  # noqa: BLE001 - 조회 기록이 없는 문서는 404
            views[title] = 0
        if n % 100 == 0:
            log(f"조회수 {n}/{len(todo)}")
        time.sleep(delay)
    return views


def _adjusted(values: np.ndarray, decades: list[str], kinds: list[str]) -> np.ndarray:
    """개봉 연대·형식으로 기대되는 몫을 뺀 나머지 (연도를 모르면 '연도 미상'을 한 갈래로)"""
    decade_levels, kind_levels = sorted(set(decades))[1:], sorted(set(kinds))[1:]
    design = np.array(
        [
            [1.0] + [1.0 if d == lv else 0.0 for lv in decade_levels] + [1.0 if k == lv else 0.0 for lv in kind_levels]
            for d, k in zip(decades, kinds, strict=True)
        ]
    )
    coef, *_ = np.linalg.lstsq(design, values, rcond=None)
    return values - design @ coef


def _z(x: np.ndarray) -> np.ndarray:
    return (x - x.mean()) / x.std() if x.std() > 0 else np.zeros_like(x)


def success_labels(works: list[ProxyWork], adaptations: list[dict], pageviews: dict[str, int]) -> dict[str, dict]:
    """원작별 흥행 구성 요소와 점수. 영상 기록이 없는 원작은 빠진다"""
    ads = [a for a in adaptations if a["work"] in {w.work for w in works}]
    if not ads:
        return {}
    decades = [f"{a['year'] // 10 * 10}s" if a["year"] else "연도 미상" for a in ads]
    kinds = [a["kind"] for a in ads]
    links = _adjusted(np.array([math.log1p(a["sitelinks"]) for a in ads]), decades, kinds)
    views = _adjusted(np.array([math.log1p(pageviews.get(a["enwiki"] or "", 0)) for a in ads]), decades, kinds)
    per: dict[str, dict] = {}
    for a, lk, vw in zip(ads, links, views, strict=True):
        p = per.setdefault(a["work"], {"adaptations": 0, "links": [], "views": []})
        p["adaptations"] += 1
        p["links"].append(float(lk))
        p["views"].append(float(vw))
    keys = sorted(per)
    remake = _z(np.array([math.log1p(per[k]["adaptations"]) for k in keys]))
    recog = _z(np.array([np.mean(per[k]["links"]) for k in keys]))
    now = _z(np.array([np.mean(per[k]["views"]) for k in keys]))
    score = (remake + recog + now) / 3
    n_hits = max(1, round(len(keys) * HIT_SHARE))
    rank = score.argsort(kind="stable").argsort()
    return {
        k: {
            "adaptations": per[k]["adaptations"],
            "remakeZ": float(remake[i]),
            "recognitionZ": float(recog[i]),
            "attentionZ": float(now[i]),
            "score": float(score[i]),
            "hit": bool(rank[i] >= len(keys) - n_hits),
        }
        for i, k in enumerate(keys)
    }


def load_or_fetch(path: Path, fetch):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    data = fetch()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
    return data


def analyze_success(
    works: list[ProxyWork],
    texts: list[str],
    labels: dict[str, dict],
    genres: list[str],
    tags: np.ndarray,
    pooled: np.ndarray | None,
    word_t: np.ndarray | None,
    freq: np.ndarray | None,
    permutations: int = 2000,
    seed: int = 0,
) -> dict:
    """영상화된 작품 중 흥행을 가르는 요소. 같은 작가 안에서 비교하므로 영상화 작품이 2편 이상인 작가만 쓴다"""
    from .proxy import feature_tests, fold_predictor
    from .proxy_controls import controlled_tests, summarize
    from .proxy_explore import word_score
    from .story_features import STORY_FEATURES, feature_matrix

    by_author: dict[str, int] = {}
    for w in works:
        if w.work in labels:
            by_author[w.author] = by_author.get(w.author, 0) + 1
    keep = [i for i, w in enumerate(works) if w.work in labels and by_author[w.author] >= 2]
    sub = [works[i] for i in keep]
    sub_texts = [texts[i] for i in keep]
    sub_genres = [genres[i] for i in keep]
    y = np.array([1.0 if labels[w.work]["hit"] else 0.0 for w in sub])
    authors = np.array([w.author for w in sub])
    strata = np.array([f"{a}|{g}" for a, g in zip(authors, sub_genres, strict=True)])
    log_chars = np.array([math.log1p(len(t)) for t in sub_texts])

    comps = np.array([[labels[w.work][k] for k in ("remakeZ", "recognitionZ", "attentionZ")] for w in sub])
    report: dict = {
        "works": len(sub),
        "authors": len(set(authors.tolist())),
        "hits": int(y.sum()),
        "componentCorrelation": np.corrcoef(comps.T).round(3).tolist(),
    }

    x = feature_matrix(sub_texts, ["en"] * len(sub_texts))
    names = list(STORY_FEATURES)
    extra = []
    if word_t is not None and freq is not None:
        extra.append(("show_index", word_score(freq[keep], word_t).reshape(-1, 1)))
    for name, col in extra:
        x = np.hstack([x, col])
        names.append(name)
    controlled = controlled_tests(x, names, sub, sub_genres, log_chars, permutations=permutations, seed=seed, tags=tags[keep], y=y)
    report["features"] = {n: summarize(controlled, n) for n in names}

    if pooled is not None:
        feats = x[:, : len(STORY_FEATURES)]
        predict, _ = fold_predictor(pooled[keep], feats, y, authors, "bge-m3", seed=seed)
        models = {}
        for key, use_vectors in (("storyFeatures", False), ("storyFeaturesAndVector", True)):
            s = predict(y, use_vectors).reshape(-1, 1)
            ok = ~np.isnan(s[:, 0])
            models[key] = {
                "sameAuthor": feature_tests(s[ok], y[ok], authors[ok], [key], permutations=permutations, seed=seed)[0],
                "sameAuthorSameGenre": feature_tests(s[ok], y[ok], strata[ok], [key], permutations=permutations, seed=seed)[0],
            }
        report["models"] = models
    return report
