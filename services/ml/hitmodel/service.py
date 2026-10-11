"""벡터화 → 정답 만들기 → 학습 → 예측·추천을 묶는다."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from . import sentiment
from .embedders import Embedder, pool_scenes
from .labels import LABEL_DEFINITION, LabeledScript, label_scripts
from .model import ALGORITHM, HitModel, beats_baseline, evaluate_time_split, fit_model
from .neighbors import Neighbor, nearest, neighbor_signal
from .segment import FEATURE_NAMES, split_scenes, structural_features
from .store import ModelVersion, Store, StoredEmbedding, text_hash


class ScriptNotFound(Exception):
    pass


@dataclass
class Settings:
    # 이만큼 정답 있는 대본이 쌓여야 모델을 학습한다. 그 전에는 비슷한 성공작만 보여 준다
    min_training_pairs: int = 100
    # 비슷한 작품을 보여 주려면 정답 있는 대본이 최소 이만큼 있어야 한다
    neighbor_min: int = 3
    model_dir: Path = Path("/models")
    # 장면 벡터는 앞에서부터 이만큼만 저장한다 (전체 벡터에는 모든 장면이 들어간다)
    max_stored_scenes: int = 300
    # 추천 요청 한 번에 새로 벡터화하는 대본 수 상한
    embed_on_demand: int = 50


def _neighbor_json(n: Neighbor) -> dict:
    return {"scriptId": n.script_id, "similarity": round(n.similarity, 4), "hit": n.hit, "percentile": round(n.percentile, 4)}


def _features(e: StoredEmbedding) -> np.ndarray:
    return np.array([float(e.features.get(k, 0.0)) for k in FEATURE_NAMES])


class HitService:
    def __init__(self, store: Store, embedder: Embedder, settings: Settings | None = None):
        self.store = store
        self.embedder = embedder
        self.settings = settings or Settings()
        self._model_cache: tuple[str, HitModel] | None = None

    # ---------- 벡터화 ----------

    def embed(self, script_id: str, force: bool = False) -> dict:
        script = self.store.script_text(script_id)
        if script is None:
            raise ScriptNotFound(script_id)
        base = {"scriptId": script_id, "embedder": self.embedder.name}
        if not script.full_text.strip():
            return {**base, "status": "EMPTY"}
        digest = text_hash(script.full_text)
        existing = self.store.get_embedding(script_id, self.embedder.name)
        if existing and existing.text_hash == digest and not force:
            return {**base, "status": "UNCHANGED", "sceneCount": existing.scene_count}

        scenes = split_scenes(script.full_text)
        vectors = self.embedder.embed([s.text for s in scenes])
        self.store.save_embedding(
            StoredEmbedding(
                script_id=script_id,
                embedder=self.embedder.name,
                dims=self.embedder.dims,
                scene_count=len(scenes),
                pooled=pool_scenes(scenes, vectors),
                scene_vectors=vectors[: self.settings.max_stored_scenes],
                features=structural_features(script.full_text, scenes),
                text_hash=digest,
            )
        )
        return {**base, "status": "EMBEDDED", "sceneCount": len(scenes), "dims": self.embedder.dims}

    def embed_stale(self, limit: int = 500) -> dict:
        ids = self.store.stale_script_ids(self.embedder.name, limit)
        for script_id in ids:
            self.embed(script_id)
        return {"embedder": self.embedder.name, "embedded": len(ids)}

    def _ensure(self, script_id: str) -> StoredEmbedding | None:
        e = self.store.get_embedding(script_id, self.embedder.name)
        if e is None and self.embed(script_id)["status"] == "EMBEDDED":
            e = self.store.get_embedding(script_id, self.embedder.name)
        return e

    # ---------- 정답 ----------

    def _labeled(self) -> tuple[list[LabeledScript], dict[str, StoredEmbedding]]:
        labels = label_scripts(self.store.outcomes())
        ids = [l.script_id for l in labels]
        embs = self.store.embeddings(self.embedder.name, ids)
        for script_id in ids:
            if script_id not in embs and self._ensure(script_id) is not None:
                embs = self.store.embeddings(self.embedder.name, ids)
        return [l for l in labels if l.script_id in embs], embs

    # ---------- 학습 ----------

    def train(self, force_activate: bool = False, now: datetime | None = None) -> dict:
        labeled, embs = self._labeled()
        n = len(labeled)
        base = {"trainingPairs": n, "requiredPairs": self.settings.min_training_pairs, "embedder": self.embedder.name}
        if n < self.settings.min_training_pairs:
            return {**base, "status": "NOT_ENOUGH_DATA"}
        y = np.array([1.0 if l.hit else 0.0 for l in labeled])
        if y.min() == y.max():
            return {**base, "status": "NOT_ENOUGH_DATA", "note": "성공과 실패가 모두 있어야 학습할 수 있습니다"}

        pooled = np.stack([embs[l.script_id].pooled for l in labeled])
        feats = np.stack([_features(embs[l.script_id]) for l in labeled])
        genres = [l.genre for l in labeled]
        metrics = evaluate_time_split(pooled, feats, y, genres, embedder=self.embedder.name, feature_names=FEATURE_NAMES)
        model = fit_model(pooled, feats, y, embedder=self.embedder.name, feature_names=FEATURE_NAMES)

        trained_at = now or datetime.now(UTC)
        version = trained_at.strftime("hit-%Y%m%d-%H%M%S")
        path = self.settings.model_dir / f"{version}.npz"
        model.save(path)
        active = force_activate or beats_baseline(metrics)
        self.store.save_model_version(
            ModelVersion(
                version=version,
                embedder=self.embedder.name,
                algorithm=ALGORITHM,
                label_definition=LABEL_DEFINITION,
                training_pairs=n,
                metrics=metrics,
                artifact_path=str(path),
                active=active,
                trained_at=trained_at,
            )
        )
        return {**base, "status": "TRAINED", "version": version, "metrics": metrics, "activated": active}

    def _active(self) -> tuple[ModelVersion, HitModel] | None:
        mv = self.store.active_model()
        if mv is None or mv.embedder != self.embedder.name:
            return None
        if self._model_cache is None or self._model_cache[0] != mv.version:
            self._model_cache = (mv.version, HitModel.load(Path(mv.artifact_path)))
        return mv, self._model_cache[1]

    # ---------- 예측·추천 ----------

    def status(self) -> dict:
        labeled, _ = self._labeled()
        active = self.store.active_model()
        return {
            "embedder": self.embedder.name,
            "embeddedScripts": self.store.count_embeddings(self.embedder.name),
            "trainingPairs": len(labeled),
            "requiredPairs": self.settings.min_training_pairs,
            "neighborMin": self.settings.neighbor_min,
            "sentiment": sentiment.VERSION,
            "activeModel": None
            if active is None
            else {"version": active.version, "embedder": active.embedder, "trainedAt": active.trained_at.isoformat(), "metrics": active.metrics},
        }

    def _readiness(self, n: int) -> dict:
        return {"embedder": self.embedder.name, "trainingPairs": n, "requiredPairs": self.settings.min_training_pairs}

    def predict(self, script_id: str) -> dict:
        e = self._ensure(script_id)
        if e is None:
            if self.store.script_text(script_id) is None:
                raise ScriptNotFound(script_id)
            return {"scriptId": script_id, "mode": "NOT_EMBEDDED", **self._readiness(0)}
        labeled, embs = self._labeled()
        out = {"scriptId": script_id, **self._readiness(len(labeled))}

        others = [l for l in labeled if l.script_id != script_id]
        neighbors: list[Neighbor] = []
        if len(others) >= self.settings.neighbor_min:
            ids = [l.script_id for l in others]
            neighbors = nearest(e.pooled, ids, np.stack([embs[i].pooled for i in ids]), {l.script_id: l for l in others})

        active = self._active()
        if active is not None:
            mv, model = active
            p, lo, hi = model.predict(e.pooled, _features(e))
            return {
                **out,
                "mode": "MODEL",
                "modelVersion": mv.version,
                "probability": round(float(p[0]), 4),
                "low": round(float(lo[0]), 4),
                "high": round(float(hi[0]), 4),
                "neighbors": [_neighbor_json(n) for n in neighbors[:3]],
            }
        if neighbors:
            return {**out, "mode": "NEIGHBORS", "neighborSignal": round(neighbor_signal(neighbors), 4), "neighbors": [_neighbor_json(n) for n in neighbors]}
        return {**out, "mode": "NOT_READY", "neighbors": []}

    def rank(self, script_ids: list[str], limit: int = 20) -> dict:
        embs = self.store.embeddings(self.embedder.name, script_ids)
        for script_id in [i for i in script_ids if i not in embs][: self.settings.embed_on_demand]:
            try:
                e = self._ensure(script_id)
            except ScriptNotFound:
                continue  # 그사이 지워진 대본은 건너뛴다
            if e is not None:
                embs[script_id] = e
        scored_ids = [i for i in script_ids if i in embs]
        labeled, label_embs = self._labeled()
        base = self._readiness(len(labeled))
        if not scored_ids:
            return {**base, "mode": "NOT_READY", "items": []}

        active = self._active()
        if active is not None:
            mv, model = active
            p, lo, hi = model.predict(np.stack([embs[i].pooled for i in scored_ids]), np.stack([_features(embs[i]) for i in scored_ids]))
            items = [
                {
                    "scriptId": sid,
                    "score": round(float(p[k]), 4),
                    "probability": round(float(p[k]), 4),
                    "low": round(float(lo[k]), 4),
                    "high": round(float(hi[k]), 4),
                }
                for k, sid in enumerate(scored_ids)
            ]
            items.sort(key=lambda x: -x["score"])
            return {**base, "mode": "MODEL", "modelVersion": mv.version, "items": items[:limit]}

        if len(labeled) >= self.settings.neighbor_min:
            by_id = {l.script_id: l for l in labeled}
            items = []
            for sid in scored_ids:
                others = [l.script_id for l in labeled if l.script_id != sid]
                if len(others) < self.settings.neighbor_min:
                    continue
                ns = nearest(embs[sid].pooled, others, np.stack([label_embs[i].pooled for i in others]), by_id)
                items.append({"scriptId": sid, "score": round(neighbor_signal(ns), 4), "neighbors": [_neighbor_json(n) for n in ns[:2]]})
            items.sort(key=lambda x: -x["score"])
            return {**base, "mode": "NEIGHBORS", "items": items[:limit]}

        return {**base, "mode": "NOT_READY", "items": [{"scriptId": sid, "score": None} for sid in scored_ids[:limit]]}

    @staticmethod
    def count_sentiment(comments: list[str]) -> dict:
        return {**asdict(sentiment.count(comments)), "version": sentiment.VERSION}
