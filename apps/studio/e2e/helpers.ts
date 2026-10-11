import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const suffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export const SEED = {
  admin: { email: "admin@vmp.dev", password: "admin1234!" },
  writer: { email: "writer1@vmp.dev", password: "writer1234!" },
  producer: { email: "producer1@vmp.dev", password: "producer1234!" },
  member: { email: "member1@vmp.dev", password: "member1234!" },
};

export async function login(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
  return page;
}

/** 화면에서 가입한다. requested에 넣은 권한은 가입과 함께 신청된다 */
export async function signup(
  browser: Browser,
  opts: { name: string; email: string; requested?: Array<"대본 제공자" | "영상 제작자"> },
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.getByLabel("이름(활동명)").fill(opts.name);
  await page.getByLabel("이메일").fill(opts.email);
  await page.getByLabel("비밀번호 (8자 이상)").fill("password1234");
  for (const role of opts.requested ?? []) await page.getByLabel(new RegExp(role)).check();
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("heading", { name: "내 계정" })).toBeVisible();
  return page;
}

/** 관리자 API로 이 이메일 사용자의 대기 중인 신청을 모두 승인한다 (매칭 흐름 테스트 준비용) */
export async function approveAllFor(request: APIRequestContext, email: string) {
  const login = await request.post("/api/auth/login", { data: SEED.admin });
  expect(login.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  const pending = await (await request.get("/api/admin/role-requests?status=PENDING", { headers })).json();
  for (const r of pending as Array<{ id: string; user: { email: string } }>) {
    if (r.user.email === email) {
      expect((await request.post(`/api/admin/role-requests/${r.id}/approve`, { headers })).ok()).toBeTruthy();
    }
  }
}
