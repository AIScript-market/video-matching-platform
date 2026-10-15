"""대리 검증 3: 미국 TV 드라마 에피소드. "같은 시리즈 안에서 어느 화가 시청자를 붙잡았나".

파일럿(같은 채널 안에서 어느 영상이 잘됐나)과 구조가 같다. 같은 시리즈는 배우·예산·방송사가 같고, 모든 화가 이미 만들어졌다.

자료: 영어 위키백과 시즌 문서의 에피소드 표 (줄거리는 CC BY-SA 4.0, 시청자 수는 닐슨 집계를 옮긴 사실 정보).
- 줄거리는 방영 뒤 편집자가 쓴 글이다. 인기 있던 화일수록 길게 쓰였을 수 있어 길이를 통제한다.

정답 (같은 시리즈 안 상위 1/3)
- 주: 다음 화 유지 = log(다음 화 시청자) − log(이번 화 시청자). 그 화의 시청자는 보기 전에 정해지지만, 다음 화에 남는지는 이번 화를 보고 정한다.
  시즌별 흐름(절편·기울기), 시즌 첫 화·다음 화가 마지막 화인지, 방영 간격(일)을 회귀로 뺀 나머지.
- 보조: 그 화 시청자 = log(시청자)에서 시즌별 흐름, 첫 화·마지막 화를 뺀 나머지.
"""

from __future__ import annotations

import json
import math
import re
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import date

import numpy as np

from .proxy import USER_AGENT

API = "https://en.wikipedia.org/w/api.php"
HIT_SHARE = 1 / 3

# 위키백과에 시즌 문서와 에피소드별 시청자 수가 있는 미국 각본 시리즈 (드라마·코미디). 이름은 시즌 문서 제목의 앞부분
SERIES = [
    "Lost",
    "House",
    "Grey's Anatomy",
    "Desperate Housewives",
    "Prison Break",
    "Heroes (American TV series)",
    "24 (TV series)",
    "Bones (TV series)",
    "Castle (TV series)",
    "The Mentalist",
    "NCIS",
    "Criminal Minds",
    "CSI: Crime Scene Investigation",
    "Supernatural",
    "Glee",
    "Scandal",
    "How to Get Away with Murder",
    "Sons of Anarchy",
    "Dexter",
    "Homeland",
    "The Good Wife",
    "Person of Interest",
    "Fringe",
    "Once Upon a Time",
    "Arrow",
    "The Flash",
    "Gotham",
    "Agents of S.H.I.E.L.D.",
    "This Is Us",
    "The Walking Dead",
    "Breaking Bad",
    "Mad Men",
    "Game of Thrones",
    "Grimm",
    "Chicago Fire",
    "Chicago P.D.",
    "Blue Bloods",
    "The Blacklist",
    "Elementary",
    "Hawaii Five-0",
    "ER",
    "The X-Files",
    "Smallville",
    "Gossip Girl",
    "The Vampire Diaries",
    "Pretty Little Liars",
    "Revenge",
    "Nashville",
    "Empire",
    "Suits",
    "Burn Notice",
    "White Collar",
    "The Following",
    "Hannibal",
    "Bates Motel",
    "Better Call Saul",
    "The Sopranos",
    "Boardwalk Empire",
    "True Blood",
    "Westworld",
    "The Americans",
    "Justified",
    "Lucifer",
    "Brooklyn Nine-Nine",
    "Modern Family",
    "The Big Bang Theory",
    "How I Met Your Mother",
    "Parks and Recreation",
    "The Office (American TV series)",
    "Community",
    "30 Rock",
    "Two and a Half Men",
    "Scrubs",
    "The Good Place",
    "New Girl",
    "Bob's Burgers",
    "Family Guy",
    "The Simpsons",
    "Riverdale",
    "Jane the Virgin",
    "Agents of S.H.I.E.L.D.",
    "Gilmore Girls",
    "One Tree Hill",
    "Veronica Mars",
    "Ugly Betty",
    "Private Practice",
    "Rizzoli & Isles",
    "The Closer",
    "Major Crimes",
    "Monk",
    "Psych",
    "Numbers (TV series)",
    "Cold Case",
    "Without a Trace",
    "Medium (TV series)",
    "The Office",
    "Friends",
    "Seinfeld",
]
MAX_SEASONS = 25
REF = re.compile(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", re.S)
TEMPLATE_START = re.compile(r"\{\{\s*episode list", re.I)


@dataclass
class Episode:
    series: str
    season: int
    number: int  # 시즌 안 순서
    title: str
    writers: str
    air_date: str | None
    viewers: float | None  # 백만 명
    summary: str


def _get(params: dict, timeout: float = 60.0) -> dict:
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers={"User-Agent": USER_AGENT}), timeout=timeout) as r:
        return json.load(r)


def _season_titles(base: str) -> list[str]:
    return [f"{base} season {n}" for n in range(1, MAX_SEASONS + 1)]


