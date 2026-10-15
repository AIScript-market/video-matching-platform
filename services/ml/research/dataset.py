"""파일럿 데이터 읽기와 정답 만들기.

채널마다 폴더 하나 (research/data/<채널>/, 저장소에 넣지 않는다):

    channel.json   {"channel": "ch-01", "exportedAt": "2026-10-10", "agreementId": "...", "genre": "드라마"}
    studio.csv     크리에이터가 스튜디오에서 내려받은 표 데이터 (studio_export.py)
    mapping.csv    video_id,script[,genre]   script는 scripts/ 아래 파일 이름
    scripts/       대본 원문 (.txt, .md)
    columns.json   (선택) 스튜디오 열 이름이 다를 때

정답은 **채널 안에서 비교한** 성과다. 채널마다 구독자·알고리즘 노출이 달라서, 같은 채널의 다른 영상보다 잘됐는지를 본다.
- 도달   = log(1+조회수) − 그 채널 중앙값
- 유지   = 평균 조회율(%) − 그 채널 중앙값   (대본 힘에 가장 가까운 지표. 없으면 뺀다)
- 반응   = log((좋아요+댓글+1)/(조회수+1)) − 그 채널 중앙값
- 점수   = 있는 지표들의 z값 평균, 상위 20% = 성공
한 대본으로 영상을 여러 편 만들었으면 지표를 평균해 대본 하나로 본다.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from .studio_export import VideoStats, parse_date, read_studio_csv

# 공개 후 이만큼 지난 영상만 쓴다 (스튜디오 내보내기는 누적 성과라서, 갓 올린 영상은 덜 쌓였다)
MIN_DAYS_LIVE = 30
# 채널 안에서 비교하려면 영상이 이만큼은 있어야 한다
MIN_CHANNEL_SCRIPTS = 8
HIT_SHARE = 0.2
LABEL_DEFINITION = "within-channel: z(log1p views - median) + z(avg% viewed - median) + z(log engagement - median), mean of available; top 20% = hit"
SCRIPT_SUFFIXES = {".txt", ".md"}


@dataclass
class PilotScript:
    channel: str
    script_key: str  # 채널 안에서 대본 파일 이름
    text: str
    genre: str
    published_at: datetime  # 이 대본으로 만든 첫 영상
    videos: list[VideoStats] = field(default_factory=list)
    reach: float = 0.0
    retention: float | None = None
    engagement: float = 0.0
    score: float = 0.0
    hit: bool = False

    @property
    def uid(self) -> str:
        return f"{self.channel}/{self.script_key}"

    @property
    def duration_s(self) -> float | None:
        durations = [v.duration_s for v in self.videos if v.duration_s is not None]
        return float(np.mean(durations)) if durations else None


@dataclass
class LoadReport:
    channels: int = 0
    videos_in_exports: int = 0
    mapped_videos: int = 0
    too_recent: int = 0
    missing_scripts: list[str] = field(default_factory=list)
    unmapped_videos: int = 0
    dropped_channels: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return self.__dict__ | {"missing_scripts": self.missing_scripts[:20]}


def _read_text(path: Path) -> str:
    for enc in ("utf-8-sig", "cp949"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"인코딩을 읽지 못했습니다: {path}")


def load_channel(folder: Path, report: LoadReport) -> list[PilotScript]:
    meta = json.loads((folder / "channel.json").read_text(encoding="utf-8"))
    channel = str(meta.get("channel") or folder.name)
    exported_at = parse_date(meta["exportedAt"]) if meta.get("exportedAt") else datetime.now(UTC)
    overrides = json.loads((folder / "columns.json").read_text(encoding="utf-8")) if (folder / "columns.json").exists() else None
    stats = {v.video_id: v for v in read_studio_csv(folder / "studio.csv", overrides)}
    report.videos_in_exports += len(stats)

    scripts: dict[str, PilotScript] = {}
    with (folder / "mapping.csv").open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            vid, key = (row.get("video_id") or "").strip(), (row.get("script") or "").strip()
            if not vid or not key or vid not in stats:
                continue
            report.mapped_videos += 1
            v = stats[vid]
            if (exported_at - v.published_at).days < MIN_DAYS_LIVE:
                report.too_recent += 1
                continue
            path = folder / "scripts" / key
            if path.suffix.lower() not in SCRIPT_SUFFIXES or not path.is_file():
                report.missing_scripts.append(f"{channel}/{key}")
                continue
            if key not in scripts:
                genre = (row.get("genre") or meta.get("genre") or "미분류").strip()
                scripts[key] = PilotScript(channel, key, _read_text(path), genre, v.published_at)
            s = scripts[key]
            s.videos.append(v)
            s.published_at = min(s.published_at, v.published_at)
    mapped = {v.video_id for s in scripts.values() for v in s.videos}
    report.unmapped_videos += len(stats) - len(mapped)
    return list(scripts.values())


def _median_center(values: list[float]) -> np.ndarray:
    arr = np.array(values, dtype=float)
    return arr - np.median(arr)


def _z(values: np.ndarray) -> np.ndarray:
    std = values.std()
    return (values - values.mean()) / std if std > 0 else np.zeros_like(values)


def label(scripts: list[PilotScript]) -> list[PilotScript]:
    """채널 안 비교 지표를 채우고 상위 20%를 성공으로 표시한다. 영상이 적은 채널은 뺀다. 시간 순서로 돌려준다."""
    by_channel: dict[str, list[PilotScript]] = {}
    for s in scripts:
        by_channel.setdefault(s.channel, []).append(s)
    kept: list[PilotScript] = []
    for items in by_channel.values():
        if len(items) < MIN_CHANNEL_SCRIPTS:
            continue
        reach = [float(np.mean([math.log1p(v.views) for v in s.videos])) for s in items]
        engage = [float(np.mean([math.log(((v.likes or 0) + (v.comments or 0) + 1) / (v.views + 1)) for v in s.videos])) for s in items]
        for s, r, e in zip(items, _median_center(reach), _median_center(engage), strict=True):
            s.reach, s.engagement = float(r), float(e)
        pct = [[v.avg_pct_viewed for v in s.videos if v.avg_pct_viewed is not None] for s in items]
        known = [float(np.mean(p)) for p in pct if p]
        if len(known) >= MIN_CHANNEL_SCRIPTS:
            mid = float(np.median(known))
            for s, p in zip(items, pct, strict=True):
                s.retention = float(np.mean(p)) - mid if p else None
        kept.extend(items)
    if not kept:
        return []

    parts = [_z(np.array([s.reach for s in kept])), _z(np.array([s.engagement for s in kept]))]
    has_ret = np.array([s.retention is not None for s in kept])
    ret = np.zeros(len(kept))
    if has_ret.any():
        ret[has_ret] = _z(np.array([s.retention for s in kept if s.retention is not None]))
    total = parts[0] + parts[1] + ret
    scores = total / (2 + has_ret.astype(float))

    n_hits = max(1, round(len(kept) * HIT_SHARE))
    rank = scores.argsort(kind="stable").argsort()
    for s, score, r in zip(kept, scores, rank, strict=True):
        s.score = float(score)
        s.hit = bool(r >= len(kept) - n_hits)
    kept.sort(key=lambda s: (s.published_at, s.uid))
    return kept


def load_pilot(root: Path) -> tuple[list[PilotScript], LoadReport]:
    report = LoadReport()
    scripts: list[PilotScript] = []
    for folder in sorted(p for p in root.iterdir() if p.is_dir() and (p / "channel.json").exists()):
        report.channels += 1
        scripts.extend(load_channel(folder, report))
    labeled = label(scripts)
    kept_channels = {s.channel for s in labeled}
    report.dropped_channels = sorted({s.channel for s in scripts} - kept_channels)
    return labeled, report
