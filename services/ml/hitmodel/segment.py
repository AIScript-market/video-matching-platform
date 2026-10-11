"""대본 본문을 장면으로 나누고, 장면마다 대사·지문·인물을 센다.

LLM을 쓰지 않는 결정적 규칙이다. 같은 본문이면 언제나 같은 결과가 나온다.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

# 장면 머리: "S#1.", "S #12", "#3", "씬 4", "장면 5", "INT.", "EXT.", "1. 집 (밤)"
SCENE_HEADING = re.compile(
    r"""^\s*(?:
        S\s*\#\s*\d+
      | \#\s*\d+
      | (?:씬|장면)\s*\d+
      | (?:INT|EXT)\b\.?
      | \d+\s*[.)]\s+\S.*\((?:낮|밤|아침|저녁|새벽|오전|오후|D|N)\)
    )""",
    re.X | re.I,
)
# 장면 머리의 괄호 안 시간대: "(밤)", "(새벽, 비)", "(N)", "NIGHT"
NIGHT = re.compile(r"\([^)]*(?:밤|새벽|저녁)[^)]*\)|\(N\)|\bNIGHT\b", re.I)
# "정수: 대사" / "정수 : 대사"
NAME_COLON = re.compile(r"^\s*([가-힣A-Za-z]{1,10})(?:\s*\([^)]{0,12}\))?\s*:\s*(\S.*)$")
# 이름만 있는 줄 (다음 줄이 대사). "정수", "정수(V.O.)"
NAME_ONLY = re.compile(r"^\s*([가-힣]{1,6}|[A-Z][A-Za-z]{0,14})(?:\s*\([^)]{0,12}\))?\s*$")

# "제목: …" 같은 머리말은 대사가 아니다
NOT_SPEAKERS = {"제목", "작가", "장르", "로그라인", "시놉시스", "기획의도", "등장인물", "인물", "배경", "시간", "장소"}

# 장면 머리가 없는 글은 이 길이 정도로 문단을 묶어 장면으로 본다
FALLBACK_CHUNK_CHARS = 1500


@dataclass
class Scene:
    index: int
    heading: str
    text: str
    dialogue_lines: int = 0
    action_lines: int = 0
    speakers: dict[str, int] = field(default_factory=dict)

    @property
    def chars(self) -> int:
        return len(self.text)

    @property
    def is_night(self) -> bool:
        return bool(NIGHT.search(self.heading))


def _classify(scene: Scene, body_lines: list[str]) -> None:
    pending: str | None = None
    for raw in body_lines:
        line = raw.strip()
        if not line:
            continue
        m = NAME_COLON.match(line)
        if m and m.group(1) in NOT_SPEAKERS:
            scene.action_lines += 1
            continue
        if m:
            scene.dialogue_lines += 1
            scene.speakers[m.group(1)] = scene.speakers.get(m.group(1), 0) + 1
            pending = None
            continue
        if pending is not None:
            scene.dialogue_lines += 1
            scene.speakers[pending] = scene.speakers.get(pending, 0) + 1
            pending = None
            continue
        m = NAME_ONLY.match(line)
        if m:
            pending = m.group(1)
            continue
        scene.action_lines += 1


def split_scenes(text: str) -> list[Scene]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[tuple[str, list[str]]] = []
    for line in lines:
        if SCENE_HEADING.match(line):
            blocks.append((line.strip(), []))
        elif blocks:
            blocks[-1][1].append(line)
        elif line.strip():
            blocks.append(("", [line]))  # 첫 장면 머리 앞의 글
    has_headings = any(h for h, _ in blocks)
    if not has_headings:
        blocks = _chunk_paragraphs(lines)

    scenes: list[Scene] = []
    for heading, body in blocks:
        body_text = "\n".join(body).strip()
        if not heading and not body_text:
            continue
        scene = Scene(index=len(scenes), heading=heading, text=(heading + "\n" + body_text).strip())
        _classify(scene, body)
        scenes.append(scene)
    return scenes


def _chunk_paragraphs(lines: list[str]) -> list[tuple[str, list[str]]]:
    chunks: list[tuple[str, list[str]]] = []
    current: list[str] = []
    size = 0
    for line in lines:
        current.append(line)
        size += len(line)
        if size >= FALLBACK_CHUNK_CHARS and not line.strip():
            chunks.append(("", current))
            current, size = [], 0
    if any(l.strip() for l in current):
        chunks.append(("", current))
    return chunks


FEATURE_NAMES = [
    "log_chars",
    "scene_count",
    "avg_scene_chars",
    "dialogue_ratio",
    "speaker_count",
    "top_speaker_share",
    "night_scene_ratio",
    "first_scene_share",
    "first_scene_dialogue_ratio",
    "punct_per_1k",
]


def structural_features(text: str, scenes: list[Scene]) -> dict[str, float]:
    """장면 구조에서 뽑은 숫자 특징. 키 순서는 FEATURE_NAMES와 같다."""
    total = max(len(text), 1)
    dialogue = sum(s.dialogue_lines for s in scenes)
    action = sum(s.action_lines for s in scenes)
    speakers: dict[str, int] = {}
    for s in scenes:
        for name, n in s.speakers.items():
            speakers[name] = speakers.get(name, 0) + n
    first = scenes[0] if scenes else None
    first_lines = (first.dialogue_lines + first.action_lines) if first else 0
    return {
        "log_chars": math.log1p(len(text)),
        "scene_count": float(len(scenes)),
        "avg_scene_chars": (sum(s.chars for s in scenes) / len(scenes)) if scenes else 0.0,
        "dialogue_ratio": dialogue / (dialogue + action) if dialogue + action else 0.0,
        "speaker_count": float(len(speakers)),
        "top_speaker_share": (max(speakers.values()) / dialogue) if speakers and dialogue else 0.0,
        "night_scene_ratio": (sum(1 for s in scenes if s.is_night) / len(scenes)) if scenes else 0.0,
        "first_scene_share": (first.chars / total) if first else 0.0,
        "first_scene_dialogue_ratio": (first.dialogue_lines / first_lines) if first and first_lines else 0.0,
        "punct_per_1k": (text.count("?") + text.count("!")) * 1000 / total,
    }
