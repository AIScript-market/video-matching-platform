"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap, type ScriptSummary } from "@/lib/api";

const GENRES = ["전체", "미스터리", "드라마", "SF", "스릴러", "코미디", "로맨스", "공포", "액션"];

export default function ScriptsPage() {
  const [genre, setGenre] = useState("전체");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ScriptSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(reset: boolean, from?: string | null) {
    return unwrap(
        api.GET("/scripts", {
          params: {
            query: {
              ...(genre !== "전체" ? { genre } : {}),
              ...(query ? { q: query } : {}),
              ...(from ? { cursor: from } : {}),
              take: 12,
            },
          },
        }),
      )
      .then((data) => {
        setItems((prev) => (reset || !prev ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genre, query]);

  return (
    <div className="stack">
      <div className="spread">
        <h1>대본 탐색</h1>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <input placeholder="제목·로그라인 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
          <button type="submit" className="secondary">
            검색
          </button>
        </form>
      </div>
      <div className="chips" role="group" aria-label="장르 필터">
        {GENRES.map((g) => (
          <button key={g} className={`chip${g === genre ? " on" : ""}`} onClick={() => setGenre(g)}>
            {g}
          </button>
        ))}
      </div>
      <ErrorText error={error} />
      {items === null ? (
        <p className="muted">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="muted">조건에 맞는 공개 대본이 없습니다.</p>
      ) : (
        <div className="grid">
          {items.map((s) => (
            <Link key={s.id} href={`/scripts/${s.id}`} className="card stack" style={{ color: "inherit", textDecoration: "none" }}>
              <div className="spread">
                <span className="badge">{s.genre}</span>
                <span className="small muted">
                  {s.author.displayName} · {new Date(s.contentUpdatedAt).toLocaleDateString("ko-KR")} 수정
                </span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.logline}</p>
              {s.aiSummary ? (
                <div className="tags" aria-label="AI 요약 태그">
                  {s.aiSummary.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                  <span className="tag">{s.aiSummary.contentRating === "ALL" ? "전체관람가" : `${s.aiSummary.contentRating}세`}</span>
                </div>
              ) : (
                <span className="small muted">AI 요약 생성 중…</span>
              )}
            </Link>
          ))}
        </div>
      )}
      {cursor && (
        <button className="secondary" onClick={() => load(false, cursor)}>
          더 보기
        </button>
      )}
    </div>
  );
}
