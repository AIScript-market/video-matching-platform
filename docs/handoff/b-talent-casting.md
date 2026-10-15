# 출연자 등록·캐스팅 (feat/b-talent-casting)

## 흐름
```
일반 계정 → 출연자 프로필 → 본인인증 → 얼굴 스캔 업로드(암호화) → 실시간 셀카 대조 → 동의
  (미성년: 보호자 계정 본인인증·동의 → 관리자 관계 확인) → ACTIVE
딜 → 작품(Project) → 배역(장면 유형 태그) → 공개 오디션 지원 또는 직접 제안
  → 출연료 제안 ⇄ 역제안 → 수락 (미성년: 보호자 승인) → 출연 계약
  → 작품 등록(계약 범위 검사) → 출연분 확인 → 공개(AI 표시 확인)
  → 내림 요청·관리자 판단·합의 / 철회·원본 삭제 / 조기 종료
```

## API (Swagger 태그 talent, casting, works, admin)
| 영역 | 경로 |
|---|---|
| 본인인증 | `POST·GET /identity-verification` |
| 출연자 | `POST /talent/profile`, `GET·PATCH /talent/me`, `POST /talent/me/assets`(multipart), `DELETE /talent/me/assets/:id`, `POST /talent/me/liveness`(multipart), `POST /talent/me/consent`, `GET /talent/me/access-logs`, `POST /talent/me/withdraw`, `POST /talent/me/withdraw/cancel`, `GET /talent`, `GET /talent/:id` |
| 원본 | `GET /likeness/assets/:id/content` |
| 보호자 | `POST /guardian/wards/:talentId/consent`, `GET /guardian/wards` |
| 캐스팅 | `POST·GET /deals/:dealId/project`, `GET /projects`, `GET /projects/:id`, `POST·GET /projects/:id/roles`, `GET /casting/roles`, `POST /casting/roles/:id/applications`, `POST /casting/roles/:id/invitations`, `GET /casting/negotiations`, `GET /casting/negotiations/:id`, `POST /casting/negotiations/:id/offers`, `POST /casting/offers/:id/accept`, `POST /casting/offers/:id/guardian-decision` |
| 계약 | `GET /casting/contracts`, `GET /casting/contracts/:id`, `GET /casting/contracts/:id/early-termination-quote` |
| 작품 | `POST·GET /projects/:id/works`, `GET /works`, `GET /works/:id`, `POST /works/:id/approve`, `POST /works/:id/publish` |
| 내림 | `POST /works/:id/takedowns`, `GET /takedowns`, `POST /takedowns/:id/settle` |
| 관리자 | `GET /admin/talent/guardian-checks`, `POST /admin/talent/:id/guardian-verified`, `POST /admin/takedowns/:id/decide`, `POST /admin/casting/contracts/:id/terminate` |

## 시범 데이터 (시드)
- `talent1@vmp.dev` 배우 한별, `talent2@vmp.dev` 일반인 도윤, `kid1@vmp.dev` 아역 서아(14세) — 비밀번호 `talent1234!`
- `guardian1@vmp.dev` 서아의 보호자 — `guardian1234!`
- "마지막 열차" 딜(김작가·박제작) → 작품 "마지막 열차 (유튜브 6부작)"
  - 정수 역: 한별과 계약됨, 1화 초안이 한별의 출연분 확인을 기다림
  - 수아 역(미성년): 서아에게 회당 5만 원 × 6회 제안, 보호자 승인 대기
  - 마지막 승객: 공개 오디션

## 남은 일
- 웹 화면 (다음 PR)
- 실제 본인인증·셀카 provider, 원본 저장소 KMS·S3 이전, 출연료 실제 지급과 장부 연결
- 변호사 검토: 조기 종료 보상 기본값, 철회 기준, 미성년자 계약, 동의 문구
