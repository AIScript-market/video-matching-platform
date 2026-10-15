import numpy as np
import pytest

from hitmodel.embedders import HashingNgramEmbedder
from research.dataset import load_pilot
from research.feasibility import analyze, channel_folds, grouped_auc, grouped_lift, permute_within, power_table, verdict
from research.synthetic import write_synthetic_pilot


def test_grouped_auc_only_compares_within_a_channel():
    # 채널 a는 점수가 전부 높고 b는 전부 낮지만, 채널 안 순서는 둘 다 완벽하다
    scores = np.array([0.9, 0.8, 0.7, 0.3, 0.2, 0.1])
    y = np.array([1, 0, 0, 1, 0, 0], dtype=float)
    groups = np.array(["a", "a", "a", "b", "b", "b"])
    assert grouped_auc(scores, y, groups) == 1.0
    assert grouped_lift(scores, y, groups, share=0.34) == pytest.approx(3.0)
    yp = permute_within(y, groups, np.random.default_rng(0))
    assert yp[:3].sum() == 1 and yp[3:].sum() == 1  # 채널마다 성공 수는 그대로


def test_channel_folds_never_split_a_channel():
    channels = [f"c{i % 7}" for i in range(70)]
    folds = channel_folds(channels, k=5)
    assert sorted(np.concatenate(folds)) == list(range(70))
    for f in folds:
        names = {channels[i] for i in f}
        assert all(channels[j] not in names for other in folds if other is not f for j in other)


@pytest.fixture(scope="module")
def embedder():
    return HashingNgramEmbedder()


def _run(tmp_path, signal, embedder):
    write_synthetic_pilot(tmp_path, channels=10, scripts_per_channel=30, signal=signal, seed=7)
    scripts, _ = load_pilot(tmp_path)
    return analyze(scripts, embedder, permutations=19)


def test_planted_signal_is_found(tmp_path, embedder):
    report = _run(tmp_path, 1.0, embedder)
    lco = report["leaveChannelsOut"]["vectorAndStructure"]
    assert report["scripts"] == 300 and report["channels"] == 10
    assert lco["auc"] > 0.65 and lco["ci"]["low"] > 0.5 and report["permutationP"] <= 0.05
    assert report["verdict"] == "GO", report["reasons"]


def test_no_signal_is_not_called_go(tmp_path, embedder):
    report = _run(tmp_path, 0.0, embedder)
    assert report["verdict"] != "GO", report["reasons"]
    assert report["permutationP"] > 0.05


def test_verdict_rules():
    big = {"auc": 0.52, "lift": 1.0, "ci": {"low": 0.49, "high": 0.56}}
    assert verdict(100, 20, big, {"auc": 0.5}, 0.5)[0] == "MORE_DATA"  # 표본 부족
    assert verdict(1200, 20, big, {"auc": 0.5}, 0.5)[0] == "NO_GO"
    weak = {"auc": 0.56, "lift": 1.2, "ci": {"low": 0.52, "high": 0.60}}
    assert verdict(1200, 20, weak, {"auc": 0.55}, 0.01)[0] == "MORE_DATA"  # 신호는 있으나 작다
    strong = {"auc": 0.66, "lift": 1.8, "ci": {"low": 0.6, "high": 0.72}}
    assert verdict(400, 10, strong, {"auc": 0.6}, 0.01)[0] == "GO"
    assert verdict(400, 10, strong, {"auc": 0.6}, 0.2)[0] == "MORE_DATA"  # 순열 검정을 못 넘으면 GO가 아니다


def test_power_grows_with_sample_size():
    rows = power_table()
    assert [r["auc0.60"] for r in rows] == sorted(r["auc0.60"] for r in rows)
    assert rows[-1]["ciHalfWidthAt0.65"] < rows[0]["ciHalfWidthAt0.65"]
