import numpy as np

from research.proxy import ProxyWork
from research.proxy_explore import TRAJECTORY_FEATURES, held_out_words, trajectory_features, word_counts


def test_trajectory_features_follow_how_the_text_moves():
    rng = np.random.default_rng(0)
    base = rng.normal(size=32)
    steady = np.stack([base + 0.01 * rng.normal(size=32) for _ in range(20)])
    wandering = np.stack([base + 0.3 * k * rng.normal(size=32) for k in range(20)])
    f, g = trajectory_features(steady), trajectory_features(wandering)
    assert list(f) == TRAJECTORY_FEATURES
    assert g["seg_drift"] > f["seg_drift"] and g["seg_spread"] > f["seg_spread"]
    assert g["late_volatility_gain"] > 0  # 뒤로 갈수록 흔들림이 커지게 만들었다


def test_word_counts_drop_proper_names():
    texts = ["Holmes looked at the door. Holmes ran. The door shut." * 5] * 25
    vocab, freq = word_counts(texts, min_docs=20)
    assert "holmes" not in vocab and "door" in vocab and "shut" in vocab
    assert freq.shape == (25, len(vocab))


def test_held_out_words_find_planted_vocabulary():
    rng = np.random.default_rng(2)
    filler = "the man went to the town and saw the house of his friend ".split()
    works, texts, genres = [], [], []
    for a in range(24):
        for k in range(6):
            adapted = k < 2
            words = list(rng.choice(filler, 3000))
            words += ["shoulder", "stood", "breath"] * (40 if adapted else 5) + ["philosopher", "social"] * (5 if adapted else 40)
            texts.append(" ".join(words))
            works.append(ProxyWork(f"Q{a}-{k}", "t", f"A{a}", "a", 1900, "1", int(adapted), ""))
            genres.append("모험")
    vocab, freq = word_counts(texts, min_docs=20)
    out = held_out_words(freq, vocab, works, genres, k=3, permutations=199)
    for fold in out["folds"]:
        assert fold["sameAuthor"]["auc"] > 0.9 and fold["sameAuthor"]["p"] <= 0.01
        assert {w for w, _ in fold["topAdapted"][:3]} == {"shoulder", "stood", "breath"}
