from datetime import timedelta

import numpy as np

from hitmodel.labels import Outcome, label_scripts, pick_snapshots
from hitmodel.model import HitModel, auc, beats_baseline, fit_model
from hitmodel.sentiment import classify, count

from .conftest import T0


def outcome(sid, views, subs=None, days=30, work=None, likes=None, pos=None):
    return Outcome(sid, "드라마", work or f"w-{sid}", T0, T0 + timedelta(days=days), views, likes, pos, subs)


def test_snapshot_must_be_a_week_old_and_nearest_to_30_days():
    rows = [outcome("a", 10, days=3), outcome("a", 20, days=12), outcome("a", 30, days=28), outcome("a", 40, days=60)]
    assert pick_snapshots(rows)["w-a"].views == 30
    assert pick_snapshots([outcome("b", 10, days=3)]) == {}


def test_channel_size_is_normalized_away():
    # 같은 조회수라도 작은 채널에서 나온 쪽이 도달 점수가 높다
    rows = [outcome("small", 50_000, subs=1_000), outcome("big", 50_000, subs=1_000_000)] + [outcome(f"x{i}", 1_000, subs=10_000) for i in range(8)]
    labels = {l.script_id: l for l in label_scripts(rows)}
    assert labels["small"].reach > labels["big"].reach
    assert labels["small"].hit and not labels["big"].hit
    assert sum(l.hit for l in labels.values()) == 2  # 10편 중 상위 20%


def test_positive_comments_raise_engagement():
    rows = [outcome("loved", 1_000, subs=1_000, likes=10, pos=50), outcome("meh", 1_000, subs=1_000, likes=10, pos=0)]
    labels = {l.script_id: l for l in label_scripts(rows)}
    assert labels["loved"].engagement > labels["meh"].engagement
    assert labels["loved"].hit and not labels["meh"].hit


def test_episodes_are_averaged_per_script():
    rows = [outcome("s", 100, subs=10, work="e1"), outcome("s", 300, subs=10, work="e2")]
    [label] = label_scripts(rows)
    assert label.works == 2


def test_logistic_model_learns_planted_signal_and_round_trips(tmp_path):
    rng = np.random.default_rng(0)
    n, dims = 120, 32
    y = (rng.random(n) < 0.25).astype(float)
    pooled = rng.normal(size=(n, dims))
    pooled[:, 0] += 2.0 * y  # 성공작은 한 방향으로 치우친다
    pooled /= np.linalg.norm(pooled, axis=1, keepdims=True)
    feats = rng.normal(size=(n, 3))
    model = fit_model(pooled, feats, y, embedder="test", feature_names=["a", "b", "c"], bootstrap=10)
    p, lo, hi = model.predict(pooled, feats)
    assert auc(p, y) > 0.8
    assert np.all(lo <= p + 1e-9) and np.all(p <= hi + 1e-9)

    model.save(tmp_path / "m.npz")
    loaded = HitModel.load(tmp_path / "m.npz")
    assert np.allclose(loaded.predict(pooled, feats)[0], p)
    assert loaded.feature_names == ["a", "b", "c"]


def test_auc_and_activation_rule():
    assert auc(np.array([0.9, 0.8, 0.1]), np.array([1, 1, 0])) == 1.0
    assert auc(np.array([0.5, 0.5]), np.array([1, 1])) is None
    assert beats_baseline({"auc": 0.7, "genreBaselineAuc": 0.6})
    assert not beats_baseline({"auc": 0.55, "genreBaselineAuc": 0.6})
    assert not beats_baseline({"auc": None})


def test_sentiment_lexicon_handles_negation():
    assert classify("와 진짜 재밌다 ㅋㅋ 다음화 언제 나와요") == "positive"
    assert classify("재미없어요 지루함") == "negative"
    assert classify("재미 없음") == "negative"
    assert classify("3분 20초에 나온 노래 제목?") == "neutral"
    c = count(["최고", "별로", "음"])
    assert (c.total, c.positive, c.negative, c.neutral) == (3, 1, 1, 1)
