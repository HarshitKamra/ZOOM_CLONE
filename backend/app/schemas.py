from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CreateMeetingIn(BaseModel):
    title: str = ""
    description: str = ""
    scheduled_at: datetime | None = None
    duration_minutes: int = Field(default=60, ge=15, le=24 * 60)
    instant: bool = False


class JoinIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    passcode: str | None = None
    host_key: str | None = None
    audio_on: bool = True
    video_on: bool = True


class TokenIn(BaseModel):
    token: str = Field(min_length=8, max_length=64)


class MeetingOut(BaseModel):
    code: str
    display_code: str
    title: str
    description: str
    host_name: str
    passcode: str | None = None
    requires_passcode: bool
    scheduled_at: str | None
    started_at: str | None
    ended_at: str | None
    duration_minutes: int
    status: str
    is_instant: bool
    is_personal: bool
    invite_path: str
    host_key: str | None = None


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    avatar_color: str
    personal_meeting_code: str
    personal_display_code: str


class HomeOut(BaseModel):
    user: UserOut
    personal_meeting: MeetingOut
    upcoming: list[MeetingOut]
    recent: list[MeetingOut]


class JoinOut(BaseModel):
    participant_id: int
    display_name: str
    role: str
    token: str
    audio_on: bool
    video_on: bool
    meeting: MeetingOut


class ChatOut(BaseModel):
    id: int
    sender_name: str
    sender_id: int | None
    body: str
    sent_at: str
