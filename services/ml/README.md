# ML 서비스 (`services/ml`)

대본 흥행 판단 모델. LLM API를 쓰지 않고, 대본을 벡터로 바꿔 우리 플랫폼의 작품 성과(조회수·좋아요·긍정 댓글)와 연결한 통계 모델이다.
설계와 원칙은 [docs/hit-model.md](../../docs/hit-model.md)에 있다.

```
대본 본문 ─ 장면 나누기 ─ 장면 벡터 ─ 대본 벡터 ┐
            └ 구조 특징 (장면 수, 대사 비율, 인물 수 …) ┴─ 우리 모델 → 상위 20% 성과일 확률 (+불확실성)
작품 성과 ─ 채널 크기 보정 ─ 정답 (상위 20%)  ──────────┘
```

## 구성

| 파일 | 역할 |
|---|---|
| `hitmodel/segment.py` | 장면 나누기, 대사·지문·인물 세기, 구조 특징 |
| `hitmodel/embedders.py` | 장면 → 벡터. 기본 문자 n그램 해시(학습·외부 API 없음), 선택 `bge-m3`(로컬 실행) |
| `hitmodel/labels.py` | 성과 → 정답. 채널 크기 보정, 상위 20% |
| `hitmodel/model.py` | 주성분 + L2 로지스틱 회귀 + 부트스트랩, 시간 순서 검증, 장르 평균 기준선 |
| `hitmodel/neighbors.py` | 비슷한 성공작 (모델 학습 전에도 쓸 수 있다) |
| `hitmodel/sentiment.py` | 댓글 감성 사전 기준선 (긍정 댓글 수 세기) |
| `hitmodel/service.py` | 위를 묶은 벡터화·학습·예측·추천 |
| `hitmodel/api.py` | HTTP API (내부 전용) |
| `hitmodel/pg_store.py` | PostgreSQL 읽기·쓰기. 테이블은 Prisma가 만든다 |

## 가능성 검증 도구 (`research/`)

크리에이터 제휴 파일럿 데이터로 "대본만 보고 같은 채널 안에서 잘될 영상을 가려낼 수 있는가"를 판정한다. 서비스와 따로 돌고, 제품 DB를 건드리지 않는다.
계획과 판정 기준은 [docs/feasibility-study.md](../../docs/feasibility-study.md).

| 파일 | 역할 |
|---|---|
| `research/studio_export.py` | 크리에이터가 내려받은 유튜브 스튜디오 표 데이터 CSV 읽기 (영어·한국어 열 이름) |
| `research/dataset.py` | 채널 폴더 읽기, 채널 안 비교 정답 |
| `research/feasibility.py` | 채널 빼고 맞히기·시간 순서 검증, 순열 검정, 판정, 표본 크기 |
| `research/blind.py` | 블라인드 테스트 문제지·정답지, 채점 |
| `research/synthetic.py` | 도구 확인용 가짜 데이터 |

```bash
python -m research synthetic research/out/demo-data && python -m research analyze research/out/demo-data
```

`research/data/`, `research/out/`은 저장소와 도커 이미지에 들어가지 않는다.

## HTTP API

`ML_TOKEN`을 정하면 `/health` 말고는 `x-ml-token` 헤더가 필요하다. API 서버와 워커만 내부 네트워크로 부른다.

| 경로 | 설명 |
|---|---|
| `GET /health` | 상태 |
| `GET /status` | 임베더, 벡터 수, 정답 있는 대본 수 / 필요한 수, 활성 모델 |
| `POST /embed/{scriptId}` | 대본 벡터 만들기 (본문이 그대로면 건너뜀, `?force=true`) |
| `POST /embed-stale` | 벡터가 없거나 본문이 바뀐 대본을 모두 벡터화 |
| `POST /train` | 학습. 정답 있는 대본이 `ML_MIN_TRAINING_PAIRS` 미만이면 `NOT_ENOUGH_DATA`. 장르 평균보다 못하면 저장만 하고 활성화하지 않는다 (`{"forceActivate": true}`로 강제) |
| `GET /predict/{scriptId}` | `MODEL`(확률·범위) / `NEIGHBORS`(비슷한 성공작) / `NOT_READY` |
| `POST /rank` | `{"scriptIds": [...], "limit": 20}` 추천 순서 |
| `POST /sentiment` | `{"comments": [...]}` 긍정·부정·중립 개수 (저장하지 않는다) |

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | (필수) | API와 같은 DB |
| `ML_EMBEDDER` | `hash-ngram` | `bge-m3`를 쓰려면 `requirements-bge.txt` 설치 |
| `ML_MIN_TRAINING_PAIRS` | `100` | 모델 학습에 필요한 정답 있는 대본 수 |
| `ML_NEIGHBOR_MIN` | `3` | 비슷한 성공작을 보여 주는 최소 정답 수 |
| `ML_MODEL_DIR` | `/models` | 학습한 모델 파일(`.npz`) 저장 위치 |
| `ML_TOKEN` | (없음) | 내부 호출 토큰 |

## 개발

```bash
docker build -t vmp-ml services/ml
docker run --rm -v "$PWD/services/ml:/srv" vmp-ml sh -c "ruff check . && pytest -q"
```

전체 스택(`pnpm up`)에서는 `ml` 서비스로 뜨고, API·워커가 `ML_URL=http://ml:8000`으로 부른다.
