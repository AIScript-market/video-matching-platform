from research.proxy import ProxyWork
from research.proxy_success import success_labels


def _work(q):
    return ProxyWork(q, "t", "A", "a", 1900, "1", 1, "")


def test_success_score_adjusts_for_era_and_counts_remakes():
    works = [_work(f"Q{i}") for i in range(6)]
    ads = []
    for i in range(6):
        # 옛날 영화는 언어판이 원래 적다: 연대 효과를 빼면 Q0(1920년대인데 언어판이 많은 작품)이 돋보여야 한다
        year = 1925 if i < 3 else 2005
        links = (40 if i == 0 else 5) if i < 3 else 30
        ads.append({"work": f"Q{i}", "ad": f"F{i}", "kind": "영화", "year": year, "sitelinks": links, "enwiki": f"T{i}"})
    ads += [{"work": "Q5", "ad": f"R{k}", "kind": "영화", "year": 2005, "sitelinks": 30, "enwiki": None} for k in range(4)]  # Q5는 다섯 번 만들어졌다
    labels = success_labels(works, ads, {f"T{i}": 1000 for i in range(6)})
    assert labels["Q0"]["recognitionZ"] > labels["Q1"]["recognitionZ"]
    assert labels["Q5"]["adaptations"] == 5 and labels["Q5"]["remakeZ"] == max(v["remakeZ"] for v in labels.values())
    assert sum(v["hit"] for v in labels.values()) == 2  # 6편 중 상위 1/3
    assert success_labels(works, [], {}) == {}
