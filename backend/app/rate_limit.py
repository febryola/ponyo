import ipaddress

from fastapi import HTTPException, Request


async def enforce_rate_limit(request: Request, key: str, limit: int, window_seconds: int) -> None:
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        if request.app.state.environment == "production":
            raise HTTPException(status_code=503, detail="Rate limiting is temporarily unavailable.")
        return
    remote_ip = request.client.host if request.client else "unknown"
    # ECS tasks accept traffic only from the ALB; ALB appends the actual client as the last XFF hop.
    forwarded_for = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
    try:
        client = str(ipaddress.ip_address(forwarded_for)) if forwarded_for else remote_ip
    except ValueError:
        client = remote_ip
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
