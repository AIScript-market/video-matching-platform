import { expect, test } from "@playwright/test";

test("로그인하지 않아도 도움말을 열고 질문을 펼칠 수 있다", async ({ page }) => {
  await page.goto("/scripts");
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "도움말" }).click();
  await expect(page.getByRole("heading", { name: "도움말", level: 1 })).toBeVisible();
  const answer = page.getByText("제작자가 전문을 보려면 비밀유지 및 무단이용 금지 서약서에", { exact: false });
  await expect(answer).toBeHidden();
  await page.getByText("제 대본이 도용되지 않을까 걱정돼요.").click();
  await expect(answer).toBeVisible();
  await expect(page.getByRole("region", { name: "문의" })).toBeVisible();
});
