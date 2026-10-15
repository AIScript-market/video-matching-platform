import {
  renderChannelPublishing,
  renderNda,
  renderScriptLicense,
  scriptContentSha256,
  sha256,
  TEMPLATE_VERSIONS,
} from './contract-templates.js';
import { splitRevenue, validateSettlementMonth } from './settlement-rules.js';

const date = new Date('2026-10-15T09:00:00Z');

describe('contract templates', () => {
  it('fills the accepted terms into the license and stays stable for the same input', () => {
    const input = {
      scriptTitle: '마지막 열차',
      scriptId: 's1',
      writerName: '한작가',
      producerName: '빛나는 제작소',
      platformName: '대본매칭',
      writerSharePct: 30,
      producerSharePct: 70,
      upfrontFeeKrw: 1_500_000,
      termMonths: 24,
      exclusive: true,
      notes: '3화 분량',
      date,
    };
    const a = renderScriptLicense(input);
    expect(a.templateVersion).toBe(TEMPLATE_VERSIONS.SCRIPT_LICENSE);
    expect(a.body).toContain('작가 30% / 제작자 70%');
    expect(a.body).toContain('1,500,000원');
    expect(a.body).toContain('24개월');
    expect(a.body).toContain('작가는 기간 동안 같은 대본의 영상화를 다른 사람에게 허락하지 않는다');
    expect(a.body).toContain('특약: 3화 분량');
    expect(sha256(a.body)).toBe(sha256(renderScriptLicense(input).body));
    expect(sha256(renderScriptLicense({ ...input, upfrontFeeKrw: 1 }).body)).not.toBe(sha256(a.body));
  });

  it('writes the 100% ad revenue rule and channel-level income into the channel contract', () => {
    const c = renderChannelPublishing({ producerName: '빛나는 제작소', platformName: '대본매칭', date });
    expect(c.body).toContain('전액 제작 측');
    expect(c.body).toContain('채널 단위로 들어오는 수입은 플랫폼에 속한다');
    expect(c.body).toContain('2026-10-15');
  });

  it('names the script and both people in the NDA', () => {
    const hash = scriptContentSha256('S#1. 승강장', null);
    const n = renderNda({
      scriptTitle: '마지막 열차',
      scriptId: 's1',
      scriptSha256: hash,
      logline: '폐역 역무원이 오지 않는 열차의 비밀을 쫓는다',
      genre: '미스터리',
      writerName: '한작가',
      producerName: '빛나는 제작소',
      platformName: '대본매칭',
      date,
    });
    expect(n.title).toBe('비밀유지 및 무단이용 금지 서약서');
    expect(n.templateVersion).toBe('nda-beta-v1');
    expect(n.body).toContain('「마지막 열차」');
    expect(n.body).toContain('서약자(이하 "제작자"): 빛나는 제작소');
    expect(n.body).toContain(`열람 대상 내용의 SHA-256: ${hash}`);
    // 아이디어만 가져가는 경우를 막는 조항들
    expect(n.body).toContain('제4조 (목적 외 이용 금지)');
    expect(n.body).toContain('제5조 (유사 작품 제작 제한)');
    expect(n.body).toContain('10,000,000원');
    // 미리보기가 바뀌면 해시도 바뀐다
    expect(scriptContentSha256('S#1. 승강장', '미리보기')).not.toBe(hash);
  });
});

describe('settlement rules', () => {
  it('gives everything to the production side and the rounding remainder to the producer', () => {
    expect(splitRevenue(10_001, 30)).toEqual({ writerKrw: 3_000, producerKrw: 7_001, platformKrw: 0 });
    expect(splitRevenue(0, 50)).toEqual({ writerKrw: 0, producerKrw: 0, platformKrw: 0 });
    expect(splitRevenue(999, 100)).toEqual({ writerKrw: 999, producerKrw: 0, platformKrw: 0 });
    expect(() => splitRevenue(-1, 30)).toThrow();
    expect(() => splitRevenue(100, 101)).toThrow();
  });

  it('only accepts finished months', () => {
    const now = new Date('2026-10-15T00:00:00Z');
    expect(() => validateSettlementMonth('2026-09', now)).not.toThrow();
    expect(() => validateSettlementMonth('2026-10', now)).toThrow();
    expect(() => validateSettlementMonth('2026-13', now)).toThrow();
    expect(() => validateSettlementMonth('2026-9', now)).toThrow();
  });
});
