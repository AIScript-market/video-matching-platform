import { expect, test } from "@playwright/test";
import { coinBadge, creator, login, SEED, suffix as makeSuffix } from "./helpers";

test("대본가 파일 업로드 → 제작자 검토 후 메시지 → 관리자 로그", async ({ browser }) => {
  const id = makeSuffix();
  const title = `바다의 끝 ${id}`;
  const writerEmail = `upwriter-${id}@e2e.test`;
  const producerEmail = `upproducer-${id}@e2e.test`;
  const note = `검토했습니다(${id}). 통영 배경이 인상적이에요. 미팅 가능할까요?`;
  const writer = await creator(browser, { name: "업로드작가", email: writerEmail });
  const producer = await creator(browser, { name: "검토제작자", email: producerEmail });

  // 1. 대본가: 파일로 초안 만들기 → 정보 채우기 → 공개
  await writer.goto("/dashboard/scripts/new");
  await writer.getByLabel("대본 파일 올리기 (5코인)").setInputFiles({
    name: `${title}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from("S#1. 바다 (새벽)\r\n\r\n\r\n해원: 다시 왔어.\r\n"),
  });
  await expect(writer.getByRole("heading", { name: "대본 편집" })).toBeVisible();
  await expect(writer.getByLabel("제목")).toHaveValue(title);
  await expect(coinBadge(writer)).toHaveText("🪙 5"); // 업로드 5코인
  await expect(writer.getByLabel(/대본 전문/)).toHaveValue("S#1. 바다 (새벽)\n\n해원: 다시 왔어.");
  await writer.getByRole("button", { name: "+ 장면 머리글 추가" }).click();
  await expect(writer.getByText("장면 2개")).toBeVisible();
  await writer.getByLabel("장르").fill("드라마");
  await writer.getByLabel("로그라인 (한 줄 소개)").fill("10년 만에 고향 바다로 돌아온 해원의 이야기");
  await writer.getByLabel("시놉시스 (공개)").fill("서울에서 실패한 해원은 고향 통영으로 돌아와 아버지의 배를 다시 띄운다.");
  await writer.getByLabel(/권리를 본인이 보유/).check();
  await writer.getByRole("button", { name: "공개하기" }).click();
  await expect(writer.getByRole("heading", { name: title })).toBeVisible();
  const scriptUrl = writer.url();

  // 2. 제작자: 열람 요청 → 작가 승인 → 전문 검토 → 메시지
  await producer.goto(scriptUrl);
  await producer.getByRole("button", { name: "전문 열람 요청" }).click();
  const nda = producer.getByRole("dialog", { name: "비밀유지 동의 (NDA)" });
  await nda.getByLabel("위 내용에 동의합니다").check();
  await nda.getByRole("button", { name: "동의하고 요청" }).click();
  await writer.goto("/dashboard");
  await writer.getByRole("row", { name: new RegExp(`${title}.*검토제작자`) }).getByRole("button", { name: "승인" }).click();

  await producer.reload();
  await expect(producer.getByText("해원: 다시 왔어.")).toBeVisible();
  const review = producer.getByRole("form", { name: "검토 후 메시지" });
  await review.getByLabel("검토 메시지").fill(note);
  await review.getByRole("button", { name: "메시지 보내기 (1코인)" }).click();
  await expect(review.getByText("메시지를 보냈습니다")).toBeVisible();
  await expect(coinBadge(producer)).toHaveText("🪙 9");

  // 3. 대본가: 대시보드의 받은 메시지 → 답장
  await writer.goto("/dashboard");
  const inbox = writer.getByRole("region", { name: "받은 메시지" });
  await expect(inbox.getByText(note, { exact: false })).toBeVisible();
  await inbox.getByRole("link", { name: "답장하기" }).click();
  await expect(writer.getByText(note)).toBeVisible();

  // 4. 관리자: 활동 로그에서 메시지·열람·업로드 확인
  const admin = await login(browser, SEED.admin.email, SEED.admin.password);
  await admin.getByRole("navigation").getByRole("link", { name: "활동 로그" }).click();
  await admin.getByLabel("로그 검색").fill(title);
  await admin.getByRole("button", { name: "검색" }).click();
  const panel = admin.getByRole("tabpanel");
  await expect(panel.getByText(note)).toBeVisible();
  await expect(panel.getByText(producerEmail)).toBeVisible();
  await expect(panel.getByText(writerEmail)).toBeVisible();

  await admin.getByRole("tab", { name: "전문 열람" }).click();
  await expect(panel.getByText(producerEmail)).toBeVisible();

  await admin.getByRole("tab", { name: "대본 업로드" }).click();
  await expect(panel.getByText(`${title}.txt`)).toBeVisible();
  await expect(panel.getByText(writerEmail)).toBeVisible();

  await admin.getByRole("tab", { name: "코인" }).click();
  await admin.getByLabel("로그 검색").fill(writerEmail);
  await admin.getByRole("button", { name: "검색" }).click();
  await expect(panel.getByRole("row").filter({ hasText: "대본 업로드" })).toBeVisible();

  // 관리자가 아니면 로그 화면에 들어갈 수 없다
  await writer.goto("/admin/logs");
  await expect(writer.getByText("관리자 계정만 쓸 수 있습니다", { exact: false })).toBeVisible();
});
