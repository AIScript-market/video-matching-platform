import { defineConfig, devices } from "@playwright/test";

// 실행 중인 스택(ops/compose.yaml)에 붙어서 돈다. 주소는 E2E_BASE_URL로 바꿀 수 있다.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
});
