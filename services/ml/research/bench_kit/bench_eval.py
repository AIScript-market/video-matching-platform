"""모델 비교 키트 채점기 (numpy만 쓴다. 키트와 함께 친구 컴퓨터로 가는 파일).

점수 매기는 법 (docs/model-bench.md와 같다)
1. 모델 점수에서 "같은 묶음 고정효과 + 글 길이(log_len)" 몫을 뺀다. 인기작일수록 글이 길게 쓰였을 수 있어서다.
2. 같은 묶음(eval_group) 안의 (흥행, 아닌 것) 쌍만 세어 AUC를 낸다. 0.5 = 동전 던지기.

쓰는 법
  python bench_eval.py dev.jsonl my_dev_predictions.csv
  예측 파일은 id,score 두 열. dev 예측은 반드시 fold 열로 나눈 교차검증(그 fold를 빼고 학습한 모델)의 점수여야 한다.
"""

from __future__ import annotations

import csv
import json
import sys

import numpy as np


def _dummies(groups: np.ndarray) -> np.ndarray:
    _, inverse = np.unique(groups, return_inverse=True)
    out = np.zeros((len(groups), inverse.max() + 1))
    out[np.arange(len(groups)), inverse] = 1.0
    return out


def residualize(scores: np.ndarray, groups: np.ndarray, log_len: np.ndarray) -> np.ndarray:
    """묶음 고정효과 + log_len으로 회귀한 나머지"""
    design = np.hstack([_dummies(groups), log_len.reshape(-1, 1)])
    coef, *_ = np.linalg.lstsq(design, scores, rcond=None)
    return scores - design @ coef


def _midranks(v: np.ndarray) -> np.ndarray:
    order = np.argsort(v, kind="mergesort")
    ranks = np.empty(len(v))
    ranks[order] = np.arange(1, len(v) + 1)
    _, inverse, counts = np.unique(v, return_inverse=True, return_counts=True)
    return (np.bincount(inverse, weights=ranks) / counts)[inverse]


def _members(groups: np.ndarray) -> list[np.ndarray]:
    return [np.where(groups == g)[0] for g in np.unique(groups)]


def _wins_pairs(s: np.ndarray, y: np.ndarray, members: list[np.ndarray]) -> tuple[float, float]:
    wins = pairs = 0.0
    for idx in members:
        n1 = y[idx].sum()
        n0 = len(idx) - n1
        if n1 == 0 or n0 == 0:
            continue
        wins += y[idx] @ _midranks(s[idx]) - n1 * (n1 + 1) / 2
        pairs += n1 * n0
    return wins, pairs


def grouped_auc(scores: np.ndarray, y: np.ndarray, groups: np.ndarray) -> float:
    wins, pairs = _wins_pairs(scores, y, _members(groups))
    return wins / pairs if pairs else float("nan")


def bench_auc(scores: np.ndarray, y: np.ndarray, groups: np.ndarray, log_len: np.ndarray) -> float:
    return grouped_auc(residualize(np.asarray(scores, float), groups, log_len), y, groups)


def bootstrap_ci(scores, y, groups, log_len, other=None, n: int = 1000, seed: int = 0) -> dict:
    """묶음 단위로 다시 뽑은 95% 구간. other(비교 모델 점수)가 있으면 차이(scores − other)의 구간도"""
    s = residualize(np.asarray(scores, float), groups, log_len)
    o = residualize(np.asarray(other, float), groups, log_len) if other is not None else None
    members = _members(groups)
    rng = np.random.default_rng(seed)
    vals, diffs = [], []
    for _ in range(n):
        picked = [members[i] for i in rng.integers(0, len(members), len(members))]
        w, p = _wins_pairs(s, y, picked)
        if not p:
            continue
        vals.append(w / p)
        if o is not None:
            w2, _ = _wins_pairs(o, y, picked)
            diffs.append((w - w2) / p)
    out = {"low": float(np.quantile(vals, 0.025)), "high": float(np.quantile(vals, 0.975))}
    if o is not None:
        out["diffLow"], out["diffHigh"] = float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975))
    return out


def permutation_p(scores, y, groups, log_len, permutations: int = 2000, seed: int = 0) -> float:
    """묶음 안에서 정답을 섞는 양쪽 검정. 점수가 이 정답을 보지 않고 만들어졌을 때만 쓸 수 있다 (시험용 평가)"""
    s = residualize(np.asarray(scores, float), groups, log_len)
    members = _members(groups)
    rng = np.random.default_rng(seed)
    w, p = _wins_pairs(s, y, members)
    observed = abs(w / p - 0.5)
    hits = 0
    yy = y.copy()
    for _ in range(permutations):
        for idx in members:
            yy[idx] = y[rng.permutation(idx)]
        w2, _ = _wins_pairs(s, yy, members)
        hits += abs(w2 / p - 0.5) >= observed - 1e-12
    return (1 + hits) / (1 + permutations)


def read_rows(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def read_predictions(path: str) -> dict[str, float]:
    with open(path, encoding="utf-8", newline="") as f:
        return {r["id"]: float(r["score"]) for r in csv.DictReader(f)}


def score_file(rows: list[dict], predictions: dict[str, float]) -> dict:
    missing = [r["id"] for r in rows if r["id"] not in predictions]
    if missing:
        raise SystemExit(f"예측이 없는 행 {len(missing)}개 (예: {missing[0]})")
    s = np.array([predictions[r["id"]] for r in rows])
    y = np.array([float(r["y"]) for r in rows])
    g = np.array([r["eval_group"] for r in rows])
    ll = np.array([float(r["log_len"]) for r in rows])
    return {"auc": bench_auc(s, y, g, ll), "ci95": bootstrap_ci(s, y, g, ll), "rows": len(rows)}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    result = score_file(read_rows(sys.argv[1]), read_predictions(sys.argv[2]))
    print(json.dumps(result, ensure_ascii=False, indent=2))
