FROM python:3.13-slim AS builder

ENV PIP_NO_CACHE_DIR=1
WORKDIR /build
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends build-essential libffi-dev \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY app ./app
RUN pip wheel --wheel-dir /wheels .

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 ponyo \
    && useradd --system --uid 10001 --gid ponyo --no-create-home --shell /usr/sbin/nologin ponyo
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
