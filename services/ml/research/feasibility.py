"""가능성 검증: "대본만 보고 같은 채널 안에서 잘될 영상을 가려낼 수 있는가".

대본에서 나온 정보만 쓴다 (벡터 + 구조 특징). 길이·게시 시각·썸네일 같은 제작 정보는 넣지 않는다.

두 가지로 나눠 맞혀 본다.
- 채널 빼고 맞히기: 채널을 몇 묶음으로 나눠, 한 묶음은 학습에서 빼고 맞힌다. 처음 보는 채널의 대본에도 통하는가.
- 시간 순서: 앞 80%로 학습하고 뒤 20%를 맞힌다. 미래에도 통하는가.

AUC는 **같은 채널 안의 (성공작, 아닌 작품) 쌍**만 센다. 정답이 채널 안 비교이기도 하고, 묶음마다 따로 학습한 모델의 점수를
한 줄로 세우면 절편 차이 때문에 우연보다 낮은 AUC가 나오는 착시가 생기기 때문이다. 신뢰구간은 채널 단위로 다시 뽑는다
(같은 채널 영상끼리는 닮아서, 영상 단위로 뽑으면 구간이 실제보다 좁아진다). 순열 검정도 채널 안에서 정답을 섞는다.

판정 기준(docs/feasibility-study.md)은 데이터를 보기 전에 정해 두고 바꾸지 않는다.
"""

from __future__ import annotations

import math

import numpy as np

from hitmodel.embedders import Embedder, pool_scenes
from hitmodel.model import choose_lambda, fit_logistic, fit_model, log_loss, sigmoid
from hitmodel.segment import FEATURE_NAMES, split_scenes, structural_features

from .dataset import LABEL_DEFINITION, PilotScript

# 판정 기준 (미리 정해 둔 값)
MIN_SCRIPTS = 300
MIN_CHANNELS = 8
GO_AUC = 0.60
GO_LIFT = 1.5
# 이만큼 모았는데도 AUC가 NO_GO_AUC 미만이고 신뢰구간 위쪽이 NO_GO_UPPER 미만이면 "쓸 만한 크기의 신호는 없다"고 본다.
# 부트스트랩 구간은 모델을 다시 학습할 때의 흔들림을 담지 못해 실제보다 좁다. 그래서 신호 판정에는 순열 검정을 꼭 함께 보고,
# 중단 판정은 점추정까지 낮을 때만 내린다.
NO_GO_SCRIPTS = 1000
NO_GO_AUC = 0.55
NO_GO_UPPER = 0.58
STRUCTURE_LAMBDAS = (0.3, 1.0, 3.0, 10.0, 30.0, 100.0)


# ---------- 입력 ----------


def featurize(scripts: list[PilotScript], embedder: Embedder) -> tuple[np.ndarray, np.ndarray]:
    pooled, feats = [], []
    for s in scripts:
        scenes = split_scenes(s.text)
        pooled.append(pool_scenes(scenes, embedder.embed([sc.text for sc in scenes])))
        f = structural_features(s.text, scenes)
        feats.append([f[k] for k in FEATURE_NAMES])
    return np.stack(pooled), np.array(feats, dtype=float)


# ---------- 모델 두 가지: 구조 특징만 / 벡터 + 구조 ----------


