"""유튜브 스튜디오 "고급 모드" 내보내기(표 데이터 CSV)를 읽는다.

크리에이터가 자기 채널에서 내려받은 파일이다. 화면 언어에 따라 열 이름이 다르므로 영어·한국어 이름을 모두 받는다.
처음 받는 실제 파일에서 열 이름이 다르면 채널 폴더의 columns.json({"views": "실제 열 이름", ...})으로 맞춘다.
"""

from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class VideoStats:
    video_id: str
    title: str
    published_at: datetime
    duration_s: float | None
    views: int
    likes: int | None = None
    comments: int | None = None
    avg_view_duration_s: float | None = None
    avg_pct_viewed: float | None = None
    impressions: int | None = None
    ctr_pct: float | None = None


def _norm(header: str) -> str:
    return re.sub(r"[\s_().%:/\-]", "", header.strip().lower())


# 필드 → 받는 열 이름 (정규화한 값)
ALIASES: dict[str, set[str]] = {
    "video_id": {"content", "videoid", "콘텐츠", "동영상id", "동영상"},
    "title": {"videotitle", "title", "동영상제목", "제목"},
    "published_at": {"videopublishtime", "publishtime", "publishdate", "동영상게시시간", "게시시간", "게시일", "동영상게시일"},
    "duration_s": {"duration", "길이", "동영상길이"},
    "views": {"views", "조회수"},
    "likes": {"likes", "좋아요", "좋아요수"},
    "comments": {"commentsadded", "comments", "추가된댓글", "추가된댓글수", "댓글", "댓글수"},
    "avg_view_duration_s": {"averageviewduration", "평균시청지속시간"},
    "avg_pct_viewed": {"averagepercentageviewed", "평균조회율", "평균시청비율", "평균시청률"},
    "impressions": {"impressions", "노출수"},
    "ctr_pct": {"impressionsclickthroughrate", "노출클릭률"},
}
REQUIRED = ("video_id", "published_at", "views")
TOTAL_ROWS = {"total", "합계", "총계"}


class ExportError(ValueError):
    pass


def resolve_columns(headers: list[str], overrides: dict[str, str] | None = None) -> dict[str, str]:
    """필드 → 실제 열 이름"""
    by_norm = {_norm(h): h for h in headers}
    out: dict[str, str] = {}
    for field_name, names in ALIASES.items():
        for n in names:
            if n in by_norm:
                out[field_name] = by_norm[n]
                break
    for field_name, header in (overrides or {}).items():
        if header not in headers:
            raise ExportError(f"columns.json의 '{header}' 열이 파일에 없습니다")
        out[field_name] = header
    missing = [f for f in REQUIRED if f not in out]
    if missing:
        raise ExportError(f"필수 열을 찾지 못했습니다: {missing}. 열 이름: {headers}. columns.json으로 지정하세요")
    return out


def parse_number(value: str | None) -> float | None:
    if value is None:
        return None
    v = value.strip().replace(",", "").replace("%", "")
    if v in {"", "-", "—"}:
        return None
    return float(v)


def parse_duration(value: str | None) -> float | None:
    """'0:45', '1:02:03', '45', '45.0' → 초"""
    if value is None or not value.strip():
        return None
    v = value.strip()
    if ":" in v:
        total = 0.0
        for part in v.split(":"):
            total = total * 60 + float(part)
        return total
    return parse_number(v)


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def parse_date(value: str) -> datetime:
    """'Oct 3, 2026', '2026. 10. 3.', '2026-10-03', '2026/10/03 12:00' → UTC 자정 기준 시각"""
    v = value.strip()
    m = re.match(r"^(\d{4})\D+(\d{1,2})\D+(\d{1,2})", v)
    if m:
        return datetime(int(m[1]), int(m[2]), int(m[3]), tzinfo=UTC)
    m = re.match(r"^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})", v)
    if m and m[1].lower() in MONTHS:
        return datetime(int(m[3]), MONTHS[m[1].lower()], int(m[2]), tzinfo=UTC)
    raise ExportError(f"게시 날짜를 읽지 못했습니다: '{value}'")


def read_studio_csv(path: Path, overrides: dict[str, str] | None = None) -> list[VideoStats]:
    # 스튜디오 파일은 BOM이 붙은 UTF-8이다
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        cols = resolve_columns(reader.fieldnames or [], overrides)
        out: list[VideoStats] = []
        for row in reader:
            vid = (row.get(cols["video_id"]) or "").strip()
            if not vid or vid.lower() in TOTAL_ROWS:
                continue

            def get(name: str, row: dict = row) -> str | None:
                return row.get(cols[name]) if name in cols else None

            views = parse_number(get("views"))
            if views is None:
                continue
            likes, comments, impressions = parse_number(get("likes")), parse_number(get("comments")), parse_number(get("impressions"))
            out.append(
                VideoStats(
                    video_id=vid,
                    title=(get("title") or "").strip(),
                    published_at=parse_date(get("published_at") or ""),
                    duration_s=parse_duration(get("duration_s")),
                    views=int(views),
                    likes=None if likes is None else int(likes),
                    comments=None if comments is None else int(comments),
                    avg_view_duration_s=parse_duration(get("avg_view_duration_s")),
                    avg_pct_viewed=parse_number(get("avg_pct_viewed")),
                    impressions=None if impressions is None else int(impressions),
                    ctr_pct=parse_number(get("ctr_pct")),
                )
            )
    return out
