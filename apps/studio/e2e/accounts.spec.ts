import { expect, test } from "@playwright/test";
import { coinBadge, creator, login, makeCreator, requestAccessWithNda, SEED, signup, suffix } from "./helpers";

test("계정 종류는 일반·관리자, 정지된 계정은 로그인할 수 없다", async ({ browser }) => {
  const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "주 메뉴" });

  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await expect(nav(admin).getByRole("link", { name: "관리자" })).toBeVisible();
  await expect(nav(admin).getByRole("link", { name: "마이페이지" })).toHaveCount(0);

  const writer = await login(browser, SEED.writer.email, SEED.writer.password);
  await expect(nav(writer).getByRole("link", { name: "마이페이지" })).toBeVisible();
  await expect(nav(writer).getByRole("link", { name: "관리자" })).toHaveCount(0);
  await expect(coinBadge(writer)).toContainText("🪙");
  await writer.goto("/admin");
  await expect(writer.getByText("관리자 계정만 쓸 수 있습니다", { exact: false })).toBeVisible();

  // 프로필 비공개 일반 계정: 탐색은 되지만 창작 활동은 프로필 공개 안내
  const member = await login(browser, SEED.member.email, SEED.member.password);
  await member.goto("/dashboard");
  await expect(member.getByRole("link", { name: "프로필 공개하러 가기" })).toBeVisible();
  await member.goto("/scripts/seed_script_last_train");
  await expect(member.getByRole("link", { name: "프로필 공개하러 가기" }).first()).toBeVisible();

  // 정지된 계정
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(SEED.suspended.email);
  await page.getByLabel("비밀번호").fill(SEED.suspended.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("이용이 정지된 계정", { exact: false })).toBeVisible();
});

test("일반 가입 → 프로필·이메일 공개 → 대본 제공 가능, 공개 프로필에 이메일 표시", async ({ browser }) => {
  const id = suffix();
  const email = `pub-${id}@e2e.test`;
  const page = await signup(browser, { name: "공개테스트", email });
  await expect(coinBadge(page)).toHaveText("🪙 10");

  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "프로필 공개하러 가기" })).toBeVisible();

  await makeCreator(page, "공개 프로필 테스트 소개");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "내 대본", level: 1 })).toBeVisible();

  await page.goto("/account");
  await page.getByRole("link", { name: "내 공개 프로필 보기" }).click();
  const profile = page.getByRole("region", { name: "공개 프로필" });
  await expect(profile.getByText(email)).toBeVisible();
  await expect(profile.getByText("공개 프로필 테스트 소개")).toBeVisible();
});

