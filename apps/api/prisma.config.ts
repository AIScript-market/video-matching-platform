import { defineConfig } from 'prisma/config';

// DATABASE_URL은 docker-compose.yml에서 주입된다.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
