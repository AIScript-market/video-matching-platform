"""흥행 판단 모델: 대본 벡터 + 구조 특징 → "상위 20% 성과일 확률".

표본이 수백 편 단위로 작기 때문에 단순하고 해석 가능한 모델로 시작한다.
1. 대본 벡터를 학습 데이터의 주성분 몇 개로 줄인다 (차원이 표본보다 훨씬 크면 과적합한다).
2. 구조 특징을 붙이고 표준화한다.
3. L2 로지스틱 회귀를 부트스트랩으로 여러 번 학습한다. 예측의 평균이 확률, 퍼짐이 불확실성이다.
   벌점 세기(λ)는 학습 데이터 안의 교차 검증(로그 손실)으로 고른다. 표본이 작을수록 강한 벌점이 맞는 경우가 많다.

평가는 시간 순서로 나눈다. 앞 80%로 학습하고 뒤 20%를 맞힌다 (미래 데이터로 과거를 맞히지 않게).
비교 기준은 "장르별 성공률"이다. 이 기준보다 못하면 모델을 활성화하지 않는다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

ALGORITHM = "pca-logreg-l2cv-bootstrap-v1"
LAMBDAS = (1.0, 3.0, 10.0, 30.0, 100.0, 300.0)
DEFAULT_LAMBDA = 30.0


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def fit_logistic(x: np.ndarray, y: np.ndarray, lam: float = 1.0, iters: int = 50) -> np.ndarray:
    """L2 로지스틱 회귀 (뉴턴법). 반환값은 [절편, 가중치...]. 절편에는 벌점을 주지 않는다."""
    xb = np.hstack([np.ones((len(x), 1)), x])
    d = xb.shape[1]
    reg = np.eye(d) * lam
    reg[0, 0] = 0.0
    w = np.zeros(d)
    for _ in range(iters):
        p = sigmoid(xb @ w)
        grad = xb.T @ (p - y) + reg @ w
        hess = xb.T @ (xb * (p * (1 - p))[:, None]) + reg + np.eye(d) * 1e-9
        step = np.linalg.solve(hess, grad)
        w -= step
        if np.max(np.abs(step)) < 1e-7:
            break
    return w


def auc(scores: np.ndarray, y: np.ndarray) -> float | None:
    """맨-휘트니 U로 계산한 AUC. 한쪽 정답만 있으면 None"""
    pos, neg = scores[y == 1], scores[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return None
    greater = (pos[:, None] > neg[None, :]).sum()
    ties = (pos[:, None] == neg[None, :]).sum()
    return float((greater + 0.5 * ties) / (len(pos) * len(neg)))


@dataclass
class HitModel:
    embedder: str
    feature_names: list[str]
    components: np.ndarray  # (k, dims) 주성분
    vec_mean: np.ndarray  # (dims,)
    x_mean: np.ndarray  # (k + features,)
    x_std: np.ndarray
    weights: np.ndarray  # (bootstrap, 1 + k + features)
    meta: dict = field(default_factory=dict)

    def design(self, pooled: np.ndarray, features: np.ndarray) -> np.ndarray:
        proj = (pooled - self.vec_mean) @ self.components.T
        x = np.hstack([proj, features])
        return (x - self.x_mean) / self.x_std

    def predict(self, pooled: np.ndarray, features: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(평균 확률, 10% 분위, 90% 분위)"""
        x = self.design(np.atleast_2d(pooled), np.atleast_2d(features))
        xb = np.hstack([np.ones((len(x), 1)), x])
        probs = sigmoid(xb @ self.weights.T)  # (n, bootstrap)
        return probs.mean(axis=1), np.quantile(probs, 0.1, axis=1), np.quantile(probs, 0.9, axis=1)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(
            path,
            embedder=np.array(self.embedder),
            feature_names=np.array(self.feature_names),
            components=self.components,
            vec_mean=self.vec_mean,
            x_mean=self.x_mean,
            x_std=self.x_std,
            weights=self.weights,
        )

    @classmethod
    def load(cls, path: Path) -> HitModel:
        with np.load(path, allow_pickle=False) as f:
            return cls(
                embedder=str(f["embedder"]),
                feature_names=[str(n) for n in f["feature_names"]],
                components=f["components"],
                vec_mean=f["vec_mean"],
                x_mean=f["x_mean"],
                x_std=f["x_std"],
                weights=f["weights"],
            )


