"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, dateTime, unwrap, type PublicProfile } from "@/lib/api";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/users/{id}", { params: { path: { id } } }))
      .then(setProfile)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (error) return <ErrorText error={error} />;
  if (!profile) return <p className="muted">불러오는 중…</p>;
  return (
    <div className="stack">
      <section className="card stack" aria-label="공개 프로필">
        <div className="spread">
          <h1 style={{ margin: 0 }}>{profile.displayName}</h1>
          {profile.creatorReady && <span className="badge ok">대본 제공·영상 제작 활동 중</span>}
        </div>
        {profile.email && (
          <p>
            <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </p>
        )}
        {profile.bio && <p className="pre">{profile.bio}</p>}
        <p className="small muted">{dateTime(profile.createdAt)} 가입</p>
        {!profile.profilePublic && <p className="notice small">비공개 프로필입니다 (본인·관리자만 보임).</p>}
      </section>
      <section className="card stack">
        <h2>공개 대본</h2>
        {profile.scripts.length === 0 ? (
          <p className="muted small">공개한 대본이 없습니다.</p>
        ) : (
          profile.scripts.map((s) => (
            <Link key={s.id} href={`/scripts/${s.id}`} className="stack" style={{ gap: 2 }}>
              <strong>{s.title}</strong>
              <span className="small muted">
                {s.genre} · {s.logline}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
