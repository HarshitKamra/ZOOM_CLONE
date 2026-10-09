from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.hub import hub
from app.schemas import ChatOut, CreateMeetingIn, HomeOut, JoinIn, JoinOut, MeetingOut, TokenIn, UserOut
from app.service import (
    create_meeting,
    end_meeting,
    get_meeting,
    home_payload,
    iso,
    join_meeting,
    leave_meeting,
    list_messages,
    to_meeting,
)

router = APIRouter()


def _user_out(user) -> UserOut:
    from app.service import format_code

    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        avatar_color=user.avatar_color,
        personal_meeting_code=user.personal_meeting_code,
        personal_display_code=format_code(user.personal_meeting_code),
    )


@router.get("/home", response_model=HomeOut)
def home(db: Session = Depends(get_db)):
    payload = home_payload(db)
    return HomeOut(
        user=_user_out(payload["user"]),
        personal_meeting=to_meeting(payload["personal_meeting"], secret=True),
        upcoming=[to_meeting(m, secret=True) for m in payload["upcoming"]],
        recent=[to_meeting(m, secret=True) for m in payload["recent"]],
    )


@router.post("/meetings", response_model=MeetingOut, status_code=201)
def create(data: CreateMeetingIn, db: Session = Depends(get_db)):
    return to_meeting(create_meeting(db, data), secret=True)


@router.get("/meetings/{code}", response_model=MeetingOut, response_model_exclude_none=True)
def read_meeting(code: str, db: Session = Depends(get_db)):
    return to_meeting(get_meeting(db, code), secret=False)


@router.post("/meetings/{code}/join", response_model=JoinOut)
def join(code: str, data: JoinIn, db: Session = Depends(get_db)):
    participant = join_meeting(db, code, data)
    return JoinOut(
        participant_id=participant.id,
        display_name=participant.display_name,
        role=participant.role,
        token=participant.token,
        audio_on=participant.audio_on,
        video_on=participant.video_on,
        meeting=to_meeting(participant.meeting, secret=True),
    )


@router.post("/meetings/{code}/leave")
def leave(code: str, data: TokenIn, db: Session = Depends(get_db)):
    leave_meeting(db, code, data.token)
    return {"ok": True}


@router.post("/meetings/{code}/end")
async def end(code: str, data: TokenIn, db: Session = Depends(get_db)):
    meeting = end_meeting(db, code, data.token)
    await hub.broadcast(meeting.code, {"type": "ended"})
    return {"ok": True, "status": meeting.status}


@router.get("/meetings/{code}/messages", response_model=list[ChatOut])
def messages(code: str, db: Session = Depends(get_db)):
    return [
        ChatOut(
            id=row.id,
            sender_name=row.sender_name,
            sender_id=row.sender_participant_id,
            body=row.body,
            sent_at=iso(row.sent_at) or "",
        )
        for row in list_messages(db, code)
    ]