def _standardize(train: np.ndarray, test: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mu, sd = train.mean(axis=0), train.std(axis=0)
    sd[sd < 1e-9] = 1.0
    return (train - mu) / sd, (test - mu) / sd


def _structure_lambda(x: np.ndarray, y: np.ndarray, folds: int = 5, seed: int = 0) -> float:
    n = len(y)
    if n < 20 or y.sum() < folds or (1 - y).sum() < folds:
        return 10.0
    fold_of = np.empty(n, dtype=int)
    fold_of[np.random.default_rng(seed).permutation(n)] = np.arange(n) % folds
    best, best_loss = 10.0, np.inf
    for lam in STRUCTURE_LAMBDAS:
        losses = []
        for f in range(folds):
            tr, te = fold_of != f, fold_of == f
            xs_tr, xs_te = _standardize(x[tr], x[te])
            w = fit_logistic(xs_tr, y[tr], lam)
            losses.append(log_loss(sigmoid(w[0] + xs_te @ w[1:]), y[te]))
        if np.mean(losses) < best_loss:
            best, best_loss = lam, float(np.mean(losses))
    return best


def predict_structure(feats: np.ndarray, y: np.ndarray, train: np.ndarray, test: np.ndarray, lam: float | None = None) -> np.ndarray:
    lam = _structure_lambda(feats[train], y[train]) if lam is None else lam
    xs_tr, xs_te = _standardize(feats[train], feats[test])
    w = fit_logistic(xs_tr, y[train], lam)
    return sigmoid(w[0] + xs_te @ w[1:])


def predict_vector(pooled: np.ndarray, feats: np.ndarray, y: np.ndarray, train: np.ndarray, test: np.ndarray, lam: float | None = None) -> np.ndarray:
    kw = {"embedder": "research", "feature_names": FEATURE_NAMES}
    if lam is None:
        lam = choose_lambda(pooled[train], feats[train], y[train], **kw)
    model = fit_model(pooled[train], feats[train], y[train], bootstrap=1, lam=lam, **kw)
    return model.predict(pooled[test], feats[test])[0]


# ---------- 나누기 ----------


def channel_folds(channels: list[str], k: int = 5, seed: int = 0) -> list[np.ndarray]:
    """채널 단위로 k묶음. 반환값은 묶음마다 검증할 행의 위치"""
    names = sorted(set(channels))
    rng = np.random.default_rng(seed)
    rng.shuffle(names)
    k = min(k, len(names))
    group = {name: i % k for i, name in enumerate(names)}
    g = np.array([group[c] for c in channels])
    return [np.where(g == i)[0] for i in range(k)]


def out_of_fold(predict, y: np.ndarray, folds: list[np.ndarray]) -> np.ndarray:
    n = len(y)
    out = np.full(n, np.nan)
    for test in folds:
        train = np.setdiff1d(np.arange(n), test)
        if y[train].min() == y[train].max():
            continue
        out[test] = predict(train, test)
    return out


# ---------- 지표 ----------


def _pair_counts(scores: np.ndarray, y: np.ndarray) -> tuple[float, int]:
    pos, neg = scores[y == 1], scores[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return 0.0, 0
    return float((pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()), len(pos) * len(neg)


def grouped_auc(scores: np.ndarray, y: np.ndarray, groups: np.ndarray) -> float | None:
    """같은 채널 안의 (성공작, 아닌 작품) 쌍만 센 AUC"""
    wins = pairs = 0.0
    for g in np.unique(groups):
        m = groups == g
        w, p = _pair_counts(scores[m], y[m])
        wins, pairs = wins + w, pairs + p
    return wins / pairs if pairs else None


def grouped_lift(scores: np.ndarray, y: np.ndarray, groups: np.ndarray, share: float = 0.2) -> float | None:
    """채널마다 모델 점수 상위 20%를 골랐을 때의 성공률 ÷ 전체 성공률"""
    if y.mean() == 0:
        return None
    picked: list[int] = []
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        top = max(1, int(round(len(idx) * share)))
        picked.extend(idx[np.argsort(-scores[idx])[:top]])
    return float(y[picked].mean() / y.mean())


def bootstrap_auc(scores: np.ndarray, y: np.ndarray, groups: np.ndarray, other: np.ndarray | None = None, n: int = 1000, seed: int = 0) -> dict:
    """채널 단위로 다시 뽑은 AUC 95% 신뢰구간. other가 있으면 같은 표본으로 (scores − other) 차이의 구간도"""
    rng = np.random.default_rng(seed)
    names = np.unique(groups)
    rows = {g: np.where(groups == g)[0] for g in names}
    vals, diffs = [], []
    for _ in range(n):
        picked = rng.choice(names, len(names))
        idx = np.concatenate([rows[g] for g in picked])
        # 같은 채널이 두 번 뽑히면 서로 다른 채널로 본다
        gid = np.concatenate([np.full(len(rows[g]), k) for k, g in enumerate(picked)])
        a = grouped_auc(scores[idx], y[idx], gid)
        if a is None:
            continue
        vals.append(a)
        if other is not None:
            diffs.append(a - grouped_auc(other[idx], y[idx], gid))
    out = {"low": float(np.quantile(vals, 0.025)), "high": float(np.quantile(vals, 0.975))}
    if other is not None:
        out["diffLow"], out["diffHigh"] = float(np.quantile(diffs, 0.025)), float(np.quantile(diffs, 0.975))
    return out


def permute_within(y: np.ndarray, groups: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    out = y.copy()
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        out[idx] = y[rng.permutation(idx)]
    return out


def permutation_p(predict_with_y, y: np.ndarray, groups: np.ndarray, observed: float, permutations: int, seed: int = 0) -> float:
    """채널 안에서 정답을 섞어도 이만큼 맞히는 경우가 얼마나 흔한가 (작을수록 우연이 아니다)"""
    rng = np.random.default_rng(seed)
    hits = 0
    for _ in range(permutations):
        yp = permute_within(y, groups, rng)
        scores = predict_with_y(yp)
        mask = ~np.isnan(scores)
        a = grouped_auc(scores[mask], yp[mask], groups[mask])
        if a is not None and a >= observed:
            hits += 1
    return (hits + 1) / (permutations + 1)


def _summary(scores: np.ndarray, y: np.ndarray, groups: np.ndarray, baseline: np.ndarray | None = None, seed: int = 0) -> dict:
    mask = ~np.isnan(scores) if baseline is None else ~(np.isnan(scores) | np.isnan(baseline))
    s, yy, gg = scores[mask], y[mask], groups[mask]
    out = {"n": int(mask.sum()), "auc": grouped_auc(s, yy, gg), "lift": grouped_lift(s, yy, gg)}
    if out["auc"] is not None:
        out["ci"] = bootstrap_auc(s, yy, gg, None if baseline is None else baseline[mask], seed=seed)
    return out


# ---------- 판정 ----------


def verdict(n_scripts: int, n_channels: int, lco: dict, time_split: dict, p_value: float | None) -> tuple[str, list[str]]:
    reasons: list[str] = []
    if n_scripts < MIN_SCRIPTS or n_channels < MIN_CHANNELS:
        reasons.append(f"표본 부족: 대본 {n_scripts}/{MIN_SCRIPTS}편, 채널 {n_channels}/{MIN_CHANNELS}곳")
        return "MORE_DATA", reasons
    ci = lco.get("ci") or {}
    a, lift = lco.get("auc") or 0.5, lco.get("lift") or 0.0
    signal = ci.get("low", 0.0) > 0.5 and p_value is not None and p_value <= 0.05
    useful = a >= GO_AUC and lift >= GO_LIFT
    forward = (time_split.get("auc") or 0.0) > 0.5
    low, high = ci.get("low", float("nan")), ci.get("high", float("nan"))
    reasons.append(f"채널 빼고 맞히기 AUC {a:.3f} (95% {low:.3f}~{high:.3f}), 리프트 {lift:.2f}, 순열 p={p_value}")
    reasons.append(f"시간 순서 AUC {time_split.get('auc')}")
    if signal and useful and forward:
        return "GO", reasons
    if n_scripts >= NO_GO_SCRIPTS and a < NO_GO_AUC and ci.get("high", 1.0) < NO_GO_UPPER:
        reasons.append(f"대본 {n_scripts}편에서 AUC {NO_GO_AUC} 미만, 신뢰구간 위쪽 {NO_GO_UPPER} 미만: 쓸 만한 크기의 신호가 없다")
        return "NO_GO", reasons
    if signal and not useful:
        reasons.append(f"신호는 있으나 기준(AUC {GO_AUC}, 리프트 {GO_LIFT})에 못 미침")
    elif signal and not forward:
        reasons.append("시간 순서 검증에서 방향이 맞지 않음")
    else:
        reasons.append("우연과 구분되지 않음")
    return "MORE_DATA", reasons


# ---------- 전체 ----------


def analyze(scripts: list[PilotScript], embedder: Embedder, *, permutations: int = 199, seed: int = 0) -> dict:
    """scripts는 dataset.label()을 거친, 시간 순서로 정렬된 대본"""
    y = np.array([1.0 if s.hit else 0.0 for s in scripts])
    channels = [s.channel for s in scripts]
    groups = np.array(channels)
    n, n_channels = len(scripts), len(set(channels))
    report: dict = {
        "labelDefinition": LABEL_DEFINITION,
        "embedder": embedder.name,
        "scripts": n,
        "channels": n_channels,
        "hitRate": float(y.mean()) if n else None,
        "criteria": {"minScripts": MIN_SCRIPTS, "minChannels": MIN_CHANNELS, "goAuc": GO_AUC, "goLift": GO_LIFT},
    }
    if n < 20 or n_channels < 2 or y.min() == y.max():
        report["verdict"], report["reasons"] = "MORE_DATA", ["분석할 수 없을 만큼 표본이 적습니다"]
        return report

    pooled, feats = featurize(scripts, embedder)
    folds = channel_folds(channels, seed=seed)

    vec = out_of_fold(lambda tr, te: predict_vector(pooled, feats, y, tr, te), y, folds)
    struct = out_of_fold(lambda tr, te: predict_structure(feats, y, tr, te), y, folds)
    lco = {"vectorAndStructure": _summary(vec, y, groups, struct, seed=seed), "structureOnly": _summary(struct, y, groups, seed=seed)}

    # 점수를 이루는 지표별로도 본다 (유지율이 대본 힘에 가장 가깝다)
    mask = ~np.isnan(vec)
    components = {}
    for name, values in (("reach", [s.reach for s in scripts]), ("retention", [s.retention for s in scripts]), ("engagement", [s.engagement for s in scripts])):
        arr = np.array([np.nan if v is None else v for v in values], dtype=float)
        ok = mask & ~np.isnan(arr)
        if ok.sum() >= 20:
            top = (arr[ok] >= np.quantile(arr[ok], 0.8)).astype(float)
            components[name] = grouped_auc(vec[ok], top, groups[ok])
    lco["componentAuc"] = components

    cut = int(round(n * 0.8))
    train, test = np.arange(cut), np.arange(cut, n)
    time_split: dict = {"nTrain": cut, "nTest": n - cut}
    if y[train].min() != y[train].max() and y[test].min() != y[test].max():
        tv = predict_vector(pooled, feats, y, train, test)
        ts = predict_structure(feats, y, train, test)
        gt = groups[test]
        time_split |= {"auc": grouped_auc(tv, y[test], gt), "structureOnlyAuc": grouped_auc(ts, y[test], gt), "lift": grouped_lift(tv, y[test], gt)}

    # 순열 검정은 벌점 세기를 고정해 빠르게 한다
    lam = choose_lambda(pooled, feats, y, embedder="research", feature_names=FEATURE_NAMES, seed=seed)
    observed = lco["vectorAndStructure"]["auc"]
    p_value = None
    if permutations > 0 and observed is not None:

        def predict_with(yp: np.ndarray) -> np.ndarray:
            return out_of_fold(lambda tr, te: predict_vector(pooled, feats, yp, tr, te, lam=lam), yp, folds)

        p_value = round(permutation_p(predict_with, y, groups, observed, permutations, seed), 4)

    report |= {"leaveChannelsOut": lco, "timeSplit": time_split, "permutationP": p_value, "permutations": permutations, "lambda": lam}
    report["verdict"], report["reasons"] = verdict(n, n_channels, lco["vectorAndStructure"], time_split, p_value)
    return report


# ---------- 표본 크기 ----------


def _phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def auc_se(a: float, n_pos: int, n_neg: int) -> float:
    """핸리–맥닐 근사. 영상끼리 독립이고 모델이 고정됐다고 볼 때라서 낙관적이다
    (합성 데이터 순열 검정에서 대본 300편의 실제 흔들림은 이 근사의 약 1.5배였다)."""
    q1, q2 = a / (2 - a), 2 * a * a / (1 + a)
    return math.sqrt((a * (1 - a) + (n_pos - 1) * (q1 - a * a) + (n_neg - 1) * (q2 - a * a)) / (n_pos * n_neg))


def detection_power(true_auc: float, n: int, hit_share: float = 0.2) -> float:
    """참 AUC가 이 값일 때, n편을 맞혀 본 95% 신뢰구간 아래쪽이 0.5를 넘을 확률"""
    n_pos = max(1, round(n * hit_share))
    return _phi((true_auc - 0.5) / auc_se(true_auc, n_pos, n - n_pos) - 1.96)


def power_table(sizes=(200, 300, 500, 1000, 2000), aucs=(0.55, 0.60, 0.65, 0.70)) -> list[dict]:
    rows = []
    for n in sizes:
        n_pos = round(n * 0.2)
        power = {f"auc{a:.2f}": round(detection_power(a, n), 3) for a in aucs}
        rows.append({"scripts": n, **power, "ciHalfWidthAt0.65": round(1.96 * auc_se(0.65, n_pos, n - n_pos), 3)})
    return rows
