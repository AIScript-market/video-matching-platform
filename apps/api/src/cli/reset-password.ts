/**
 * 비밀번호 재설정 메일이 생기기 전까지, 운영자가 본인 확인을 마친 뒤 임시 비밀번호를 정해 준다.
 *   docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env run --rm \
 *     -e USER_EMAIL=member@example.com -e NEW_PASSWORD='...' api node apps/api/dist/cli/reset-password.js
 */
import { hash } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service.js';

async function main() {
  const email = process.env.USER_EMAIL?.trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? '';
  if (!email || password.length < 8) throw new Error('USER_EMAIL과 8자 이상의 NEW_PASSWORD가 필요합니다');
  const prisma = new PrismaService();
  try {
    const { count } = await prisma.user.updateMany({ where: { email, status: 'ACTIVE' }, data: { passwordHash: await hash(password) } });
    if (count === 0) throw new Error(`이용 중인 계정을 찾을 수 없습니다: ${email}`);
    console.log(`비밀번호를 바꿨습니다: ${email}. 사용자에게 로그인 후 바로 바꾸라고 안내하세요.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
