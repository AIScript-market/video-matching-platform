import csv
import json

import numpy as np

from research.dataset import MIN_CHANNEL_SCRIPTS, load_pilot
from research.synthetic import write_synthetic_pilot


def test_loads_synthetic_pilot_and_labels_within_channel(tmp_path):
    write_synthetic_pilot(tmp_path, channels=4, scripts_per_channel=20, seed=1)
    scripts, report = load_pilot(tmp_path)
    assert report.channels == 4 and len(scripts) == 80 and not report.missing_scripts
    assert sum(s.hit for s in scripts) == 16  # 상위 20%
    assert all(s.retention is not None for s in scripts)
    times = [s.published_at for s in scripts]
    assert times == sorted(times)
    # 채널 규모를 걷어냈으므로 채널마다 도달 중앙값이 0이고, 성공작이 한 채널에 몰리지 않는다
    for ch in {s.channel for s in scripts}:
        assert abs(np.median([s.reach for s in scripts if s.channel == ch])) < 1e-9
    assert len({s.channel for s in scripts if s.hit}) >= 3


def test_skips_recent_unmapped_and_small_channels(tmp_path):
    write_synthetic_pilot(tmp_path, channels=2, scripts_per_channel=MIN_CHANNEL_SCRIPTS + 2, seed=2)
    ch1 = tmp_path / "ch-01"
    meta = json.loads((ch1 / "channel.json").read_text(encoding="utf-8"))
    # 첫 채널: 대본 파일 하나가 없고, 내보낸 날짜를 앞당겨 대부분 "갓 올린 영상"이 되게 한다
    (ch1 / "scripts" / "s001.txt").unlink()
    meta["exportedAt"] = "2025-01-01"
    (ch1 / "channel.json").write_text(json.dumps(meta), encoding="utf-8")
    # 둘째 채널: 매핑에서 한 줄을 뺀다
    ch2 = tmp_path / "ch-02"
    rows = list(csv.reader((ch2 / "mapping.csv").open(encoding="utf-8")))
    with (ch2 / "mapping.csv").open("w", encoding="utf-8", newline="") as f:
        csv.writer(f).writerows(rows[:-1])

    scripts, report = load_pilot(tmp_path)
    assert report.too_recent > 0
    assert report.unmapped_videos >= 1
    assert "ch-01" not in {s.channel for s in scripts}
    assert {s.channel for s in scripts} == {"ch-02"} and len(scripts) == MIN_CHANNEL_SCRIPTS + 1
