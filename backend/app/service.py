"""Meeting rules: create, join, end, and the shape sent to the client."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import ChatMessage, Meeting, Participant, User
from app.schemas import CreateMeetingIn, JoinIn, MeetingOut

# ponytail: full-mesh WebRTC. Six people is the ceiling; an SFU is the upgrade path.
MAX_PARTICIPANTS = 6


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def as_utc_naive(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_code(raw: str) -> str:
    return "".join(ch for ch in raw if ch.isdigit())


def format_code(code: str) -> str:
    if len(code) == 11:
        return f"{code[:3]} {code[3:7]} {code[7:]}"
    if len(code) == 10:
        return f"{code[:3]} {code[3:6]} {code[6:]}"
    if len(code) == 9:
        return f"{code[:3]} {code[3:6]} {code[6:]}"
    return code


def digits(raw: str | None) -> str:
    return "".join(ch for ch in (raw or "") if ch.isdigit())


def keys_match(given: str | None, expected: str | None) -> bool:
    if not given or not expected or len(given) != len(expected):
        return False
    return secrets.compare_digest(given, expected)


def new_code(db: Session) -> str:
    for _ in range(8):
        code = str(secrets.randbelow(90_000_000_000) + 10_000_000_000)
        if not db.query(Meeting.id).filter_by(code=code).first():
            return code
    raise HTTPException(500, "Could not allocate a meeting ID")


def new_passcode() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def default_user(db: Session) -> User:
    user = db.query(User).order_by(User.id).first()
    if not user:
        raise HTTPException(500, "Demo user is missing. Restart the API so it can seed.")
    return user


def to_meeting(meeting: Meeting, *, secret: bool) -> MeetingOut:
    host_name = meeting.host.name if meeting.host else "Host"
    path = f"/j/{meeting.code}"
    if secret:
        path = f"{path}?pwd={quote(meeting.passcode)}"
    return MeetingOut(
        code=meeting.code,
        display_code=format_code(meeting.code),
        title=meeting.title,
        description=meeting.description or "",
        host_name=host_name,
        passcode=meeting.passcode if secret else None,
        requires_passcode=bool(meeting.passcode),
        scheduled_at=iso(meeting.scheduled_at),
        started_at=iso(meeting.started_at),
        ended_at=iso(meeting.ended_at),
        duration_minutes=meeting.duration_minutes,
        status=meeting.status,
        is_instant=meeting.is_instant,
        is_personal=meeting.is_personal,
        invite_path=path,
        host_key=meeting.host_key if secret else None,
    )


def get_meeting(db: Session, raw_code: str) -> Meeting:
    code = normalize_code(raw_code)
    meeting = (
        db.query(Meeting)
        .options(joinedload(Meeting.host))
        .filter(Meeting.code == code)
        .one_or_none()
    )
    if not meeting:
        raise HTTPException(404, "Invalid meeting ID. Please check and try again.")
    return meeting


def create_meeting(db: Session, data: CreateMeetingIn) -> Meeting:
    user = default_user(db)
    now = utcnow()
    title = data.title.strip()
    description = data.description.strip()[:2000]
    if data.instant:
        title = title or f"{user.name}'s Zoom Meeting"
        scheduled = now
        status = "live"
        started = now
        instant = True
    else:
        if not title:
            raise HTTPException(400, "Add a topic")
        if data.scheduled_at is None:
            raise HTTPException(400, "Date and time are required")
        scheduled = as_utc_naive(data.scheduled_at)
        if scheduled < now - timedelta(minutes=1):
            raise HTTPException(400, "Pick a time in the future")
        status = "scheduled"
        started = None
        instant = False

    meeting = Meeting(
        code=new_code(db),
        title=title[:200],
        description=description,
        host_id=user.id,
        host=user,
        host_key=secrets.token_urlsafe(24),
        passcode=new_passcode(),
        scheduled_at=scheduled,
        duration_minutes=data.duration_minutes,
        status=status,
        is_instant=instant,
        is_personal=False,
        created_at=now,
        started_at=started,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def home_payload(db: Session) -> dict:
    user = default_user(db)
    personal = (
        db.query(Meeting)
        .options(joinedload(Meeting.host))
        .filter(Meeting.code == user.personal_meeting_code)
        .one()
    )
    upcoming = (
        db.query(Meeting)
        .options(joinedload(Meeting.host))
        .filter(
            Meeting.host_id == user.id,
            Meeting.is_personal.is_(False),
            Meeting.status.in_(["scheduled", "live"]),
        )
        .all()
    )
    upcoming.sort(key=lambda m: (m.status != "live", m.scheduled_at or datetime.max))
    recent = (
        db.query(Meeting)
        .options(joinedload(Meeting.host))
        .filter(
            Meeting.host_id == user.id,
            Meeting.is_personal.is_(False),
            Meeting.status == "ended",
        )
        .order_by(Meeting.ended_at.desc())
        .limit(20)
        .all()
    )
    return {
        "user": user,
        "personal_meeting": personal,
        "upcoming": upcoming,
        "recent": recent,
    }


def _active_count(db: Session, meeting_id: int) -> int:
    return (
        db.query(Participant)
        .filter(
            Participant.meeting_id == meeting_id,
            Participant.left_at.is_(None),
            Participant.kicked.is_(False),
        )
        .count()
    )


def join_meeting(db: Session, raw_code: str, data: JoinIn) -> Participant:
    meeting = get_meeting(db, raw_code)
    user = default_user(db)
    name = data.display_name.strip()
    if not name:
        raise HTTPException(400, "Enter your name")

    is_host = keys_match(data.host_key, meeting.host_key)
    if not is_host and not keys_match(digits(data.passcode), meeting.passcode):
        raise HTTPException(403, "Incorrect passcode. Please try again.")

    if meeting.status == "ended" and not is_host:
        raise HTTPException(409, "This meeting has ended")

    if _active_count(db, meeting.id) >= MAX_PARTICIPANTS:
        raise HTTPException(403, "This meeting is full")

    now = utcnow()
    if meeting.status == "ended" and is_host:
        meeting.status = "live"
        meeting.ended_at = None
        meeting.started_at = now
        db.query(ChatMessage).filter(ChatMessage.meeting_id == meeting.id).delete()
    elif meeting.status == "scheduled":
        meeting.status = "live"
        meeting.started_at = now

    participant = Participant(
        meeting_id=meeting.id,
        meeting=meeting,
        user_id=user.id if is_host else None,
        display_name=name[:120],
        role="host" if is_host else "participant",
        token=secrets.token_urlsafe(24),
        audio_on=data.audio_on,
        video_on=data.video_on,
        kicked=False,
        joined_at=now,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


def participant_by_token(db: Session, raw_code: str, token: str) -> Participant:
    code = normalize_code(raw_code)
    participant = (
        db.query(Participant)
        .join(Meeting)
        .options(joinedload(Participant.meeting))
        .filter(Meeting.code == code, Participant.token == token)
        .one_or_none()
    )
    if not participant:
        raise HTTPException(401, "That session is no longer valid")
    return participant


def leave_meeting(db: Session, raw_code: str, token: str) -> None:
    participant = participant_by_token(db, raw_code, token)
    if participant.left_at is None:
        participant.left_at = utcnow()
        db.commit()


def end_meeting(db: Session, raw_code: str, token: str) -> Meeting:
    participant = participant_by_token(db, raw_code, token)
    if participant.role != "host":
        raise HTTPException(403, "Only the host can end the meeting for everyone")
    meeting = participant.meeting
    now = utcnow()
    meeting.status = "ended"
    meeting.ended_at = now
    db.query(Participant).filter(
        Participant.meeting_id == meeting.id,
        Participant.left_at.is_(None),
    ).update({Participant.left_at: now})
    db.commit()
    return meeting


def list_messages(db: Session, raw_code: str) -> list[ChatMessage]:
    meeting = get_meeting(db, raw_code)
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.meeting_id == meeting.id)
        .order_by(ChatMessage.id.asc())
        .limit(200)
        .all()
    )


def save_message(db: Session, participant: Participant, text: str) -> ChatMessage:
    message = ChatMessage(
        meeting_id=participant.meeting_id,
        sender_participant_id=participant.id,
        sender_name=participant.display_name,
        body=text,
        sent_at=utcnow(),
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def mark_left(db: Session, participant_id: int) -> None:
    participant = db.get(Participant, participant_id)
    if participant and participant.left_at is None and not participant.kicked:
        participant.left_at = utcnow()
        db.commit()


def open_session(db: Session, raw_code: str, token: str) -> Participant | str:
    """Return the participant, or an error string the socket should show."""
    try:
        participant = participant_by_token(db, raw_code, token)
    except HTTPException:
        return "That session is no longer valid"
    if participant.kicked:
        return "The host removed you from the meeting"
    meeting = participant.meeting
    if meeting.status != "live":
        return "This meeting has ended"
    participant.left_at = None
    db.commit()
    return participant
