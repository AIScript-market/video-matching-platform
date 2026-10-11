# ML 서비스 (개발·운영 공용). 개발에서는 ops/compose.yaml이 소스를 볼륨으로 덮어쓴다.
FROM python:3.12-slim

WORKDIR /srv
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .

ENV ML_MODEL_DIR=/models
EXPOSE 8000
CMD ["uvicorn", "hitmodel.main:app", "--host", "0.0.0.0", "--port", "8000"]
