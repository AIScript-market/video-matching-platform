"""uvicorn hitmodel.main:app — 환경 변수로 설정한다 (README 참고)."""

from __future__ import annotations

import os
from pathlib import Path

from .api import create_app
from .embedders import embedder_from_name
from .pg_store import PgStore
from .service import HitService, Settings

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL이 필요합니다")

settings = Settings(
    min_training_pairs=int(os.environ.get("ML_MIN_TRAINING_PAIRS", "100")),
    neighbor_min=int(os.environ.get("ML_NEIGHBOR_MIN", "3")),
    model_dir=Path(os.environ.get("ML_MODEL_DIR", "/models")),
)
service = HitService(PgStore(database_url), embedder_from_name(os.environ.get("ML_EMBEDDER", "hash-ngram")), settings)
app = create_app(service, token=os.environ.get("ML_TOKEN") or None)
