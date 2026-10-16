import { expect, test } from "@playwright/test";
import { creator, login, SEED, signup, suffix } from "./helpers";

test("계정 신고 → 관리자가 신고된 계정·신고 목록 확인 → 기각·정지하고 처리", async ({ browser }) => {
  const id = suffix();
  const badEmail = `reported-${id}@e2e.test`;
  const bad = await creator(browser, { name: `신고대상${id}`, email: badEmail });
  const badId = new URL(
    (await bad.goto("/account").then(() => bad.getByRole("link", { name: "내 공개 프로필 보기" }).getAttribute("href")))!,
    "http://x",
  ).pathname;

  // 본인 프로필에는 신고 버튼이 없다
  await bad.goto(badId);
  await expect(bad.getByRole("region", { name: "공개 프로필" })).toBeVisible();
  await expect(bad.getByRole("button", { name: "🚩 신고" })).toHaveCount(0);

  // 신고자 1: 공개 프로필에서 신고 (사기)
  const r1 = await signup(browser, { name: `신고자1${id}`, email: `rep1-${id}@e2e.test` });
  await r1.goto(badId);
  await r1.getByRole("button", { name: "🚩 신고" }).click();
  const dialog = r1.getByRole("dialog");
  await dialog.getByLabel("사기·금전 요구").check();
  await dialog.getByLabel(/내용/).fill("선급금을 개인 계좌로 먼저 보내라고 했습니다.");
  await dialog.getByRole("button", { name: "신고하기" }).click();
  await expect(dialog.getByText("신고가 접수되었습니다")).toBeVisible();
  await dialog.getByRole("button", { name: "닫기" }).click();
  // 같은 계정을 처리 전에 다시 신고할 수 없다
  await r1.getByRole("button", { name: "🚩 신고" }).click();
  await r1.getByRole("dialog").getByRole("button", { name: "신고하기" }).click();
  await expect(r1.getByRole("dialog").getByText("이미 접수되어", { exact: false })).toBeVisible();

  // 신고자 2: 기타 사유는 내용 필수
  const r2 = await login(browser, SEED.producer.email, SEED.producer.password);
  await r2.goto(badId);
  await r2.getByRole("button", { name: "🚩 신고" }).click();
  const d2 = r2.getByRole("dialog");
  await d2.getByLabel("스팸·홍보").check();
  await d2.getByLabel(/내용/).fill("같은 홍보 메시지를 계속 보냄");
  await d2.getByRole("button", { name: "신고하기" }).click();
  await expect(d2.getByText("신고가 접수되었습니다")).toBeVisible();

  // 관리자: 사용자 목록의 신고 수 → 해당 계정 신고 목록
  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await admin.goto("/admin");
  const users = admin.getByRole("region", { name: "사용자 관리" });
  await users.getByLabel("사용자 검색").fill(badEmail);
  await users.getByRole("button", { name: "검색" }).click();
  const userRow = users.getByRole("row").filter({ hasText: badEmail });
  await userRow.getByRole("link", { name: "2" }).click();
  const list = admin.getByRole("tabpanel", { name: "신고 목록" });
  await expect(list.getByRole("row").filter({ hasText: "사기·금전 요구" })).toBeVisible();
  await expect(list.getByRole("row").filter({ hasText: "스팸·홍보" })).toBeVisible();

  // 신고된 계정 탭에 보인다
  await admin.getByRole("tab", { name: /신고된 계정/ }).click();
  const accounts = admin.getByRole("tabpanel", { name: "신고된 계정" });
  const accountRow = accounts.getByRole("row").filter({ hasText: badEmail });
  await expect(accountRow).toContainText("사기·금전 요구");
  await accountRow.getByRole("button", { name: "신고 보기" }).click();

  // 스팸은 기각, 사기는 정지하고 처리
  const spamRow = list.getByRole("row").filter({ hasText: "스팸·홍보" });
  admin.once("dialog", (d) => d.accept("근거 부족"));
  await spamRow.getByRole("button", { name: "기각" }).click();
  // "처리 전" 필터라 기각된 신고는 목록에서 사라진다
  await expect(list.getByRole("row").filter({ hasText: "스팸·홍보" })).toHaveCount(0);
  const fraudRow = list.getByRole("row").filter({ hasText: "사기·금전 요구" });
  admin.once("dialog", (d) => d.accept("사기 시도 확인"));
  await fraudRow.getByRole("button", { name: "정지하고 처리" }).click();
  await expect(list.getByRole("row").filter({ hasText: "사기·금전 요구" })).toHaveCount(0);

  // 전체 보기에서 처리 결과 확인
  await list.getByLabel("처리 상태").selectOption("");
  await expect(list.getByRole("row").filter({ hasText: "사기·금전 요구" })).toContainText("사기 시도 확인");
  await expect(list.getByRole("row").filter({ hasText: "스팸·홍보" })).toContainText("근거 부족");

  // 신고된 계정 목록에서 빠지고, 계정은 정지됨
  await admin.getByRole("tab", { name: /신고된 계정/ }).click();
  await expect(accounts.getByRole("row").filter({ hasText: badEmail })).toHaveCount(0);
  await bad.goto("/account");
  await expect(bad.getByRole("button", { name: "로그아웃" })).toHaveCount(0);
});