def fetch_wikitext(titles: list[str]) -> dict[str, str]:
    """문서 제목 → 위키 원문 (없는 문서는 빠진다). 한 번에 50개씩"""
    out: dict[str, str] = {}
    for i in range(0, len(titles), 50):
        r = _get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "titles": "|".join(titles[i : i + 50])})
        for p in r["query"]["pages"]:
            if "revisions" in p:
                out[p["title"]] = p["revisions"][0]["slots"]["main"]["content"]
        time.sleep(0.5)
    return out


def _template_bodies(text: str) -> list[str]:
    """{{Episode list ...}} 틀의 본문들 (중괄호 짝을 맞춰 자른다)"""
    out = []
    for m in TEMPLATE_START.finditer(text):
        depth, i = 0, m.start()
        while i < len(text) - 1:
            if text.startswith("{{", i):
                depth += 1
                i += 2
                continue
            if text.startswith("}}", i):
                depth -= 1
                i += 2
                if depth == 0:
                    out.append(text[m.start() : i])
                    break
                continue
            i += 1
    return out


def _params(body: str) -> dict[str, str]:
    """맨 바깥 단계의 | 이름 = 값 만 읽는다"""
    inner = body[2:-2]
    parts, depth, cur = [], 0, []
    i = 0
    while i < len(inner):
        two = inner[i : i + 2]
        if two in ("{{", "[["):
            depth += 1
            cur.append(two)
            i += 2
            continue
        if two in ("}}", "]]"):
            depth -= 1
            cur.append(two)
            i += 2
            continue
        if inner[i] == "|" and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(inner[i])
        i += 1
    parts.append("".join(cur))
    out = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            out[k.strip().lower()] = v.strip()
    return out


def clean_wiki(text: str) -> str:
    """위키 문법을 걷어 읽을 수 있는 글만 남긴다"""
    t = REF.sub("", text)
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", t)
    for _ in range(3):
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"'{2,}", "", t)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def parse_viewers(value: str) -> float | None:
    m = re.search(r"\d+(?:\.\d+)?", REF.sub("", value))
    return float(m.group()) if m else None


def parse_air_date(value: str) -> str | None:
    m = re.search(r"\{\{\s*(?:start date|dts|film date)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", value, re.I)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3])).isoformat()
    return None


def parse_season(series: str, season: int, text: str) -> list[Episode]:
    eps = []
    for body in _template_bodies(text):
        p = _params(body)
        summary = clean_wiki(p.get("shortsummary", ""))
        number = re.search(r"\d+", clean_wiki(p.get("episodenumber2", "")))
        eps.append(
            Episode(
                series=series,
                season=season,
                number=int(number.group()) if number else len(eps) + 1,
                title=clean_wiki(p.get("title", "")),
                writers=clean_wiki(p.get("writtenby", "")),
                air_date=parse_air_date(p.get("originalairdate", "")),
                viewers=parse_viewers(p.get("viewers", "")),
                summary=summary,
            )
        )
    return eps


def fetch_series(series: list[str] = SERIES, log=print) -> list[Episode]:
    episodes: list[Episode] = []
    for base in dict.fromkeys(series):
        pages = fetch_wikitext(_season_titles(base))
        found = 0
        for title, text in pages.items():
            m = re.search(r"season (\d+)$", title)
            if not m:
                continue
            eps = parse_season(re.sub(r" \(.*\)$", "", base), int(m.group(1)), text)
            episodes.extend(eps)
            found += len(eps)
        log(f"{base}: 시즌 {len(pages)}개, 에피소드 {found}편")
    return episodes


def save(episodes: list[Episode], path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([asdict(e) for e in episodes], ensure_ascii=False), encoding="utf-8")


def load(path) -> list[Episode]:
    return [Episode(**e) for e in json.loads(path.read_text(encoding="utf-8"))]


# ---------- 정답 ----------


def usable(episodes: list[Episode], min_words: int = 30, min_episodes: int = 20) -> list[Episode]:
    """시청자 수·방영일·줄거리(30단어 이상)가 있는 화만, 그런 화가 20편 이상인 시리즈만"""
    ok = [e for e in episodes if e.viewers and e.viewers > 0 and e.air_date and len(e.summary.split()) >= min_words]
    count: dict[str, int] = {}
    for e in ok:
        count[e.series] = count.get(e.series, 0) + 1
    return [e for e in ok if count[e.series] >= min_episodes]


def _residual(y: np.ndarray, design: np.ndarray) -> np.ndarray:
    coef, *_ = np.linalg.lstsq(design, y, rcond=None)
    return y - design @ coef


