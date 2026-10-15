"""댓글 감성 분류 기준선 (사전 기반).

긍정 댓글 수를 세는 데 쓴다. 학습 없이 바로 쓸 수 있는 출발점이고, 사람이 라벨을 단 댓글이 쌓이면
분류 모델로 바꾼다. 부정 표현을 먼저 지운 뒤 긍정 표현을 센다 ("재미없다"가 "재미"로 잡히지 않게).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

VERSION = "lexicon-ko-v1"

NEGATIVE = [
    "재미없", "재미가없", "재미도없", "노잼", "핵노잼", "지루", "별로", "실망", "억지", "오글", "최악", "유치",
    "뻔하", "뻔한", "짜증", "어색", "돈아깝", "시간아깝", "망작", "하차", "불편", "싫", "안좋", "못하", "ㅡㅡ",
    "boring", "worst", "bad",
]
POSITIVE = [
    "재밌", "재미있", "재미잇", "잼있", "꿀잼", "존잼", "최고", "감동", "소름", "대박", "명작", "웃기", "웃겼",
    "ㅋㅋ", "ㅎㅎ", "좋아", "좋다", "좋네", "좋았", "좋은", "사랑", "울었", "눈물", "기대", "다음화", "다음편",
    "미쳤", "몰입", "레전드", "찢었", "고퀄", "잘만", "잘봤", "추천",
    "love", "good", "great", "best", "amazing", "❤", "👍", "😭", "🔥",
]
SPACES = re.compile(r"\s+")


@dataclass
class SentimentCounts:
    total: int = 0
    positive: int = 0
    negative: int = 0
    neutral: int = 0


def classify(comment: str) -> str:
    """'positive' | 'negative' | 'neutral'"""
    text = SPACES.sub("", comment.lower())
    neg = 0
    for word in sorted(NEGATIVE, key=len, reverse=True):
        hits = text.count(word)
        if hits:
            neg += hits
            text = text.replace(word, " ")
    pos = sum(text.count(word) for word in POSITIVE)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def count(comments: list[str]) -> SentimentCounts:
    out = SentimentCounts(total=len(comments))
    for c in comments:
        kind = classify(c)
        setattr(out, kind, getattr(out, kind) + 1)
    return out
