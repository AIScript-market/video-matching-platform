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
  /** 출연자·캐스팅 계정: FEATURE_CASTING=on일 때만 목록에 보인다 */
  casting?: boolean;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { key: "admin", label: "관리자", role: "관리자", email: "admin@vmp.dev", password: "admin1234!", note: "계정 정지, 코인 지급, 활동 로그, 장부", landing: "/admin" },
  { key: "writer1", label: "김작가", role: "일반 (공개)", email: "writer1@vmp.dev", password: "writer1234!", note: "공개 대본 2편 · 100코인", landing: "/dashboard" },
  { key: "writer2", label: "이작가", role: "일반 (공개)", email: "writer2@vmp.dev", password: "writer1234!", note: "공개 대본 1편 · 100코인", landing: "/dashboard" },
  { key: "producer1", label: "박제작", role: "일반 (공개)", email: "producer1@vmp.dev", password: "producer1234!", note: "열람 요청·미리보기·메시지 · 100코인", landing: "/scripts" },
  { key: "producer2", label: "최제작", role: "일반 (공개)", email: "producer2@vmp.dev", password: "producer1234!", note: "열람 요청·미리보기·메시지 · 100코인", landing: "/scripts" },
  { key: "member1", label: "정일반", role: "일반 (비공개)", email: "member1@vmp.dev", password: "member1234!", note: "프로필 비공개 — 공개 전에는 창작 활동 불가 · 10코인", landing: "/account" },
  { key: "suspended1", label: "강정지", role: "정지된 계정", email: "suspended1@vmp.dev", password: "member1234!", note: "로그인 불가, 같은 이메일 재가입 불가", landing: "/scripts" },
  { key: "talent1", label: "최한별", role: "출연자 (배우)", email: "talent1@vmp.dev", password: "talent1234!", note: "\"마지막 열차\" 정수 역 계약 · 1화 출연분 확인 대기", landing: "/talent", casting: true },
  { key: "talent2", label: "정도윤", role: "출연자 (일반인)", email: "talent2@vmp.dev", password: "talent1234!", note: "공개 오디션 \"마지막 승객\"에 지원 가능", landing: "/casting", casting: true },
  { key: "kid1", label: "윤서아", role: "출연자 (아역 14세)", email: "kid1@vmp.dev", password: "talent1234!", note: "수아 역 제안이 보호자 승인 대기", landing: "/talent", casting: true },
  { key: "guardian1", label: "윤보호", role: "보호자", email: "guardian1@vmp.dev", password: "guardian1234!", note: "서아의 법정대리인 — 제안 승인·출연분 확인", landing: "/guardian", casting: true },
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
