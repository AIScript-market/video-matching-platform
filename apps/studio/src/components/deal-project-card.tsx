"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorText } from "@/components/ui";
import { api, unwrap } from "@/lib/api";
import type { Project } from "@/lib/casting";

/** 딜 화면의 "작품" 카드: 작품이 없으면 만들고, 있으면 캐스팅 화면으로 보낸다 */
export function DealProjectCard({ dealId }: { dealId: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap(api.GET("/deals/{dealId}/project", { params: { path: { dealId } } }))
      .then((p) => setProject(p && "id" in (p as object) ? (p as Project) : null))
      .catch(() => setProject(null));
  }, [dealId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setProject(await unwrap(api.POST("/deals/{dealId}/project", { params: { path: { dealId } }, body: { title } })));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (project === undefined) return null;
  return (
    <section className="card stack">
      <h2>작품과 캐스팅</h2>
      {project ? (
        <div className="spread">
          <span>{project.title}</span>
          <Link href={`/projects/${project.id}`} className="button secondary">
            배역·캐스팅 관리
          </Link>
        </div>
      ) : (
        <form className="row" onSubmit={create}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="작품 이름 (예: 마지막 열차 유튜브 6부작)" style={{ flex: 1, minWidth: 220 }} maxLength={200} />
          <button type="submit" disabled={!title.trim()}>
            작품 만들기
          </button>
        </form>
      )}
      <ErrorText error={error} />
    </section>
  );
}
