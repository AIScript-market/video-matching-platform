# 시험해 볼 만한 모델

우리 노트북(CPU)에서는 bge-m3 한 번 벡터화에 과제마다 2시간 넘게 걸려서, 큰 모델은 친구 컴퓨터에 부탁합니다.
제품에 들어갈 수 있으려면 **상업적 이용이 되는 라이선스**여야 합니다. 받기 전에 모델 카드에서 라이선스를 다시 확인해 주세요(아래는 2026년 기준 기억이라 바뀌었을 수 있습니다).
더 새 모델이 있으면 MTEB 순위표(<https://huggingface.co/spaces/mteb/leaderboard>)의 다국어 분류·군집 항목을 참고해 주세요.

## 1. 다른 임베딩 모델 (가장 먼저 해 볼 것)

`embed.py`로 벡터를 만들고 `example_baseline.py --vectors 태그`로 같은 릿지 실험을 하면 표현만 바꾼 비교가 됩니다.

| 모델 | 크기 | 라이선스 | 필요 사양 | 메모 |
|---|---|---|---|---|
| `intfloat/multilingual-e5-large-instruct` | 0.56B | MIT | GPU 6GB 또는 CPU(느림) | 글 앞에 `passage: ` |
| `Alibaba-NLP/gte-multilingual-base` | 0.3B | Apache-2.0 | CPU 가능 | `trust_remote_code` 필요 |
| `Snowflake/snowflake-arctic-embed-l-v2.0` | 0.57B | Apache-2.0 | GPU 6GB | 다국어 |
| `Qwen/Qwen3-Embedding-0.6B` | 0.6B | Apache-2.0 | GPU 6GB | 긴 글(최대 32k 토큰) |
| `Qwen/Qwen3-Embedding-4B` | 4B | Apache-2.0 | GPU 16GB | |
| `Qwen/Qwen3-Embedding-8B` | 8B | Apache-2.0 | GPU 24GB | 기대가 가장 큼 |
| `nvidia/NV-Embed-v2`, `jinaai/jina-embeddings-v3` | — | CC BY-NC (비상업) | — | **연구 비교용만**. 좋게 나와도 제품에는 못 씀 |

- bge-m3는 앞 3,000자(소설은 구간마다 2,000자)만 봤습니다. 긴 글을 받는 모델(Qwen3)로 줄거리 전체를 넣어 보는 것도 좋은 비교입니다.
- 소설 `text`는 이미 20구간을 `[…]`로 이은 글입니다. 구간별로 나눠 벡터화한 뒤 평균 내는 쪽이 우리 방식과 같습니다.

## 2. 다른 학습기 (벡터는 그대로)

우리도 아래를 돌립니다(`docs/model-bench.md`): 주성분 16개 로지스틱(기준), 1,024차원 로지스틱, 릿지(점수), 묶음 안 릿지, 그래디언트 부스팅, kNN, TF-IDF 릿지, 혼합.
그 밖에 해 볼 만한 것:
- 묶음 안 짝 비교(pairwise ranking): 같은 묶음 안 두 편의 벡터 차이로 "누가 더 흥행했나"를 맞히는 로지스틱. LightGBM `lambdarank`(묶음 = query)도 같은 생각입니다.
- 작은 신경망(MLP) 위에 묶음 안 순위 손실.

## 3. 임베딩 모델 미세조정 (GPU 필요)

- bge-m3나 e5를 개발용 정답으로 미세조정: 같은 묶음 안 (흥행, 아닌 것) 짝으로 순위 손실(margin ranking)을 줍니다. fold마다 따로 학습해야 개발용 점수가 정직합니다.
- `microsoft/deberta-v3-base`(MIT) 같은 인코더를 회귀로 미세조정 (목표 = 묶음 안에서 중심화한 `score`).
- 과적합이 가장 쉬운 방법입니다. 개발용 5겹 점수가 0.6을 넘어도 시험용에서 확인될 때까지는 믿지 않습니다.

## 하지 않는 것

- LLM에게 "이 대본 흥행할까?"를 묻는 방식은 쓰지 않습니다(팀 결정: 우리 데이터로 만든 통계 모델로 판단한다).
