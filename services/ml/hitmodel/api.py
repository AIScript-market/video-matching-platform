"""ML 서비스 HTTP API. API 서버와 워커만 내부 네트워크로 부른다 (사용자에게 직접 열지 않는다)."""

from __future__ import annotations

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .service import HitService, ScriptNotFound


class TrainRequest(BaseModel):
    forceActivate: bool = False


class RankRequest(BaseModel):
    scriptIds: list[str] = Field(max_length=2000)
    limit: int = Field(default=20, ge=1, le=200)


class SentimentRequest(BaseModel):
    comments: list[str] = Field(max_length=5000)


def create_app(service: HitService, token: str | None = None) -> FastAPI:
    app = FastAPI(title="video-matching-platform ML", version="0.1.0")

    def check_token(x_ml_token: str | None = Header(default=None)) -> None:
        if token and not (x_ml_token and hmac.compare_digest(x_ml_token, token)):
            raise HTTPException(status_code=401, detail="ML 토큰이 맞지 않습니다")

    guarded = [Depends(check_token)]

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "embedder": service.embedder.name}

    @app.get("/status", dependencies=guarded)
    def status() -> dict:
        return service.status()

    @app.post("/embed/{script_id}", dependencies=guarded)
    def embed(script_id: str, force: bool = False) -> dict:
        try:
            return service.embed(script_id, force=force)
        except ScriptNotFound:
            raise HTTPException(status_code=404, detail="대본을 찾을 수 없습니다") from None

    @app.post("/embed-stale", dependencies=guarded)
    def embed_stale(limit: int = 500) -> dict:
        return service.embed_stale(limit)

    @app.post("/train", dependencies=guarded)
    def train(body: TrainRequest | None = None) -> dict:
        return service.train(force_activate=bool(body and body.forceActivate))

    @app.get("/predict/{script_id}", dependencies=guarded)
    def predict(script_id: str) -> dict:
        try:
            return service.predict(script_id)
        except ScriptNotFound:
            raise HTTPException(status_code=404, detail="대본을 찾을 수 없습니다") from None

    @app.post("/rank", dependencies=guarded)
    def rank(body: RankRequest) -> dict:
        return service.rank(body.scriptIds, body.limit)

    @app.post("/sentiment", dependencies=guarded)
    def count_sentiment(body: SentimentRequest) -> dict:
        return service.count_sentiment(body.comments)

    return app
