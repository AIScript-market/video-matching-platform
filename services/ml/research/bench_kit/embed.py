"""예제: 다른 임베딩 모델로 키트의 글을 벡터로 바꾼다 (sentence-transformers).

  python embed.py movies intfloat/multilingual-e5-large-instruct --tag e5l --prefix "passage: "
  python embed.py novels Qwen/Qwen3-Embedding-0.6B --tag qwen06 --segments

출력: <과제>/<tag>_dev.npy, <과제>/<tag>_test.npy (float16, 정규화, jsonl 행 순서). 그다음 example_baseline.py --vectors <tag>.
--segments: 소설처럼 "[…]"로 이은 글을 구간별로 벡터화해 평균 낸다 (우리 bge-m3 방식과 같음).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from bench_eval import read_rows

SEPARATOR = "\n\n[…]\n\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("task", choices=["movies", "tv", "novels"])
    ap.add_argument("model")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--prefix", default="", help='모델이 요구하는 앞말 (e5는 "passage: ")')
    ap.add_argument("--max-chars", type=int, default=3000, help="글마다 앞에서 몇 자까지 넣을지 (bge-m3는 3,000자)")
    ap.add_argument("--max-seq-length", type=int, default=512)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--segments", action="store_true")
    ap.add_argument("--device", default=None, help="cuda / cpu / mps (기본: 자동)")
    args = ap.parse_args()

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(args.model, device=args.device, trust_remote_code=True)
    model.max_seq_length = args.max_seq_length
    d = Path(__file__).parent / args.task
    for split in ("dev", "test"):
        rows = read_rows(d / f"{split}.jsonl")
        if args.segments:
            parts = [r["text"].split(SEPARATOR) for r in rows]
            flat = [args.prefix + p[: args.max_chars] for ps in parts for p in ps]
            v = model.encode(flat, batch_size=args.batch_size, normalize_embeddings=True, show_progress_bar=True)
            out, i = [], 0
            for ps in parts:
                m = v[i : i + len(ps)].mean(axis=0)
                out.append(m / (np.linalg.norm(m) or 1.0))
                i += len(ps)
            v = np.stack(out)
        else:
            texts = [args.prefix + r["text"][: args.max_chars] for r in rows]
            v = model.encode(texts, batch_size=args.batch_size, normalize_embeddings=True, show_progress_bar=True)
        np.save(d / f"{args.tag}_{split}.npy", np.asarray(v, dtype=np.float16))
        print(f"{split}: {v.shape} → {d / f'{args.tag}_{split}.npy'}")


if __name__ == "__main__":
    main()
