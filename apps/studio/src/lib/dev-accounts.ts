// 개발 환경 전용: 시드 계정마다 하위 주소(<key>.localhost)를 배정한다.
// 로그인 쿠키는 호스트 이름별로 나뉘므로, 주소가 다르면 한 브라우저에서 여러 계정을 동시에 쓸 수 있다.
// NEXT_PUBLIC_DEV_ACCOUNTS=true 일 때만 화면에 나타난다 (ops/compose.yaml에서 켬).

export const DEV_ACCOUNTS_ENABLED = process.env.NEXT_PUBLIC_DEV_ACCOUNTS === "true";

export interface DevAccount {
  key: string;
  label: string;
  role: string;
  email: string;
  password: string;
  note: string;
  landing: string;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { key: "admin", label: "관리자", role: "관리자", email: "admin@vmp.dev", password: "admin1234!", note: "권한 신청 승인, 활동 로그, 장부", landing: "/admin" },
  { key: "writer1", label: "김작가", role: "대본 제공자", email: "writer1@vmp.dev", password: "writer1234!", note: "공개 대본 2편", landing: "/dashboard" },
  { key: "writer2", label: "이작가", role: "대본 제공자", email: "writer2@vmp.dev", password: "writer1234!", note: "공개 대본 1편", landing: "/dashboard" },
  { key: "producer1", label: "박제작", role: "영상 제작자", email: "producer1@vmp.dev", password: "producer1234!", note: "열람 요청·검토 메시지·제안", landing: "/scripts" },
  { key: "producer2", label: "최제작", role: "영상 제작자", email: "producer2@vmp.dev", password: "producer1234!", note: "열람 요청·검토 메시지·제안", landing: "/scripts" },
  { key: "member1", label: "정일반", role: "일반", email: "member1@vmp.dev", password: "member1234!", note: "권한 없음 — 권한 신청 가능", landing: "/account" },
  { key: "applicant1", label: "한신청", role: "일반 (신청 대기)", email: "applicant1@vmp.dev", password: "member1234!", note: "대본 제공자 권한 승인 대기", landing: "/account" },
  { key: "applicant2", label: "윤신청", role: "일반 (신청 대기)", email: "applicant2@vmp.dev", password: "member1234!", note: "영상 제작자 권한 승인 대기", landing: "/account" },
];

/** 현재 접속 주소의 포트를 유지한 채 계정 전용 하위 주소를 만든다 */
export function accountOrigin(key: string, port: string): string {
  return `http://${key}.localhost${port ? `:${port}` : ""}`;
}

/** 지금 접속한 호스트가 어느 계정 주소인지 (예: writer1.localhost → writer1) */
export function accountForHost(hostname: string): DevAccount | undefined {
  const key = hostname.endsWith(".localhost") ? hostname.slice(0, -".localhost".length) : "";
  return DEV_ACCOUNTS.find((a) => a.key === key);
}
