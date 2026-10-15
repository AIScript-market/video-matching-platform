"""블라인드 테스트: 결과를 이미 아는 대본으로 "모델 vs PD 패널 vs 구조 특징 기준선"을 비교한다.

1. make_packet: 시간상 가장 최근 대본 중 일부를 문제로 고른다. 모델은 그보다 앞선 대본으로만 학습하고,
   **문제지를 만드는 순간 모델 점수를 정답지(key.csv)에 적어 둔다** (나중에 결과를 보고 고칠 수 없게).
2. PD들은 packet/만 받는다. 대본마다 1~5점, 그리고 "가장 잘됐을 것" k편을 고른다.
3. score: 정답지와 PD 답안을 맞춰 본다.

정답지(key.csv)는 진행자만 갖는다. 문제지에는 영상 ID·채널·제목·성과를 넣지 않는다.
대본 본문에 채널 이름이 들어 있을 수 있으니 진행자가 문제지를 보내기 전에 한 번 훑는다.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

import numpy as np

from hitmodel.embedders import Embedder
from hitmodel.model import auc

from .dataset import PilotScript
from .feasibility import featurize, predict_structure, predict_vector

HEADER_LINES = re.compile(r"^\s*(제목|작가|채널|title|channel)\s*[:：]", re.I)
SHEET_COLUMNS = ["code", "rating", "pick", "note"]


def _clean(text: str) -> str:
    return "\n".join(line for line in text.splitlines() if not HEADER_LINES.match(line)).strip() + "\n"


def make_packet(scripts: list[PilotScript], embedder: Embedder, out: Path, *, items: int = 40, test_share: float = 0.2, seed: int = 0) -> dict:
    n = len(scripts)
    cut = int(round(n * (1 - test_share)))
    y = np.array([1.0 if s.hit else 0.0 for s in scripts])
    if cut < 20 or y[:cut].min() == y[:cut].max():
        raise ValueError("문제지를 만들기에 학습할 대본이 부족합니다")
    rng = np.random.default_rng(seed)
    test = np.arange(cut, n)
    # 문제의 성공 비율을 전체와 같게 (약 20%) 맞춰 뽑는다
    hits, misses = test[y[test] == 1], test[y[test] == 0]
    k_hits = min(len(hits), max(1, round(items * float(y.mean()))))
    chosen = np.concatenate([rng.choice(hits, k_hits, replace=False), rng.choice(misses, min(len(misses), items - k_hits), replace=False)])
    rng.shuffle(chosen)

    pooled, feats = featurize(scripts, embedder)
    train = np.arange(cut)
    model = predict_vector(pooled, feats, y, train, chosen)
    struct = predict_structure(feats, y, train, chosen)

    packet = out / "packet"
    (packet / "scripts").mkdir(parents=True, exist_ok=True)
    pick_k = max(1, round(len(chosen) * 0.2))
    key_rows = []
    for i, idx in enumerate(chosen):
        code = f"B{i + 1:02d}"
        s = scripts[idx]
        (packet / "scripts" / f"{code}.txt").write_text(_clean(s.text), encoding="utf-8")
        key_rows.append([code, s.uid, s.channel, int(s.hit), f"{model[i]:.6f}", f"{struct[i]:.6f}"])
    with (packet / "answer-sheet.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(SHEET_COLUMNS)
        w.writerows([[f"B{i + 1:02d}", "", "", ""] for i in range(len(chosen))])
    (packet / "README.txt").write_text(
        f"""블라인드 대본 평가

scripts/ 안의 대본 {len(chosen)}편은 모두 실제로 영상이 된 대본입니다. 같은 채널의 다른 영상과 비교해 성과가 좋았던 것을 맞혀 주세요.

answer-sheet.csv에 적어 주세요.
- rating: 1~5 (5 = 같은 채널의 다른 영상보다 훨씬 잘됐을 것)
- pick: 가장 잘됐을 것 같은 {pick_k}편에만 1, 나머지는 비워 두기
- note: (선택) 그렇게 본 이유

대본을 다른 사람과 나누거나 검색하지 말아 주세요. 혼자, 대본만 보고 판단해 주세요.
""",
        encoding="utf-8",
    )
    with (out / "key.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "uid", "channel", "hit", "model", "structure"])
        w.writerows(key_rows)
    return {"items": len(chosen), "hits": int(y[chosen].sum()), "pick": pick_k, "trainedOn": int(cut), "packet": str(packet), "key": str(out / "key.csv")}


def _read_key(path: Path) -> dict[str, dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return {r["code"]: r for r in csv.DictReader(f)}


def _read_sheet(path: Path) -> dict[str, tuple[float | None, bool]]:
    out = {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rating = (r.get("rating") or "").strip()
            out[r["code"].strip()] = (float(rating) if rating else None, (r.get("pick") or "").strip() in {"1", "y", "Y", "o", "O", "v", "V"})
    return out


def _precision_at(scores: np.ndarray, y: np.ndarray, k: int) -> float:
    return float(y[np.argsort(-scores, kind="stable")[:k]].mean())


def score(key_path: Path, sheet_paths: list[Path], *, bootstrap: int = 2000, seed: int = 0) -> dict:
    key = _read_key(key_path)
    codes = sorted(key)
    y = np.array([float(key[c]["hit"]) for c in codes])
    k = max(1, round(len(codes) * 0.2))
    model = np.array([float(key[c]["model"]) for c in codes])
    struct = np.array([float(key[c]["structure"]) for c in codes])

    raters, ratings, picks = [], [], []
    for p in sheet_paths:
        sheet = _read_sheet(p)
        r = np.array([sheet.get(c, (None, False))[0] for c in codes], dtype=float)
        if np.isnan(r).all():
            continue
        r = np.where(np.isnan(r), np.nanmean(r), r)  # 빈 칸은 그 사람의 평균 점수로
        pk = np.array([sheet.get(c, (None, False))[1] for c in codes], dtype=float)
        ratings.append(r)
        picks.append(pk)
        hit_rate = float(y[pk == 1].mean()) if pk.sum() else None
        raters.append({"sheet": p.name, "auc": auc(r, y), "pickHitRate": hit_rate, "picked": int(pk.sum())})

    out: dict = {
        "items": len(codes),
        "hits": int(y.sum()),
        "baseRate": float(y.mean()),
        "k": k,
        "model": {"auc": auc(model, y), "precisionAtK": _precision_at(model, y, k)},
        "structure": {"auc": auc(struct, y), "precisionAtK": _precision_at(struct, y, k)},
        "raters": raters,
    }
    if ratings:
        # 패널 점수 = 평균 점수, 같은 점수는 고른 사람 수로 가른다
        panel = np.mean(ratings, axis=0) + 1e-3 * np.mean(picks, axis=0)
        out["panel"] = {"auc": auc(panel, y), "precisionAtK": _precision_at(panel, y, k), "raters": len(ratings)}
        rng = np.random.default_rng(seed)
        diffs = []
        for _ in range(bootstrap):
            idx = rng.integers(0, len(y), len(y))
            a, b = auc(model[idx], y[idx]), auc(panel[idx], y[idx])
            if a is not None and b is not None:
                diffs.append(a - b)
        out["modelMinusPanelAuc"] = {
            "point": out["model"]["auc"] - out["panel"]["auc"],
            "low": float(np.quantile(diffs, 0.025)),
            "high": float(np.quantile(diffs, 0.975)),
        }
    return out
