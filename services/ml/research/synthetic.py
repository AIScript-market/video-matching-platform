"""가짜 파일럿 데이터. 분석 도구가 맞게 도는지 확인하는 용도다 (실제 성과와 무관).

signal=0이면 대본 내용과 성과가 무관하다. 이때 분석이 "가능성 있음"을 내면 도구가 틀린 것이다.
signal>0이면 긴장 장면이 많은 대본일수록 같은 채널 안에서 유지율·조회수가 높다.
"""

from __future__ import annotations

import csv
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

CALM = [
    "민지: 오늘 점심 뭐 먹을까?",
    "준호: 아무거나 괜찮아.",
    "카페 창가, 햇살이 들어온다.",
    "민지: 주말에 영화 볼래?",
    "준호: 좋아, 표는 내가 살게.",
    "두 사람, 천천히 길을 걷는다.",
    "엄마: 밥은 먹고 다니니?",
    "회사 탕비실, 커피 머신 소리.",
]
TENSE = [
    "민지: 너 지금 거짓말하는 거지?",
    "준호: (휴대폰을 숨기며) 아니야, 진짜야!",
    "문이 벌컥 열린다. 낯선 남자가 서 있다.",
    "남자: 그 돈, 어디 있어?",
    "민지: 설마… 처음부터 다 알고 있었어?",
    "정적. 휴대폰 진동이 울린다. 발신자: 모르는 번호.",
    "준호: 지금 당장 여기서 나가야 돼!",
    "반전. 사진 속 인물은 민지 자신이다.",
]
EXPORT_HEADER = ["콘텐츠", "동영상 제목", "동영상 게시 시간", "길이", "조회수", "평균 시청 지속 시간", "평균 조회율 (%)", "좋아요 수", "추가된 댓글 수"]


def _script(rng: np.random.Generator, tension: float) -> str:
    scenes = []
    for k in range(int(rng.integers(3, 7))):
        place = rng.choice(["거실", "카페", "사무실", "골목", "옥상"])
        time = rng.choice(["낮", "밤"])
        lines = [str(rng.choice(TENSE if rng.random() < tension else CALM)) for _ in range(int(rng.integers(4, 9)))]
        scenes.append(f"S#{k + 1}. {place} ({time})\n" + "\n".join(lines))
    return "\n\n".join(scenes) + "\n"


def write_synthetic_pilot(root: Path, *, channels: int = 12, scripts_per_channel: int = 30, signal: float = 1.0, seed: int = 0) -> Path:
    rng = np.random.default_rng(seed)
    exported_at = datetime(2026, 10, 1, tzinfo=UTC)
    for c in range(channels):
        folder = root / f"ch-{c + 1:02d}"
        (folder / "scripts").mkdir(parents=True, exist_ok=True)
        size = 10 ** rng.uniform(3.5, 6.0)  # 채널마다 규모가 크게 다르다
        base_ret = rng.uniform(45, 80)
        (folder / "channel.json").write_text(
            json.dumps({"channel": folder.name, "exportedAt": exported_at.date().isoformat(), "agreementId": "synthetic", "genre": "드라마"}),
            encoding="utf-8",
        )
        rows, mapping = [], []
        for i in range(scripts_per_channel):
            tension = float(rng.uniform(0.05, 0.6))
            key = f"s{i + 1:03d}.txt"
            (folder / "scripts" / key).write_text(_script(rng, tension), encoding="utf-8")
            effect = signal * (tension - 0.33) / 0.16  # 대략 표준화한 긴장도
            published = exported_at - timedelta(days=int(rng.integers(35, 400)))
            views = int(size * np.exp(0.5 * effect + rng.normal(0, 0.8)))
            duration = int(rng.integers(40, 180))
            pct = float(np.clip(base_ret + 6 * effect + rng.normal(0, 8), 5, 150))
            likes = int(views * np.exp(rng.normal(-3.5, 0.4) + 0.2 * effect))
            comments = int(likes * rng.uniform(0.03, 0.12))
            vid = f"{folder.name}-v{i + 1:03d}"
            avg = int(duration * pct / 100)
            rows.append(
                [vid, f"{i + 1}화", published.strftime("%Y. %m. %d."), duration, f"{views:,}", f"{avg // 60}:{avg % 60:02d}", f"{pct:.1f}", likes, comments]
            )
            mapping.append([vid, key])
        with (folder / "studio.csv").open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(EXPORT_HEADER)
            w.writerow(["합계", "", "", "", "", "", "", "", ""])
            w.writerows(rows)
        with (folder / "mapping.csv").open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["video_id", "script"])
            w.writerows(mapping)
    return root
