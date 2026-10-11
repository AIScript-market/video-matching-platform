import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nest DI는 데코레이터 메타데이터가 필요해서 esbuild 대신 SWC로 변환한다
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/*.int-spec.ts', 'test/**/*.e2e-spec.ts'],
    // DB를 공유하는 통합 테스트끼리 섞이지 않게 파일 단위로 순서대로 실행
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
