"""ML 서비스가 읽고 쓰는 데이터. 실제로는 PostgreSQL(pg_store.py), 테스트에서는 메모리 저장소를 쓴다."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

import numpy as np

from .labels import Outcome


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class ScriptText:
    id: str
    full_text: str
    genre: str


@dataclass
class StoredEmbedding:
    script_id: str
    embedder: str
    dims: int
    scene_count: int
    pooled: np.ndarray
    scene_vectors: np.ndarray  # (scene_count_stored, dims)
    features: dict[str, float]
    text_hash: str


@dataclass
class ModelVersion:
    version: str
    embedder: str
    algorithm: str
    label_definition: str
    training_pairs: int
    metrics: dict
    artifact_path: str
    active: bool
    trained_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class Store(Protocol):
    def script_text(self, script_id: str) -> ScriptText | None: ...
    def stale_script_ids(self, embedder: str, limit: int) -> list[str]:
        """벡터가 없거나 본문이 바뀐 대본 (본문이 빈 대본은 뺀다)"""
        ...
    def get_embedding(self, script_id: str, embedder: str) -> StoredEmbedding | None: ...
    def save_embedding(self, e: StoredEmbedding) -> None: ...
    def embeddings(self, embedder: str, script_ids: list[str] | None = None) -> dict[str, StoredEmbedding]: ...
    def count_embeddings(self, embedder: str) -> int: ...
    def outcomes(self) -> list[Outcome]:
        """학습 동의한 대본(작가 활동 중)으로 만든 공개 작품의 성과 기록 전부"""
        ...
    def save_model_version(self, m: ModelVersion) -> None:
        """m.active면 다른 버전을 모두 비활성으로 바꾼다"""
        ...
    def active_model(self) -> ModelVersion | None: ...


class MemoryStore:
    def __init__(self) -> None:
        self.scripts: dict[str, ScriptText] = {}
        self.consent: dict[str, bool] = {}
        self.vectors: dict[tuple[str, str], StoredEmbedding] = {}
        self.outcome_rows: list[Outcome] = []
        self.models: list[ModelVersion] = []

    def add_script(self, script_id: str, text: str, genre: str = "드라마", consent: bool = True) -> None:
        self.scripts[script_id] = ScriptText(script_id, text, genre)
        self.consent[script_id] = consent

    def script_text(self, script_id: str) -> ScriptText | None:
        return self.scripts.get(script_id)

    def stale_script_ids(self, embedder: str, limit: int) -> list[str]:
        out = []
        for s in self.scripts.values():
            e = self.vectors.get((s.id, embedder))
            if s.full_text.strip() and (e is None or e.text_hash != text_hash(s.full_text)):
                out.append(s.id)
        return out[:limit]

    def get_embedding(self, script_id: str, embedder: str) -> StoredEmbedding | None:
        return self.vectors.get((script_id, embedder))

    def save_embedding(self, e: StoredEmbedding) -> None:
        self.vectors[(e.script_id, e.embedder)] = e

    def embeddings(self, embedder: str, script_ids: list[str] | None = None) -> dict[str, StoredEmbedding]:
        wanted = set(script_ids) if script_ids is not None else None
        return {sid: e for (sid, emb), e in self.vectors.items() if emb == embedder and (wanted is None or sid in wanted)}

    def count_embeddings(self, embedder: str) -> int:
        return sum(1 for (_, emb) in self.vectors if emb == embedder)

    def outcomes(self) -> list[Outcome]:
        return [o for o in self.outcome_rows if self.consent.get(o.script_id)]

    def save_model_version(self, m: ModelVersion) -> None:
        if m.active:
            for old in self.models:
                old.active = False
        self.models.append(m)

    def active_model(self) -> ModelVersion | None:
        return next((m for m in reversed(self.models) if m.active), None)
