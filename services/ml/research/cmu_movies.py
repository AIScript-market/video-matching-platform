"""대리 검증 4: 영화 줄거리 → 흥행 (CMU Movie Summary Corpus, CC BY-SA 3.0 US).

기획안·로그라인 단계의 판단을 흉내 낸다: 이미 만들어진 영화들 중, 줄거리만 보고 흥행작을 가려낼 수 있는가.

자료: 위키백과 줄거리 42,306편 + Freebase 메타데이터(박스오피스, 개봉일, 장르, 상영 시간, 언어, 국가).
- 박스오피스가 있는 영화만 쓴다. 예산은 없다 (흥행의 큰 몫이 예산·배우·프랜차이즈라 천장이 낮다).
- 줄거리는 개봉 뒤 편집자가 쓴 글이라 인기작일수록 길 수 있다. 길이를 언제나 뺀다.

정답: log(박스오피스)에서 개봉 연도(5년 단위)·장르(여러 갈래)·상영 시간·영어/미국 여부·줄거리 길이로 기대되는 몫을 뺀 나머지.
같은 장르·같은 5년 안에서 상위 1/3 = 흥행. 비교도 그 묶음 안에서 한다.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

HIT_SHARE = 1 / 3
# 대표 장르는 이 순서로 먼저 맞는 하나 (구체적인 장르부터, 드라마·코미디는 맨 뒤)
MAIN_GENRES = [
    "Animation",
    "Horror",
    "Science Fiction",
    "Western",
    "Musical",
    "War film",
    "Romantic comedy",
    "Biographical film",
    "Family Film",
    "Fantasy",
    "Mystery",
    "Crime Fiction",
    "Thriller",
    "Action",
    "Adventure",
    "Romance Film",
    "Comedy",
    "Drama",
]


@dataclass
class Movie:
    wiki_id: str
    name: str
    year: int
    box_office: float
    runtime: float | None
    english: bool
    us: bool
    genres: list[str]
    summary: str

    @property
    def primary_genre(self) -> str:
        return next((g for g in MAIN_GENRES if g in self.genres), "기타")


def load_movies(raw_dir: Path) -> list[Movie]:
    base = next(raw_dir.rglob("movie.metadata.tsv")).parent
    summaries: dict[str, str] = {}
    with (base / "plot_summaries.txt").open(encoding="utf-8") as f:
        for line in f:
            wid, _, text = line.rstrip("\n").partition("\t")
            summaries[wid] = text
    movies = []
    with (base / "movie.metadata.tsv").open(encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            wid, _, name, date, box, runtime, langs, countries, genres = row[:9]
            if not box or wid not in summaries or not date[:4].isdigit():
                continue
            movies.append(
                Movie(
                    wiki_id=wid,
                    name=name,
                    year=int(date[:4]),
                    box_office=float(box),
                    runtime=float(runtime) if runtime else None,
                    english="English Language" in json.loads(langs).values(),
                    us="United States of America" in json.loads(countries).values(),
                    genres=list(json.loads(genres).values()),
                    summary=summaries[wid],
                )
            )
    return movies


def usable(movies: list[Movie], min_words: int = 50) -> list[Movie]:
    return [m for m in movies if m.box_office > 0 and len(m.summary.split()) >= min_words and m.year >= 1950]


def labels(movies: list[Movie]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(정답 0/1, 나머지 점수, 묶음 이름). 묶음 = 대표 장르 × 5년"""
    years = sorted({m.year // 5 * 5 for m in movies})[1:]
    runtimes = [m.runtime for m in movies if m.runtime]
    mid_runtime = float(np.median(runtimes)) if runtimes else 100.0
    rows = []
    for m in movies:
        rows.append(
            [1.0]
            + [1.0 if m.year // 5 * 5 == y else 0.0 for y in years]
            + [1.0 if g in m.genres else 0.0 for g in MAIN_GENRES]
            + [math.log(m.runtime or mid_runtime), float(m.english), float(m.us), math.log(len(m.summary.split()))]
        )
    design = np.array(rows)
    target = np.log([m.box_office for m in movies])
    coef, *_ = np.linalg.lstsq(design, target, rcond=None)
    resid = target - design @ coef
    strata = np.array([f"{m.primary_genre}|{m.year // 5 * 5}" for m in movies])
    y = np.zeros(len(movies))
    for s in np.unique(strata):
        idx = np.where(strata == s)[0]
        if len(idx) < 6:
            continue
        cut = np.quantile(resid[idx], 1 - HIT_SHARE)
        y[idx] = (resid[idx] >= cut).astype(float)
    return y, resid, strata


def analyze_movies(movies: list[Movie], vectors: np.ndarray | None = None, permutations: int = 2000, seed: int = 0) -> dict:
    from .proxy import feature_tests, fold_predictor
    from .proxy_controls import residualize
    from .story_features import STORY_FEATURES, feature_matrix

    y, resid, strata = labels(movies)
    # 6편 미만 묶음은 비교에서 뺀다
    counts = {s: int((strata == s).sum()) for s in np.unique(strata)}
    keep = np.array([counts[s] >= 6 for s in strata])
    mv = [m for m, k in zip(movies, keep, strict=True) if k]
    y, strata = y[keep], strata[keep]
    texts = [m.summary for m in mv]
    x = feature_matrix(texts, ["en"] * len(texts))
    log_words = np.array([math.log(len(t.split())) for t in texts])
    xs = residualize(x, strata, log_words.reshape(-1, 1))
    report: dict = {
        "movies": len(mv),
        "strata": len(set(strata.tolist())),
        "hits": int(y.sum()),
        "summaryLength": feature_tests(log_words.reshape(-1, 1), y, strata, ["log_words"], permutations=permutations, seed=seed)[0],
        "features": feature_tests(xs, y, strata, list(STORY_FEATURES), permutations=permutations, seed=seed),
    }
    if vectors is not None:
        v = vectors[keep]
        predict, lam = fold_predictor(v, x, y, strata, "bge-m3", seed=seed)
        models = {}
        for name, use_vectors in (("storyFeatures", False), ("storyFeaturesAndVector", True)):
            s = predict(y, use_vectors)
            ok = ~np.isnan(s)
            sr = residualize(s[ok].reshape(-1, 1), strata[ok], log_words[ok].reshape(-1, 1))
            models[name] = feature_tests(sr, y[ok], strata[ok], [name], permutations=permutations, seed=seed)[0]
        report["models"] = models
        report["lambda"] = lam
    return report
