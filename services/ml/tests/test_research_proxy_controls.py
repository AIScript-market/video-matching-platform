import numpy as np

from research.proxy import ProxyWork
from research.proxy_controls import UNKNOWN, catalog_tags, coarse_genre, controlled_tests, primary_genre, residualize, tag_matrix


def test_coarse_genre_priority_and_unknown():
    assert coarse_genre(["fantasy", "children's fiction"]) == "아동"  # 오즈 시리즈처럼 아동 판타지는 아동으로
    assert coarse_genre(["Detective fiction", "adventure fiction"]) == "범죄·추리"
    assert coarse_genre(["essay"]) == "기타"
    assert coarse_genre(None) == coarse_genre([]) == UNKNOWN


def test_residualize_removes_author_and_control_effects():
    rng = np.random.default_rng(0)
    groups = np.array([f"a{i % 5}" for i in range(100)])
    control = rng.normal(size=(100, 1))
    x = (3 * control[:, 0] + np.array([int(g[1:]) for g in groups]) + 0.01 * rng.normal(size=100)).reshape(-1, 1)
    r = residualize(x, groups, control)
    assert np.abs(r).max() < 0.1


def test_genre_confound_disappears_within_genre():
    # 장르가 긴장도와 영상화를 함께 정하고, 같은 장르 안에서는 긴장도가 영상화와 무관한 가짜 자료
    rng = np.random.default_rng(1)
    works, genres, tension = [], [], []
    for a in range(30):
        for k in range(8):
            genre = "범죄·추리" if k % 2 else "사회·심리·성장"
            adapted = rng.random() < (0.6 if genre == "범죄·추리" else 0.15)
            works.append(ProxyWork(f"Q{a}-{k}", "t", f"A{a}", "a", 1900, "1", int(adapted), ""))
            genres.append(genre)
            tension.append((2.0 if genre == "범죄·추리" else 0.0) + rng.normal())
    x = np.array(tension).reshape(-1, 1)
    out = controlled_tests(x, ["tension"], works, genres, np.zeros(len(works)), permutations=499)
    assert out["baseline"][0]["p"] <= 0.01 and out["baseline"][0]["auc"] > 0.6
    assert out["sameAuthorSameGenre"]["tests"][0]["p"] > 0.05
    assert out["genreAndLengthAdjusted"][0]["p"] > 0.05


def test_catalog_tags_skip_outcome_shelves():
    shelves = "Movie Books; Best Books Ever Listings; Category: Adventure; Bestsellers, American, 1895-1923"
    subjects = "Detective and mystery stories; Holmes, Sherlock (Fictitious character) -- Fiction"
    tags = catalog_tags(shelves, subjects)
    assert tags == {"범죄·추리", "모험"}  # "Movie Books"(영상화된 책)나 베스트셀러 목록은 장르로 쓰지 않는다
    assert primary_genre(tags) == "범죄·추리"
    assert catalog_tags("Movie Books", "") == set() and primary_genre(set()) == UNKNOWN
    assert tag_matrix([tags, set()]).sum(axis=1).tolist() == [2.0, 0.0]
