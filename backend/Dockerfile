FROM python:3.13-alpine AS builder

ENV PIP_NO_CACHE_DIR=1
WORKDIR /build
RUN apk upgrade --no-cache \
    && apk add --no-cache build-base libffi-dev
COPY pyproject.toml ./
COPY app ./app
RUN pip wheel --wheel-dir /wheels .

FROM python:3.13-alpine AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 ponyo \
    && adduser -S -D -H -u 10001 -G ponyo ponyo
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl \
    && rm -rf /wheels \
    && chown -R ponyo:ponyo /app
COPY --from=builder --chown=ponyo:ponyo /build/app ./app
COPY --chown=ponyo:ponyo migrations ./migrations
COPY --chown=ponyo:ponyo alembic.ini ./alembic.ini
USER ponyo

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
