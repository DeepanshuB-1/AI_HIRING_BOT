"""Build iCalendar (.ics) event strings for interview slot confirmation emails."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def build_ics(summary: str, slot_dt: datetime, description: str = "", duration_minutes: int = 30) -> str:
    """Return a .ics file string for a 30-minute interview slot."""
    # Localise to IST then format as UTC for interoperability
    if slot_dt.tzinfo is None:
        slot_dt = slot_dt.replace(tzinfo=IST)
    slot_utc = slot_dt.astimezone(ZoneInfo("UTC"))
    end_utc = slot_utc + timedelta(minutes=duration_minutes)

    fmt = "%Y%m%dT%H%M%SZ"
    now_utc = datetime.utcnow().strftime(fmt)

    return (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//AI Hiring Bot//EN\r\n"
        "CALSCALE:GREGORIAN\r\n"
        "METHOD:REQUEST\r\n"
        "BEGIN:VEVENT\r\n"
        f"DTSTART:{slot_utc.strftime(fmt)}\r\n"
        f"DTEND:{end_utc.strftime(fmt)}\r\n"
        f"DTSTAMP:{now_utc}\r\n"
        f"SUMMARY:{summary}\r\n"
        f"DESCRIPTION:{description}\r\n"
        "STATUS:CONFIRMED\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
