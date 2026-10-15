"use client";

import { useCallback, useEffect, useState } from "react";
import { ReadinessMeter } from "@/components/hit-insight";
import { ErrorText, RequireAuth } from "@/components/ui";
import { api, dateTime, unwrap, type Schemas } from "@/lib/api";

type Status = Schemas["MlStatusDto"];
type ModelVersion = Schemas["HitModelVersionDto"];

export default function AdminMlPage() {
  return (
    <RequireAuth role="ADMIN">
      <AdminMl />
    </RequireAuth>
  );
}

const metric = (m: Record<string, unknown>, key: string) => {
  const v = m[key];
  return typeof v === "number" ? v.toFixed(3) : "-";
};

function AdminMl() {
  const [status, setStatus] = useState<Status | null>(null);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [forceActivate, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([unwrap(api.GET("/admin/ml/status")), unwrap(api.GET("/admin/ml/models"))])
        .then(([s, m]) => {
          setStatus(s);
          setModels(m);
          setError(null);
        })
        .catch((err: Error) => setError(err.message)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const embedStale = () =>
    run(async () => {
      const r = await unwrap(api.POST("/admin/ml/embed-stale"));
      return `${r.embedded}편을 벡터화했습니다 (${r.embedder}).`;
    });

  const train = () =>
    run(async () => {
      const r = await unwrap(api.POST("/admin/ml/train", { body: { forceActivate } }));
      if (r.status === "NOT_ENOUGH_DATA") return `학습 데이터가 부족합니다 (${r.trainingPairs}/${r.requiredPairs}편). ${r.note ?? ""}`;
      return r.activated
        ? `${r.version}을 학습하고 활성화했습니다.`
        : `${r.version}을 학습했지만 시간 순서 검증에서 장르 평균보다 낫지 않아 활성화하지 않았습니다.`;
    });

  return (
    <div className="stack">
      <h1>흥행 판단 모델</h1>
      <p className="muted small">
        대본 벡터(장면 단위)와 작품 성과(채널 크기 보정한 조회수·좋아요·긍정 댓글)로 학습하는 우리 모델입니다. 학습에 동의한 대본만 쓰고, 원문은 내보내지
        않습니다. 학습한 모델은 시간 순서 검증에서 장르 평균 이상일 때만 활성화됩니다.
      </p>
      <ErrorText error={error} />
      {message && <p className="notice small">{message}</p>}
      {status && (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>상태</h2>
          <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", margin: 0 }}>
            <dt className="muted">임베더</dt>
            <dd style={{ margin: 0 }}>{status.embedder}</dd>
            <dt className="muted">벡터화한 대본</dt>
            <dd style={{ margin: 0 }}>{status.embeddedScripts}편</dd>
            <dt className="muted">댓글 감성 분류</dt>
            <dd style={{ margin: 0 }}>{status.sentiment}</dd>
            <dt className="muted">활성 모델</dt>
            <dd style={{ margin: 0 }}>{status.activeModel ? `${status.activeModel.version} (${dateTime(status.activeModel.trainedAt)})` : "없음"}</dd>
          </dl>
          <ReadinessMeter trainingPairs={status.trainingPairs} requiredPairs={status.requiredPairs} />
          <div className="row">
            <button className="secondary" onClick={embedStale} disabled={busy}>
              바뀐 대본 벡터화
            </button>
            <button onClick={train} disabled={busy}>
              {busy ? "처리 중…" : "학습"}
            </button>
            <label className="check small">
              <input type="checkbox" checked={forceActivate} onChange={(e) => setForce(e.target.checked)} />
              <span>장르 평균보다 못해도 활성화</span>
            </label>
          </div>
        </section>
      )}
      <section className="card stack">
        <h2 style={{ margin: 0 }}>학습 기록</h2>
        {models.length === 0 ? (
          <p className="muted small">아직 학습한 모델이 없습니다.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>버전</th>
                  <th>학습 시각</th>
                  <th className="num">대본</th>
                  <th className="num">AUC</th>
                  <th className="num">장르 평균 AUC</th>
                  <th className="num">상위 20% 적중</th>
                  <th className="num">리프트</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m.id}>
                    <td title={`${m.algorithm} · ${m.embedder}`}>{m.version}</td>
                    <td>{dateTime(m.trainedAt)}</td>
                    <td className="num">{m.trainingPairs}</td>
                    <td className="num">{metric(m.metrics, "auc")}</td>
                    <td className="num">{metric(m.metrics, "genreBaselineAuc")}</td>
                    <td className="num">{metric(m.metrics, "precisionAtTop20")}</td>
                    <td className="num">{metric(m.metrics, "lift")}</td>
                    <td>{m.active ? <span className="badge ok">활성</span> : <span className="badge plain">보관</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          검증: 공개 시점 순으로 앞 80%로 학습하고 뒤 20%를 맞힙니다. 리프트는 &ldquo;모델이 고른 상위 20%의 성공률 ÷ 전체 성공률&rdquo;입니다.
        </p>
      </section>
    </div>
  );
}