def fit_model(
    pooled: np.ndarray,
    features: np.ndarray,
    y: np.ndarray,
    *,
    embedder: str,
    feature_names: list[str],
    bootstrap: int = 50,
    lam: float | None = None,
    seed: int = 0,
) -> HitModel:
    """lam이 없으면 choose_lambda로 고른다"""
    n = len(y)
    if lam is None:
        lam = choose_lambda(pooled, features, y, embedder=embedder, feature_names=feature_names, seed=seed)
    vec_mean = pooled.mean(axis=0)
    centered = pooled - vec_mean
    # 주성분 수: 표본 5개당 하나, 최대 16개
    k = max(1, min(16, n // 5, np.linalg.matrix_rank(centered) if n > 1 else 1))
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    components = vt[:k]
    x = np.hstack([centered @ components.T, features])
    x_mean = x.mean(axis=0)
    x_std = x.std(axis=0)
    x_std[x_std < 1e-9] = 1.0
    xs = (x - x_mean) / x_std

    rng = np.random.default_rng(seed)
    weights = [fit_logistic(xs, y, lam)]
    tries = 0
    while len(weights) < bootstrap and tries < bootstrap * 5:
        tries += 1
        idx = rng.integers(0, n, n)
        if y[idx].min() == y[idx].max():
            continue  # 한쪽 정답만 뽑히면 학습할 수 없다
        weights.append(fit_logistic(xs[idx], y[idx], lam))
    return HitModel(embedder, feature_names, components, vec_mean, x_mean, x_std, np.stack(weights), meta={"lambda": lam})


def log_loss(p: np.ndarray, y: np.ndarray) -> float:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def choose_lambda(
    pooled: np.ndarray, features: np.ndarray, y: np.ndarray, *, embedder: str, feature_names: list[str], folds: int = 5, seed: int = 0
) -> float:
    """k겹 교차 검증 로그 손실이 가장 작은 벌점 세기. 표본이 너무 적으면 기본값"""
    n = len(y)
    if n < 20 or y.sum() < folds or (1 - y).sum() < folds:
        return DEFAULT_LAMBDA
    fold_of = np.empty(n, dtype=int)
    fold_of[np.random.default_rng(seed).permutation(n)] = np.arange(n) % folds
    best, best_loss = DEFAULT_LAMBDA, np.inf
    for lam in LAMBDAS:
        losses = []
        for f in range(folds):
            train, test = fold_of != f, fold_of == f
            if y[train].min() == y[train].max():
                continue
            m = fit_model(pooled[train], features[train], y[train], embedder=embedder, feature_names=feature_names, bootstrap=1, lam=lam)
            losses.append(log_loss(m.predict(pooled[test], features[test])[0], y[test]))
        if losses and np.mean(losses) < best_loss:
            best, best_loss = lam, float(np.mean(losses))
    return best


def genre_rates(genres: list[str], y: np.ndarray, prior: float) -> dict[str, float]:
    """장르별 성공률 (표본이 적은 장르는 전체 평균 쪽으로 당긴다)"""
    out: dict[str, float] = {}
    for g in set(genres):
        mask = np.array([x == g for x in genres])
        out[g] = float((y[mask].sum() + 2 * prior) / (mask.sum() + 2))
    return out


def evaluate_time_split(
    pooled: np.ndarray,
    features: np.ndarray,
    y: np.ndarray,
    genres: list[str],
    *,
    embedder: str,
    feature_names: list[str],
    test_share: float = 0.2,
) -> dict:
    """행은 시간 순서로 정렬되어 있어야 한다. 뒤쪽 test_share를 맞혀 본다."""
    n = len(y)
    cut = int(round(n * (1 - test_share)))
    train, test = slice(0, cut), slice(cut, n)
    y_train, y_test = y[train], y[test]
    metrics: dict = {"nTrain": int(cut), "nTest": int(n - cut), "testHitRate": float(y_test.mean()) if n > cut else None}
    if cut < 5 or n - cut < 2 or y_train.min() == y_train.max():
        metrics["note"] = "검증하기에 표본이 부족합니다"
        return metrics

    model = fit_model(pooled[train], features[train], y_train, embedder=embedder, feature_names=feature_names, bootstrap=20)
    metrics["lambda"] = model.meta["lambda"]
    prob, _, _ = model.predict(pooled[test], features[test])
    top = max(1, int(round(len(prob) * 0.2)))
    picked = np.argsort(-prob)[:top]
    rates = genre_rates(genres[:cut], y_train, float(y_train.mean()))
    baseline = np.array([rates.get(g, float(y_train.mean())) for g in genres[cut:]])
    metrics.update(
        {
            "auc": auc(prob, y_test),
            "genreBaselineAuc": auc(baseline, y_test),
            "precisionAtTop20": float(y_test[picked].mean()),
            "lift": float(y_test[picked].mean() / y_test.mean()) if y_test.mean() > 0 else None,
            "brier": float(np.mean((prob - y_test) ** 2)),
            "genreBaselineBrier": float(np.mean((baseline - y_test) ** 2)),
        }
    )
    return metrics


def beats_baseline(metrics: dict) -> bool:
    """활성화 조건: 시간 순서 검증 AUC가 0.5보다 높고 장르 평균 이상"""
    model_auc = metrics.get("auc")
    if model_auc is None:
        return False
    baseline = metrics.get("genreBaselineAuc")
    return model_auc > 0.5 and (baseline is None or model_auc >= baseline)
