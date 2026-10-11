import { expect, test } from "@playwright/test";
import { approveAllFor, login, SEED, signup, suffix as makeSuffix } from "./helpers";

test("대본을 고칠 때마다 AI 요약이 새로 만들어지고, 미리보기는 제작자에게만 보인다", async ({ browser, request }) => {
  const id = makeSuffix();
  const title = `미리보기 테스트 ${id}`;
  const writerEmail = `pvwriter-${id}@e2e.test`;
  const producerEmail = `pvproducer-${id}@e2e.test`;
  const writer = await signup(browser, { name: "미리보기작가", email: writerEmail, requested: ["대본 제공자"] });
  const producer = await signup(browser, { name: "미리보기제작자", email: producerEmail, requested: ["영상 제작자"] });
  await approveAllFor(request, writerEmail);
  await approveAllFor(request, producerEmail);

  // 1. 작성 → 임시 저장 → 첫 요약
  await writer.goto("/dashboard/scripts/new");
  await writer.getByLabel("제목").fill(title);
  await writer.getByLabel("장르").fill("드라마");
  await writer.getByLabel("로그라인 (한 줄 소개)").fill("첫 번째 로그라인");
  await writer.getByLabel("시놉시스 (공개)").fill("처음 버전의 시놉시스입니다. 주인공은 등대지기다.");
  await writer.getByLabel(/대본 전문/).fill("S#1. 등대 (밤)\n등대지기: 불을 켜.\n\nS#2. 바다 (새벽)\n선장: 보인다.");
  await writer.getByLabel("미리보기 본문").fill("S#1. 등대 (밤)\n등대지기: 불을 켜.");
  await writer.getByRole("button", { name: "임시 저장" }).click();
  await expect(writer.getByRole("heading", { name: "대본 편집" })).toBeVisible();

  const card = writer.getByRole("region", { name: "AI 요약" });
  await expect(card.getByText("처음 버전의 시놉시스입니다.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId("summary-generated-at")).not.toHaveText("-");
  await expect(card.getByTestId("content-updated-at")).not.toBeEmpty();

  // 2. 내용을 고치면 요약이 새로 만들어진다
  await writer.getByLabel("시놉시스 (공개)").fill("두 번째 버전의 시놉시스입니다. 등대지기는 떠난다.");
  await writer.getByRole("button", { name: "저장", exact: true }).click();
  await expect(writer.getByText("저장했습니다", { exact: false })).toBeVisible();
  await expect(card.getByText("두 번째 버전의 시놉시스입니다.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText("처음 버전의 시놉시스입니다.", { exact: false })).toHaveCount(0);

  // 3. 직접 새로고침
  await card.getByRole("button", { name: "AI 요약 새로고침" }).click();
  await expect(card.getByRole("button", { name: "AI 요약 새로고침" })).toBeEnabled({ timeout: 30_000 });
  await expect(card.getByText("두 번째 버전의 시놉시스입니다.", { exact: false })).toBeVisible();

  // 4. 공개
  await writer.getByLabel(/권리를 본인이 보유/).check();
  await writer.getByRole("button", { name: "공개하기" }).click();
  await expect(writer.getByRole("heading", { name: title })).toBeVisible();
  const scriptUrl = writer.url();
  await expect(writer.getByText("미리보기 대본이 있습니다", { exact: false })).toBeVisible();

  // 5. 영상 제작자: 열람 승인 전에도 미리보기는 보이고 전문은 안 보인다
  await producer.goto(scriptUrl);
  const preview = producer.getByRole("region", { name: "미리보기 대본" });
  await expect(preview.getByText("등대지기: 불을 켜.")).toBeVisible();
  await expect(producer.getByText("선장: 보인다.")).toHaveCount(0);
  await expect(producer.getByRole("region", { name: "AI 요약" }).getByText("두 번째 버전의 시놉시스입니다.", { exact: false })).toBeVisible();

  // 6. 일반 계정과 비로그인에게는 미리보기가 없다
  const member = await login(browser, SEED.member.email, SEED.member.password);
  await member.goto(scriptUrl);
  await expect(member.getByRole("heading", { name: title })).toBeVisible();
  await expect(member.getByRole("region", { name: "미리보기 대본" })).toHaveCount(0);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(scriptUrl);
  await expect(anon.getByRole("heading", { name: title })).toBeVisible();
  await expect(anon.getByRole("region", { name: "미리보기 대본" })).toHaveCount(0);
});
