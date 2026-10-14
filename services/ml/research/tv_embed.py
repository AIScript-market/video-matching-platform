"""TV 에피소드 줄거리를 bge-m3로 벡터화한다 (작품마다 벡터 하나, 앞 3,000자). 캐시에 쌓아 이어서 계산할 수 있다."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .proxy_explore import embed_segments_cached
from .tv_episodes import Episode


def episode_id(e: Episode) -> str:
    return f"{e.series}|{e.season}|{e.number}|{e.air_date}"


def embed_episodes(episodes: list[Episode], cache: Path, log=print) -> np.ndarray:
    vectors = embed_segments_cached(
        [e.summary for e in episodes], [episode_id(e) for e in episodes], cache, segments=1, sample_chars=3000, save_every=200, log=log
    )
    return vectors[:, 0, :]