test("관리자 정지 → 이용·재가입 차단 → 해제, 탈퇴 → 같은 이메일로 재가입", async ({ browser }) => {
  const id = suffix();
  const badEmail = `bad-${id}@e2e.test`;
  const leaveEmail = `leave-${id}@e2e.test`;
  const bad = await creator(browser, { name: `정지대상${id}`, email: badEmail });

  // 관리자: 사용자 검색 → 정지 (사유 입력)
  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await admin.goto("/admin");
  const users = admin.getByRole("region", { name: "사용자 관리" });
  await users.getByLabel("사용자 검색").fill(badEmail);
  await users.getByRole("button", { name: "검색" }).click();
  const row = users.getByRole("row").filter({ hasText: badEmail });
  admin.once("dialog", (d) => d.accept("스팸 메시지"));
  await row.getByRole("button", { name: "정지" }).click();
  await expect(row.getByText("사유: 스팸 메시지")).toBeVisible();

  // 정지된 사용자: 다음 요청부터 막힘, 같은 이메일로 가입 불가
  await bad.goto("/account");
  await expect(bad.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
  const again = await (await browser.newContext()).newPage();
  await again.goto("/signup");
  await again.getByLabel("이름(활동명)").fill("재가입");
  await again.getByLabel("이메일").fill(badEmail);
  await again.getByLabel("비밀번호 (8자 이상)").fill("password1234");
  await again.getByLabel(/개인정보 처리방침에 동의/).check();
  await again.getByRole("button", { name: "가입하기" }).click();
  await expect(again.getByText("정지된 이메일", { exact: false })).toBeVisible();

  // 해제
  await row.getByRole("button", { name: "정지 해제" }).click();
  await expect(row.getByText("정상")).toBeVisible();

  // 탈퇴 → 같은 이메일로 다시 가입
  const leaver = await signup(browser, { name: "탈퇴자", email: leaveEmail });
  const withdraw = leaver.getByRole("form", { name: "회원 탈퇴" });
  await withdraw.getByLabel("비밀번호 확인").fill("password1234");
  await expect(withdraw.getByRole("button", { name: "탈퇴하기" })).toBeDisabled();
  await withdraw.getByLabel("위 내용을 확인했고 탈퇴합니다").check();
  await withdraw.getByRole("button", { name: "탈퇴하기" }).click();
  await expect(leaver.getByRole("banner").getByRole("link", { name: "가입", exact: true })).toBeVisible();
  const reborn = await signup(browser, { name: "다시가입", email: leaveEmail });
  await expect(coinBadge(reborn)).toHaveText("🪙 10");
});

test("코인: 구매(테스트 결제), 메시지마다 차감, 부족하면 충전 안내", async ({ browser }) => {
  const id = suffix();
  const writer = await creator(browser, { name: `코인작가${id}`, email: `cw-${id}@e2e.test` });
  const producer = await creator(browser, { name: `코인제작${id}`, email: `cp-${id}@e2e.test` });

  // 작가: 대본 작성·공개 (직접 작성은 무료)
  const title = `코인 테스트 ${id}`;
  await writer.goto("/dashboard/scripts/new");
  await writer.getByLabel("제목").fill(title);
  await writer.getByLabel("장르").fill("드라마");
  await writer.getByLabel("로그라인 (한 줄 소개)").fill("코인 테스트 로그라인");
  await writer.getByLabel("시놉시스 (공개)").fill("코인 테스트 시놉시스입니다.");
  await writer.getByLabel(/대본 전문/).fill("S#1. 테스트");
  await writer.getByRole("button", { name: "임시 저장" }).click();
  await expect(writer.getByRole("heading", { name: "대본 편집" })).toBeVisible();
  await writer.getByLabel(/권리를 본인이 보유/).check();
  await writer.getByRole("button", { name: "공개하기" }).click();
  await expect(writer.getByRole("heading", { name: title })).toBeVisible();
  const scriptUrl = writer.url();

  // 제작자: 열람 요청 → 승인 → 협상 시작
  await producer.goto(scriptUrl);
  await requestAccessWithNda(producer, "제작자");
  await writer.goto("/dashboard");
  await writer.getByRole("row", { name: new RegExp(title) }).getByRole("button", { name: "승인" }).click();
  await producer.reload();
  await producer.getByRole("button", { name: "작가와 협상 시작" }).click();
  await expect(producer.getByRole("heading", { name: "대화" })).toBeVisible();

  // 메시지 1건 = 1코인 (10 → 9)
  await producer.getByLabel("메시지").fill("첫 메시지");
  await producer.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(producer.getByText("첫 메시지")).toBeVisible();
  await expect(coinBadge(producer)).toHaveText("🪙 9");

  // 나머지 9코인을 다 쓰면 부족 안내
  for (let i = 0; i < 9; i++) {
    await producer.getByLabel("메시지").fill(`메시지 ${i}`);
    await producer.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(producer.getByText(`메시지 ${i}`, { exact: true })).toBeVisible();
  }
  await expect(coinBadge(producer)).toHaveText("🪙 0");
  await producer.getByLabel("메시지").fill("코인 없음");
  await producer.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(producer.getByText("코인이 부족합니다", { exact: false })).toBeVisible();
  await producer.getByRole("link", { name: "코인 충전하기 →" }).click();

  // 테스트 결제로 구매
  const coins = producer.getByRole("region", { name: "코인" });
  await coins.getByRole("button", { name: "구매" }).first().click();
  await expect(coins.getByTestId("wallet-balance")).toHaveText("🪙 10코인");
  await expect(coinBadge(producer)).toHaveText("🪙 10");
  await expect(coins.getByRole("cell", { name: "구매" })).toBeVisible();
});
