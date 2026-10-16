import { expect, test } from "@playwright/test";
import { coinBadge, creator, login, SEED, suffix as makeSuffix } from "./helpers";

test("AI 요약은 시놉시스로 만들고 시놉시스를 고칠 때마다 새로 만든다. 미리보기는 코인으로 열람권을 산 사람만 본다", async ({ browser }) => {
  const id = makeSuffix();
  const title = `미리보기 테스트 ${id}`;
  const writerEmail = `pvwriter-${id}@e2e.test`;
  const producerEmail = `pvproducer-${id}@e2e.test`;
  const writer = await creator(browser, { name: "미리보기작가", email: writerEmail });
  const producer = await creator(browser, { name: "미리보기제작자", email: producerEmail });

  // 1. 작성 → 임시 저장 → 첫 요약
  await writer.goto("/dashboard/scripts/new");
  await writer.getByLabel("제목").fill(title);
  await writer.getByLabel("장르").fill("드라마");
  await writer.getByLabel("로그라인 (한 줄 소개)").fill("첫 번째 로그라인");
  await writer.getByLabel("시놉시스 (공개)").fill("처음 버전의 시놉시스입니다. 주인공은 등대지기다.");
  await writer.getByLabel(/대본 전문/).fill("S#1. 등대 (밤)\n등대지기: 불을 켜.\n\nS#2. 바다 (새벽)\n선장: 보인다.");
  await writer.getByLabel("미리보기 본문").fill("S#1. 등대 (밤)\n등대지기: 불을 켜.");
  // 동의 항목은 펼쳐서 자세한 내용을 볼 수 있다
  const consents = writer.getByRole("region", { name: "확인과 동의" });
  await expect(consents.getByText("원작자에게 영상화 허락을")).toBeHidden();
  await consents.getByText("자세히 보기").first().click();
  await expect(consents.getByText("원작자에게 영상화 허락을", { exact: false })).toBeVisible();
  await expect(consents.getByLabel(/흥행 예측 기능 개선/)).toHaveCount(process.env.E2E_BETA ? 0 : 1);
  await expect(consents.getByLabel(/시놉시스로 AI 요약 만들기/)).toBeChecked(); // 새 대본은 켜져 있다
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
  await writer.getByLabel(/영상으로 만들도록 허락할 권리/).check();
  await writer.getByRole("button", { name: "공개하기" }).click();
  await expect(writer.getByRole("heading", { name: title })).toBeVisible();
  const scriptUrl = writer.url();
  await expect(writer.getByText("미리보기 대본이 있습니다", { exact: false })).toBeVisible();

  // 5. 다른 사용자: 미리보기는 열람권(3코인)을 사야 보인다. 전문은 여전히 안 보인다
  await producer.goto(scriptUrl);
  const preview = producer.getByRole("region", { name: "미리보기 대본" });
  await expect(preview.getByText("등대지기: 불을 켜.")).toHaveCount(0);
  await preview.getByRole("button", { name: "미리보기 열람 (3코인)" }).click();
  await expect(preview.getByText("등대지기: 불을 켜.")).toBeVisible();
  await expect(coinBadge(producer)).toHaveText("🪙 7");
  await expect(producer.getByText("선장: 보인다.")).toHaveCount(0);
  await producer.reload();
  await expect(producer.getByRole("region", { name: "미리보기 대본" }).getByText("등대지기: 불을 켜.")).toBeVisible();
  await expect(coinBadge(producer)).toHaveText("🪙 7"); // 다시 볼 때는 차감 없음

  // AI 요약은 공개 소개 글로 만들었으므로 제작자도 바로 본다
  const producerCard = producer.getByRole("region", { name: "AI 요약" });
  await expect(producerCard.getByText("두 번째 버전의 시놉시스입니다.", { exact: false })).toBeVisible();

  // 6. 프로필 비공개 계정은 프로필 공개 안내, 비로그인은 로그인 안내 (미리보기 본문은 안 보임)
  const member = await login(browser, SEED.member.email, SEED.member.password);
  await member.goto(scriptUrl);
  const memberPreview = member.getByRole("region", { name: "미리보기 대본" });
  await expect(memberPreview.getByRole("link", { name: "프로필 공개하러 가기" })).toBeVisible();
  await expect(member.getByText("등대지기: 불을 켜.")).toHaveCount(0);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(scriptUrl);
  await expect(anon.getByRole("link", { name: "로그인하고 미리보기 보기" })).toBeVisible();
  await expect(anon.getByText("등대지기: 불을 켜.")).toHaveCount(0);
});
