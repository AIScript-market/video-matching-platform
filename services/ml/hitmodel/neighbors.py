"""비슷한 성공작 찾기. 학습 데이터가 모델을 만들 만큼 쌓이기 전에도 쓸 수 있다."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .labels import HIT_QUANTILE, LabeledScript

# 이웃의 성공률을 전체 평균(상위 20% = 0.2) 쪽으로 당기는 강도
PRIOR_WEIGHT = 1.0
PRIOR = 1 - HIT_QUANTILE


@dataclass
class Neighbor:
    script_id: str
    similarity: float
    hit: bool
    percentile: float


def nearest(query: np.ndarray, ids: list[str], vectors: np.ndarray, labels: dict[str, LabeledScript], k: int = 5) -> list[Neighbor]:
    """정규화된 벡터끼리 코사인 유사도로 가장 가까운 정답 있는 대본 k개"""
    if len(ids) == 0:
        return []
    sims = vectors @ query
    order = np.argsort(-sims)[:k]
    return [Neighbor(ids[i], float(sims[i]), labels[ids[i]].hit, labels[ids[i]].percentile) for i in order]


def neighbor_signal(neighbors: list[Neighbor]) -> float:
    """유사도로 가중한 이웃 성공률. 확률이 아니라 정렬용 참고 신호다"""
    weights = np.array([max(n.similarity, 0.0) for n in neighbors])
    hits = np.array([1.0 if n.hit else 0.0 for n in neighbors])
    return float((weights @ hits + PRIOR_WEIGHT * PRIOR) / (weights.sum() + PRIOR_WEIGHT))
