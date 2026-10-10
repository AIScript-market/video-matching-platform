# Video Matching Platform

대본 작가와 영상 제작자를 연결하는 플랫폼. 이후 배우·성우의 얼굴과 목소리를 **동의와 라이선스에 근거해 합법적으로** 쓰는 기능과 정산 기능을 단계적으로 추가한다.

## 현재 범위 (MVP)

| 기능 | 내용 |
|---|---|
| 회원 | 작가(`WRITER`) / 제작자(`PRODUCER`) 역할로 가입 |
| 대본 | 작가가 대본을 등록하고 공개(`OPEN`)로 전환 |
| 제안 | 제작자가 공개된 대본에 제작 제안(메시지, 금액) |
| 매칭 | 작가가 제안을 수락하면 대본이 `MATCHED` 상태가 됨 |

AI 요약, 배우·성우 자산, 라이선스, 정산은 이후 단계. 전체 계획은 [docs/architecture.md](docs/architecture.md) 참고.

## 기술 스택

**TypeScript 하나로** 프론트엔드와 백엔드를 모두 만든다. 2명이 화면과 서버를 오가며 같이 개발할 수 있고, API 타입도 공유할 수 있다.

| 영역 | 기술 |
|---|---|
| 웹 | Next.js 16 (React 19) |
| API | NestJS 12 |
| DB | PostgreSQL 17 + Prisma 7 |
| 개발 환경 | Docker Compose (Node 24) |

## 시작하기

준비물: [Docker Desktop](https://www.docker.com/products/docker-desktop/)만 있으면 된다. 로컬에 Node를 설치하지 않아도 된다.

```bash
cp .env.example .env
docker compose up --build
```

처음 실행할 때는 패키지 설치 때문에 1~2분 걸린다. 준비되면:

| 주소 | 내용 |
|---|---|
| http://localhost:3000 | 웹 (첫 화면에 API·DB 연결 상태 표시) |
| http://localhost:4000/health | API 상태 확인 |
| `localhost:5432` | PostgreSQL (TablePlus, DBeaver 등으로 접속, 계정은 `.env` 참고) |

코드를 저장하면 웹과 API 모두 자동으로 다시 반영된다.

## 자주 쓰는 명령

```bash
docker compose up -d                    # 백그라운드로 실행
docker compose logs -f api web          # 로그 보기
docker compose down                     # 종료 (DB 데이터는 유지)
docker compose down -v                  # 종료 + DB 초기화
```

**DB 스키마 변경**: `apps/api/prisma/schema.prisma`를 고친 뒤

```bash
npm run db:migrate -- --name add_something
```

`apps/api/prisma/migrations/`에 마이그레이션 파일이 생긴다. 이 파일을 커밋하면 상대방은 `docker compose up`만 하면 자동으로 적용된다.

**패키지 추가**: 컨테이너 안에서 설치한다 (`package.json`과 `package-lock.json`이 갱신됨).

```bash
docker compose exec api npm install <패키지> -w api
docker compose exec api npm install <패키지> -w web
```

상대방은 pull 후 `docker compose up`을 하면 새 패키지가 자동 설치된다.

**에디터 자동완성**: 컨테이너와 별개로 내 컴퓨터에서도 `npm install`을 한 번 해두면 VS Code 등에서 타입 자동완성이 된다 (Node 24 이상).

## 폴더 구조

```
├─ apps/
│  ├─ web/                 # Next.js
│  └─ api/                 # NestJS
│     ├─ prisma/           # DB 스키마와 마이그레이션
│     └─ src/
│        ├─ prisma/        # DB 연결 (PrismaService)
│        └─ health/        # 상태 확인 API
├─ docker/dev.Dockerfile   # 개발용 Node 이미지
├─ docker-compose.yml
└─ docs/architecture.md    # 전체 설계와 로드맵
```

새 기능은 `apps/api/src/<기능>/` 아래에 NestJS 모듈로 추가한다 (예: `scripts/`, `proposals/`).

## PR과 자동 머지

`main`에는 직접 push할 수 없다. 기능 브랜치에서 PR을 올리면 다음 순서로 진행된다.

1. CI가 마이그레이션 적용, 스키마·마이그레이션 일치 확인, lint, 빌드를 실행한다.
2. CI를 통과하면 **자동으로 squash merge** 되고 브랜치가 삭제된다.
3. 단, 아래 경로를 바꾼 PR은 상대방이 Approve해야 머지된다 ([`.github/CODEOWNERS`](.github/CODEOWNERS)).
   - `apps/api/prisma/` (DB 스키마, 마이그레이션)
   - `.github/` (CI, 자동 머지 규칙)

아직 작업 중이라 머지되면 안 되는 PR은 **Draft**로 올린다. Draft는 자동 머지가 켜지지 않고, "Ready for review"를 누르면 그때 켜진다.

CI가 실패하면 PR 화면의 Checks 탭에서 원인을 보고 같은 브랜치에 고쳐서 push하면 된다. 통과하면 자동으로 머지된다.

## 협업 규칙

1. 기능 브랜치는 짧게(1~3일) 유지한다.
2. 리뷰가 필수는 아니지만, 상대방 코드에 영향을 주는 변경은 PR 설명에 적어둔다.
3. API를 바꿀 때는 요청·응답 형식을 PR 설명에 먼저 적고 합의한다.
4. 이미 머지된 DB 마이그레이션 파일은 수정하지 않는다. 고칠 게 있으면 새 마이그레이션을 만든다.
5. 비밀 키는 저장소에 커밋하지 않는다. `.env.example`만 커밋한다.
6. 개발 환경에 실제 배우의 얼굴·목소리 데이터를 넣지 않는다.
