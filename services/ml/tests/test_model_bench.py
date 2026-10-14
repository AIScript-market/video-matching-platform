import json

import numpy as np

from research import model_bench
from research.bench_kit.bench_eval import bench_auc, grouped_auc, permutation_p


def _task(n_groups: int = 40, per: int = 12, signal: float = 2.0, seed: int = 0) -> model_bench.Task:
    rng = np.random.default_rng(seed)
    n = n_groups * per
    groups = np.repeat([f"g{i}" for i in range(n_groups)], per)
    v = rng.normal(size=(n, 32))
    score = signal * v[:, 0] + rng.normal(size=n) + np.repeat(rng.normal(scale=5, size=n_groups), per)
    y = np.zeros(n)
    for g in np.unique(groups):
        idx = np.where(groups == g)[0]
        y[idx] = score[idx] >= np.quantile(score[idx], 2 / 3)
    words = ["alpha", "beta", "gamma", "delta"]
    texts = [" ".join(words[(i + k) % 4] for k in range(20)) + (" winner" * 3 if v[i, 0] > 0 else "") for i in range(n)]
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    return model_bench.Task("toy", [f"id{i}" for i in range(n)], texts, v, y, score, groups, groups, np.log(rng.integers(50, 500, n)))


def test_grouped_auc_counts_only_within_group_pairs():
    s = np.array([1.0, 0.0, 10.0, 9.0])
    y = np.array([1.0, 0.0, 0.0, 1.0])
    g = np.array(["a", "a", "b", "b"])
    assert grouped_auc(s, y, g) == 0.5  # a는 맞고 b는 틀림. 묶음을 섞으면 다른 값이 나온다


def test_length_is_removed_before_scoring():
    rng = np.random.default_rng(1)
    g = np.repeat(["a", "b", "c", "d"], 50)
    log_len = rng.normal(size=200)
    y = (log_len + rng.normal(scale=0.1, size=200) > 0).astype(float)
    assert bench_auc(log_len, y, g, log_len) < 0.6  # 길이만으로 맞히는 점수는 길이를 빼면 남는 게 없다


def test_split_is_by_group_and_stable():
    t = _task()
    for g in np.unique(t.groups):
        assert len(set(t.test[t.groups == g].tolist())) == 1
        assert len(set(t.folds[t.groups == g].tolist())) == 1
    assert model_bench.is_test_group("Lost") == model_bench.is_test_group("Lost")
    assert 0.05 < t.test.mean() < 0.4


def test_dev_comparison_finds_planted_signal():
    report = model_bench.run_dev(_task(), log=lambda *_: None)
    assert set(report["models"]) == set(model_bench.MODELS)
    assert report["models"]["ridge-within"]["auc"] > 0.7
    assert report["models"][report["chosen"]]["auc"] >= report["models"]["pca16-logit"]["auc"]


def test_test_scoring_and_permutation():
    t = _task()
    out = model_bench.run_test(t, ["ridge-within"], permutations=99)
    assert out["models"]["ridge-within"]["auc"] > 0.7
    assert out["models"]["ridge-within"]["p"] <= 0.05
    rng = np.random.default_rng(2)
    test = t.subset(t.test)
    assert permutation_p(rng.normal(size=len(test.y)), test.y, test.eval_groups, test.log_len, permutations=99) > 0.01


def test_kit_hides_test_labels(tmp_path):
    t = _task()
    info = model_bench.write_kit(t, tmp_path / "kit", tmp_path / "locked")
    test_rows = [json.loads(line) for line in (tmp_path / "kit" / "toy" / "test.jsonl").read_text(encoding="utf-8").splitlines()]
    dev_rows = [json.loads(line) for line in (tmp_path / "kit" / "toy" / "dev.jsonl").read_text(encoding="utf-8").splitlines()]
    assert all("y" not in r and "score" not in r and "fold" not in r for r in test_rows)
    assert all({"y", "score", "fold"} <= set(r) for r in dev_rows)
    assert len(test_rows) == info["test"] and len(dev_rows) == info["dev"]
    assert np.load(tmp_path / "kit" / "toy" / "bge-m3_test.npy").shape == (info["test"], 32)
    assert (tmp_path / "locked" / "toy-test-labels.jsonl").exists()
