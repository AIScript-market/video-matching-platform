import { expect, test } from "@playwright/test";
import { login, SEED, signup, suffix } from "./helpers";

test("역할별 시드 계정은 메뉴와 접근 권한이 다르다", async ({ browser }) => {
  const nav = (page: import("@playwright/test").Page) => page.getByRole("navigation");

  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await expect(nav(admin).getByRole("link", { name: "관리자" })).toBeVisible();
  await admin.goto("/admin");
  await expect(admin.getByRole("heading", { name: /권한 신청/ })).toBeVisible();

  const writer = await login(browser, SEED.writer.email, SEED.writer.password);
  await expect(nav(writer).getByRole("link", { name: "제공자 대시보드" })).toBeVisible();
  await expect(nav(writer).getByRole("link", { name: "관리자" })).toHaveCount(0);
  await writer.goto("/admin");
  await expect(writer.getByText("관리자 권한이 필요합니다", { exact: false })).toBeVisible();

  const producer = await login(browser, SEED.producer.email, SEED.producer.password);
  await expect(nav(producer).getByRole("link", { name: "제공자 대시보드" })).toHaveCount(0);
  await producer.goto("/scripts/seed_script_last_train");
  await expect(producer.getByRole("button", { name: "전문 열람 요청" })).toBeVisible();

  const member = await login(browser, SEED.member.email, SEED.member.password);
  await expect(nav(member).getByRole("link", { name: "권한 신청" })).toBeVisible();
  await expect(member.getByText("일반", { exact: true })).toBeVisible();
  await member.goto("/dashboard");
  await expect(member.getByRole("link", { name: "대본 제공자 권한 신청하기" })).toBeVisible();
  await member.goto("/scripts/seed_script_last_train");
  await expect(member.getByRole("link", { name: "제작자 권한 신청" })).toBeVisible();
});

test("일반 가입 → 권한 신청 → 관리자 승인으로 제작자·제공자가 된다", async ({ browser }) => {
  const id = suffix();

  // 1. 일반으로 가입, 신청 없이 → 내 계정에서 제작자 권한 신청
  const user = await signup(browser, { name: "신청자", email: `applicant-${id}@e2e.test` });
  await expect(user.getByText("일반 계정입니다", { exact: false })).toBeVisible();
  await user.getByRole("button", { name: "영상 제작자 권한 신청" }).click();
  await expect(user.getByText("승인 대기 중")).toBeVisible();

  // 2. 가입하면서 대본 제공자 권한을 신청한 다른 사용자
  const writer = await signup(browser, { name: "제공자신청", email: `writer-${id}@e2e.test`, requested: ["대본 제공자"] });
  await expect(writer.getByText("승인 대기 중")).toBeVisible();

  // 3. 관리자가 두 신청을 승인
  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await admin.goto("/admin");
  const requests = admin.getByRole("region", { name: "권한 신청 관리" });
  for (const email of [`applicant-${id}@e2e.test`, `writer-${id}@e2e.test`]) {
    const row = requests.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "승인" }).click();
    await expect(row.getByText("승인", { exact: true })).toBeVisible();
  }

  // 4. 신청자는 제작자로 분기: 열람 요청 가능, 제공자 대시보드는 없음
  await user.goto("/account");
  await expect(user.getByRole("navigation").getByRole("link", { name: "내 계정" })).toBeVisible();
  await expect(user.getByText("보유 중")).toBeVisible();
  await user.goto("/scripts/seed_script_rooftop_kitchen");
  await expect(user.getByRole("button", { name: "전문 열람 요청" })).toBeVisible();

  // 5. 제공자 신청자는 대본 제공자로 분기: 대시보드에서 대본 작성 가능
  await writer.goto("/account");
  await expect(writer.getByRole("navigation").getByRole("link", { name: "제공자 대시보드" })).toBeVisible();
  await writer.getByRole("navigation").getByRole("link", { name: "제공자 대시보드" }).click();
  await expect(writer.getByRole("heading", { name: "대본 제공자 대시보드" })).toBeVisible();
  await expect(writer.getByRole("link", { name: "+ 새 대본" })).toBeVisible();
});
