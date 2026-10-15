/**
 * 운영 서버에서 관리자 계정을 만든다 (운영에는 시드를 넣지 않아서 필요하다).
 *   docker compose -f ops/prod/compose.yaml --env-file ops/prod/production.env run --rm \
 *     -e ADMIN_EMAIL=ops@example.com -e ADMIN_NAME=운영자 -e ADMIN_PASSWORD='...' api node apps/api/dist/cli/create-admin.js
 * 비밀번호는 명령 기록에 남지 않게 환경 변수로 넘긴다. 이미 있는 이메일이면 관리자 권한만 붙인다.
 */
import { hash } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim() || '운영자';
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || password.length < 12) {
    throw new Error('ADMIN_EMAIL과 12자 이상의 ADMIN_PASSWORD가 필요합니다');
  }
  const prisma = new PrismaService();
  try {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, roles: true } });
    if (existing) {
      if (!existing.roles.includes('ADMIN')) {
        await prisma.user.update({ where: { id: existing.id }, data: { roles: { push: 'ADMIN' } } });
      }
      console.log(`기존 계정에 관리자 권한: ${email}`);
      return;
    }
    await prisma.user.create({ data: { email, displayName: name, passwordHash: await hash(password), roles: ['ADMIN'] } });
    console.log(`관리자 계정을 만들었습니다: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
