from fastapi.testclient import TestClient

from hitmodel.api import create_app

from .conftest import fill_store, make_script


def test_embed_is_skipped_when_text_unchanged(service, store):
    store.add_script("a", "S#1. 집 (밤)\n정수: 안녕")
    assert service.embed("a")["status"] == "EMBEDDED"
    assert service.embed("a")["status"] == "UNCHANGED"
    store.scripts["a"].full_text += "\n수아: 잘 가"
    assert service.embed("a")["status"] == "EMBEDDED"
    store.add_script("empty", "   ")
    assert service.embed("empty")["status"] == "EMPTY"
    assert service.embed_stale()["embedded"] == 0


def test_not_ready_then_neighbors_then_model(service, store):
    import random

    store.add_script("new", make_script("hit", random.Random(1)), consent=False)
    first = service.predict("new")
    assert first["mode"] == "NOT_READY" and first["trainingPairs"] == 0 and first["requiredPairs"] == 40

    kinds = fill_store(store, 10)
    mid = service.predict("new")
    assert mid["mode"] == "NEIGHBORS" and mid["trainingPairs"] == 10
    # 가장 가까운 정답 있는 대본은 같은 부류(긴장감 있는 대본)다
    assert kinds[mid["neighbors"][0]["scriptId"]] == "hit"
    assert service.train()["status"] == "NOT_ENOUGH_DATA"

    store.outcome_rows.clear()
    store.scripts = {k: v for k, v in store.scripts.items() if k == "new"}
    kinds = fill_store(store, 60)
    result = service.train()
    assert result["status"] == "TRAINED" and result["trainingPairs"] == 60
    assert result["metrics"]["auc"] >= 0.8
    assert result["activated"] is True
    assert store.active_model().version == result["version"]

    pred = service.predict("new")
    assert pred["mode"] == "MODEL" and pred["modelVersion"] == result["version"]
    assert pred["low"] <= pred["probability"] <= pred["high"]

    store.add_script("flat-new", make_script("flat", random.Random(2)), consent=False)
    ranked = service.rank(["flat-new", "new", "missing"])
    assert [i["scriptId"] for i in ranked["items"]] == ["new", "flat-new"]


def test_scripts_without_consent_are_not_training_data(service, store):
    fill_store(store, 10)
    for sid in list(store.consent):
        store.consent[sid] = False
    assert service.status()["trainingPairs"] == 0


def test_http_api_requires_token(store, service):
    client = TestClient(create_app(service, token="secret"))
    assert client.get("/health").status_code == 200
    assert client.get("/status").status_code == 401
    headers = {"x-ml-token": "secret"}
    assert client.get("/status", headers=headers).json()["requiredPairs"] == 40
    assert client.post("/embed/none", headers=headers).status_code == 404
    store.add_script("a", "S#1. 집 (밤)\n정수: 안녕")
    assert client.post("/embed/a", headers=headers).json()["status"] == "EMBEDDED"
    assert client.get("/predict/a", headers=headers).json()["mode"] == "NOT_READY"
    body = client.post("/sentiment", headers=headers, json={"comments": ["최고예요", "지루해요"]}).json()
    assert body["positive"] == 1 and body["negative"] == 1
