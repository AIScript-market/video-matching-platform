import { canReadFullText, canReadPreview, canSeeScript } from './access-rules.js';

const author = { id: 'w1', roles: ['WRITER'] };
const producer = { id: 'p1', roles: ['PRODUCER'] };
const admin = { id: 'a1', roles: ['ADMIN'] };
const published = { authorId: 'w1', status: 'PUBLISHED' as const };
const draft = { authorId: 'w1', status: 'DRAFT' as const };
const hidden = { authorId: 'w1', status: 'HIDDEN' as const };

describe('canSeeScript', () => {
  it('공개 대본은 비로그인 포함 누구나', () => {
    expect(canSeeScript(published, null)).toBe(true);
    expect(canSeeScript(published, producer)).toBe(true);
  });
  it('비공개 대본은 작가와 관리자만', () => {
    expect(canSeeScript(draft, null)).toBe(false);
    expect(canSeeScript(draft, producer)).toBe(false);
    expect(canSeeScript(draft, author)).toBe(true);
    expect(canSeeScript(hidden, admin)).toBe(true);
  });
});

describe('canReadFullText', () => {
  it('작가 본인은 항상 가능', () => {
    expect(canReadFullText(draft, author, null)).toBe(true);
    expect(canReadFullText(hidden, author, null)).toBe(true);
  });
  it('제작자는 공개 대본 + 승인된 경우만', () => {
    expect(canReadFullText(published, producer, 'APPROVED')).toBe(true);
    expect(canReadFullText(published, producer, 'PENDING')).toBe(false);
    expect(canReadFullText(published, producer, null)).toBe(false);
    expect(canReadFullText(hidden, producer, 'APPROVED')).toBe(false);
  });
  it('관리자·비로그인은 불가', () => {
    expect(canReadFullText(published, admin, null)).toBe(false);
    expect(canReadFullText(published, null, null)).toBe(false);
  });
});

describe('canReadPreview', () => {
  it('작가 본인과 공개 대본의 제작자만', () => {
    expect(canReadPreview(draft, author)).toBe(true);
    expect(canReadPreview(published, producer)).toBe(true);
    expect(canReadPreview(hidden, producer)).toBe(false);
    expect(canReadPreview(published, { id: 'm1', roles: [] })).toBe(false);
    expect(canReadPreview(published, admin)).toBe(false);
    expect(canReadPreview(published, null)).toBe(false);
  });
});
