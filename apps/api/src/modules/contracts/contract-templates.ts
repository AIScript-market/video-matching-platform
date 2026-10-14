import { createHash } from 'node:crypto';

/**
 * 플랫폼 계약서 템플릿 (베타 계약서 v0, docs/business-model.md).
 * 법률 검토 전 초안이다. 본문은 계약을 만들 때 아래 함수로 한 번 만들고 고정하며, 바꾸려면 버전을 올린다.
 * 이미 만든 계약의 본문은 다시 만들지 않는다 (해시가 달라진다).
 */
export const TEMPLATE_VERSIONS = {
  NDA: 'nda-beta-v0',
  SCRIPT_LICENSE: 'script-license-beta-v0',
  CHANNEL_PUBLISHING: 'channel-publishing-beta-v0',
} as const;

export type ContractKindName = keyof typeof TEMPLATE_VERSIONS;

/** 서명 화면과 서명 기록에 함께 남기는 동의 문구 */
export const SIGN_CONSENT = '위 계약서의 내용을 모두 읽고 이해했으며, 이에 동의하여 전자서명합니다.';

export interface RenderedContract {
  kind: ContractKindName;
  templateVersion: string;
  title: string;
  body: string;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const day = (d: Date) => d.toISOString().slice(0, 10);

function header(title: string, version: string): string {
  return [`# ${title}`, '', `(베타 계약서 ${version}. 법률 검토 전 초안이며, 정식 계약서가 나오면 새 버전으로 다시 서명을 요청할 수 있습니다.)`, ''].join('\n');
}

export interface NdaInput {
  scriptTitle: string;
  scriptId: string;
  writerName: string;
  producerName: string;
  date: Date;
}

/** 비밀유지 서약서: 제작자가 전문 열람을 요청할 때 혼자 서명한다. 작가는 수혜자다 */
export function renderNda(p: NdaInput): RenderedContract {
  const v = TEMPLATE_VERSIONS.NDA;
  const title = '비밀유지 서약서';
  const body = [
    header(title, v),
    `서약자(이하 "제작자"): ${p.producerName}`,
    `작가: ${p.writerName}`,
    `대상 대본: 「${p.scriptTitle}」 (플랫폼 대본 번호 ${p.scriptId})`,
    `작성일: ${day(p.date)}`,
    '',
    '제1조 (목적) 제작자는 대상 대본의 영상화 검토를 위해 작가가 공개하지 않은 대본 전문과 관련 자료(이하 "비밀정보")를 열람하며, 그 비밀을 지킬 것을 서약한다.',
    '제2조 (비밀정보) 비밀정보는 대본 전문, 미리보기 대본, 줄거리·인물·설정·대사·구성 등 대본의 창작적 표현과 아이디어, 그리고 작가가 플랫폼에서 제작자에게 제공한 모든 자료를 말한다. 다만 열람 전에 이미 공개된 정보와 제작자가 독자적으로 만든 것임을 증명할 수 있는 정보는 제외한다.',
    '제3조 (의무) 제작자는 ① 비밀정보를 영상화 검토 외의 목적으로 쓰지 않고, ② 작가의 서면(플랫폼 메시지 포함) 동의 없이 제3자에게 공개·복제·배포하지 않으며, ③ 작가와 이용허락 계약을 맺지 않고 비밀정보를 바탕으로 영상물이나 다른 저작물을 만들지 않는다. 검토에 참여하는 소속 인원에게는 같은 의무를 지우고 그 위반에 책임진다.',
    '제4조 (기간) 이 서약의 효력은 작성일부터 3년간 유지된다. 이용허락 계약을 맺으면 그 계약이 정한 바를 따른다.',
    '제5조 (위반) 제작자가 이 서약을 위반하면 작가가 입은 손해를 배상하고, 플랫폼은 제작자의 이용을 정지할 수 있다.',
    '제6조 (기록) 이 서약서의 본문, 서명 시각, 서명자가 입력한 이름과 접속 정보는 플랫폼에 보관되며 분쟁 시 증거로 쓰일 수 있다.',
  ].join('\n');
  return { kind: 'NDA', templateVersion: v, title, body };
}

export interface ScriptLicenseInput {
  scriptTitle: string;
  scriptId: string;
  writerName: string;
  producerName: string;
  platformName: string;
  writerSharePct: number;
  producerSharePct: number;
  upfrontFeeKrw: number;
  termMonths: number;
  exclusive: boolean;
  notes?: string | null;
  date: Date;
}

/** 대본 이용허락 계약: 작가 ↔ 제작자. 협상에서 수락된 조건으로 채운다 */
export function renderScriptLicense(p: ScriptLicenseInput): RenderedContract {
  const v = TEMPLATE_VERSIONS.SCRIPT_LICENSE;
  const title = `대본 이용허락 계약서 (「${p.scriptTitle}」)`;
  const body = [
    header(title, v),
    `이용허락자(이하 "작가"): ${p.writerName}`,
    `이용자(이하 "제작자"): ${p.producerName}`,
    `대상 대본: 「${p.scriptTitle}」 (플랫폼 대본 번호 ${p.scriptId})`,
    `작성일: ${day(p.date)}`,
    '',
    '## 합의한 조건',
    `- 이용 방식: 영상화 권리의 ${p.exclusive ? '독점' : '비독점'} 이용`,
    `- 기간: 계약 성립일부터 ${p.termMonths}개월`,
    `- 원고료(선급금): ${won(p.upfrontFeeKrw)}`,
    `- 광고 수익 배분: 작가 ${p.writerSharePct}% / 제작자 ${p.producerSharePct}%`,
    p.notes ? `- 특약: ${p.notes}` : '- 특약: 없음',
    '',
    '제1조 (목적) 작가는 제작자에게 대상 대본을 영상물로 만들어 공개할 수 있도록 이용을 허락하고, 제작자는 그 대가를 지급한다.',
    `제2조 (이용 범위) 제작자는 기간 동안 대상 대본을 바탕으로 영상물(회차·숏폼 포함)을 제작하고, 이를 ${p.platformName}이(가) 운영하는 장르 채널(이하 "플랫폼 채널")에 공개할 수 있다. 플랫폼 채널 밖에서 공개하거나 대본을 다른 형태(출판, 공연, 2차 영상화 등)로 이용하려면 작가와 따로 합의한다.`,
    '제3조 (원고료) 제작자는 계약 성립일부터 14일 안에 원고료를 작가에게 지급한다. 베타 기간에는 플랫폼 밖에서 지급하고, 두 당사자가 플랫폼에 지급 사실을 기록한다.',
    '제4조 (광고 수익 배분) 플랫폼 채널에 공개된 영상물의 YouTube 광고 수익(구글이 확정해 지급한 금액 기준)은 전액 작가와 제작자에게 배분되며, 위 배분율에 따라 나눈다. 플랫폼은 채널 게시 계약에 따라 정산서를 만들고 지급을 처리하거나 기록한다. 채널 단위 수입(브랜드 광고 계약, 멤버십 등)은 배분 대상이 아니다.',
    '제5조 (크레딧) 제작자는 영상물과 그 설명란에 작가의 이름(작가가 정한 활동명)을 각본으로 표시한다.',
    '제6조 (수정) 제작자는 영상화에 필요한 범위에서 대본을 고칠 수 있다. 줄거리·결말·주요 인물의 성격을 크게 바꾸려면 작가의 동의를 받는다.',
    '제7조 (권리 보증) 작가는 대상 대본이 자신의 창작물이고 제3자의 권리를 침해하지 않으며, 이 계약과 충돌하는 다른 계약을 맺지 않았음을 보증한다. 위반으로 제작자나 플랫폼이 손해를 입으면 작가가 책임진다.',
    `제8조 (${p.exclusive ? '독점' : '비독점'}) ${p.exclusive ? '작가는 기간 동안 같은 대본의 영상화를 다른 사람에게 허락하지 않는다.' : '작가는 기간 동안에도 같은 대본의 영상화를 다른 사람에게 허락할 수 있다.'}`,
    '제9조 (해지) 상대방이 이 계약을 중대하게 위반하고, 시정을 요구한 날부터 14일 안에 고치지 않으면 계약을 해지할 수 있다. 해지 전에 공개된 영상물의 수익 배분은 계속된다.',
    '제10조 (권리의 귀속) 대본의 저작권은 작가에게 남는다. 영상물의 권리는 제작자에게 있으며, 플랫폼 채널 게시는 제작자와 플랫폼의 채널 게시 계약을 따른다.',
    '제11조 (분쟁) 분쟁은 먼저 플랫폼의 중재로 협의하고, 협의가 되지 않으면 관할 법원에서 해결한다. 한국저작권위원회 등의 조정 절차를 이용할 수 있다.',
    '제12조 (전자서명과 기록) 두 당사자는 플랫폼에서 전자서명으로 이 계약을 맺는 데 동의한다. 본문, 본문의 해시, 서명 시각, 입력한 이름, 접속 정보는 플랫폼에 보관된다.',
  ].join('\n');
  return { kind: 'SCRIPT_LICENSE', templateVersion: v, title, body };
}

export interface ChannelPublishingInput {
  producerName: string;
  platformName: string;
  date: Date;
}

/** 채널 게시 계약: 제작자 ↔ 플랫폼. 제작자마다 버전당 한 번 */
export function renderChannelPublishing(p: ChannelPublishingInput): RenderedContract {
  const v = TEMPLATE_VERSIONS.CHANNEL_PUBLISHING;
  const title = '플랫폼 채널 게시 계약서';
  const body = [
    header(title, v),
    `게시자(이하 "제작자"): ${p.producerName}`,
    `채널 운영자(이하 "플랫폼"): ${p.platformName}`,
    `작성일: ${day(p.date)}`,
    '',
    '제1조 (목적) 제작자가 플랫폼에서 맺은 대본 이용허락 계약으로 만든 영상물을 플랫폼이 소유·운영하는 장르 채널(이하 "플랫폼 채널")에 게시하는 조건을 정한다.',
    '제2조 (게시권) 제작자는 제출하고 검수를 통과한 영상물을 플랫폼 채널에 게시·편성·홍보할 수 있는 비독점적 권리를 플랫폼에 준다. 기간은 게시일부터 해당 대본 이용허락 계약의 기간과 같다. 영상물의 권리는 제작자에게 남는다.',
    '제3조 (광고 수익 100% 배분) 플랫폼 채널에 게시된 영상물의 YouTube 광고 수익은 구글이 확정해 플랫폼에 지급한 금액을 기준으로 전액 제작 측(제작자와 작가)에 배분한다. 나누는 비율은 대본 이용허락 계약을 따른다. 플랫폼은 이 수익에서 수수료를 떼지 않는다. 다만 이체 수수료와 법령에 따른 세금(원천징수 등)은 뺄 수 있다.',
    '제4조 (정산) 플랫폼은 구글의 지급을 받은 달의 다음 달 말일까지 영상물별 정산서를 만들어 플랫폼에 공개하고 지급한다. 예상 수익으로 먼저 지급하지 않는다. 채널이 수익 창출 조건을 넘기 전에는 광고 수익이 없을 수 있다.',
    '제5조 (채널 단위 수입) 브랜드 광고 계약, 채널 협찬, 멤버십·후원 등 채널 단위로 들어오는 수입은 플랫폼에 속한다. 플랫폼이 수주한 광고 영상의 제작을 제작자에게 맡길 때는 건마다 외주 조건(제작비, 일정, 권리)을 따로 정한다. 광고 영상에 붙는 YouTube 광고 수익은 광고비에 포함된 것으로 보아 플랫폼에 속한다. 제작자의 영상물 안에 넣는 간접광고(PPL)의 대가는 건마다 정하되, 따로 정하지 않으면 제작 몫 70%, 플랫폼 몫 30%로 나눈다.',
    '제6조 (외주 배정 기준) 플랫폼은 광고 외주를 배정할 때 누적 성과, 장르 적합도, 검수 위반 이력을 기준으로 삼고 그 기준을 플랫폼에 공개한다.',
    '제7조 (제출과 검수) 제작자는 영상물과 함께 음원·소재의 출처와 이용 권한, 출연자의 출연·초상 이용 동의, 광고 포함 여부를 제출한다. 플랫폼은 저작권·초상권·명예훼손·광고 표시(추천·보증 심사지침) 등을 검수하고, 게시를 거절하거나 수정을 요청할 수 있다. 제목·썸네일·공개 일정은 제작자가 정하되 플랫폼 채널의 편성 기준을 따른다.',
    '제8조 (권리 보증과 책임) 제작자는 영상물이 제3자의 권리를 침해하지 않음을 보증한다. 영상물 때문에 플랫폼 채널이 저작권 경고·수익 창출 제한 등 불이익을 받거나 플랫폼이 손해를 입으면 제작자가 책임진다.',
    '제9조 (게시 중단) 권리 침해 신고, 법령 위반, YouTube 정책 위반이 확인되거나 그럴 우려가 클 때 플랫폼은 영상물을 비공개로 돌리거나 내릴 수 있고, 제작자에게 이유를 알린다. 위반이 반복되면 이용을 정지할 수 있다.',
    '제10조 (탈퇴와 종료) 제작자가 탈퇴하거나 이 계약을 해지해도 이미 게시된 영상물은 게시 기간 동안 플랫폼 채널에 남을 수 있고, 그 영상물의 광고 수익 배분은 계속된다. 제작자는 30일 전에 알리고 게시 중단을 요청할 수 있으며, 플랫폼은 정당한 사유가 없으면 이에 응한다.',
    '제11조 (데이터) 플랫폼은 채널 운영자로서 영상물의 조회·시청·수익 자료를 보고 편성과 서비스 개선에 쓴다. 제작자에게는 자기 영상물의 성과와 정산 자료를 보여 준다.',
    '제12조 (분쟁과 기록) 분쟁은 협의로 해결하고, 협의가 되지 않으면 관할 법원에서 해결한다. 두 당사자는 플랫폼에서 전자서명으로 이 계약을 맺는 데 동의하며, 본문·해시·서명 기록은 플랫폼에 보관된다.',
  ].join('\n');
  return { kind: 'CHANNEL_PUBLISHING', templateVersion: v, title, body };
}
