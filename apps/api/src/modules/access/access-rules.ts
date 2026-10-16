export type ScriptStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export type AccessStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Viewer {
  id: string;
  roles: string[];
}

/**
 * 대본 존재 자체를 볼 수 있는가: 공개 대본은 누구나, 그 외에는 작가 본인과 관리자.
 * 작가가 정지·탈퇴했으면(authorStatus가 ACTIVE가 아니면) 관리자만 본다.
 */
export function canSeeScript(
  script: { authorId: string; status: ScriptStatus; authorStatus?: string },
  viewer: Viewer | null,
): boolean {
  const isAdmin = Boolean(viewer?.roles.includes('ADMIN'));
  if (script.authorStatus && script.authorStatus !== 'ACTIVE') return isAdmin;
  if (script.status === 'PUBLISHED') return true;
  if (!viewer) return false;
  return script.authorId === viewer.id || isAdmin;
}

/** 미리보기 대본을 볼 수 있는가: 작가 본인, 그리고 공개 대본의 미리보기 열람권(코인)을 산 사람 */
export function canReadPreview(
  script: { authorId: string; status: ScriptStatus },
  viewer: Viewer | null,
  unlocked: boolean,
): boolean {
  if (!viewer) return false;
  if (script.authorId === viewer.id) return true;
  return script.status === 'PUBLISHED' && unlocked;
}

/**
 * 전문(fullText)을 볼 수 있는가 — 계약: 작가 본인과 열람 승인된 제작자만.
 * 승인된 제작자라도 대본이 공개 상태가 아니면(숨김 등) 볼 수 없다.
 */
export function canReadFullText(
  script: { authorId: string; status: ScriptStatus },
  viewer: Viewer | null,
  accessStatus: AccessStatus | null,
): boolean {
  if (!viewer) return false;
  if (script.authorId === viewer.id) return true;
  return script.status === 'PUBLISHED' && accessStatus === 'APPROVED';
}
