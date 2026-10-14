"""가능성 검증 명령. services/ml에서 실행한다.

python -m research synthetic research/out/demo-data           # 가짜 데이터로 흐름 확인 (저장소에 안 들어감)
python -m research check research/data                          # 파일럿 폴더 점검
python -m research analyze research/data                        # 분석 → research/out/report.{json,md}
python -m research power                                        # 필요한 대본 수
python -m research blind-packet research/data --out research/out/blind
python -m research blind-score research/out/blind/key.csv 답안1.csv 답안2.csv

# 대리 검증 (docs/hit-features.md): 공공 저작물 소설
python -m research proxy-manifest                               # 위키데이터 → research/data/proxy/manifest.csv
python -m research proxy-fetch                                  # 구텐베르크 미러에서 본문 (2초 간격)
python -m research proxy-analyze                                # → research/out/proxy-report.{json,md}
python -m research proxy-controls                               # 장르·길이 통제 → research/out/proxy-controls.json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

from hitmodel.embedders import embedder_from_name

from . import blind, proxy, proxy_controls, proxy_explore
from .dataset import load_pilot
from .feasibility import analyze as run_analysis
from .feasibility import power_table
from .story_features import STORY_FEATURES, feature_matrix
from .synthetic import write_synthetic_pilot

VERDICT_TEXT = {
    "GO": "가능성 있음 — 블라인드 테스트로 넘어간다",
    "MORE_DATA": "판단 보류 — 데이터를 더 모은다",
    "NO_GO": "쓸 만한 신호 없음 — 모델 방향을 다시 생각한다",
}


def _fmt(v) -> str:
    if v is None:
        return "-"
    return f"{v:.3f}" if isinstance(v, float) else str(v)


def render_markdown(report: dict, load: dict) -> str:
    lines = [
        "# 가능성 검증 결과",
        "",
        f"**판정: {report['verdict']}** — {VERDICT_TEXT[report['verdict']]}",
        "",
        *[f"- {r}" for r in report.get("reasons", [])],
        "",
        "## 데이터",
        f"- 대본 {report['scripts']}편, 채널 {report['channels']}곳, 성공 비율 {_fmt(report.get('hitRate'))}",
        f"- 임베더 `{report['embedder']}`",
        f"- 정답 정의: `{report['labelDefinition']}`",
        f"- 불러오기: {json.dumps(load, ensure_ascii=False)}",
    ]
    lco = report.get("leaveChannelsOut")
    if lco:
        v, s = lco["vectorAndStructure"], lco["structureOnly"]
        ci = v.get("ci", {})
        lines += [
            "",
            "## 채널 빼고 맞히기 (같은 채널 안 비교)",
            "| 모델 | AUC | 95% 구간 | 리프트 |",
            "|---|---|---|---|",
            f"| 벡터 + 구조 | {_fmt(v['auc'])} | {_fmt(ci.get('low'))}~{_fmt(ci.get('high'))} | {_fmt(v['lift'])} |",
            f"| 구조 특징만 | {_fmt(s['auc'])} | {_fmt(s.get('ci', {}).get('low'))}~{_fmt(s.get('ci', {}).get('high'))} | {_fmt(s['lift'])} |",
            "",
            f"- 벡터를 더한 효과(AUC 차이) 95% 구간: {_fmt(ci.get('diffLow'))}~{_fmt(ci.get('diffHigh'))}",
            f"- 순열 검정 p = {_fmt(report.get('permutationP'))} ({report.get('permutations')}회)",
            "- 지표별 AUC: " + ", ".join(f"{k} {_fmt(x)}" for k, x in lco.get("componentAuc", {}).items()),
        ]
    ts = report.get("timeSplit")
    if ts:
        lines += [
            "",
            "## 시간 순서 (앞 80% 학습 → 뒤 20%)",
            f"- AUC {_fmt(ts.get('auc'))} (구조 특징만 {_fmt(ts.get('structureOnlyAuc'))}), 리프트 {_fmt(ts.get('lift'))}",
            f"- 학습 {ts['nTrain']}편 / 검증 {ts['nTest']}편",
        ]
    lines += ["", "판정 기준은 docs/feasibility-study.md에 미리 적어 둔 값이다. 결과를 보고 바꾸지 않는다.", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m research")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("synthetic", help="가짜 파일럿 데이터 만들기")
    p.add_argument("out", type=Path)
    p.add_argument("--signal", type=float, default=1.0)
    p.add_argument("--channels", type=int, default=12)
    p.add_argument("--scripts", type=int, default=30)
    p.add_argument("--seed", type=int, default=0)

    p = sub.add_parser("check", help="파일럿 폴더 점검")
    p.add_argument("data", type=Path)

    p = sub.add_parser("analyze", help="가능성 분석")
    p.add_argument("data", type=Path)
    p.add_argument("--out", type=Path, default=Path("research/out"))
    p.add_argument("--embedder", default="hash-ngram")
    p.add_argument("--permutations", type=int, default=199)

    sub.add_parser("power", help="대본 수에 따른 검출력")

    p = sub.add_parser("blind-packet", help="블라인드 테스트 문제지와 정답지 만들기")
    p.add_argument("data", type=Path)
    p.add_argument("--out", type=Path, default=Path("research/out/blind"))
    p.add_argument("--items", type=int, default=40)
    p.add_argument("--embedder", default="hash-ngram")

    p = sub.add_parser("blind-score", help="블라인드 테스트 채점")
    p.add_argument("key", type=Path)
    p.add_argument("sheets", type=Path, nargs="+")

    proxy_dir = Path("research/data/proxy")
    p = sub.add_parser("proxy-manifest", help="위키데이터에서 공공 저작물 소설 목록과 영상화 횟수 받기")
    p.add_argument("--out", type=Path, default=proxy_dir / "manifest.csv")
    p.add_argument("--all", action="store_true", help="영상화 작품이 없는 작가까지 모두 저장")

    p = sub.add_parser("proxy-fetch", help="구텐베르크 미러에서 본문 받기")
    p.add_argument("--manifest", type=Path, default=proxy_dir / "manifest.csv")
    p.add_argument("--out", type=Path, default=proxy_dir / "texts")
    p.add_argument("--mirror", default=proxy.DEFAULT_MIRROR)
    p.add_argument("--delay", type=float, default=2.0)
    p.add_argument("--limit", type=int, default=0, help="앞에서부터 이만큼만 (0 = 전부)")

    p = sub.add_parser("proxy-analyze", help="같은 작가 안에서 영상화된 작품과 아닌 작품 비교")
    p.add_argument("--manifest", type=Path, default=proxy_dir / "manifest.csv")
    p.add_argument("--texts", type=Path, default=proxy_dir / "texts")
    p.add_argument("--out", type=Path, default=Path("research/out"))
    p.add_argument("--embedder", default="hash-ngram")
    p.add_argument("--permutations", type=int, default=2000)
    p.add_argument("--model-permutations", type=int, default=99)

    p = sub.add_parser("proxy-controls", help="요소의 신호가 장르·글 길이 때문인지 가르기")
    p.add_argument("--manifest", type=Path, default=proxy_dir / "manifest.csv")
    p.add_argument("--texts", type=Path, default=proxy_dir / "texts")
    p.add_argument("--genre-source", choices=["catalog", "wikidata"], default="catalog")
    p.add_argument("--catalog", type=Path, default=proxy_dir / "pg_catalog.csv", help="구텐베르크 카탈로그 (gutenberg.org/cache/epub/feeds/pg_catalog.csv)")
    p.add_argument("--genres", type=Path, default=proxy_dir / "genres.json", help="위키데이터 장르. 없으면 받아 저장")
    p.add_argument("--embedder", default="hash-ngram")
    p.add_argument("--out", type=Path, default=Path("research/out"))
    p.add_argument("--permutations", type=int, default=2000)

    p = sub.add_parser("proxy-explore", help="벡터 흐름 요소와 특징 낱말 탐색 (작가 반반 나눠 확인)")
    p.add_argument("--manifest", type=Path, default=proxy_dir / "manifest.csv")
    p.add_argument("--texts", type=Path, default=proxy_dir / "texts")
    p.add_argument("--catalog", type=Path, default=proxy_dir / "pg_catalog.csv")
    p.add_argument("--out", type=Path, default=Path("research/out"))
    p.add_argument("--embedder", default="hash-ngram")
    p.add_argument("--permutations", type=int, default=2000)

    p = sub.add_parser("proxy-bge", help="bge-m3 장면 벡터로 벡터 흐름 요소와 벡터 모델 다시 보기 (CPU로 수 시간, 이어서 계산 가능)")
    p.add_argument("--manifest", type=Path, default=proxy_dir / "manifest.csv")
    p.add_argument("--texts", type=Path, default=proxy_dir / "texts")
    p.add_argument("--catalog", type=Path, default=proxy_dir / "pg_catalog.csv")
    p.add_argument("--cache", type=Path, default=proxy_dir / "bge-segments.npz")
    p.add_argument("--sample-chars", type=int, default=2000)
    p.add_argument("--out", type=Path, default=Path("research/out"))
    p.add_argument("--permutations", type=int, default=2000)

    args = parser.parse_args(argv)
    if args.cmd == "synthetic":
        write_synthetic_pilot(args.out, channels=args.channels, scripts_per_channel=args.scripts, signal=args.signal, seed=args.seed)
        print(f"가짜 파일럿 데이터를 만들었습니다: {args.out}")
    elif args.cmd == "check":
        scripts, load = load_pilot(args.data)
        print(json.dumps({"scripts": len(scripts), "hits": sum(s.hit for s in scripts), **load.as_dict()}, ensure_ascii=False, indent=2))
    elif args.cmd == "analyze":
        scripts, load = load_pilot(args.data)
        report = run_analysis(scripts, embedder_from_name(args.embedder), permutations=args.permutations)
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "report.json").write_text(json.dumps({**report, "load": load.as_dict()}, ensure_ascii=False, indent=2), encoding="utf-8")
        (args.out / "report.md").write_text(render_markdown(report, load.as_dict()), encoding="utf-8")
        print(f"{report['verdict']}: {args.out / 'report.md'}")
    elif args.cmd == "power":
        print(json.dumps(power_table(), ensure_ascii=False, indent=2))
    elif args.cmd == "blind-packet":
        scripts, _ = load_pilot(args.data)
        print(json.dumps(blind.make_packet(scripts, embedder_from_name(args.embedder), args.out, items=args.items), ensure_ascii=False, indent=2))
    elif args.cmd == "blind-score":
        print(json.dumps(blind.score(args.key, args.sheets), ensure_ascii=False, indent=2))
    elif args.cmd == "proxy-manifest":
        works = proxy.fetch_manifest()
        kept = works if args.all else proxy.informative(works)
        proxy.write_manifest(kept, args.out)
        print(f"작품 {len(works)}편 중 {len(kept)}편 저장 (영상화 {sum(w.adapted for w in kept)}편): {args.out}")
    elif args.cmd == "proxy-fetch":
        works = proxy.read_manifest(args.manifest)
        works = works[: args.limit] if args.limit else works
        print(json.dumps(proxy.fetch_texts(works, args.out, mirror=args.mirror, delay=args.delay), ensure_ascii=False))
    elif args.cmd == "proxy-analyze":
        works, texts = proxy.load_corpus(args.manifest, args.texts)
        report = proxy.analyze_proxy(
            works, texts, embedder_from_name(args.embedder), permutations=args.permutations, model_permutations=args.model_permutations
        )
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "proxy-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        (args.out / "proxy-report.md").write_text(proxy.render_markdown(report), encoding="utf-8")
        print(f"작품 {report['works']}편, 작가 {report['authors']}명: {args.out / 'proxy-report.md'}")
    elif args.cmd == "proxy-controls":
        works, texts = proxy.load_corpus(args.manifest, args.texts)
        tags = None
        if args.genre_source == "catalog":
            by_id = proxy_controls.read_catalog(args.catalog, [w.gutenberg for w in works])
            tag_sets = [by_id.get(w.gutenberg, set()) for w in works]
            genres = [proxy_controls.primary_genre(t) for t in tag_sets]
            tags = proxy_controls.tag_matrix(tag_sets)
        else:
            if not args.genres.exists():
                args.genres.write_text(json.dumps(proxy_controls.fetch_genres([w.work for w in works]), ensure_ascii=False, indent=0), encoding="utf-8")
            raw = json.loads(args.genres.read_text(encoding="utf-8"))
            genres = [proxy_controls.coarse_genre(raw.get(w.work)) for w in works]
        x = feature_matrix(texts, ["en"] * len(texts))
        log_chars = np.array([math.log1p(len(t)) for t in texts])
        names = list(STORY_FEATURES)
        controlled = proxy_controls.controlled_tests(x, names, works, genres, log_chars, permutations=args.permutations, tags=tags)
        report = {
            "genreSource": args.genre_source,
            "works": len(works),
            "genreRecorded": sum(g != proxy_controls.UNKNOWN for g in genres),
            "genreEffect": proxy_controls.genre_effect(works, genres, permutations=args.permutations),
            "controlled": controlled,
            "summary": {n: proxy_controls.summarize(controlled, n) for n in names},
            "models": proxy_controls.model_within_genre(works, texts, x, genres, embedder_from_name(args.embedder), permutations=args.permutations),
        }
        if tags is not None:
            y = np.array([1.0 if w.adapted else 0.0 for w in works])
            tag_names = [name for name, _, _ in proxy_controls.CATALOG_GENRES]
            report["tagEffect"] = proxy.feature_tests(tags, y, np.array([w.author for w in works]), tag_names, permutations=args.permutations)
            report["tagCounts"] = {n: int(tags[:, i].sum()) for i, n in enumerate(tag_names)}
        args.out.mkdir(parents=True, exist_ok=True)
        out_file = args.out / f"proxy-controls-{args.genre_source}.json"
        out_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"작품 {len(works)}편 (장르 있음 {report['genreRecorded']}편, 출처 {args.genre_source}): {out_file}")
    elif args.cmd == "proxy-explore":
        works, texts = proxy.load_corpus(args.manifest, args.texts)
        by_id = proxy_controls.read_catalog(args.catalog, [w.gutenberg for w in works])
        tag_sets = [by_id.get(w.gutenberg, set()) for w in works]
        genres = [proxy_controls.primary_genre(t) for t in tag_sets]
        tags = proxy_controls.tag_matrix(tag_sets)
        log_chars = np.array([math.log1p(len(t)) for t in texts])
        traj = proxy_explore.trajectory_matrix(texts, embedder_from_name(args.embedder))
        trajectory = proxy_controls.controlled_tests(
            traj, proxy_explore.TRAJECTORY_FEATURES, works, genres, log_chars, permutations=args.permutations, tags=tags
        )
        vocab, freq = proxy_explore.word_counts(texts)
        words = proxy_explore.held_out_words(freq, vocab, works, genres, permutations=args.permutations)
        report = {
            "works": len(works),
            "vocab": len(vocab),
            "trajectory": {n: proxy_controls.summarize(trajectory, n) for n in proxy_explore.TRAJECTORY_FEATURES},
            "words": words,
        }
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "proxy-explore.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"작품 {len(works)}편, 낱말 {len(vocab)}개: {args.out / 'proxy-explore.json'}")
    elif args.cmd == "proxy-bge":
        works, texts = proxy.load_corpus(args.manifest, args.texts)
        by_id = proxy_controls.read_catalog(args.catalog, [w.gutenberg for w in works])
        tag_sets = [by_id.get(w.gutenberg, set()) for w in works]
        genres = [proxy_controls.primary_genre(t) for t in tag_sets]
        tags = proxy_controls.tag_matrix(tag_sets)
        log_chars = np.array([math.log1p(len(t)) for t in texts])
        vectors = proxy_explore.embed_segments_cached(texts, [w.work for w in works], args.cache, sample_chars=args.sample_chars)
        traj = proxy_explore.trajectory_from_vectors(vectors)
        trajectory = proxy_controls.controlled_tests(
            traj, proxy_explore.TRAJECTORY_FEATURES, works, genres, log_chars, permutations=args.permutations, tags=tags
        )
        pooled = vectors.mean(axis=1)
        pooled /= np.linalg.norm(pooled, axis=1, keepdims=True)
        feats = feature_matrix(texts, ["en"] * len(texts))
        models = proxy_controls.model_within_genre(works, texts, feats, genres, None, permutations=args.permutations, pooled=pooled, embedder_name="bge-m3")
        report = {
            "embedder": "bge-m3",
            "sampleChars": args.sample_chars,
            "works": len(works),
            "trajectory": {n: proxy_controls.summarize(trajectory, n) for n in proxy_explore.TRAJECTORY_FEATURES},
            "models": models,
        }
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "proxy-bge.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"작품 {len(works)}편: {args.out / 'proxy-bge.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
