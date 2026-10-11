export type ScriptStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export type AccessStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Viewer {
  id: string;
  roles: string[];
}

/** 대본 존재 자체를 볼 수 있는가: 공개 대본은 누구나, 그 외에는 작가 본인과 관리자 */
export function canSeeScript(
  script: { authorId: string; status: ScriptStatus },
  viewer: Viewer | null,
): boolean {
  if (script.status === 'PUBLISHED') return true;
  if (!viewer) return false;
  return script.authorId === viewer.id || viewer.roles.includes('ADMIN');
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
