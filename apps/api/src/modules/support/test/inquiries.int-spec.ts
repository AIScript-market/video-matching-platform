/** 문의 게시판 (DATABASE_URL 필요) */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Viewer } from '../../access/access-rules.js';
import { PRIVATE_TITLE } from '../support.dto.js';
import { SupportService } from '../support.service.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('문의 게시판 (DB)', () => {
  const suffix = Date.now().toString(36);
  let prisma: PrismaService;
  let support: SupportService;
  let asker: Viewer, other: Viewer, admin: Viewer;
  const userIds: string[] = [];

  async function makeUser(name: string, roles: Array<'ADMIN'> = []): Promise<Viewer> {
    const u = await prisma.user.create({ data: { email: `inq-${name}-${suffix}@test.local`, passwordHash: 'x', displayName: `${name}${suffix}`, roles } });
    userIds.push(u.id);
    return { id: u.id, roles };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    support = new SupportService(prisma);
    asker = await makeUser('asker');
    other = await makeUser('other');
    admin = await makeUser('admin', ['ADMIN']);
  });

  afterAll(async () => {
    await prisma.inquiry.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('비밀 문의는 작성자·운영자만 보고, 다른 사람에게는 제목·작성자도 가린다', async () => {
    const q = await support.create(asker, { category: 'CONTRACTS', title: `정산 계좌 문의 ${suffix}`, body: '지급일이 언제인가요?' });
    expect(q).toMatchObject({ isPrivate: true, status: 'OPEN', mine: true, canReply: true, canClose: true, replies: [] });

    const listed = (viewer: Viewer | null) => support.list(viewer, { take: 50 }).then((p) => p.items.find((i) => i.id === q.id));
    expect(await listed(other)).toMatchObject({ title: PRIVATE_TITLE, authorName: null, mine: false });
    expect(await listed(null)).toMatchObject({ title: PRIVATE_TITLE, authorName: null });
    expect((await listed(admin))?.title).toBe(`정산 계좌 문의 ${suffix}`);
    await expect(support.get(q.id, other)).rejects.toThrow(NotFoundException);
    await expect(support.get(q.id, null)).rejects.toThrow(NotFoundException);
    await expect(support.reply(q.id, other, { body: '저도요' })).rejects.toThrow(NotFoundException);

    // 운영자 답변 → 답변 완료(운영자 이름은 "운영자"), 작성자가 더 물으면 다시 답변 대기, 해결됨으로 닫기
    const answered = await support.reply(q.id, admin, { body: '다음 달 말일까지 지급합니다.' });
    expect(answered.status).toBe('ANSWERED');
    expect(answered.replies[0]).toMatchObject({ fromStaff: true, authorName: '운영자' });
    expect((await support.reply(q.id, asker, { body: '감사합니다. 하나 더요.' })).status).toBe('OPEN');
    const closed = await support.close(q.id, asker);
    expect(closed).toMatchObject({ status: 'CLOSED', canClose: false });
    expect((await support.reply(q.id, asker, { body: '다시 여쭤봐요' })).status).toBe('OPEN');

    // 내 문의만
    expect((await support.list(asker, { mine: true })).items.map((i) => i.id)).toContain(q.id);
    expect((await support.list(other, { mine: true })).items.map((i) => i.id)).not.toContain(q.id);
    await expect(support.list(null, { mine: true })).rejects.toThrow(ForbiddenException);
  });

  it('공개 문의는 누구나 읽지만 답글은 작성자·운영자만, 숨긴 문의는 운영자만 본다', async () => {
    const q = await support.create(asker, { category: 'COINS', title: `코인 충전 ${suffix}`, body: '베타 코인을 더 받을 수 있나요?', isPrivate: false });
    expect((await support.get(q.id, null)).title).toBe(`코인 충전 ${suffix}`);
    const seen = await support.get(q.id, other);
    expect(seen).toMatchObject({ authorName: `asker${suffix}`, canReply: false, canClose: false });
    await expect(support.reply(q.id, other, { body: '끼어들기' })).rejects.toThrow(ForbiddenException);
    await expect(support.close(q.id, other)).rejects.toThrow(ForbiddenException);

    expect((await support.hide(q.id, true)).hidden).toBe(true);
    await expect(support.get(q.id, other)).rejects.toThrow(NotFoundException);
    await expect(support.get(q.id, asker)).rejects.toThrow(NotFoundException);
    expect((await support.list(other, { take: 50 })).items.map((i) => i.id)).not.toContain(q.id);
    expect((await support.get(q.id, admin)).hidden).toBe(true);
    await support.hide(q.id, false);
    expect((await support.get(q.id, null)).hidden).toBe(false);
  });

  it('운영자가 답변 대기만 보면 오래 기다린 문의부터', async () => {
    const a = await support.create(other, { category: 'OTHER', title: `먼저 ${suffix}`, body: '1' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await support.create(other, { category: 'OTHER', title: `나중 ${suffix}`, body: '2' });
    const ids = (await support.list(admin, { status: 'OPEN', take: 50 })).items.map((i) => i.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    const latest = (await support.list(other, { mine: true })).items.map((i) => i.id);
    expect(latest.indexOf(b.id)).toBeLessThan(latest.indexOf(a.id));
  });
});
