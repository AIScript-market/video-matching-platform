"""모델 비교 (docs/model-bench.md). 표현(글 → 숫자)과 학습기(숫자 → 흥행)를 바꿔 가며 같은 잣대로 잰다.

여러 모델을 돌려 가장 좋은 것만 고르면 우연히 좋게 나온 모델을 고르게 된다. 그래서
- 묶음(시리즈·장르×5년·작가)의 20%를 시험용으로 미리 잠근다. 어느 묶음이 시험용인지는 묶음 이름의 해시로 정해서, 결과를 보고 바꿀 수 없다.
- 나머지 80%(개발용)를 묶음 단위 5겹으로 나눠 모델을 비교하고 고른다.
- 고른 모델과 기준 모델만 시험용으로 한 번 잰다 (bench-test는 두 번째 실행을 거부한다).
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .bench_kit.bench_eval import bench_auc, bootstrap_ci, permutation_p

TEST_SHARE = 5  # 묶음 해시 % 5 == 0 이면 시험용 (약 20%)
FOLDS = 5
VECTOR_NAME = "bge-m3"


def _hash(text: str) -> int:
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16)


def is_test_group(group: str) -> bool:
    return _hash(group) % TEST_SHARE == 0


def fold_of(group: str) -> int:
    return _hash("fold|" + group) % FOLDS


@dataclass
class Task:
    name: str
    ids: list[str]
    texts: list[str]
    vectors: np.ndarray  # (행, 차원) 정규화된 bge-m3
    y: np.ndarray  # 0/1 흥행
    score: np.ndarray  # 연속 정답 (없으면 y)
    groups: np.ndarray  # 나누는 단위 (시험용·겹·학습 중심화)
    eval_groups: np.ndarray  # 비교 단위 (AUC를 셀 때)
    log_len: np.ndarray
    note: str = ""
    test: np.ndarray = field(init=False)
    folds: np.ndarray = field(init=False)

    def __post_init__(self) -> None:
        self.test = np.array([is_test_group(g) for g in self.groups])
        self.folds = np.array([fold_of(g) for g in self.groups])

    def subset(self, mask: np.ndarray) -> Task:
        t = Task(
            self.name,
            [i for i, m in zip(self.ids, mask, strict=True) if m],
            [x for x, m in zip(self.texts, mask, strict=True) if m],
            self.vectors[mask],
            self.y[mask],
            self.score[mask],
            self.groups[mask],
            self.eval_groups[mask],
            self.log_len[mask],
            self.note,
        )
        return t


def _vectors_by_id(cache: Path) -> dict[str, np.ndarray]:
    with np.load(cache, allow_pickle=False) as f:
        return {str(i): v for i, v in zip(f["ids"], f["vectors"], strict=True)}


def _stack(by_id: dict[str, np.ndarray], ids: list[str]) -> np.ndarray:
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise SystemExit(f"벡터 캐시에 없는 항목 {len(missing)}개 (예: {missing[0]}). 먼저 벡터화하세요")
    v = np.stack([by_id[i] for i in ids]).astype(np.float64)
    if v.ndim == 3:  # (항목, 구간, 차원) → 구간 평균
        v = v.mean(axis=1)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


# ---------- 세 과제 ----------


def build_movies(raw: Path, cache: Path) -> Task:
    from . import cmu_movies

    movies = cmu_movies.usable(cmu_movies.load_movies(raw))
    y, resid, strata = cmu_movies.labels(movies)
    counts = {s: int((strata == s).sum()) for s in np.unique(strata)}
    keep = np.array([counts[s] >= 6 for s in strata])
    mv = [m for m, k in zip(movies, keep, strict=True) if k]
    ids = [m.wiki_id for m in mv]
    return Task(
        "movies",
        ids,
        [m.summary for m in mv],
        _stack(_vectors_by_id(cache), ids),
        y[keep],
        resid[keep],
        strata[keep],
        strata[keep],
        np.array([math.log(len(m.summary.split())) for m in mv]),
        "영화 줄거리 → 박스오피스 나머지 (같은 대표 장르 × 5년 안 상위 1/3)",
    )


def build_tv(episodes_path: Path, cache: Path) -> Task:
    from . import tv_episodes
    from .tv_embed import episode_id

    episodes = tv_episodes.usable(tv_episodes.load(episodes_path))
    labels = tv_episodes.episode_labels(episodes)
    keep = [i for i, lab in enumerate(labels) if "retentionHit" in lab]
    eps = [episodes[i] for i in keep]
    ids = [episode_id(e) for e in eps]
    series = np.array([e.series for e in eps])
    return Task(
        "tv",
        ids,
        [e.summary for e in eps],
        _stack(_vectors_by_id(cache), ids),
        np.array([1.0 if labels[i]["retentionHit"] else 0.0 for i in keep]),
        np.array([labels[i]["retention"] for i in keep]),
        series,
        series,
        np.array([math.log(len(e.summary.split())) for e in eps]),
        "TV 에피소드 줄거리 → 다음 화 시청자 유지 (같은 시리즈 안 상위 1/3)",
    )


def build_novels(manifest: Path, text_dir: Path, catalog: Path, cache: Path) -> Task:
    from . import proxy, proxy_controls
    from .proxy_explore import sample_segments

    works, texts = proxy.load_corpus(manifest, text_dir)
    by_id = proxy_controls.read_catalog(catalog, [w.gutenberg for w in works])
    genres = [proxy_controls.primary_genre(by_id.get(w.gutenberg, set())) for w in works]
    ids = [w.work for w in works]
    authors = np.array([w.author for w in works])
    y = np.array([1.0 if w.adapted else 0.0 for w in works])
    return Task(
        "novels",
        ids,
        # 키트에는 bge-m3가 실제로 본 부분(20구간 × 앞 2,000자)만 넣는다
        ["\n\n[…]\n\n".join(sample_segments(t)) for t in texts],
        _stack(_vectors_by_id(cache), ids),
        y,
        y.copy(),
        authors,
        np.array([f"{a}|{g}" for a, g in zip(authors, genres, strict=True)]),
        np.array([math.log1p(len(t)) for t in texts]),
        "공개 소설 → 영상화 여부 (같은 작가·같은 장르 안)",
    )


# ---------- 키트 ----------


def write_kit(task: Task, out_dir: Path, locked_dir: Path) -> dict:
    """개발용(정답 포함)·시험용(정답 없음)·벡터를 키트로 쓰고, 시험용 정답은 locked_dir에만 둔다"""
    d = out_dir / task.name
    d.mkdir(parents=True, exist_ok=True)
    locked_dir.mkdir(parents=True, exist_ok=True)
    for split, mask in (("dev", ~task.test), ("test", task.test)):
        idx = np.where(mask)[0]
        with (d / f"{split}.jsonl").open("w", encoding="utf-8", newline="\n") as f:
            for i in idx:
                row = {"id": task.ids[i], "group": str(task.groups[i]), "eval_group": str(task.eval_groups[i]), "log_len": round(float(task.log_len[i]), 6)}
                if split == "dev":
                    row.update(fold=int(task.folds[i]), y=int(task.y[i]), score=round(float(task.score[i]), 6))
                row["text"] = task.texts[i]
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        np.save(d / f"{VECTOR_NAME}_{split}.npy", task.vectors[idx].astype(np.float16))
    locked = locked_dir / f"{task.name}-test-labels.jsonl"
    with locked.open("w", encoding="utf-8", newline="\n") as f:
        for i in np.where(task.test)[0]:
            f.write(json.dumps({"id": task.ids[i], "y": int(task.y[i]), "score": round(float(task.score[i]), 6)}) + "\n")
    return {
        "task": task.name,
        "note": task.note,
        "dev": int((~task.test).sum()),
        "test": int(task.test.sum()),
        "devGroups": len(set(task.groups[~task.test].tolist())),
        "testGroups": len(set(task.groups[task.test].tolist())),
        "devHits": int(task.y[~task.test].sum()),
        "testLabelsSha256": hashlib.sha256(locked.read_bytes()).hexdigest(),
    }


# ---------- 학습기 ----------


def _center(x: np.ndarray, groups: np.ndarray) -> np.ndarray:
    out = np.array(x, dtype=np.float64, copy=True)
    for g in np.unique(groups):
        m = groups == g
        out[m] -= out[m].mean(axis=0)
    return out


def _target(t: Task, within: bool = True) -> np.ndarray:
    return _center(t.score, t.groups) if within else t.score


def _group_splits(groups: np.ndarray, k: int = 3) -> list[tuple[np.ndarray, np.ndarray]]:
    names = np.unique(groups)
    rng = np.random.default_rng(0)
    rng.shuffle(names)
    part = {g: i % k for i, g in enumerate(names)}
    f = np.array([part[g] for g in groups])
    return [(np.where(f != i)[0], np.where(f == i)[0]) for i in range(k)]


ALPHAS = np.logspace(-1, 5, 13)


def _logit(dims: int | None):
    def fit(tr: Task):
        from sklearn.decomposition import PCA
        from sklearn.linear_model import LogisticRegressionCV
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler

        steps = [PCA(n_components=min(dims, tr.vectors.shape[1]), random_state=0)] if dims else []
        model = make_pipeline(
            *steps,
            StandardScaler(),
            LogisticRegressionCV(
                Cs=np.logspace(-4, 2, 13), l1_ratios=(0.0,), cv=_group_splits(tr.groups), scoring="roc_auc", max_iter=2000, use_legacy_attributes=False
            ),
        )
        model.fit(tr.vectors, tr.y)
        return lambda te: model.decision_function(te.vectors)

    return fit


def _ridge(within: bool):
    def fit(tr: Task):
        from sklearn.linear_model import RidgeCV
        from sklearn.preprocessing import StandardScaler

        x = _center(tr.vectors, tr.groups) if within else tr.vectors
        scaler = StandardScaler().fit(x)
        model = RidgeCV(alphas=ALPHAS).fit(scaler.transform(x), _target(tr, within))
        return lambda te: model.predict(scaler.transform(te.vectors))

    return fit


def _hgb(tr: Task):
    from sklearn.decomposition import PCA
    from sklearn.ensemble import HistGradientBoostingRegressor

    pca = PCA(n_components=min(64, len(tr.y) - 1, tr.vectors.shape[1]), random_state=0).fit(_center(tr.vectors, tr.groups))
    model = HistGradientBoostingRegressor(
        learning_rate=0.05,
        max_iter=400,
        max_leaf_nodes=15,
        min_samples_leaf=max(10, len(tr.y) // 200),
        l2_regularization=1.0,
        early_stopping=True,
        random_state=0,
    )
    model.fit(pca.transform(_center(tr.vectors, tr.groups)), _target(tr))
    # 시험 쪽도 묶음 안에서 중심화한다 (같은 채널의 다른 대본은 정답 없이도 알 수 있다)
    return lambda te: model.predict(pca.transform(_center(te.vectors, te.groups)))


def _knn(k: int):
    def fit(tr: Task):
        target = _target(tr)
        x = tr.vectors

        def predict(te: Task) -> np.ndarray:
            sims = te.vectors @ x.T  # 둘 다 정규화돼 있어서 코사인
            top = np.argpartition(-sims, min(k, len(target) - 1), axis=1)[:, :k]
            return target[top].mean(axis=1)

        return predict

    return fit


def _tfidf(tr: Task):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import RidgeCV

    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=5, max_df=0.5, sublinear_tf=True, max_features=50000, stop_words="english")
    x = vec.fit_transform(tr.texts)
    model = RidgeCV(alphas=ALPHAS).fit(x, _target(tr))
    return lambda te: model.predict(vec.transform(te.texts))


def _blend(tr: Task):
    a, b = _ridge(True)(tr), _tfidf(tr)

    def predict(te: Task) -> np.ndarray:
        pa, pb = a(te), b(te)
        return (pa - pa.mean()) / (pa.std() or 1) + (pb - pb.mean()) / (pb.std() or 1)

    return predict


# 이름: (설명, 학습 함수). 첫 번째가 기준 모델 (지금까지 쓴 방식에 가장 가까운 것)
MODELS: dict[str, tuple[str, object]] = {
    "pca16-logit": ("기준: 주성분 16개 + 로지스틱 (지금까지 방식)", _logit(16)),
    "logit-full": ("주성분 제한 없이 1,024차원 로지스틱", _logit(None)),
    "ridge-score": ("흥행 점수 자체를 맞히는 릿지 회귀", _ridge(False)),
    "ridge-within": ("같은 묶음 안 차이로 학습하는 릿지 회귀", _ridge(True)),
    "hgb-pca64": ("그래디언트 부스팅 (비선형, 주성분 64개)", _hgb),
    "knn50": ("비슷한 작품 50편의 성적 평균", _knn(50)),
    "tfidf-ridge": ("낱말 빈도(TF-IDF) + 릿지 (bge-m3 안 씀)", _tfidf),
    "blend": ("ridge-within + tfidf-ridge 평균", _blend),
}
BASELINE = "pca16-logit"


def out_of_fold(task: Task, fit) -> np.ndarray:
    s = np.full(len(task.y), np.nan)
    for k in range(FOLDS):
        te = task.folds == k
        s[te] = fit(task.subset(~te))(task.subset(te))
    return s


def run_dev(task: Task, models: list[str] | None = None, log=print) -> dict:
    dev = task.subset(~task.test)
    report: dict = {"task": task.name, "rows": len(dev.y), "groups": len(set(dev.groups.tolist())), "models": {}}
    scores: dict[str, np.ndarray] = {}
    for name in models or list(MODELS):
        desc, fit = MODELS[name]
        s = out_of_fold(dev, fit)
        scores[name] = s
        fold_aucs = [bench_auc(s[dev.folds == k], dev.y[dev.folds == k], dev.eval_groups[dev.folds == k], dev.log_len[dev.folds == k]) for k in range(FOLDS)]
        auc = bench_auc(s, dev.y, dev.eval_groups, dev.log_len)
        base = scores.get(BASELINE)
        ci = bootstrap_ci(s, dev.y, dev.eval_groups, dev.log_len, other=base if name != BASELINE else None)
        report["models"][name] = {"description": desc, "auc": auc, "ci95": ci, "foldAucs": fold_aucs}
        log(f"[{task.name}] {name}: {auc:.3f} ({ci['low']:.3f}–{ci['high']:.3f})")
    best = max(report["models"], key=lambda n: report["models"][n]["auc"])
    report["chosen"] = best
    return report


def run_test(task: Task, names: list[str], permutations: int = 2000) -> dict:
    """개발용 전부로 학습하고 시험용에서 한 번 잰다. 점수가 시험용 정답을 보지 않았으니 묶음 안 순열 검정을 그대로 쓴다"""
    dev, test = task.subset(~task.test), task.subset(task.test)
    out: dict = {"task": task.name, "rows": len(test.y), "groups": len(set(test.groups.tolist())), "models": {}}
    scores = {}
    for name in names:
        s = MODELS[name][1](dev)(test)
        scores[name] = s
        other = scores.get(BASELINE) if name != BASELINE else None
        out["models"][name] = {
            "auc": bench_auc(s, test.y, test.eval_groups, test.log_len),
            "ci95": bootstrap_ci(s, test.y, test.eval_groups, test.log_len, other=other),
            "p": permutation_p(s, test.y, test.eval_groups, test.log_len, permutations=permutations),
        }
    return out


def score_submission(task: Task, predictions: dict[str, float], permutations: int = 2000) -> dict:
    """친구가 보낸 시험용 예측(id → 점수)을 잠긴 정답으로 잰다"""
    test = task.subset(task.test)
    missing = [i for i in test.ids if i not in predictions]
    if missing:
        raise SystemExit(f"예측이 없는 시험용 행 {len(missing)}개 (예: {missing[0]})")
    s = np.array([predictions[i] for i in test.ids])
    return {
        "auc": bench_auc(s, test.y, test.eval_groups, test.log_len),
        "ci95": bootstrap_ci(s, test.y, test.eval_groups, test.log_len),
        "p": permutation_p(s, test.y, test.eval_groups, test.log_len, permutations=permutations),
    }
