"""대본 장면을 벡터로 바꾸는 임베더.

기본은 문자 n그램 해시 임베더다. 학습이나 외부 API가 필요 없고, 같은 글이면 언제나 같은 벡터가 나온다.
한국어는 음절 하나가 의미 단위에 가까워서 1~3그램만으로도 소재·말투·장면 분위기 차이를 꽤 잡는다.
더 좋은 벡터가 필요하면 ML_EMBEDDER=bge-m3 로 공개 다국어 임베딩 모델(로컬 실행)을 쓴다.
임베더 이름이 DB에 함께 저장되므로, 임베더를 바꾸면 벡터와 모델을 다시 만든다.
"""

from __future__ import annotations

import math
import re
import zlib
from typing import Protocol

import numpy as np

from .segment import Scene

WHITESPACE = re.compile(r"\s+")
# 장면 하나를 임베딩할 때 쓰는 최대 글자 수 (긴 장면은 앞부분만)
MAX_SCENE_CHARS = 4000


class Embedder(Protocol):
    name: str
    dims: int

    def embed(self, texts: list[str]) -> np.ndarray:
        """(len(texts), dims) 크기의 L2 정규화된 벡터"""
        ...


def _normalize_rows(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return m / norms


class HashingNgramEmbedder:
    """문자 1~3그램을 crc32로 해시해 고정 길이 벡터에 더한다 (부호 해시로 충돌 편향을 줄인다)."""

    def __init__(self, dims: int = 512, max_n: int = 3):
        self.dims = dims
        self.max_n = max_n
        self.name = f"hash-ngram-v1-d{dims}"

    def _vector(self, text: str) -> np.ndarray:
        t = WHITESPACE.sub(" ", text.lower()).strip()
        counts: dict[int, float] = {}
        for n in range(1, self.max_n + 1):
            for i in range(len(t) - n + 1):
                gram = t[i : i + n]
                if gram.isspace():
                    continue
                h = zlib.crc32(f"{n}:{gram}".encode())
                idx = h % self.dims
                sign = 1.0 if (h >> 31) & 1 else -1.0
                counts[idx] = counts.get(idx, 0.0) + sign
        v = np.zeros(self.dims, dtype=np.float64)
        for idx, c in counts.items():
            # 자주 나오는 그램이 벡터를 독차지하지 않게 로그로 누른다
            v[idx] = math.copysign(math.log1p(abs(c)), c)
        return v

    def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dims))
        return _normalize_rows(np.stack([self._vector(t[:MAX_SCENE_CHARS]) for t in texts]))


class SentenceTransformerEmbedder:
    """공개 임베딩 모델(예: BAAI/bge-m3)을 로컬에서 돌린다. requirements-bge.txt 설치가 필요하다."""

    def __init__(self, model_name: str = "BAAI/bge-m3"):
        from sentence_transformers import SentenceTransformer  # 선택 의존성

        self._model = SentenceTransformer(model_name)
        self.dims = int(self._model.get_sentence_embedding_dimension())
        self.name = model_name.split("/")[-1].lower()

    def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dims))
        out = self._model.encode([t[:MAX_SCENE_CHARS] for t in texts], normalize_embeddings=True)
        return np.asarray(out, dtype=np.float64)


def embedder_from_name(name: str) -> Embedder:
    if name in ("", "hash-ngram"):
        return HashingNgramEmbedder()
    if name == "bge-m3":
        return SentenceTransformerEmbedder("BAAI/bge-m3")
    raise ValueError(f"알 수 없는 임베더: {name}")


def pool_scenes(scenes: list[Scene], vectors: np.ndarray) -> np.ndarray:
    """장면 벡터를 장면 길이의 제곱근으로 가중 평균한다 (긴 장면이 너무 지배하지 않게)."""
    if len(scenes) == 0:
        return np.zeros(vectors.shape[1] if vectors.ndim == 2 else 0)
    weights = np.array([math.sqrt(max(s.chars, 1)) for s in scenes])
    pooled = (vectors * weights[:, None]).sum(axis=0) / weights.sum()
    norm = np.linalg.norm(pooled)
    return pooled / norm if norm else pooled
