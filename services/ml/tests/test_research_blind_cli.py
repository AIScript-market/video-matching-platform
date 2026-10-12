import csv
import json

import numpy as np

from hitmodel.embedders import HashingNgramEmbedder
from research import blind
from research.__main__ import main
from research.dataset import load_pilot
from research.synthetic import write_synthetic_pilot


def _answer(sheet_path, key, *, honest: bool, seed: int):
    """정답을 아는 척하는 평가자(honest)와 아무렇게나 고르는 평가자"""
    rng = np.random.default_rng(seed)
    rows = list(csv.DictReader(sheet_path.open(encoding="utf-8-sig")))
    k = round(len(rows) * 0.2)
    scores = {r["code"]: (int(key[r["code"]]["hit"]) * 3 + rng.random()) if honest else rng.random() for r in rows}
    top = set(sorted(scores, key=lambda c: -scores[c])[:k])
    for r in rows:
        r["rating"] = str(1 + round(scores[r["code"]]))
        r["pick"] = "1" if r["code"] in top else ""
    out = sheet_path.with_name(f"answer-{seed}.csv")
    with out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=blind.SHEET_COLUMNS)
        w.writeheader()
        w.writerows(rows)
    return out


def test_packet_hides_answers_and_scores_raters(tmp_path):
    write_synthetic_pilot(tmp_path / "data", channels=8, scripts_per_channel=25, seed=4)
    scripts, _ = load_pilot(tmp_path / "data")
    info = blind.make_packet(scripts, HashingNgramEmbedder(), tmp_path / "blind", items=30)
    packet = tmp_path / "blind" / "packet"
    assert info["items"] == 30 and info["pick"] == 6
    assert len(list((packet / "scripts").glob("B*.txt"))) == 30
    # 문제지에는 영상 ID·채널·정답이 없다
    for f in packet.rglob("*"):
        if f.is_file():
            text = f.read_text(encoding="utf-8-sig")
            assert "ch-0" not in text and "hit" not in text
    key = {r["code"]: r for r in csv.DictReader((tmp_path / "blind" / "key.csv").open(encoding="utf-8"))}
    assert sum(int(r["hit"]) for r in key.values()) == info["hits"]

    good = _answer(packet / "answer-sheet.csv", key, honest=True, seed=1)
    noise = _answer(packet / "answer-sheet.csv", key, honest=False, seed=2)
    result = blind.score(tmp_path / "blind" / "key.csv", [good, noise])
    by_sheet = {r["sheet"]: r for r in result["raters"]}
    assert by_sheet[good.name]["auc"] > 0.95 and by_sheet[good.name]["picked"] == 6
    assert result["panel"]["raters"] == 2
    assert result["modelMinusPanelAuc"]["low"] <= result["modelMinusPanelAuc"]["point"] <= result["modelMinusPanelAuc"]["high"]


def test_cli_synthetic_check_analyze(tmp_path, capsys):
    data, out = tmp_path / "data", tmp_path / "out"
    assert main(["synthetic", str(data), "--channels", "3", "--scripts", "12"]) == 0
    assert main(["check", str(data)]) == 0
    assert json.loads(capsys.readouterr().out.split("\n", 1)[1])["scripts"] == 36
    assert main(["analyze", str(data), "--out", str(out), "--permutations", "0"]) == 0
    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    assert report["verdict"] == "MORE_DATA"  # 채널 3곳, 대본 36편이면 기준 미달
    assert "판정: MORE_DATA" in (out / "report.md").read_text(encoding="utf-8")
