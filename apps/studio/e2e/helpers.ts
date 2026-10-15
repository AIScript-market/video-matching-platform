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
  await page.getByLabel(/개인정보 처리방침에 동의/).check();
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("heading", { name: "내 계정" })).toBeVisible();
  return page;
}

/** 대본 상세에서 비밀유지 서약서를 읽고 이름을 입력해 서명하며 열람을 요청한다 */
export async function requestAccessWithNda(page: Page, name: string) {
  await page.getByRole("button", { name: "전문 열람 요청" }).click();
  const nda = page.getByRole("dialog", { name: "비밀유지 서약서" });
  await expect(nda.getByText("제1조 (목적)", { exact: false })).toBeVisible();
  await expect(nda.getByRole("button", { name: "서명하고 요청" })).toBeDisabled();
  await nda.getByLabel("서명할 이름 (활동명)").fill(name);
  await nda.getByLabel(/모두 읽고 이해했으며/).check();
  await nda.getByRole("button", { name: "서명하고 요청" }).click();
}

/** 계약서 화면(딜·계약 상세)에서 계약서에 적힌 이름으로 전자서명한다 */
export async function signContract(page: Page, name: string) {
  const form = page.getByRole("form", { name: "전자서명" }).first();
  await form.getByLabel(/계약서에 적힌 이름/).fill(name);
  await form.getByLabel(/모두 읽고 이해했으며/).check();
  await form.getByRole("button", { name: "서명하기" }).click();
}

/** 내 계정에서 소개를 쓰고 프로필·이메일을 공개한다 (이메일 공개는 선택이지만 공개 프로필 확인용으로 켠다) */
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
