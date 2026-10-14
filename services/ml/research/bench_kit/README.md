# 대본 흥행 예측 모델 비교 키트 (v1)

글(줄거리·소설 일부)만 보고 **같은 묶음 안에서** 어느 작품이 더 흥행했는지 맞히는 과제 셋입니다.
우리 쪽 기준 모델과 같은 잣대로 채점되니, 다른 임베딩 모델이나 학습기를 마음껏 시험해 보세요.
계획 전체: <https://github.com/zerohoon123/video-matching-platform/blob/feat/b-model-bench/docs/model-bench.md>

## 들어 있는 것

```
README.md          이 문서
MODELS.md          시험해 볼 만한 모델 목록 (컴퓨터 사양별)
NOTICE.md          자료 출처와 라이선스 (꼭 읽어 주세요)
bench_eval.py      채점기 (numpy만 필요)
example_baseline.py  예제: bge-m3 벡터 + 릿지로 개발용 교차검증·시험용 예측 만들기
embed.py           예제: 다른 임베딩 모델로 글을 벡터로 바꾸기 (sentence-transformers)
manifest.json      과제별 행 수
movies/ tv/ novels/
  dev.jsonl          개발용: id, group, eval_group, fold, log_len, y, score, text
  test.jsonl         시험용: id, group, eval_group, log_len, text   ← 정답 없음
  bge-m3_dev.npy     개발용 bge-m3 벡터 (float16, dev.jsonl 행 순서)
  bge-m3_test.npy    시험용 bge-m3 벡터
```

| 과제 | 글 | 정답 (`y`) | 묶음 |
|---|---|---|---|
| movies (주 과제) | 위키백과 영화 줄거리 | 박스오피스에서 연도·장르·상영 시간·언어·줄거리 길이 몫을 뺀 나머지가 같은 묶음 상위 1/3 | 대표 장르 × 5년 |
| tv (대조 과제) | 위키백과 에피소드 줄거리 | 다음 화 시청자 유지(시즌 흐름·방영 간격을 뺀 나머지)가 같은 시리즈 상위 1/3 | 시리즈 |
| novels (참고) | 공공 저작물 소설 20구간 × 앞 2,000자 | 영상화 여부 | 작가 (채점은 작가 × 장르) |

- `score`는 `y`를 만들기 전의 연속 점수입니다(소설은 `y`와 같음). 학습에 써도 됩니다.
- `log_len`은 글 길이입니다. 채점기가 점수에서 길이 몫을 빼므로, 길이로 맞히는 건 점수가 되지 않습니다.
- 지금까지 우리 결과(개발용 기준이 아니라 이전 분석): 영화 0.568, TV 0.498, 소설 0.636. 0.5 = 동전 던지기.

## 규칙 (중요)

1. **개발용에서만 고르고 맞추세요.** 모델·설정 비교는 반드시 `fold` 열(0~4)로 나눈 교차검증으로 합니다.
   fold k의 점수는 fold k를 빼고 학습한 모델이 낸 것이어야 합니다. 같은 묶음은 언제나 같은 fold에 있습니다.
2. 개발용 점수는 직접 잴 수 있습니다.
   ```bash
   python bench_eval.py movies/dev.jsonl my_movies_dev.csv     # CSV 열: id,score
   ```
3. **시험용 예측은 과제마다 최대 3번까지** 보내 주세요(개발용 전부로 학습한 모델로 `test.jsonl` 전 행에 점수). 실패한 것까지 모두 기록합니다.
   여러 번 낼수록 우연히 좋은 숫자가 나올 기회가 늘어서입니다. 보낼 때 모델 이름·설정·개발용 점수를 같이 적어 주세요.
4. 원본 박스오피스·시청자 수를 찾아보지 말아 주세요. 시험용 정답은 공개 자료에서 다시 만들 수 있지만, 그러면 실험이 무의미해집니다.
5. 점수는 높을수록 "흥행 쪽"입니다. 묶음 안 순서만 보므로 단위는 상관없습니다.

## 빠르게 시작

```bash
pip install numpy scikit-learn                      # 예제 실행에 필요
python example_baseline.py movies                   # → movies_ridge_dev.csv, movies_ridge_test.csv 와 개발용 점수 출력
pip install sentence-transformers                   # 다른 임베딩을 쓸 때
python embed.py movies intfloat/multilingual-e5-large-instruct --tag e5l --prefix "passage: "
python example_baseline.py movies --vectors e5l      # e5l_dev.npy / e5l_test.npy 로 같은 실험
```

## 이 키트에서 하지 않은 것

- 이야기 요소(우리가 정의한 18개 규칙 기반 요소)는 넣지 않았습니다. 순수하게 글 → 점수 모델만 비교합니다.
- 한국어 글은 없습니다(전부 영어). 제품은 한국어 대본을 다루므로, 다국어 모델이 영어에서 비슷하게 잘하면 다국어 모델을 고릅니다.
