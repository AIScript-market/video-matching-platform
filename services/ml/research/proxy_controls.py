"""대리 검증 통제: 요소의 신호가 장르·글 길이 때문인지 가른다.

장르 출처는 둘이다.
- 구텐베르크 카탈로그(기본): 모든 작품에 사서가 붙인 주제·서가가 있다. 여러 갈래가 붙고, 대표 갈래 하나도 정한다.
  "Movie Books"(영상화된 책) 서가와 베스트셀러·명작 목록은 정답이나 유명세가 새므로 쓰지 않는다.
- 위키데이터 P136: 기록이 58%뿐이고 유명 작품 쪽으로 치우쳐 있다. 비교용으로 남긴다.
장르가 없는 작품은 "기록 없음"으로 둔다.
세 가지로 본다.
1. 장르 자체: 같은 작가 안에서 장르가 영상화를 가르는가 (기록 유무가 영상화와 엮였는가도 함께)
2. 같은 작가·같은 장르 안에서만 비교 (장르를 아는 작품만)
3. 작가·장르·길이를 회귀로 뺀 나머지로 비교 (모든 작품)
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

import numpy as np

from hitmodel.embedders import Embedder

from .proxy import USER_AGENT, WIKIDATA_SPARQL, ProxyWork, feature_tests, fold_predictor, pool_texts

# 여러 장르가 붙은 작품은 이 순서로 먼저 맞는 갈래 하나로 본다
COARSE_GENRES: list[tuple[str, set[str]]] = [
    ("범죄·추리", {"detective fiction", "crime fiction", "mystery fiction", "spy fiction", "cloak and dagger novel", "sensation fiction"}),
    ("공포·고딕", {"horror fiction", "weird fiction", "lovecraftian horror", "gothic fiction", "gothic literature", "gothic novel"}),
    ("아동", {"children's fiction", "young adult fiction", "christmas fiction"}),
    ("SF·판타지", {"fantasy", "science fiction", "science fantasy", "speculative fiction", "alternate history"}),
    ("모험", {"adventure fiction", "pirate fiction", "lost world fiction", "nautical fiction", "military fiction", "picaresque novel"}),
    ("역사", {"historical fiction"}),
    ("풍자·희극", {"satirical fiction", "satire", "comedy", "comic novel", "black comedy", "tragicomedy"}),
    (
        "사회·심리·성장",
        {
            "romantic fiction",
            "novel of manners",
            "social fiction",
            "social criticism",
            "psychological fiction",
            "family saga",
            "bildungsroman",
            "developmental novel",
            "coming-of-age fiction",
            "künstlerroman",
            "autobiographical novel",
            "epistolary novel",
            "modernist literature",
            "high literature",
            "great american novel",
            "tragedy",
        },
    ),
]
OTHER = "기타"
UNKNOWN = "기록 없음"


def fetch_genres(qids: list[str], timeout: float = 120.0) -> dict[str, list[str]]:
    """위키데이터 P136 장르 이름(영어). 장르가 없는 작품은 결과에 없다"""
    values = " ".join("wd:" + q for q in qids)
    query = (
        "SELECT ?work ?genreLabel WHERE { VALUES ?work { " + values + " } ?work wdt:P136 ?genre . "
        'SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } }'
    )
    body = urllib.parse.urlencode({"query": query, "format": "json"}).encode()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded"}
    with urllib.request.urlopen(urllib.request.Request(WIKIDATA_SPARQL, data=body, headers=headers), timeout=timeout) as r:
        payload = json.load(r)
    out: dict[str, set[str]] = {}
    for b in payload["results"]["bindings"]:
        out.setdefault(b["work"]["value"].rsplit("/", 1)[-1], set()).add(b["genreLabel"]["value"])
    return {k: sorted(v) for k, v in out.items()}


def coarse_genre(labels: list[str] | None) -> str:
    if not labels:
        return UNKNOWN
    low = {x.lower() for x in labels}
    for name, members in COARSE_GENRES:
        if low & members:
            return name
    return OTHER


# 구텐베르크 카탈로그(pg_catalog.csv, 공공 저작물)의 서가·주제로 붙이는 장르. 여러 갈래가 붙을 수 있다.
# 서가는 이름이 같아야, 주제(미 의회도서관 주제명)는 이 말이 들어 있으면 그 갈래로 본다.
CATALOG_GENRES: list[tuple[str, set[str], tuple[str, ...]]] = [
    (
        "범죄·추리",
        {"category: crime, thrillers and mystery", "detective fiction", "crime fiction", "mystery fiction"},
        ("detective and mystery", "private investigators", "crime --", "murder --", "spy stories", "criminals --"),
    ),
    ("공포·고딕", {"horror", "gothic fiction", "category: horror"}, ("horror tales", "ghost stories", "gothic", "supernatural")),
    ("아동", {"category: children & young adult reading", "children's literature", "children's fiction"}, ("juvenile fiction",)),
    ("SF·판타지", {"category: science-fiction & fantasy", "science fiction", "fantasy"}, ("science fiction", "fantasy")),
    ("모험", {"category: adventure", "adventure", "western"}, ("adventure stories", "sea stories", "war stories", "western stories", "pirates")),
    ("역사", {"category: historical novels", "historical fiction"}, ("historical fiction",)),
    ("풍자·희극", {"category: humour", "humor"}, ("humorous stories", "satire")),
    ("연애·가정", {"category: romance"}, ("love stories", "domestic fiction", "man-woman relationships", "courtship --")),
    ("사회·심리·성장", set(), ("psychological fiction", "bildungsromans", "social classes", "didactic fiction", "social problems")),
]
# 장르가 아니라 결과(영상화)나 유명세를 뜻하는 서가. 정답이 새므로 쓰지 않는다
LEAKY_SHELVES = {"movie books", "best books ever listings", "harvard classics", "contemporary reviews", "category: classics of literature"}


def catalog_tags(shelves: str, subjects: str) -> set[str]:
    shelf_set = {s.strip().lower() for s in shelves.split(";") if s.strip()}
    shelf_set = {s for s in shelf_set if s not in LEAKY_SHELVES and not s.startswith(("bestsellers", "banned books"))}
    subj = subjects.lower()
    return {name for name, shelf_names, subject_words in CATALOG_GENRES if shelf_set & shelf_names or any(w in subj for w in subject_words)}


def primary_genre(tags: set[str]) -> str:
    """여러 갈래 중 CATALOG_GENRES 순서로 먼저 나오는 하나"""
    return next((name for name, _, _ in CATALOG_GENRES if name in tags), UNKNOWN)


def read_catalog(path, gutenberg_ids: list[str]) -> dict[str, set[str]]:
    import csv

    wanted = set(gutenberg_ids)
    with open(path, encoding="utf-8", newline="") as f:
        return {r["Text#"]: catalog_tags(r.get("Bookshelves") or "", r.get("Subjects") or "") for r in csv.DictReader(f) if r["Text#"] in wanted}


def tag_matrix(tags: list[set[str]]) -> np.ndarray:
    names = [name for name, _, _ in CATALOG_GENRES]
    return np.array([[1.0 if n in t else 0.0 for n in names] for t in tags]).reshape(len(tags), len(names))


def _dummies(values: list[str], drop: str | None = None) -> np.ndarray:
    levels = [v for v in sorted(set(values)) if v != drop]
    return np.array([[1.0 if v == lv else 0.0 for lv in levels] for v in values]).reshape(len(values), len(levels))


def residualize(x: np.ndarray, groups: np.ndarray, *controls: np.ndarray) -> np.ndarray:
    """작가 고정효과 + 통제 변수로 회귀한 나머지 (열마다)"""
    design = np.hstack([_dummies(groups.tolist()), *controls])
    coef, *_ = np.linalg.lstsq(design, x, rcond=None)
    return x - design @ coef


def genre_effect(works: list[ProxyWork], genres: list[str], permutations: int = 2000, seed: int = 0) -> dict:
    """같은 작가 안에서 장르가 영상화를 가르는가: 갈래별 영상화 비율(작가 하나씩 빼고 계산)을 점수로 쓴 AUC"""
    y = np.array([1.0 if w.adapted else 0.0 for w in works])
    groups = np.array([w.author for w in works])
    g = np.array(genres)
    score = np.empty(len(y))
    for i in range(len(y)):
        others = (groups != groups[i]) & (g == g[i])
        score[i] = (y[others].sum() + 1) / (others.sum() + 3)  # 표본이 적은 갈래는 전체 쪽으로
    rows = feature_tests(np.column_stack([score, (g != UNKNOWN).astype(float)]), y, groups, ["genre", "genre_recorded"], permutations=permutations, seed=seed)
    rates = {name: {"works": int((g == name).sum()), "adaptedShare": float(y[g == name].mean())} for name in sorted(set(genres))}
    return {"tests": rows, "byGenre": rates}


def controlled_tests(
    x: np.ndarray,
    names: list[str],
    works: list[ProxyWork],
    genres: list[str],
    log_chars: np.ndarray,
    permutations: int = 2000,
    seed: int = 0,
    tags: np.ndarray | None = None,
    y: np.ndarray | None = None,
) -> dict:
    """genres는 작품마다 대표 갈래 하나. tags(작품 × 갈래 0/1)가 있으면 회귀 통제에는 여러 갈래를 모두 쓴다.
    y를 주지 않으면 정답은 "영상화됐는가"다 (흥행 분석처럼 다른 정답을 쓸 때 y를 준다)."""
    if y is None:
        y = np.array([1.0 if w.adapted else 0.0 for w in works])
    authors = np.array([w.author for w in works])
    g = np.array(genres)
    out: dict = {"baseline": feature_tests(x, y, authors, names, permutations=permutations, seed=seed)}

    # 같은 작가·같은 장르 안에서만 (장르를 아는 작품)
    known = g != UNKNOWN
    strata = np.array([f"{a}|{gg}" for a, gg in zip(authors, g, strict=True)])
    pairs = sum(int(y[known & (strata == s)].sum() * (1 - y[known & (strata == s)]).sum()) for s in np.unique(strata[known]))
    author_pairs = sum(int(y[known & (authors == a)].sum() * (1 - y[known & (authors == a)]).sum()) for a in np.unique(authors[known]))
    out["sameAuthorSameGenre"] = {
        "works": int(known.sum()),
        "pairs": pairs,
        "tests": feature_tests(x[known], y[known], strata[known], names, permutations=permutations, seed=seed),
    }
    # 같은 작품들(장르를 아는 작품)에서 장르를 무시하고 작가 안에서만 비교한 값. 위와 견줘야 장르 몫이 보인다
    out["knownGenreSameAuthor"] = {
        "works": int(known.sum()),
        "pairs": author_pairs,
        "tests": feature_tests(x[known], y[known], authors[known], names, permutations=permutations, seed=seed),
    }
    # 장르 기록이 없는 작품끼리만 (신호가 어느 쪽 작품에서 나오는지 보려고)
    out["unknownGenreSameAuthor"] = feature_tests(x[~known], y[~known], authors[~known], names, permutations=permutations, seed=seed)
    known_genres = [gg for gg, k in zip(genres, known, strict=True) if k]
    genre_design = tags if tags is not None else _dummies(genres, drop=UNKNOWN)
    known_design = tags[known] if tags is not None else _dummies(known_genres)
    out["knownGenreAdjusted"] = feature_tests(
        residualize(x[known], authors[known], known_design, log_chars[known].reshape(-1, 1)),
        y[known],
        authors[known],
        names,
        permutations=permutations,
        seed=seed,
    )

    # 작가·장르·길이를 뺀 나머지 (모든 작품, 장르 기록 없음도 한 갈래로)
    lc = log_chars.reshape(-1, 1)
    out["lengthAdjusted"] = feature_tests(residualize(x, authors, lc), y, authors, names, permutations=permutations, seed=seed)
    out["genreAndLengthAdjusted"] = feature_tests(residualize(x, authors, genre_design, lc), y, authors, names, permutations=permutations, seed=seed)
    return out


def summarize(controlled: dict, feature: str) -> dict:
    def find(rows: list[dict]) -> dict | None:
        return next((r for r in rows if r["feature"] == feature), None)

    return {
        "baseline": find(controlled["baseline"]),
        "lengthAdjusted": find(controlled["lengthAdjusted"]),
        "genreAndLengthAdjusted": find(controlled["genreAndLengthAdjusted"]),
        "knownGenreSameAuthor": find(controlled["knownGenreSameAuthor"]["tests"]),
        "knownGenreAdjusted": find(controlled["knownGenreAdjusted"]),
        "sameAuthorSameGenre": find(controlled["sameAuthorSameGenre"]["tests"]),
        "unknownGenreSameAuthor": find(controlled["unknownGenreSameAuthor"]),
    }


def model_within_genre(
    works: list[ProxyWork],
    texts: list[str],
    feats: np.ndarray,
    genres: list[str],
    embedder: Embedder | None,
    permutations: int = 2000,
    seed: int = 0,
    pooled: np.ndarray | None = None,
    embedder_name: str | None = None,
) -> dict:
    """작가 빼고 맞힌 모델 점수를 장르 안에서도 맞히는지 본다. pooled(작품 벡터)를 주면 embedder 대신 그걸 쓴다.

    점수는 그 작가를 빼고 학습한 모델이 낸 것이라, 그 작가의 정답을 섞는 순열 검정을 그대로 쓸 수 있다.
    """
    y = np.array([1.0 if w.adapted else 0.0 for w in works])
    authors = np.array([w.author for w in works])
    g = np.array(genres)
    known = g != UNKNOWN
    strata = np.array([f"{a}|{gg}" for a, gg in zip(authors, g, strict=True)])
    if pooled is None:
        pooled = pool_texts(texts, embedder)
    predict, _ = fold_predictor(pooled, feats, y, authors, embedder_name or embedder.name, seed=seed)
    out: dict = {}
    for key, use_vectors in (("storyFeatures", False), ("storyFeaturesAndVector", True)):
        s = predict(y, use_vectors).reshape(-1, 1)
        ok = ~np.isnan(s[:, 0])
        k = ok & known

        def test(mask: np.ndarray, groups: np.ndarray, s: np.ndarray = s, key: str = key) -> dict:
            return feature_tests(s[mask], y[mask], groups[mask], [key], permutations=permutations, seed=seed)[0]

        out[key] = {"allSameAuthor": test(ok, authors), "knownGenreSameAuthor": test(k, authors), "sameAuthorSameGenre": test(k, strata)}
    return out
