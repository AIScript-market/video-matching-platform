"""작품 성과를 "성공했는가" 정답으로 바꾼다.

채널 크기 차이를 걷어내야 대본의 힘을 볼 수 있다. 구독자 100만 채널의 10만 회와 1만 채널의 10만 회는 다르다.

- 도달(reach)   = log(1+조회수) - log(1+공개 시점 채널 구독자)
- 반응(engage)  = (좋아요 + 3 × 긍정 댓글) / 조회수
- 점수          = z(도달) + z(반응)   (학습에 쓰는 대본들 안에서 표준화)
- 정답(hit)     = 점수 상위 20%

성과는 공개 후 7일이 지난 기록만 쓰고, 그중 공개 후 30일에 가장 가까운 기록을 고른다.
한 대본으로 여러 편을 만들었으면 편별 값을 평균한다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

import numpy as np

LABEL_DEFINITION = "z(log1p(views)-log1p(channelSubscribers)) + z((likes+3*positiveComments)/views), top 20% = hit; snapshot >=7d nearest 30d"
MIN_DAYS = 7
TARGET_DAYS = 30
HIT_QUANTILE = 0.8
POSITIVE_COMMENT_WEIGHT = 3.0


@dataclass
class Outcome:
    """성과 기록 한 줄 (학습 동의한 대본으로 만든 공개 작품)"""

    script_id: str
    genre: str
    work_id: str
    published_at: datetime
    captured_at: datetime
    views: int
    likes: int | None = None
    positive_comments: int | None = None
    channel_subscribers: int | None = None


@dataclass
class LabeledScript:
    script_id: str
    genre: str
    label_time: datetime
    works: int
    reach: float
    engagement: float
    score: float = 0.0
    percentile: float = 0.0
    hit: bool = False


def pick_snapshots(outcomes: list[Outcome]) -> dict[str, Outcome]:
    """작품마다 공개 후 7일 이상 지난 기록 중 30일에 가장 가까운 것 하나"""
    best: dict[str, tuple[float, Outcome]] = {}
    for o in outcomes:
        days = (o.captured_at - o.published_at).total_seconds() / 86400
        if days < MIN_DAYS:
            continue
        distance = abs(days - TARGET_DAYS)
        if o.work_id not in best or distance < best[o.work_id][0]:
            best[o.work_id] = (distance, o)
    return {work_id: o for work_id, (_, o) in best.items()}


def _zscore(values: np.ndarray) -> np.ndarray:
    std = values.std()
    return (values - values.mean()) / std if std > 0 else np.zeros_like(values)


def label_scripts(outcomes: list[Outcome]) -> list[LabeledScript]:
    snapshots = list(pick_snapshots(outcomes).values())
    if not snapshots:
        return []
    known_subs = [o.channel_subscribers for o in snapshots if o.channel_subscribers is not None]
    # 구독자 수를 모르면 아는 값들의 중앙값으로 채운다 (없으면 0)
    fill_subs = float(np.median(known_subs)) if known_subs else 0.0

    per_script: dict[str, list[Outcome]] = {}
    for o in snapshots:
        per_script.setdefault(o.script_id, []).append(o)

    rows: list[LabeledScript] = []
    for script_id, works in per_script.items():
        reach = [math.log1p(o.views) - math.log1p(o.channel_subscribers if o.channel_subscribers is not None else fill_subs) for o in works]
        engage = [((o.likes or 0) + POSITIVE_COMMENT_WEIGHT * (o.positive_comments or 0)) / max(o.views, 1) for o in works]
        rows.append(
            LabeledScript(
                script_id=script_id,
                genre=works[0].genre,
                label_time=min(o.published_at for o in works),
                works=len(works),
                reach=float(np.mean(reach)),
                engagement=float(np.mean(engage)),
            )
        )

    scores = _zscore(np.array([r.reach for r in rows])) + _zscore(np.array([r.engagement for r in rows]))
    # 순위로 자른다 (점수가 같은 대본이 많아도 정확히 상위 20%만 성공으로 본다)
    n_hits = max(1, round(len(rows) * (1 - HIT_QUANTILE)))
    order = scores.argsort(kind="stable").argsort()
    for r, score, rank in zip(rows, scores, order, strict=True):
        r.score = float(score)
        r.percentile = float(rank / max(len(rows) - 1, 1))
        r.hit = bool(rank >= len(rows) - n_hits) and len(rows) > 1
    rows.sort(key=lambda r: r.label_time)
    return rows
