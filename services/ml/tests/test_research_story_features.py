"""측정 확인 (docs/hit-features.md 1단계): 요소를 의도대로 재는가."""

from research.story_features import STORY_FEATURES, detect_lang, feature_matrix, story_features, strip_gutenberg

CALM_KO = "민지는 창가에 앉아 커피를 마셨다. 오후 햇살이 들어왔다. 준호가 신문을 넘겼다.\n" * 10
TENSE_KO = "갑자기 문이 열렸다. 남자가 칼을 들고 위협했다. 민지는 비명을 지르며 도망쳤다.\n" * 10
CALM_EN = "Anna sat by the window and drank her tea. The afternoon was quiet. Tom turned the page.\n" * 10
TENSE_EN = "Suddenly the door burst open. A man with a knife attacked. Anna screamed and fled in terror.\n" * 10


def test_tension_rises_with_tense_scenes_in_both_languages():
    for calm, tense in ((CALM_KO, TENSE_KO), (CALM_EN, TENSE_EN)):
        assert story_features(tense)["tension_mean"] > story_features(calm)["tension_mean"] + 1
    assert detect_lang(CALM_KO) == "ko" and detect_lang(CALM_EN) == "en"


def test_conflict_onset_and_peak_follow_where_the_tension_is():
    early = story_features(TENSE_KO * 2 + CALM_KO * 18)
    late = story_features(CALM_KO * 18 + TENSE_KO * 2)
    assert early["conflict_onset"] < 0.2 < 0.8 < late["conflict_onset"]
    assert early["hook_tension"] > 1 > late["hook_tension"]
    assert late["tension_peak_pos"] > 0.8 and late["tension_slope"] > 0


def test_ending_valence_and_reversals():
    happy = CALM_EN * 9 + "They laughed with joy, full of love and hope, and smiled at each other.\n" * 3
    sad = CALM_EN * 9 + "She wept in despair and grief, lonely and wretched, and cried.\n" * 3
    assert story_features(happy)["ending_valence"] > 0 > story_features(sad)["ending_valence"]
    wave = (CALM_EN + "They laughed with joy and love.\n" * 5 + CALM_EN + "She wept in grief and despair.\n" * 5) * 4
    assert story_features(wave)["valence_reversals"] >= 4


def test_exact_words_do_not_match_longer_words():
    # "war"는 낱말 그대로만 센다 ("warm", "ward"는 긴장이 아니다)
    assert story_features("The warm ward was a reward.\n" * 20, "en")["tension_mean"] == 0
    assert story_features("The war began.\n" * 20, "en")["tension_mean"] > 0


def test_twists_secrets_and_open_endings():
    plain = CALM_KO * 20
    twist = CALM_KO * 10 + "알고 보니 그 사람의 정체는 형이었다. 비밀을 숨기고 거짓말을 했던 것이다.\n" * 3 + CALM_KO * 6 + "그는 정말 돌아올까?\n" * 3
    f, g = story_features(plain), story_features(twist)
    assert g["twist_markers"] > f["twist_markers"] == 0
    assert g["secret_markers"] > 0 and g["ending_open"] > f["ending_open"]


def test_dialogue_and_characters_in_script_and_prose():
    script = "S#1. 거실 (밤)\n민지: 어디 갔었어?\n준호: 회사.\n민지: 거짓말.\n" * 15
    prose = 'Anna looked at Tom. "Where were you?" asked Anna. Tom said nothing to Anna.\n' * 15
    s, p = story_features(script), story_features(prose)
    assert s["character_count"] == 2 and 0.4 < s["top_character_share"] < 0.8
    assert p["character_count"] >= 2 and p["dialogue_share"] > 0
    assert s["dialogue_share"] > story_features(CALM_KO * 5)["dialogue_share"]


def test_gutenberg_boilerplate_is_removed_and_matrix_shape():
    raw = (
        "The Project Gutenberg eBook\nlicense...\n*** START OF THE PROJECT GUTENBERG EBOOK EMMA ***\n"
        "Story here.\n*** END OF THE PROJECT GUTENBERG EBOOK EMMA ***\nlicense"
    )
    assert strip_gutenberg(raw) == "Story here."
    m = feature_matrix([CALM_KO, TENSE_EN])
    assert m.shape == (2, len(STORY_FEATURES))
