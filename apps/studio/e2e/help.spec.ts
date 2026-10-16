import { expect, test } from "@playwright/test";
import { login, SEED, signup, suffix } from "./helpers";

test("로그인하지 않아도 도움말을 열고 질문을 펼칠 수 있다", async ({ page }) => {
  await page.goto("/scripts");
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "도움말" }).click();
  await expect(page.getByRole("heading", { name: "도움말", level: 1 })).toBeVisible();
  const answer = page.getByText("제작자가 전문을 보려면 비밀유지 및 무단이용 금지 서약서에", { exact: false });
  await expect(answer).toBeHidden();
  await page.getByText("제 대본이 도용되지 않을까 걱정돼요.").click();
  await expect(answer).toBeVisible();
  const contact = page.getByRole("region", { name: "문의" });
  await expect(contact).toBeVisible();
  await contact.getByRole("link", { name: "문의 게시판으로 가기" }).click();
  await expect(page.getByRole("heading", { name: "문의 게시판" })).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인하고 문의하기" })).toBeVisible();
});

test("문의 게시판: 비밀 문의는 다른 사람에게 가려지고, 운영자가 답하면 답변 완료가 된다", async ({ browser }) => {
  const id = suffix();
  const title = `정산일 문의 ${id}`;
  const asker = await signup(browser, { name: "문의작성자", email: `asker-${id}@e2e.test` });

  // 1. 비밀 문의 쓰기 (기본이 비밀)
  await asker.goto("/help/inquiries");
  await asker.getByRole("button", { name: "문의하기" }).click();
  const form = asker.getByRole("form", { name: "문의 쓰기" });
  await form.getByLabel("분류").selectOption({ label: "계약·수익" });
  await form.getByLabel("제목").fill(title);
  await form.getByLabel("내용").fill("영상 수익은 언제 지급되나요?");
  await expect(form.getByLabel(/비밀 문의/)).toBeChecked();
  await form.getByRole("button", { name: "문의 올리기" }).click();
  await expect(asker.getByRole("heading", { name: title })).toBeVisible();
  await expect(asker.getByText("답변 대기")).toBeVisible();
  const url = asker.url();

  // 2. 다른 사람·비로그인에게는 제목이 가려지고 열 수 없다
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/help/inquiries");
  await expect(anon.getByText(title)).toHaveCount(0);
  await anon.goto(url);
  await expect(anon.getByText("문의를 찾을 수 없습니다")).toBeVisible();

  // 3. 운영자: 관리자 > 문의에서 찾아 답변 (이용자에게는 "운영자"로 보인다)
  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await admin.goto("/admin/inquiries");
  await admin.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: "문의" }).click();
  await admin.getByRole("link", { name: title }).click();
  await admin.getByLabel("답변").fill("구글이 확정한 수익이 들어온 달의 다음 달 말일까지 지급합니다.");
  await admin.getByRole("button", { name: "답변 올리기" }).click();
  await expect(admin.getByText("답변 완료")).toBeVisible();

  // 4. 작성자: 답변 확인 → 해결됨으로 닫기
  await asker.reload();
  const answer = asker.getByRole("region", { name: "운영자 답변" });
  await expect(answer.getByText("다음 달 말일까지 지급합니다", { exact: false })).toBeVisible();
  await asker.getByRole("button", { name: "해결됨으로 닫기" }).click();
  await expect(asker.getByText("해결됨")).toBeVisible();
  await asker.goto("/help/inquiries");
  await asker.getByLabel("내 문의만").check();
  await expect(asker.getByRole("link", { name: title })).toBeVisible();
});
