import { Suspense } from "react";

const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

async function fetchHealth(): Promise<{ status: string; db: string } | null> {
  try {
    const res = await fetch(`${apiUrl}/health`);
    return await res.json();
  } catch {
    return null;
  }
}

async function ApiStatus() {
  const health = await fetchHealth();
  if (!health) {
    return <p>API에 연결할 수 없습니다 ({apiUrl})</p>;
  }
  return (
    <p>
      API: {health.status} · DB: {health.db}
    </p>
  );
}

export default function Home() {
  return (
    <main style={{ padding: 32, display: "grid", gap: 12 }}>
      <h1>Video Matching Platform</h1>
      <p>대본 작가와 영상 제작자를 연결합니다.</p>
      <Suspense fallback={<p>API 상태 확인 중…</p>}>
        <ApiStatus />
      </Suspense>
    </main>
  );
}
