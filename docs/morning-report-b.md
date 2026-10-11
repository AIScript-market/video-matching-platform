# 진행 보고 (영훈)

## 완료
- **B 파트**: scripts, access, negotiations(메시지·제안), deals, ledger API + AI 요약 워커
- **A 파트도 구현** (`feat/b-fullstack`): pnpm 워크스페이스, 계약 ERD 스키마·마이그레이션·시드, 인증(argon2id + JWT, httpOnly 쿠키), 관리자 API, Swagger(`/docs`)·openapi.json, 웹(`apps/studio`), 개발 스택(`ops/compose.yaml`), CI
- 파트너 작업과 경로가 겹치지 않게 했다 (`apps/studio`, `src/core`, `modules/identity`, `modules/backoffice`, `ops/`)
- 실제로 띄워 검증:
  - API 테스트 25개 (단위·DB 통합·Redis 통합·실제 인증 e2e), 워커 테스트 3개
  - lint·타입 검사·프로덕션 빌드(api, worker, studio) 통과
  - Playwright e2e: 가입 → 대본 작성·공개 → AI 요약 → NDA 열람 요청·승인 → 채팅 → 제안·역제안·수락 → 딜, 3회 연속 통과
  - 브라우저에서 탐색·관리자 화면과 장부 기록 확인

## 실행
```bash
docker compose -f ops/compose.yaml up --build
```
http://localhost:3000 · 시드 계정 비밀번호 `password1234` (README 참고)

## 남은 일
1. `feat/b-fullstack` PR 머지: `prisma/`와 `.github/`을 바꿔서 CODEOWNERS 규칙상 **varevstudio의 Approve**가 필요하다
2. 파트너가 자기 A 작업을 올리면 중복 기능(`/auth/*` 등) 중 어느 쪽을 남길지 정하기 — `docs/handoff/b-done.md` 참고
3. PR #3(머지된 브랜치 정기 삭제)도 파트너 승인 대기
4. 실제 Claude 요약을 쓰려면 `.env`에 `ANTHROPIC_API_KEY` 설정 (지금은 mock 요약기)
