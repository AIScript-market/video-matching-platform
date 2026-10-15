import numpy as np

from hitmodel.embedders import HashingNgramEmbedder
from research.proxy import (
    ProxyWork,
    analyze_proxy,
    holm,
    informative,
    load_texts,
    mirror_paths,
    parse_sparql,
    read_manifest,
    render_markdown,
    write_manifest,
)

CALM = "Anna walked to the market with Tom and bought bread. The morning was quiet and ordinary. "
TENSE = "Suddenly a man with a knife attacked Anna, and she screamed in terror and fled from danger. "


def _binding(work, g, author, died, n):
    return {
        "work": {"value": f"http://www.wikidata.org/entity/{work}"},
        "title": {"value": f"Title {work}"},
        "author": {"value": f"http://www.wikidata.org/entity/{author}"},
        "authorName": {"value": f"Author {author}"},
        "diedYear": {"value": str(died)},
        "gutenberg": {"value": g},
        "adaptations": {"value": str(n)},
    }


def test_parse_sparql_and_keep_only_authors_with_both_kinds(tmp_path):
    payload = {
        "results": {
            "bindings": [
                _binding("Q1", "1342", "A1", 1817, 12),
                _binding("Q2", "158", "A1", 1817, 0),
                _binding("Q3", "84", "A2", 1851, 5),  # 작가 A2는 영상화된 작품만 있다
                _binding("Q4", "x9", "A3", 1900, 0),  # 번호가 이상하면 뺀다
            ]
        }
    }
    works = parse_sparql(payload)
    assert [w.work for w in works] == ["Q1", "Q2", "Q3"] and works[0].file == "pg1342.txt"
    assert {w.work for w in informative(works)} == {"Q1", "Q2"}
    write_manifest(works, tmp_path / "m.csv")
    assert read_manifest(tmp_path / "m.csv") == works


def test_mirror_paths_and_holm():
    assert mirror_paths("1342")[0] == "1/3/4/1342/1342-0.txt"
    assert mirror_paths("5")[1] == "0/5/5.txt"
    assert holm([0.01, 0.04, 0.03]) == [0.03, 0.06, 0.06]


def test_planted_feature_is_found_within_authors(tmp_path):
    rng = np.random.default_rng(0)
    works = []
    for a in range(14):
        for k in range(6):
            adapted = k < 2
            share = 0.35 if adapted else 0.08  # 영상화된 작품에 긴장 문장이 더 많다
            body = "".join(TENSE if rng.random() < share else CALM for _ in range(300))
            g = f"{a}{k}9"
            wrapped = f"*** START OF THE PROJECT GUTENBERG EBOOK X ***\n{body}\n*** END OF THE PROJECT GUTENBERG EBOOK X ***"
            (tmp_path / f"pg{g}.txt").write_text(wrapped, encoding="utf-8")
            works.append(ProxyWork(f"Q{a}{k}", f"T{a}{k}", f"A{a}", f"Author {a}", 1900, g, 3 if adapted else 0, f"pg{g}.txt"))
    kept, texts = load_texts(works, tmp_path)
    assert len(kept) == 84 and not texts[0].startswith("***")

    report = analyze_proxy(kept, texts, HashingNgramEmbedder(dims=128), permutations=999, model_permutations=9)
    by_name = {r["feature"]: r for r in report["features"]}
    assert by_name["tension_mean"]["signal"] == "신호 있음" and by_name["tension_mean"]["auc"] > 0.9
    # 가짜 글에 물음표가 없으므로 질문 요소에는 차이가 없어야 한다 (문장 길이는 긴장 문장과 같이 바뀌어서 여기서는 못 쓴다)
    assert by_name["first_question"]["signal"] == "없음"
    assert report["leaveAuthorsOut"]["storyFeatures"]["auc"] > 0.8
    assert "tension_mean" in render_markdown(report)
