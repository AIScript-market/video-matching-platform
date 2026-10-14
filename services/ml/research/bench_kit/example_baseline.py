"""예제: 벡터 + "묶음 안 릿지"로 개발용 교차검증 점수와 시험용 예측을 만든다.

  python example_baseline.py movies                    # bge-m3 벡터
  python example_baseline.py movies --vectors e5l      # embed.py로 만든 e5l_dev.npy / e5l_test.npy

출력: <과제>_<벡터>_dev.csv (fold 교차검증 점수), <과제>_<벡터>_test.csv (개발용 전부로 학습한 점수), 개발용 채점 결과.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from bench_eval import read_rows, score_file
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler


def center(x: np.ndarray, groups: np.ndarray) -> np.ndarray:
    out = np.array(x, dtype=np.float64, copy=True)
    for g in np.unique(groups):
        m = groups == g
        out[m] -= out[m].mean(axis=0)
    return out


def fit_predict(x_tr, s_tr, g_tr, x_te):
    """묶음 안에서 중심화한 벡터로 묶음 안에서 중심화한 점수를 맞힌다 (같은 묶음 안 비교로 학습)"""
    xc = center(x_tr, g_tr)
    scaler = StandardScaler().fit(xc)
    model = RidgeCV(alphas=np.logspace(-1, 5, 13)).fit(scaler.transform(xc), center(s_tr, g_tr))
    return model.predict(scaler.transform(x_te))


def write(path: Path, ids: list[str], scores: np.ndarray) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "score"])
        w.writerows(zip(ids, scores.tolist(), strict=True))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("task", choices=["movies", "tv", "novels"])
    ap.add_argument("--vectors", default="bge-m3")
    args = ap.parse_args()
    d = Path(__file__).parent / args.task
    dev, test = read_rows(d / "dev.jsonl"), read_rows(d / "test.jsonl")
    x_dev = np.load(d / f"{args.vectors}_dev.npy").astype(np.float64)
    x_test = np.load(d / f"{args.vectors}_test.npy").astype(np.float64)
    s = np.array([r["score"] for r in dev], dtype=float)
    g = np.array([r["group"] for r in dev])
    folds = np.array([r["fold"] for r in dev])

    oof = np.full(len(dev), np.nan)
    for k in range(5):
        te = folds == k
        oof[te] = fit_predict(x_dev[~te], s[~te], g[~te], x_dev[te])
    name = f"{args.task}_{args.vectors}"
    write(Path(f"{name}_dev.csv"), [r["id"] for r in dev], oof)
    write(Path(f"{name}_test.csv"), [r["id"] for r in test], fit_predict(x_dev, s, g, x_test))
    print(json.dumps({"dev": score_file(dev, {r["id"]: v for r, v in zip(dev, oof, strict=True)})}, ensure_ascii=False, indent=2))
    print(f"시험용 예측: {name}_test.csv (보내기 전에 개발용 점수를 같이 적어 주세요)")


if __name__ == "__main__":
    main()
