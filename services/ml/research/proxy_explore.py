"""벡터·낱말에서 새 요소 찾기 (docs/hit-features.md 2단계 탐색).

탐색한 데이터로 그대로 검정하면 우연이 신호처럼 보인다. 그래서 두 가지로 나눈다.
- 벡터 흐름 요소: 데이터를 보기 전에 정의를 정해 두고(아래 TRAJECTORY_FEATURES), 다른 요소와 같은 통제로 검정한다.
- 특징 낱말: 작가를 둘로 나눠 한쪽에서 찾고 다른 쪽에서 확인한다(양쪽을 바꿔 두 번).
"""

from __future__ import annotations

import re
import time
from collections import Counter
from pathlib import Path

import numpy as np

from hitmodel.embedders import Embedder

from .proxy import ProxyWork, feature_tests

SEGMENTS = 20
TRAJECTORY_FEATURES = [
    "seg_volatility",  # 이웃한 구간끼리 얼마나 다른가 (장면·화제가 자주 바뀌는가)
    "seg_drift",  # 처음과 끝이 얼마나 다른가 (이야기가 멀리 가는가)
    "seg_spread",  # 구간들이 전체 평균에서 얼마나 흩어졌나 (다양한가)
    "opening_distinct",  # 첫 구간이 나머지와 얼마나 다른가 (도입이 튀는가)
    "ending_distinct",  # 마지막 구간이 나머지와 얼마나 다른가 (결말이 튀는가)
    "late_volatility_gain",  # 뒤 1/3의 변화량 − 앞 1/3의 변화량 (뒤로 갈수록 빨라지는가)
]

WORD = re.compile(r"[A-Za-z][a-z']+|[A-Z]+")


# ---------- 벡터 흐름 ----------


