"""PostgreSQL 저장소. 테이블은 apps/api/prisma/schema.prisma가 만든다 (이 서비스는 마이그레이션을 하지 않는다)."""

from __future__ import annotations

import json
import uuid

import numpy as np
import psycopg
from psycopg.rows import dict_row

from .labels import Outcome
from .store import ModelVersion, ScriptText, StoredEmbedding


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class PgStore:
    def __init__(self, database_url: str):
        # Prisma 연결 문자열의 ?schema= 같은 옵션은 psycopg가 모르므로 뗀다
        self.dsn = database_url.split("?")[0]

    def _conn(self) -> psycopg.Connection:
        return psycopg.connect(self.dsn, row_factory=dict_row)

    def script_text(self, script_id: str) -> ScriptText | None:
        with self._conn() as c:
            row = c.execute('SELECT id, "fullText", genre FROM "Script" WHERE id = %s', (script_id,)).fetchone()
        return ScriptText(row["id"], row["fullText"], row["genre"]) if row else None

    def stale_script_ids(self, embedder: str, limit: int) -> list[str]:
        sql = """
            SELECT s.id FROM "Script" s
            LEFT JOIN "ScriptEmbedding" e ON e."scriptId" = s.id AND e.embedder = %s
            WHERE btrim(s."fullText") <> ''
              AND (e.id IS NULL OR e."textHash" <> encode(sha256(convert_to(s."fullText", 'UTF8')), 'hex'))
            ORDER BY s."createdAt" LIMIT %s
        """
        with self._conn() as c:
            return [r["id"] for r in c.execute(sql, (embedder, limit)).fetchall()]

    @staticmethod
    def _row_to_embedding(r: dict) -> StoredEmbedding:
        dims = r["dims"]
        scenes = np.array(r["sceneVectors"] or [], dtype=np.float64)
        return StoredEmbedding(
            script_id=r["scriptId"],
            embedder=r["embedder"],
            dims=dims,
            scene_count=r["sceneCount"],
            pooled=np.array(r["pooled"], dtype=np.float64),
            scene_vectors=scenes.reshape(-1, dims),
            features=r["features"],
            text_hash=r["textHash"],
        )

    def get_embedding(self, script_id: str, embedder: str) -> StoredEmbedding | None:
        with self._conn() as c:
            r = c.execute('SELECT * FROM "ScriptEmbedding" WHERE "scriptId" = %s AND embedder = %s', (script_id, embedder)).fetchone()
        return self._row_to_embedding(r) if r else None

    def save_embedding(self, e: StoredEmbedding) -> None:
        sql = """
            INSERT INTO "ScriptEmbedding"
              (id, "scriptId", embedder, dims, "sceneCount", pooled, "sceneVectors", features, "textHash", "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
            ON CONFLICT ("scriptId", embedder) DO UPDATE SET
              dims = EXCLUDED.dims, "sceneCount" = EXCLUDED."sceneCount", pooled = EXCLUDED.pooled,
              "sceneVectors" = EXCLUDED."sceneVectors", features = EXCLUDED.features,
              "textHash" = EXCLUDED."textHash", "updatedAt" = now()
        """
        with self._conn() as c:
            c.execute(
                sql,
                (
                    _new_id("emb"),
                    e.script_id,
                    e.embedder,
                    e.dims,
                    e.scene_count,
                    e.pooled.tolist(),
                    e.scene_vectors.reshape(-1).tolist(),
                    json.dumps(e.features),
                    e.text_hash,
                ),
            )

    def embeddings(self, embedder: str, script_ids: list[str] | None = None) -> dict[str, StoredEmbedding]:
        # 목록·학습에는 장면 벡터가 필요 없으므로 읽지 않는다
        sql = 'SELECT "scriptId", embedder, dims, "sceneCount", pooled, NULL AS "sceneVectors", features, "textHash" FROM "ScriptEmbedding" WHERE embedder = %s'
        params: tuple = (embedder,)
        if script_ids is not None:
            sql += ' AND "scriptId" = ANY(%s)'
            params = (embedder, script_ids)
        with self._conn() as c:
            rows = c.execute(sql, params).fetchall()
        return {r["scriptId"]: self._row_to_embedding(r) for r in rows}

    def count_embeddings(self, embedder: str) -> int:
        with self._conn() as c:
            return c.execute('SELECT count(*) AS n FROM "ScriptEmbedding" WHERE embedder = %s', (embedder,)).fetchone()["n"]

    def outcomes(self) -> list[Outcome]:
        sql = """
            SELECT s.id AS script_id, s.genre, w.id AS work_id, w."publishedAt", p."capturedAt", p.views, p.likes,
                   p."positiveComments", p."channelSubscribers"
            FROM "Script" s
            JOIN "User" u ON u.id = s."authorId" AND u.status = 'ACTIVE'
            JOIN "Negotiation" n ON n."scriptId" = s.id
            JOIN "Deal" d ON d."negotiationId" = n.id
            JOIN "Project" pr ON pr."dealId" = d.id
            JOIN "Work" w ON w."projectId" = pr.id AND w."publishedAt" IS NOT NULL
            JOIN "WorkPerformanceSnapshot" p ON p."workId" = w.id
            WHERE s."trainingConsent" = true
        """
        with self._conn() as c:
            rows = c.execute(sql).fetchall()
        return [
            Outcome(
                script_id=r["script_id"],
                genre=r["genre"],
                work_id=r["work_id"],
                published_at=r["publishedAt"],
                captured_at=r["capturedAt"],
                views=r["views"],
                likes=r["likes"],
                positive_comments=r["positiveComments"],
                channel_subscribers=r["channelSubscribers"],
            )
            for r in rows
        ]

    def save_model_version(self, m: ModelVersion) -> None:
        with self._conn() as c, c.transaction():
            if m.active:
                c.execute('UPDATE "HitModelVersion" SET active = false WHERE active')
            c.execute(
                """INSERT INTO "HitModelVersion"
                   (id, version, embedder, algorithm, "labelDefinition", "trainingPairs", metrics, "artifactPath", active, "trainedAt")
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    _new_id("hmv"),
                    m.version,
                    m.embedder,
                    m.algorithm,
                    m.label_definition,
                    m.training_pairs,
                    json.dumps(m.metrics),
                    m.artifact_path,
                    m.active,
                    m.trained_at,
                ),
            )

    def active_model(self) -> ModelVersion | None:
        with self._conn() as c:
            r = c.execute('SELECT * FROM "HitModelVersion" WHERE active ORDER BY "trainedAt" DESC LIMIT 1').fetchone()
        if not r:
            return None
        return ModelVersion(
            version=r["version"],
            embedder=r["embedder"],
            algorithm=r["algorithm"],
            label_definition=r["labelDefinition"],
            training_pairs=r["trainingPairs"],
            metrics=r["metrics"],
            artifact_path=r["artifactPath"],
            active=r["active"],
            trained_at=r["trainedAt"],
        )
