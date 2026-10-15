import numpy as np

from hitmodel.embedders import HashingNgramEmbedder, pool_scenes
from hitmodel.segment import FEATURE_NAMES, split_scenes, structural_features

SCRIPT = """제목: 마지막 열차

S#1. 폐역 승강장 (밤, 비)
녹슨 안내판 아래, 정수(50대)가 랜턴을 들고 서 있다.
정수
(혼잣말) 오늘도 안 오네.

S#2. 역무실 (낮)
수아: 아저씨, 또 밤새셨어요?
정수: 열차가 올 거야.
수아가 한숨을 쉰다.

#3 선로 (새벽)
멀리서 기적 소리가 들린다!
"""


def test_split_scenes_counts_dialogue_and_speakers():
    scenes = split_scenes(SCRIPT)
    assert [s.heading for s in scenes] == ["", "S#1. 폐역 승강장 (밤, 비)", "S#2. 역무실 (낮)", "#3 선로 (새벽)"]
    first = scenes[1]
    assert first.dialogue_lines == 1 and first.speakers == {"정수": 1}
    assert first.action_lines == 1
    assert scenes[2].speakers == {"수아": 1, "정수": 1}
    assert [s.is_night for s in scenes[1:]] == [True, False, True]


def test_text_without_headings_is_chunked():
    text = ("문단입니다. " * 100 + "\n\n") * 6
    scenes = split_scenes(text)
    assert len(scenes) >= 2
    assert all(not s.heading for s in scenes)


def test_structural_features_have_fixed_keys():
    scenes = split_scenes(SCRIPT)
    f = structural_features(SCRIPT, scenes)
    assert list(f) == FEATURE_NAMES
    assert f["scene_count"] == 4
    assert f["speaker_count"] == 2
    assert 0 < f["dialogue_ratio"] < 1
    assert f["night_scene_ratio"] == 0.5


def test_hashing_embedder_is_deterministic_and_normalized():
    e = HashingNgramEmbedder(dims=128)
    a = e.embed(["총성이 울린다. 추격이 시작된다.", "카페에서 커피를 마신다."])
    b = HashingNgramEmbedder(dims=128).embed(["총성이 울린다. 추격이 시작된다.", "카페에서 커피를 마신다."])
    assert np.allclose(a, b)
    assert np.allclose(np.linalg.norm(a, axis=1), 1.0)


def test_similar_texts_are_closer():
    e = HashingNgramEmbedder()
    v = e.embed(["총성이 울리고 추격이 시작된다. 배신자는 누구인가", "추격 끝에 총성이 울린다. 누가 배신했나", "카페에서 커피를 마시며 날씨 이야기를 한다"])
    assert v[0] @ v[1] > v[0] @ v[2]


def test_pooling_weights_long_scenes_and_normalizes():
    scenes = split_scenes(SCRIPT)
    vectors = HashingNgramEmbedder(dims=64).embed([s.text for s in scenes])
    pooled = pool_scenes(scenes, vectors)
    assert pooled.shape == (64,)
    assert np.isclose(np.linalg.norm(pooled), 1.0)
