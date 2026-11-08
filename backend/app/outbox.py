import asyncio
import json
import logging
from datetime import datetime, timezone

import boto3
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import OutboxEvent

logger = logging.getLogger(__name__)


async def publish_outbox_events() -> None:
    if not settings.sqs_order_events_url:
        return
    sqs = boto3.client("sqs", region_name=settings.aws_region)
    while True:
        try:
            async with SessionLocal() as db:
                events = await db.scalars(
                    select(OutboxEvent)
                    .where(OutboxEvent.status == "pending")
                    .order_by(OutboxEvent.created_at)
                    .limit(10)
                    .with_for_update(skip_locked=True)
                )
                batch = list(events)
                for event in batch:
                    event.attempts += 1
                    try:
                        message = {
                            "eventId": str(event.id),
                            "eventType": event.event_type,
                            "occurredAt": event.created_at.isoformat(),
                            "data": event.payload,
                        }
                        await asyncio.to_thread(
                            sqs.send_message,
                            QueueUrl=settings.sqs_order_events_url,
                            MessageBody=json.dumps(message, separators=(",", ":")),
                        )
                        event.status = "published"
                        event.published_at = datetime.now(timezone.utc)
                    except Exception:
                        logger.exception("Outbox event publish failed", extra={"event_id": str(event.id)})
                await db.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Outbox polling iteration failed")
        await asyncio.sleep(2)
