from fastapi import HTTPException, Request


async def enforce_rate_limit(request: Request, key: str, limit: int, window_seconds: int) -> None:
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        if request.app.state.environment == "production":
            raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable.")
        return
    client = request.client.host if request.client else "unknown"
    bucket = f"ponyo:rate:{key}:{client}"
    try:
        count = await redis.incr(bucket)
        if count == 1:
            await redis.expire(bucket, window_seconds)
        if count > limit:
            raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")
    except HTTPException:
        raise
    except Exception:
        if request.app.state.environment == "production":
            raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable.") from None
