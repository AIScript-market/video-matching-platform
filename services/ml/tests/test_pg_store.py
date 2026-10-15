"""PgStore SQL이 Prisma 스키마와 맞는지 (실제 PostgreSQL + 시드 필요, DATABASE_URL 없으면 건너뜀).

모델 버전은 쓰지 않는다 (개발 DB의 활성 모델을 바꾸지 않게). 시드 대본의 벡터만 만든다.
"""

import os

import pytest

from hitmodel.embedders import HashingNgramEmbedder
from hitmodel.service import HitService, Settings

DATABASE_URL = os.environ.get("DATABASE_URL")
pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="DATABASE_URL 없음")
SEED_SCRIPT = "seed_script_last_train"


@pytest.fixture
def store():
    from hitmodel.pg_store import PgStore

    s = PgStore(DATABASE_URL)
    if s.script_text(SEED_SCRIPT) is None:
        pytest.skip("시드 데이터 없음 (pnpm --filter api db:seed)")
    return s


def test_embedding_round_trip_and_read_queries(store, tmp_path):
    embedder = HashingNgramEmbedder()
    service = HitService(store, embedder, Settings(model_dir=tmp_path))
    result = service.embed(SEED_SCRIPT, force=True)
    assert result["status"] == "EMBEDDED"

    saved = store.get_embedding(SEED_SCRIPT, embedder.name)
    assert saved is not None and saved.dims == embedder.dims
    assert saved.scene_vectors.shape == (min(saved.scene_count, 300), embedder.dims)
    assert service.embed(SEED_SCRIPT)["status"] == "UNCHANGED"
    assert SEED_SCRIPT not in store.stale_script_ids(embedder.name, 10_000)
    assert SEED_SCRIPT in store.embeddings(embedder.name, [SEED_SCRIPT])

    # 정답·모델 조회 SQL이 스키마와 맞는지 (결과 내용은 DB 상태에 따라 다르다)
    assert isinstance(store.outcomes(), list)
    store.active_model()
    assert service.status()["embeddedScripts"] >= 1
