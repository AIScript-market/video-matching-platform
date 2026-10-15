"""가능성 검증 명령. services/ml에서 실행한다.

    python -m research synthetic research/out/demo-data           # 가짜 데이터로 흐름 확인 (저장소에 안 들어감)
    python -m research check research/data                          # 파일럿 폴더 점검
    python -m research analyze research/data                        # 분석 → research/out/report.{json,md}
    python -m research power                                        # 필요한 대본 수
    python -m research blind-packet research/data --out research/out/blind
    python -m research blind-score research/out/blind/key.csv 답안1.csv 답안2.csv
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from hitmodel.embedders import embedder_from_name

from . import blind
from .dataset import load_pilot
from .feasibility import analyze as run_analysis
from .feasibility import power_table
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
