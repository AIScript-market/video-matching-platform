import { expect, test } from "@playwright/test";
import { creator, login, requestAccessWithNda, SEED, signContract, suffix as makeSuffix } from "./helpers";

const suffix = makeSuffix();

test("대본 제공자와 제작자가 대본으로 매칭되어 딜이 만들어진다", async ({ browser }) => {
  // 가입부터 정산·지급까지 이어지는 긴 흐름이라 기본 제한(90초)보다 길게 둔다
  test.setTimeout(180_000);
  const title = `E2E 대본 ${suffix}`;

  // 0. 일반 가입 → 프로필·이메일 공개
  const writer = await creator(browser, { name: "작가E2E", email: `writer-${suffix}@e2e.test` });
  const producer = await creator(browser, { name: "제작자E2E", email: `producer-${suffix}@e2e.test` });

  // 1. 대본 작성 → 권리 진술 → 공개
  await writer.goto("/dashboard/scripts/new");
  await writer.getByLabel("제목").fill(title);
  await writer.getByLabel("장르").fill("스릴러");
  await writer.getByLabel("로그라인 (한 줄 소개)").fill("사라진 동생을 찾는 형사의 마지막 72시간");
  await writer.getByLabel("시놉시스 (공개)").fill("형사 민준은 동생이 사라진 밤의 기록을 다시 쫓는다. 단서는 오래된 지하철역에 남아 있다.");
  await writer.getByLabel(/대본 전문/).fill("S#1. 지하철역 (밤)\n민준: 여기서 마지막으로 봤어.");
  await writer.getByRole("button", { name: "임시 저장" }).click();
  await expect(writer.getByRole("heading", { name: "대본 편집" })).toBeVisible();
  await writer.getByLabel(/권리를 본인이 보유/).check();
  await writer.getByRole("button", { name: "공개하기" }).click();
  await expect(writer.getByRole("heading", { name: title })).toBeVisible();

  // 2. AI 요약 (워커가 만들어 저장할 때까지 화면이 다시 불러온다)
  await expect(writer.getByText("예상 등급:")).toBeVisible({ timeout: 30_000 });
  const scriptUrl = writer.url();

  // 3. 제작자: 탐색에서 찾기 → NDA 동의 후 열람 요청
  await producer.goto("/scripts");
  await producer.getByRole("button", { name: "스릴러" }).click();
  await producer.getByRole("link", { name: new RegExp(title) }).click();
  await expect(producer.getByText("전문은 작가와 열람 승인을 받은 제작자만")).toBeVisible();
  await requestAccessWithNda(producer, "제작자E2E");
  await expect(producer.getByText("작가의 승인을 기다리고 있습니다")).toBeVisible();

  // 4. 작가가 대시보드에서 승인
  await writer.goto("/dashboard");
  const requestRow = writer.getByRole("row", { name: new RegExp(`${title}.*제작자E2E`) });
  await requestRow.getByRole("button", { name: "승인" }).click();
  await expect(requestRow.getByText("승인")).toBeVisible();

  // 5. 제작자: 전문 확인 → 협상 시작 → 채팅 → 제안
  await producer.goto(scriptUrl);
  await expect(producer.getByText("민준: 여기서 마지막으로 봤어.")).toBeVisible();
  await producer.getByRole("button", { name: "작가와 협상 시작" }).click();
  await expect(producer.getByRole("heading", { name: "대화" })).toBeVisible();
  const roomUrl = producer.url();
  await producer.getByLabel("메시지").fill("안녕하세요, 영상화하고 싶습니다.");
  await producer.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(producer.getByText("안녕하세요, 영상화하고 싶습니다.")).toBeVisible();

  await producer.getByLabel("작가 분배 비율").fill("40");
  await expect(producer.getByTestId("producer-share")).toHaveText("60%");
  await producer.getByLabel("선급금 (원)").fill("3000000");
  await producer.getByRole("button", { name: "제안 보내기" }).click();
  await expect(producer.getByText("상대방의 응답을 기다리는 중")).toBeVisible();

  // 6. 작가: 3초 폴링으로 메시지 수신 → 역제안
  await writer.goto(roomUrl);
  await expect(writer.getByText("안녕하세요, 영상화하고 싶습니다.")).toBeVisible();
  await writer.getByLabel("메시지").fill("조건을 조금 조정하고 싶어요.");
  await writer.getByRole("button", { name: "보내기", exact: true }).click();
  await writer.getByLabel("작가 분배 비율").fill("55");
  await writer.getByRole("button", { name: "역제안 보내기" }).click();
  await expect(writer.getByText("상대방의 응답을 기다리는 중")).toBeVisible();

  // 7. 제작자: 폴링으로 역제안을 받아 수락 → 딜
  await expect(producer.getByText("조건을 조금 조정하고 싶어요.")).toBeVisible();
  const current = producer.getByRole("region", { name: "현재 제안" });
  await expect(current.getByText("작가 55% / 제작자 45%")).toBeVisible();
  await current.getByRole("button", { name: "수락" }).click();
  await expect(producer.getByText("합의가 이루어져 딜이 만들어졌습니다")).toBeVisible();
  await producer.getByRole("link", { name: "딜 보기" }).click();
  await expect(producer.getByText("작가 55% / 제작자 45%").first()).toBeVisible();
  await expect(producer.getByText("영상화 권리 독점 이용")).toBeVisible();

  const dealUrl = producer.url();

  // 8. 작가의 '내 딜'에도 보인다
  await writer.goto("/deals");
  await expect(writer.getByRole("link", { name: new RegExp(title) })).toBeVisible();

  // 9. 대본 이용허락 계약: 작가·제작자가 서명하면 딜이 진행 중이 된다
  await writer.goto(dealUrl);
  const license = writer.getByRole("region", { name: "계약서" }).first();
  await expect(license.getByText("작가: 작가E2E — 55.00%")).toBeVisible();
  await expect(license.getByText("플랫폼: ", { exact: false }).first()).toBeVisible(); // 플랫폼도 당사자
  await signContract(writer, "작가E2E");
  await expect(license.getByText("서명 대기")).toHaveCount(1);
  await producer.reload();
  await signContract(producer, "제작자E2E");
  await expect(producer.getByText("서명 완료").first()).toBeVisible();
  await producer.reload();
  await expect(producer.getByText("진행 중").first()).toBeVisible();

  // 10. 제작자: 채널 게시 계약 서명 → 영상 파일을 저장소에 바로 올려 제출 (개발 저장소 S3Mock, docs/deploy.md)
  const videos = producer.getByRole("region", { name: "채널 영상" });
  await signContract(producer, "제작자E2E");
  const submit = videos.getByRole("form", { name: "영상 제출" });
  await submit.getByLabel("제목").fill(`${title} 1화`);
  await expect(submit.getByRole("radio", { name: "영상 파일 올리기" })).toBeChecked();
  await submit.getByLabel(/영상 파일 \(mp4/).setInputFiles({ name: "1화 최종.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(300_000, 1) });
  await expect(submit.getByText("1화 최종.mp4 · 300KB")).toBeVisible();
  await expect(submit.getByRole("button", { name: "제출하기" })).toBeDisabled();
  for (const label of [/음원은 모두/, /소재는 모두/, /출연자 전원/, /유료 광고 포함/]) await submit.getByLabel(label).check();
  await submit.getByRole("button", { name: "제출하기" }).click();
  await expect(videos.getByText("검수 대기")).toBeVisible();

  // 11. 관리자: 승인 → 게시 기록 → 지난달 확정 수익 기록
  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await admin.goto("/admin/videos");
  const card = admin.getByRole("region", { name: `${title} 1화` });
  await expect(card.getByText("검수용 파일: 1화 최종.mp4 · 300KB")).toBeVisible();
  // 서명 주소로 저장소에서 바로 받는다 (우리 서버를 거치지 않는다)
  const fileUrl = admin.waitForResponse((r) => r.url().includes(`/file?download=false`));
  await card.getByRole("button", { name: "재생" }).click();
  const { url } = await (await fileUrl).json();
  expect((await admin.request.get(url)).ok()).toBe(true);
  await card.getByRole("button", { name: "승인" }).click();
  await admin.getByRole("button", { name: "게시 대기" }).click();
  await card.getByPlaceholder("채널 이름").fill("스릴러 채널");
  await card.getByPlaceholder(/YouTube 영상 번호/).fill(`e2e${suffix}`.padEnd(11, "x").slice(0, 11));
  await card.getByRole("button", { name: "게시 기록" }).click();
  await admin.getByRole("button", { name: "게시됨" }).click();
  await expect(card.getByText("검수가 끝나 저장소에서 지웠습니다")).toBeVisible();
  expect((await admin.request.get(url)).status()).toBe(404);
  const d = new Date();
  const lastMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  await card.getByPlaceholder("정산 월 YYYY-MM").fill(lastMonth);
  await card.getByPlaceholder("확정 수익 (원)").fill("10001");
  await card.getByRole("button", { name: "수익 기록" }).click();
  await expect(admin.getByText(`${lastMonth} 수익을 기록했습니다`)).toBeVisible();

  // 12. 정산서: 작가 55% 내림(5,500원), 제작자 나머지(4,501원) → 관리자가 작가 지급 기록
  await admin.goto(dealUrl);
  const settlement = admin.getByRole("region", { name: "정산" });
  await expect(settlement.getByText("5,500원").first()).toBeVisible();
  await expect(settlement.getByText("4,501원").first()).toBeVisible();
  await settlement.getByRole("button", { name: "지급 기록" }).first().click();
  await expect(settlement.getByText("지급 5,500원")).toBeVisible();
  await writer.goto(dealUrl);
  await expect(writer.getByRole("region", { name: "정산" }).getByText("지급 5,500원")).toBeVisible();
});
