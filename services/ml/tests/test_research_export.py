from datetime import UTC, datetime

import pytest

from research.studio_export import ExportError, parse_date, parse_duration, read_studio_csv

EN_HEADER = (
    "Content,Video title,Video publish time,Duration,Views,Watch time (hours),Average view duration,"
    "Average percentage viewed (%),Likes,Comments added,Impressions,Impressions click-through rate (%)"
)
EN = "﻿" + EN_HEADER + """
Total,,,,"12,345",100.1,0:00:40,,300,20,"100,000",4.1
abc123,첫 화,"Oct 3, 2026",58,"10,000",80.2,0:00:41,70.5,250,15,"80,000",4.5
def456,둘째 화,"Sep 21, 2026",1:05,"2,345",19.9,0:00:30,46.1,50,5,"20,000",
"""

KO = """﻿콘텐츠,동영상 제목,동영상 게시 시간,길이,조회수,평균 시청 지속 시간,평균 조회율 (%),좋아요 수,추가된 댓글 수
합계,,,,"3,000",,,,
k1,반전 편,2026. 10. 3.,45,"3,000",0:32,71.1,90,7
"""


def test_reads_english_export_and_skips_total(tmp_path):
    p = tmp_path / "studio.csv"
    p.write_text(EN, encoding="utf-8")
    rows = read_studio_csv(p)
    assert [r.video_id for r in rows] == ["abc123", "def456"]
    a, b = rows
    assert a.views == 10_000 and a.likes == 250 and a.comments == 15 and a.impressions == 80_000
    assert a.published_at == datetime(2026, 10, 3, tzinfo=UTC)
    assert a.avg_view_duration_s == 41 and a.avg_pct_viewed == 70.5 and a.duration_s == 58
    assert b.duration_s == 65 and b.ctr_pct is None


def test_reads_korean_export(tmp_path):
    p = tmp_path / "studio.csv"
    p.write_text(KO, encoding="utf-8")
    [row] = read_studio_csv(p)
    assert row.video_id == "k1" and row.views == 3_000 and row.likes == 90 and row.comments == 7
    assert row.published_at == datetime(2026, 10, 3, tzinfo=UTC) and row.avg_view_duration_s == 32


def test_column_overrides_and_missing_columns(tmp_path):
    p = tmp_path / "studio.csv"
    p.write_text("id,when,plays\nv1,2026-01-02,10\n", encoding="utf-8")
    with pytest.raises(ExportError):
        read_studio_csv(p)
    [row] = read_studio_csv(p, {"video_id": "id", "published_at": "when", "views": "plays"})
    assert row.views == 10 and row.published_at.month == 1


def test_parsers():
    assert parse_duration("1:02:03") == 3723
    assert parse_duration("") is None
    assert parse_date("2026/10/03 12:00").day == 3
    with pytest.raises(ExportError):
        parse_date("어제")
