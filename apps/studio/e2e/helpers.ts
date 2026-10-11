import { expect, type Browser, type Page } from "@playwright/test";

export const suffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

export const SEED = {
  admin: { email: "admin@vmp.dev", password: "admin1234!" },
  writer: { email: "writer1@vmp.dev", password: "writer1234!" },
  producer: { email: "producer1@vmp.dev", password: "producer1234!" },
  member: { email: "member1@vmp.dev", password: "member1234!" },
  suspended: { email: "suspended1@vmp.dev", password: "member1234!" },
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

/** 화면에서 일반 계정으로 가입한다 (가입 후 '내 계정'으로 이동) */
export async function signup(browser: Browser, opts: { name: string; email: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/signup");
  await page.getByLabel("이름(활동명)").fill(opts.name);
  await page.getByLabel("이메일").fill(opts.email);
  await page.getByLabel("비밀번호 (8자 이상)").fill("password1234");
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("heading", { name: "내 계정" })).toBeVisible();
  return page;
}

/** 내 계정에서 소개를 쓰고 프로필·이메일을 공개한다 (대본 제공·영상 제작 가능 상태) */
export async function makeCreator(page: Page, bio = "영상화를 기다리는 이야기를 씁니다.") {
  await page.goto("/account");
  const profile = page.getByRole("form", { name: "프로필" });
  await profile.getByLabel("소개").fill(bio);
  await profile.getByLabel("프로필 공개").check();
  await profile.getByLabel(/이메일 공개/).check();
  await profile.getByRole("button", { name: "프로필 저장" }).click();
  await expect(profile.getByText("대본 제공·영상 제작 가능")).toBeVisible();
}

/** 가입 + 프로필 공개 */
export async function creator(browser: Browser, opts: { name: string; email: string }) {
  const page = await signup(browser, opts);
  await makeCreator(page);
  return page;
}

export const coinBadge = (page: Page) => page.getByTestId("coin-balance");
