"""Sample meetings so the dashboard is never empty on a fresh database."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import ChatMessage, Meeting, Participant, User
from app.service import utcnow


def _local_at(days: int, hour: int, minute: int = 0) -> datetime:
    local = datetime.now().astimezone() + timedelta(days=days)
    local = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def _hours_ahead(hours: int) -> datetime:
    when = datetime.now(timezone.utc) + timedelta(hours=hours)
    return when.replace(minute=0, second=0, microsecond=0, tzinfo=None)


def seed(db: Session) -> None:
    old = db.query(User).filter_by(email="alex.morgan@example.com").first()
    if old:
        old.name = "Harshit Kamra"
        old.email = "harshit.kamra@example.com"
        for row in db.query(Meeting).filter(Meeting.host_id == old.id).all():
            row.title = row.title.replace("Alex Morgan", "Harshit Kamra")
        for row in db.query(Participant).filter_by(display_name="Alex Morgan").all():
            row.display_name = "Harshit Kamra"
        for row in db.query(ChatMessage).filter_by(sender_name="Alex Morgan").all():
            row.sender_name = "Harshit Kamra"
        db.commit()
        return
    if db.query(User).filter_by(email="harshit.kamra@example.com").first():
        return

    now = utcnow()
    alex = User(
        name="Harshit Kamra",
        email="harshit.kamra@example.com",
        personal_meeting_code="84219304412",
        avatar_color="#0E72ED",
        created_at=now,
    )
    sam = User(
        name="Sam Rivera",
        email="sam.rivera@example.com",
        personal_meeting_code="89011223344",
        avatar_color="#F26D21",
        created_at=now,
    )
    db.add_all([alex, sam])
    db.flush()

    def meeting(**kwargs) -> Meeting:
        fields = {
            "host_key": secrets.token_urlsafe(24),
            "created_at": now,
            "description": "",
            "is_instant": False,
            "is_personal": False,
        }
        fields.update(kwargs)
        row = Meeting(**fields)
        db.add(row)
        return row

    meeting(
        code="84219304412",
        title="Harshit Kamra's Personal Meeting Room",
        host_id=alex.id,
        host=alex,
        passcode="123456",
        scheduled_at=None,
        duration_minutes=60,
        status="scheduled",
        is_personal=True,
    )
    meeting(
        code="89011223344",
        title="Sam Rivera's Personal Meeting Room",
        host_id=sam.id,
        host=sam,
        passcode="654321",
        scheduled_at=None,
        duration_minutes=60,
        status="scheduled",
        is_personal=True,
    )
    meeting(
        code="84729133011",
        title="Design sync",
        description="Review the meeting UI and the join flow.",
        host_id=alex.id,
        host=alex,
        passcode="482193",
        scheduled_at=_hours_ahead(2),
        duration_minutes=30,
        status="scheduled",
    )
    meeting(
        code="85910228473",
        title="Customer onboarding",
        description="Walk the new workspace with the pilot team.",
        host_id=alex.id,
        host=alex,
        passcode="220198",
        scheduled_at=_hours_ahead(5),
        duration_minutes=45,
        status="scheduled",
    )
    meeting(
        code="86300192847",
        title="Sprint planning",
        description="Pick the next slice of meeting controls.",
        host_id=alex.id,
        host=alex,
        passcode="771540",
        scheduled_at=_local_at(1, 10, 0),
        duration_minutes=60,
        status="scheduled",
    )
    meeting(
        code="87123450918",
        title="1:1 with Sam",
        host_id=alex.id,
        host=alex,
        passcode="330291",
        scheduled_at=_local_at(3, 15, 0),
        duration_minutes=30,
        status="scheduled",
    )

    standup_start = _local_at(-1, 9, 30)
    standup = meeting(
        code="81400293817",
        title="Daily standup",
        host_id=alex.id,
        host=alex,
        passcode="918273",
        scheduled_at=standup_start,
        duration_minutes=15,
        status="ended",
        started_at=standup_start,
        ended_at=standup_start + timedelta(minutes=15),
    )
    review_start = _local_at(-2, 14, 0)
    meeting(
        code="82555120934",
        title="Product review",
        host_id=alex.id,
        host=alex,
        passcode="564738",
        scheduled_at=review_start,
        duration_minutes=45,
        status="ended",
        started_at=review_start,
        ended_at=review_start + timedelta(minutes=40),
    )
    interview_start = _local_at(-5, 11, 0)
    meeting(
        code="83667019283",
        title="Interview — frontend",
        host_id=alex.id,
        host=alex,
        passcode="102938",
        scheduled_at=interview_start,
        duration_minutes=45,
        status="ended",
        started_at=interview_start,
        ended_at=interview_start + timedelta(minutes=45),
    )
    db.flush()

    alex_row = Participant(
        meeting_id=standup.id,
        user_id=alex.id,
        display_name=alex.name,
        role="host",
        token=secrets.token_urlsafe(24),
        audio_on=True,
        video_on=True,
        kicked=False,
        joined_at=standup_start,
        left_at=standup_start + timedelta(minutes=15),
    )
    sam_row = Participant(
        meeting_id=standup.id,
        user_id=sam.id,
        display_name=sam.name,
        role="participant",
        token=secrets.token_urlsafe(24),
        audio_on=True,
        video_on=False,
        kicked=False,
        joined_at=standup_start,
        left_at=standup_start + timedelta(minutes=15),
    )
    db.add_all([alex_row, sam_row])
    db.flush()
    db.add_all(
        [
            ChatMessage(
                meeting_id=standup.id,
                sender_participant_id=sam_row.id,
                sender_name=sam.name,
                body="Shipping the join dialog today.",
                sent_at=standup_start + timedelta(minutes=2),
            ),
            ChatMessage(
                meeting_id=standup.id,
                sender_participant_id=alex_row.id,
                sender_name=alex.name,
                body="I'll take the meeting controls.",
                sent_at=standup_start + timedelta(minutes=3),
            ),
        ]
    )
    db.commit()
