"use client";

import { useSession } from "@/lib/session";

/** 베타 개인정보 처리방침 v0. 법률 검토 전 초안이다. 바꾸면 apps/api/src/core/beta.ts의 TERMS_VERSION도 올린다 */
export default function PrivacyPage() {
  const { config } = useSession();
  return (
    <article className="card stack legal">
      <h1>개인정보 처리방침 (베타)</h1>
      <p className="small muted">버전 {config?.termsVersion ?? "terms-privacy-beta-v0"} · 초대제 베타 기간에 적용되는 초안입니다.</p>

      <h2>1. 처리하는 개인정보</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>항목</th>
              <th>목적</th>
              <th>보관 기간</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>이메일, 비밀번호(암호화된 값), 활동명, 소개</td>
              <td>가입·로그인, 공개 프로필</td>
              <td>탈퇴할 때까지 (탈퇴하면 바로 지움)</td>
            </tr>
            <tr>
              <td>대본, 메시지, 협상 조건</td>
              <td>대본 공개, 열람, 협상</td>
              <td>탈퇴할 때까지. 계약에 쓰인 내용은 아래 계약 기록과 같이</td>
            </tr>
            <tr>
              <td>계약서 본문, 서명할 때 입력한 이름, 서명 시각, 접속 IP와 브라우저 정보</td>
              <td>계약 성립과 서명자 증명, 분쟁 대응</td>
              <td>계약이 끝난 뒤 5년 (탈퇴해도 계약 기록은 남습니다)</td>
            </tr>
            <tr>
              <td>대본 열람 기록, 활동 기록</td>
              <td>비밀유지 위반 확인, 부정 이용 방지</td>
              <td>1년</td>
            </tr>
            <tr>
              <td>제작자가 올린 검수용 영상 파일 (영상에 나오는 출연자의 얼굴·목소리 포함)</td>
              <td>채널 게시 전 검수</td>
              <td>게시하거나 거절할 때까지 (그때 바로 지우고, 늦어도 올린 지 60일 뒤 지움)</td>
            </tr>
            <tr>
              <td>영상별 수익과 지급 기록</td>
              <td>정산</td>
              <td>세법이 정한 기간 (5년)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small">베타 기간에는 결제 정보와 계좌 정보를 플랫폼에 저장하지 않습니다. 지급은 플랫폼 밖에서 하고 지급 사실만 기록합니다.</p>

      <h2>2. 다른 곳에 맡기거나 보내는 경우</h2>
      <ul className="small">
        <li>AI 요약: 대본의 줄거리·태그를 만들기 위해 대본 내용이 Anthropic(미국)의 AI 서비스로 보내집니다. 보낸 내용은 요약을 만드는 데만 쓰입니다. 원하지 않으면 운영자에게 알려 주세요.</li>
        <li>서버 운영: 서비스는 클라우드 서버에서 운영되며, 서버 업체는 저장된 정보를 이용하지 않습니다.</li>
        <li>영상 보관: 검수용 영상 파일은 Cloudflare(미국)의 저장소 서비스에 위 기간 동안만 보관합니다. 업체는 보관 외에 영상을 이용하지 않습니다.</li>
        <li>그 밖에 법령에 따른 요청이 없는 한 다른 사람에게 개인정보를 주지 않습니다.</li>
      </ul>

      <h2>3. 이용자의 권리</h2>
      <p className="small">내 계정에서 정보를 고치거나 탈퇴할 수 있고, 처리 정지·열람·삭제를 요청할 수 있습니다. 계약·정산 기록처럼 법령이나 계약상 보관해야 하는 정보는 그 기간 동안 남습니다.</p>

      <h2>4. 안전 조치</h2>
      <p className="small">비밀번호는 복원할 수 없는 방식으로 암호화하고, 접속은 HTTPS로만 받으며, 대본 열람·업로드·메시지 같은 주요 활동 기록을 남겨 부정 이용을 확인합니다.</p>

      <h2>5. 만 19세 미만</h2>
      <p className="small">베타에는 만 19세 이상만 가입할 수 있습니다.</p>

      <h2>6. 개인정보 보호 책임자와 문의</h2>
      <p className="small">{config?.contactEmail ?? "서비스 안 문의"}</p>
    </article>
  );
}
