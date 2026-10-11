from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

import pytest

from hitmodel.embedders import HashingNgramEmbedder
from hitmodel.labels import Outcome
from hitmodel.service import HitService, Settings
from hitmodel.store import MemoryStore

T0 = datetime(2026, 1, 1, tzinfo=UTC)

HIT_SCENES = [
    "S#{n}. 폐공장 (밤)\n총성이 울린다. 민재가 숨을 멈춘다.\n민재\n누가 배신했어?\n수아\n처음부터 너였잖아!",
    "S#{n}. 옥상 (새벽)\n추격 끝에 수아가 난간에 선다.\n수아\n비밀은 이제 끝이야!\n민재\n잠깐, 그 열쇠는 어디서 났어?",
]
FLAT_SCENES = [
    "S#{n}. 카페 (낮)\n지윤이 커피를 마신다. 창밖으로 사람들이 지나간다.\n지윤\n오늘 날씨 좋다.\n하나\n응, 산책하기 좋겠다.",
    "S#{n}. 사무실 (오후)\n지윤이 서류를 정리한다. 하나가 간식을 건넨다.\n하나\n이거 먹어.\n지윤\n고마워.",
]


def make_script(kind: str, rng: random.Random, scenes: int = 6) -> str:
    pool = HIT_SCENES if kind == "hit" else FLAT_SCENES
    return "\n\n".join(rng.choice(pool).format(n=i + 1) for i in range(scenes))


def fill_store(store: MemoryStore, n: int, seed: int = 7) -> dict[str, str]:
    """n편의 대본과 성과. 20%는 긴장감 있는 대본이고 조회·반응이 높다. 나머지는 잔잔하고 낮다."""
    rng = random.Random(seed)
    kinds: dict[str, str] = {}
    for i in range(n):
        kind = "hit" if i % 5 == 0 else "flat"
        sid = f"s{i:03d}"
        kinds[sid] = kind
        store.add_script(sid, make_script(kind, rng), genre="스릴러" if i % 2 else "드라마")
        published = T0 + timedelta(days=i)
        subs = rng.choice([1_000, 10_000, 100_000])
        views = int(subs * (3.0 if kind == "hit" else 0.3) * rng.uniform(0.7, 1.3))
        store.outcome_rows.append(
            Outcome(
                script_id=sid,
                genre="스릴러" if i % 2 else "드라마",
                work_id=f"w{i:03d}",
                published_at=published,
                captured_at=published + timedelta(days=30),
                views=views,
                likes=int(views * (0.08 if kind == "hit" else 0.02)),
                positive_comments=int(views * (0.01 if kind == "hit" else 0.001)),
                channel_subscribers=subs,
            )
        )
    return kinds


@pytest.fixture
def store() -> MemoryStore:
    return MemoryStore()


@pytest.fixture
def service(store: MemoryStore, tmp_path) -> HitService:
    return HitService(store, HashingNgramEmbedder(dims=256), Settings(min_training_pairs=40, neighbor_min=3, model_dir=tmp_path))
