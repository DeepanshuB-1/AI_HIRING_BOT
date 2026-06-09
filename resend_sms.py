import asyncio
from backend.config import settings
from backend.database import AsyncSessionLocal
from backend.models.candidate import Candidate, CandidateStatus
from backend.notifications.sms import send_sms
from backend.notifications.templates import consent_sms
from sqlalchemy import select


async def resend():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Candidate).where(Candidate.status == CandidateStatus.pending_review)
        )
        candidates = result.scalars().all()
        if not candidates:
            print("No pending_review candidates found.")
            return
        for c in candidates:
            consent_url = f"{settings.webhook_base_url}/voice/consent/{c.id}"
            msg = consent_sms(c.name, consent_url)
            print(f"Sending to {c.phone}")
            print(f"Message ({len(msg)} chars): {msg}")
            ok = send_sms(c.phone, msg)
            print(f"Result: {'Sent' if ok else 'Failed'}")

asyncio.run(resend())