def segment_vectors(text: str, embedder: Embedder, segments: int = SEGMENTS) -> np.ndarray:
    size = max(1, len(text) // segments)
    return embedder.embed([text[i * size : (i + 1) * size] for i in range(segments)])


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(a @ b / (na * nb)) if na and nb else 0.0


def trajectory_features(v: np.ndarray) -> dict[str, float]:
    """v: (구간, 차원). 키 순서는 TRAJECTORY_FEATURES와 같다"""
    n = len(v)
    steps = np.array([1 - _cos(v[i], v[i + 1]) for i in range(n - 1)])
    centroid = v.mean(axis=0)
    third = max(1, (n - 1) // 3)
    return {
        "seg_volatility": float(steps.mean()),
        "seg_drift": 1 - _cos(v[0], v[-1]),
        "seg_spread": float(np.mean([1 - _cos(x, centroid) for x in v])),
        "opening_distinct": 1 - _cos(v[0], v[1:].mean(axis=0)),
        "ending_distinct": 1 - _cos(v[-1], v[:-1].mean(axis=0)),
        "late_volatility_gain": float(steps[-third:].mean() - steps[:third].mean()),
    }


def trajectory_matrix(texts: list[str], embedder: Embedder) -> np.ndarray:
    return trajectory_from_vectors([segment_vectors(t, embedder) for t in texts])


def trajectory_from_vectors(vectors) -> np.ndarray:
    rows = []
    for v in vectors:
        f = trajectory_features(np.asarray(v, dtype=np.float64))
        rows.append([f[k] for k in TRAJECTORY_FEATURES])
    return np.array(rows, dtype=float)


def sample_segments(text: str, segments: int = SEGMENTS, sample_chars: int = 2000) -> list[str]:
    """같은 길이 구간으로 나누고, 구간마다 앞쪽 sample_chars자만 쓴다 (큰 모델은 느려서)"""
    size = max(1, len(text) // segments)
    return [text[i * size : i * size + min(size, sample_chars)] for i in range(segments)]


def embed_segments_cached(
    texts: list[str],
    ids: list[str],
    cache: Path,
    *,
    model_name: str = "BAAI/bge-m3",
    segments: int = SEGMENTS,
    sample_chars: int = 2000,
    batch_size: int = 8,
    save_every: int = 10,
    works_per_call: int = 1,
    log=print,
) -> np.ndarray:
    """(작품, 구간, 차원) 벡터. 작품마다 캐시에 쌓아 두어, 중간에 멈춰도 이어서 계산한다"""
    from sentence_transformers import SentenceTransformer  # 선택 의존성 (requirements-bge.txt)

    done: dict[str, np.ndarray] = {}
    if cache.exists():
        with np.load(cache, allow_pickle=False) as f:
            done = {str(i): v for i, v in zip(f["ids"], f["vectors"], strict=True)}
    todo = [(i, t) for i, t in zip(ids, texts, strict=True) if i not in done]
    if todo:
        model = SentenceTransformer(model_name, device="cpu")
        model.max_seq_length = 512
        start = time.time()

        def save() -> None:
            cache.parent.mkdir(parents=True, exist_ok=True)
            keys = list(done)
            np.savez(cache, ids=np.array(keys), vectors=np.stack([done[k] for k in keys]).astype(np.float32))

        # works_per_call편의 구간을 한 번에 넣는다. CPU에서는 길이가 다른 글을 묶으면 짧은 글이 긴 글 길이로 채워져 오히려 느려서 기본은 1편
        per_call = works_per_call
        n = 0
        for c in range(0, len(todo), per_call):
            chunk = todo[c : c + per_call]
            texts_flat = [s for _, t in chunk for s in sample_segments(t, segments, sample_chars)]
            vecs = model.encode(texts_flat, batch_size=batch_size, normalize_embeddings=True)
            for k, (i, _) in enumerate(chunk):
                done[i] = vecs[k * segments : (k + 1) * segments]
            before, n = n, n + len(chunk)
            if n // save_every > before // save_every or n == len(todo):
                save()
                left = (time.time() - start) / n * (len(todo) - n)
                log(f"{len(done)}/{len(ids)} 작품, 남은 시간 약 {left / 60:.0f}분")
    return np.stack([done[i] for i in ids]).astype(np.float64)


# ---------- 특징 낱말 ----------


def word_counts(texts: list[str], max_vocab: int = 8000, min_docs: int = 20) -> tuple[list[str], np.ndarray]:
    """작품 × 낱말 빈도 (1만 낱말당). 고유명사(대문자로 쓰인 비율이 높은 낱말)는 뺀다 — 인물 이름은 작품마다 달라서 비교가 안 된다"""
    per_doc: list[Counter] = []
    capital: Counter = Counter()
    total: Counter = Counter()
    for t in texts:
        c: Counter = Counter()
        for w in WORD.findall(t):
            low = w.lower()
            c[low] += 1
            if w[0].isupper():
                capital[low] += 1
        per_doc.append(c)
        total.update(c)
    doc_freq: Counter = Counter()
    for c in per_doc:
        doc_freq.update(c.keys())
    # 문장 첫머리 때문에 대문자인 경우가 있으니, 60% 넘게 대문자로 쓰인 낱말만 고유명사로 본다
    vocab = [w for w, _ in total.most_common() if doc_freq[w] >= min_docs and capital[w] / total[w] <= 0.6 and len(w) > 1][:max_vocab]
    index = {w: i for i, w in enumerate(vocab)}
    m = np.zeros((len(texts), len(vocab)), dtype=np.float32)
    for d, c in enumerate(per_doc):
        n = sum(c.values()) or 1
        for w, k in c.items():
            j = index.get(w)
            if j is not None:
                m[d, j] = k * 10000.0 / n
    return vocab, m


def _within_center(x: np.ndarray, groups: np.ndarray) -> np.ndarray:
    out = x.astype(np.float64).copy()
    for g in np.unique(groups):
        m = groups == g
        out[m] -= out[m].mean(axis=0)
    return out


def distinctive_words(freq: np.ndarray, y: np.ndarray, groups: np.ndarray, vocab: list[str], top: int = 40) -> dict:
    """같은 작가 안에서 영상화된 작품에 더 많이(적게) 나오는 낱말. 로그 빈도를 작가 안에서 중심화하고 두 무리의 차이를 t값으로"""
    x = _within_center(np.log1p(freq), groups)
    a, b = x[y == 1], x[y == 0]
    diff = a.mean(axis=0) - b.mean(axis=0)
    se = np.sqrt(a.var(axis=0, ddof=1) / len(a) + b.var(axis=0, ddof=1) / len(b)) + 1e-9
    t = diff / se
    order = np.argsort(-t)
    return {
        "t": t,
        "adapted": [(vocab[j], round(float(t[j]), 2)) for j in order[:top]],
        "notAdapted": [(vocab[j], round(float(t[j]), 2)) for j in order[::-1][:top]],
    }


def word_score(freq: np.ndarray, t: np.ndarray, k: int = 100) -> np.ndarray:
    """찾은 쪽의 t값 상위·하위 k개 낱말로 만든 점수: (영상화 쪽 낱말 평균 − 반대쪽 낱말 평균), 로그 빈도 기준"""
    order = np.argsort(-t)
    up, down = order[:k], order[::-1][:k]
    lf = np.log1p(freq)
    return lf[:, up].mean(axis=1) - lf[:, down].mean(axis=1)


def split_authors(authors: np.ndarray, seed: int = 0) -> np.ndarray:
    """작가를 반으로 나눈 표시 (True = 앞쪽 절반)"""
    names = np.unique(authors)
    rng = np.random.default_rng(seed)
    first = set(rng.permutation(names)[: len(names) // 2].tolist())
    return np.array([a in first for a in authors])


def held_out_words(
    freq: np.ndarray, vocab: list[str], works: list[ProxyWork], genres: list[str], k: int = 100, permutations: int = 2000, seed: int = 0
) -> dict:
    y = np.array([1.0 if w.adapted else 0.0 for w in works])
    authors = np.array([w.author for w in works])
    strata = np.array([f"{a}|{g}" for a, g in zip(authors, genres, strict=True)])
    half = split_authors(authors, seed=seed)
    out: dict = {"k": k, "folds": []}
    for name, find, check in (("A→B", half, ~half), ("B→A", ~half, half)):
        found = distinctive_words(freq[find], y[find], authors[find], vocab)
        s = word_score(freq[check], found["t"], k).reshape(-1, 1)
        out["folds"].append(
            {
                "fold": name,
                "findAuthors": int(len(np.unique(authors[find]))),
                "checkAuthors": int(len(np.unique(authors[check]))),
                "sameAuthor": feature_tests(s, y[check], authors[check], ["wordScore"], permutations=permutations, seed=seed)[0],
                "sameAuthorSameGenre": feature_tests(s, y[check], strata[check], ["wordScore"], permutations=permutations, seed=seed)[0],
                "topAdapted": found["adapted"][:25],
                "topNotAdapted": found["notAdapted"][:25],
            }
        )
    full = distinctive_words(freq, y, authors, vocab)
    out["allAuthors"] = {"adapted": full["adapted"], "notAdapted": full["notAdapted"]}
    return out