def episode_labels(episodes: list[Episode]) -> list[dict]:
    """화마다 {"own": 그 화 시청자 나머지, "retention": 다음 화 유지 나머지 (없으면 None)}. 시리즈 안 상위 1/3을 hit로"""
    seasons: dict[tuple[str, int], list[int]] = {}
    for i, e in enumerate(episodes):
        seasons.setdefault((e.series, e.season), []).append(i)
    own = np.full(len(episodes), np.nan)
    ret = np.full(len(episodes), np.nan)
    for _series in {e.series for e in episodes}:
        keys = [k for k in seasons if k[0] == _series]
        rows_own, x_own, rows_ret, x_ret = [], [], [], []
        for s_i, key in enumerate(keys):
            idx = sorted(seasons[key], key=lambda i: (episodes[i].air_date, episodes[i].number))
            n = len(idx)
            for pos, i in enumerate(idx):
                season_dummy = [1.0 if s_i == k else 0.0 for k in range(len(keys))]
                trend = [pos / max(n - 1, 1) if s_i == k else 0.0 for k in range(len(keys))]
                first, last = float(pos == 0), float(pos == n - 1)
                rows_own.append(i)
                x_own.append([*season_dummy, *trend, first, last])
                if pos < n - 1:
                    j = idx[pos + 1]
                    gap = (date.fromisoformat(episodes[j].air_date) - date.fromisoformat(episodes[i].air_date)).days
                    if 0 < gap <= 60:  # 두 달 넘게 쉬면 시즌 중간 휴방이라 비교하지 않는다
                        next_last = float(pos + 1 == n - 1)
                        rows_ret.append((i, j))
                        x_ret.append([*season_dummy, *trend, first, next_last, math.log(gap)])
        if len(rows_own) > len(x_own[0]) + 2:
            v = np.log([episodes[i].viewers for i in rows_own])
            own[rows_own] = _residual(v, np.array(x_own))
        if len(rows_ret) > len(x_ret[0]) + 2:
            change = np.array([math.log(episodes[j].viewers) - math.log(episodes[i].viewers) for i, j in rows_ret])
            ret[[i for i, _ in rows_ret]] = _residual(change, np.array(x_ret))

    out = [{"own": None if np.isnan(o) else float(o), "retention": None if np.isnan(r) else float(r)} for o, r in zip(own, ret, strict=True)]
    for key in ("own", "retention"):
        for series in {e.series for e in episodes}:
            idx = [i for i, e in enumerate(episodes) if e.series == series and out[i][key] is not None]
            if not idx:
                continue
            vals = np.array([out[i][key] for i in idx])
            cut = np.quantile(vals, 1 - HIT_SHARE)
            for i, v in zip(idx, vals, strict=True):
                out[i][f"{key}Hit"] = bool(v >= cut)
    return out


# ---------- 분석 ----------


def analyze_tv(episodes: list[Episode], labels: list[dict], vectors: np.ndarray | None = None, permutations: int = 2000, seed: int = 0) -> dict:
    """같은 시리즈 안에서 흥행한 화와 아닌 화를 줄거리로 가르는가. 줄거리 길이는 언제나 뺀다 (인기 있는 화일수록 길게 쓰였을 수 있어서)"""
    from .proxy import feature_tests, fold_predictor
    from .proxy_controls import residualize
    from .story_features import STORY_FEATURES, feature_matrix

    texts = [e.summary for e in episodes]
    x = feature_matrix(texts, ["en"] * len(texts))
    log_words = np.array([math.log(len(t.split())) for t in texts])
    series = np.array([e.series for e in episodes])
    seasons = np.array([f"{e.series}|{e.season}" for e in episodes])
    report: dict = {"episodes": len(episodes), "series": len(set(series.tolist()))}
    for key in ("retention", "own"):
        m = np.array([f"{key}Hit" in lab for lab in labels])
        y = np.array([1.0 if labels[i].get(f"{key}Hit") else 0.0 for i in range(len(labels))])[m]
        xs = residualize(x[m], series[m], log_words[m].reshape(-1, 1))
        out: dict = {
            "episodes": int(m.sum()),
            "hits": int(y.sum()),
            "summaryLength": feature_tests(log_words[m].reshape(-1, 1), y, series[m], ["log_words"], permutations=permutations, seed=seed)[0],
            "featuresSameSeries": feature_tests(xs, y, series[m], list(STORY_FEATURES), permutations=permutations, seed=seed),
            "featuresSameSeason": feature_tests(xs, y, seasons[m], list(STORY_FEATURES), permutations=permutations, seed=seed),
        }
        if vectors is not None:
            predict, lam = fold_predictor(vectors[m], x[m], y, series[m], "bge-m3", seed=seed)
            models = {}
            for name, use_vectors in (("storyFeatures", False), ("storyFeaturesAndVector", True)):
                s = predict(y, use_vectors)
                ok = ~np.isnan(s)
                # 모델 점수에서도 줄거리 길이 몫을 뺀 뒤 잰다
                sr = residualize(s[ok].reshape(-1, 1), series[m][ok], log_words[m][ok].reshape(-1, 1))
                models[name] = {
                    "sameSeries": feature_tests(sr, y[ok], series[m][ok], [name], permutations=permutations, seed=seed)[0],
                    "sameSeason": feature_tests(sr, y[ok], seasons[m][ok], [name], permutations=permutations, seed=seed)[0],
                }
            out["models"] = models
            out["lambda"] = lam
        report[key] = out
    return report
