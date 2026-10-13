"""이야기 요소 측정 (docs/hit-features.md). LLM 없이 사전과 규칙으로 잰다.

글을 같은 길이 구간 20개로 나누고, 구간마다 긴장·감정 점수를 재서 곡선을 만든다.
대본과 소설 모두에 쓴다. 한국어와 영어 사전이 있고, 언어는 한글 비율로 정한다.
사전은 거칠다. 고칠 때마다 VERSION을 올리고 결과를 비교한다.
"""

from __future__ import annotations

import re
from collections import Counter

import numpy as np

from hitmodel.segment import split_scenes

VERSION = "story-lex-v0"
SEGMENTS = 20

STORY_FEATURES = [
    "hook_tension",
    "conflict_onset",
    "first_question",
    "tension_mean",
    "tension_slope",
    "tension_peak_pos",
    "valence_swing",
    "valence_reversals",
    "ending_valence",
    "twist_markers",
    "secret_markers",
    "ending_open",
    "dialogue_share",
    "character_count",
    "top_character_share",
    "exclaim_rate",
    "sentence_len_mean",
    "sentence_len_cv",
]

# 한국어는 교착어라 어간 부분 문자열로 센다. 짧은 어간("피", "적")은 다른 낱말에 섞여서 뺐다.
LEX = {
    "ko": {
        "tension": [
            "위험",
            "무서",
            "두려",
            "공포",
            "비명",
            "피가",
            "피를",
            "피투성이",
            "죽었",
            "죽여",
            "죽음",
            "죽일",
            "죽을",
            "살인",
            "칼을",
            "총을",
            "싸우",
            "싸움",
            "공격",
            "위협",
            "도망",
            "쫓아",
            "쫓기",
            "소리치",
            "분노",
            "절박",
            "갑자기",
            "긴급",
            "폭발",
            "함정",
            "감옥",
            "전쟁",
            "상처",
            "울부짖",
            "외쳤",
            "떨리",
            "떨었",
            "숨이 막",
            "다급",
        ],
        "positive": ["사랑", "행복", "기쁘", "기뻐", "웃었", "웃음", "미소", "다정", "아름답", "희망", "고마", "감사", "평화", "따뜻", "반가", "설레"],
        "negative": ["슬프", "슬픔", "눈물", "아프", "고통", "미워", "증오", "잔인", "절망", "외로", "비참", "괴로", "원망", "서럽", "무서", "두려"],
        "twist": ["알고 보니", "알고보니", "사실은", "정체", "반전", "진실", "속았", "가짜", "변장"],
        "secret": ["비밀", "거짓말", "숨기", "숨겼", "감추", "속이", "몰래", "들키"],
    },
    "en": {
        "tension": [
            "danger",
            "=fear",
            "=feared",
            "afraid",
            "terror",
            "terrif",
            "scream",
            "blood",
            "=dead",
            "death",
            "kill",
            "murder",
            "=gun",
            "=guns",
            "knife",
            "fight",
            "attack",
            "threat",
            "escape",
            "chase",
            "panic",
            "trembl",
            "horror",
            "shout",
            "rage",
            "furious",
            "desperat",
            "sudden",
            "alarm",
            "crash",
            "=fire",
            "storm",
            "enemy",
            "=trap",
            "poison",
            "prison",
            "=war",
            "=wars",
            "wound",
            "=flee",
            "=fled",
        ],
        "positive": [
            "love",
            "=happy",
            "happi",
            "=joy",
            "joyful",
            "smil",
            "laugh",
            "=kind",
            "kindness",
            "beautiful",
            "hope",
            "glad",
            "delight",
            "peace",
            "warm",
            "gentle",
            "bless",
            "thank",
            "wonderful",
            "dear",
        ],
        "negative": [
            "=sad",
            "sorrow",
            "grief",
            "=tears",
            "weep",
            "=pain",
            "=hate",
            "=hated",
            "cruel",
            "=fear",
            "angry",
            "despair",
            "miser",
            "lonely",
            "=sick",
            "wretched",
            "suffer",
            "=cry",
            "=cried",
        ],
        "twist": [
            "turned out",
            "in truth",
            "the truth",
            "all along",
            "none other than",
            "no other than",
            "revealed",
            "unmasked",
            "disguise",
            "realized",
            "realised",
        ],
        "secret": ["secret", "=lie", "=lies", "=lied", "=liar", "hidden", "conceal", "myster", "deceiv", "pretend"],
    },
}
SENTENCE_END = re.compile(r"[.!?。…]+[\"'”’)]*\s+|\n+")
QUOTED = re.compile(r"[\"“]([^\"“”]{1,2000})[\"”]|[「『]([^」』]{1,2000})[」』]")
CAPITALIZED = re.compile(r"(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,})\b")
ANY_CAPITALIZED = re.compile(r"\b([A-Z][a-z]{2,})\b")
NOT_NAMES = {
    "The",
    "And",
    "But",
    "Then",
    "There",
    "This",
    "That",
    "What",
    "When",
    "Where",
    "Which",
    "While",
    "With",
    "Who",
    "Why",
    "How",
    "Yes",
    "Not",
    "For",
    "His",
    "Her",
    "She",
    "They",
    "Their",
    "You",
    "Your",
    "Our",
    "Its",
    "Mrs",
    "Miss",
    "Sir",
    "Lord",
    "Lady",
    "God",
    "Chapter",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "English",
    "France",
    "London",
}
GUTENBERG_START = re.compile(r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n", re.I)
OLD_SMALL_PRINT_END = re.compile(r"\*END\*THE SMALL PRINT![^\n]*\n", re.I)
GUTENBERG_END = re.compile(r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK", re.I)


def strip_gutenberg(text: str) -> str:
    """구텐베르크 머리말·꼬리말(라이선스 안내)을 뗀다"""
    # 1990년대 파일은 "*END*THE SMALL PRINT!" 안내문 뒤에서 본문이 시작한다
    m = GUTENBERG_START.search(text) or OLD_SMALL_PRINT_END.search(text)
    if m:
        text = text[m.end() :]
    m = GUTENBERG_END.search(text)
    if m:
        text = text[: m.start()]
    return text.strip()


def detect_lang(text: str) -> str:
    sample = text[:20000]
    hangul = sum(1 for ch in sample if "가" <= ch <= "힣")
    letters = sum(1 for ch in sample if ch.isalpha())
    return "ko" if letters and hangul / letters > 0.3 else "en"


_EN_PATTERNS: dict[tuple[str, ...], re.Pattern] = {}


def _en_pattern(words: list[str]) -> re.Pattern:
    """영어 사전 → 정규식. "=war"는 낱말 그대로만, "terrif"는 그 어간으로 시작하는 낱말, 띄어쓰기가 있으면 구절"""
    key = tuple(words)
    if key not in _EN_PATTERNS:
        parts = []
        for w in words:
            if w.startswith("="):
                parts.append(re.escape(w[1:]) + r"\b")
            elif " " in w:
                parts.append(re.escape(w) + r"\b")
            else:
                parts.append(re.escape(w) + r"[a-z']*")
        _EN_PATTERNS[key] = re.compile(r"\b(?:" + "|".join(parts) + ")")
    return _EN_PATTERNS[key]


def _count(text: str, words: list[str], lang: str) -> int:
    if lang == "en":
        return len(_en_pattern(words).findall(text.lower()))
    return sum(text.count(w) for w in words)


def _per_1k(n: float, chars: int) -> float:
    return n * 1000.0 / max(chars, 1)


def _segments(text: str, n: int = SEGMENTS) -> list[str]:
    size = max(1, len(text) // n)
    return [text[i * size : (i + 1) * size if i < n - 1 else len(text)] for i in range(n)]


def _smooth(x: np.ndarray) -> np.ndarray:
    if len(x) < 3:
        return x
    padded = np.concatenate([[x[0]], x, [x[-1]]])
    return np.convolve(padded, np.ones(3) / 3, mode="valid")


def _reversals(x: np.ndarray) -> int:
    d = np.sign(np.diff(_smooth(x)))
    d = d[d != 0]
    return int((d[1:] != d[:-1]).sum()) if len(d) > 1 else 0


def _characters(text: str, lang: str) -> Counter:
    if lang == "ko" or re.search(r"^\s*[가-힣A-Za-z]{1,10}\s*:", text, re.M):
        speakers: Counter = Counter()
        for s in split_scenes(text):
            speakers.update(s.speakers)
        if speakers:
            return speakers
    # 문장 가운데에서 대문자로 쓰인 적이 있는 낱말만 이름 후보로 보고, 문장 첫머리에 나온 것까지 센다
    candidates = {m for m in CAPITALIZED.findall(text) if m not in NOT_NAMES}
    names = Counter(m for m in ANY_CAPITALIZED.findall(text) if m in candidates)
    floor = max(5, len(text) // 20000)
    return Counter({k: v for k, v in names.items() if v >= floor})


def _dialogue_share(text: str) -> float:
    quoted = sum(len(a or b) for a, b in QUOTED.findall(text))
    script = sum(len(m.group(1)) for m in re.finditer(r"^\s*[가-힣A-Za-z]{1,10}(?:\s*\([^)]{0,12}\))?\s*:\s*(\S.*)$", text, re.M))
    return min(1.0, (quoted + script) / max(len(text), 1))


def story_features(text: str, lang: str | None = None) -> dict[str, float]:
    """키 순서는 STORY_FEATURES와 같다"""
    lang = lang or detect_lang(text)
    lex = LEX[lang]
    total = max(len(text), 1)
    segs = _segments(text)
    tension = np.array([_per_1k(_count(s, lex["tension"], lang), len(s)) for s in segs])
    valence = np.array([_per_1k(_count(s, lex["positive"], lang) - _count(s, lex["negative"], lang), len(s)) for s in segs])

    head = text[: max(1, total // 20)]
    tail = text[-max(1, total // 20) :]
    ending = text[-max(1, total // 10) :]
    overall_t = _per_1k(_count(text, lex["tension"], lang), total)
    overall_v = _per_1k(_count(text, lex["positive"], lang) - _count(text, lex["negative"], lang), total)

    median_t = float(np.median(tension))
    onset = next((i for i, t in enumerate(tension) if t > 0 and t >= 1.5 * median_t), None)
    z = (tension - tension.mean()) / tension.std() if tension.std() > 0 else np.zeros_like(tension)
    xs = np.linspace(0, 1, len(z))

    sentences = [s for s in SENTENCE_END.split(text) if s.strip()]
    lengths = np.array([len(s) for s in sentences], dtype=float) if sentences else np.array([0.0])
    chars = _characters(text, lang)
    char_total = sum(chars.values())

    return {
        "hook_tension": _per_1k(_count(head, lex["tension"], lang), len(head)) / overall_t if overall_t > 0 else 0.0,
        "conflict_onset": onset / (len(tension) - 1) if onset is not None else 1.0,
        "first_question": _per_1k(head.count("?") + head.count("？"), len(head)),
        "tension_mean": overall_t,
        "tension_slope": float(np.polyfit(xs, z, 1)[0]) if z.any() else 0.0,
        "tension_peak_pos": float(np.argmax(_smooth(tension)) / (len(tension) - 1)),
        "valence_swing": float(valence.std()),
        "valence_reversals": float(_reversals(valence)),
        "ending_valence": _per_1k(_count(ending, lex["positive"], lang) - _count(ending, lex["negative"], lang), len(ending)) - overall_v,
        "twist_markers": _count(text, lex["twist"], lang) * 10000.0 / total,
        "secret_markers": _count(text, lex["secret"], lang) * 10000.0 / total,
        "ending_open": _per_1k(tail.count("?") + tail.count("？") + tail.count("…") + tail.count("..."), len(tail)),
        "dialogue_share": _dialogue_share(text),
        "character_count": float(len(chars)),
        "top_character_share": max(chars.values()) / char_total if char_total else 0.0,
        "exclaim_rate": _per_1k(text.count("!") + text.count("！"), total),
        "sentence_len_mean": float(lengths.mean()),
        "sentence_len_cv": float(lengths.std() / lengths.mean()) if lengths.mean() > 0 else 0.0,
    }


def feature_matrix(texts: list[str], langs: list[str | None] | None = None) -> np.ndarray:
    langs = langs or [None] * len(texts)
    rows = []
    for t, lang in zip(texts, langs, strict=True):
        f = story_features(t, lang)  # 작품마다 한 번만 잰다
        rows.append([f[k] for k in STORY_FEATURES])
    return np.array(rows, dtype=float)
