"""Meeting schema.

users 1—N meetings as host
users 1—N participants when a signed-in account joins (guests leave user_id null)
meetings 1—N participants
meetings 1—N chat_messages
participants 1—N chat_messages
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    personal_meeting_code: Mapped[str] = mapped_column(String(11), unique=True, nullable=False)
    avatar_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#0E72ED")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    hosted_meetings: Mapped[list[Meeting]] = relationship(back_populates="host")
    participations: Mapped[list[Participant]] = relationship(back_populates="user")


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (Index("ix_meetings_host_status", "host_id", "status", "scheduled_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(11), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    host_key: Mapped[str] = mapped_column(String(64), nullable=False)
    passcode: Mapped[str] = mapped_column(String(10), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    is_instant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_personal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    host: Mapped[User] = relationship(back_populates="hosted_meetings")
    participants: Mapped[list[Participant]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    audio_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    video_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    kicked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship(back_populates="participations")
    messages: Mapped[list[ChatMessage]] = relationship(back_populates="sender")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id"), nullable=False, index=True)
    sender_participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id"), nullable=True
    )
    sender_name: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    meeting: Mapped[Meeting] = relationship(back_populates="messages")
    sender: Mapped[Participant | None] = relationship(back_populates="messages")
