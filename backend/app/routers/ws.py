from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.hub import hub
from app.models import Participant
from app.service import iso, mark_left, open_session, participant_by_token, save_message, utcnow

router = APIRouter()

REACTIONS = {"👍", "👏", "❤️", "😂", "😮", "🎉"}


def _db():
    if SessionLocal.kw.get("bind") is None:
        from app.database import init_db

        init_db()
    return SessionLocal()


@router.websocket("/ws/meetings/{code}")
async def meeting_socket(websocket: WebSocket, code: str):
    await websocket.accept()
    participant_id: int | None = None
    try:
        hello = await websocket.receive_json()
        token = str(hello.get("token") or "") if isinstance(hello, dict) else ""
        db = _db()
        try:
            opened = open_session(db, code, token)
            if isinstance(opened, str):
                await websocket.send_json({"type": "error", "message": opened})
                await websocket.close(code=1008)
                return
            participant = opened
            participant_id = participant.id
            code = participant.meeting.code
            info = {
                "id": participant.id,
                "name": participant.display_name,
                "role": participant.role,
                "audio": participant.audio_on,
                "video": participant.video_on,
            }
        finally:
            db.close()

        peers = hub.join(code, participant_id, websocket, info)
        await websocket.send_json({"type": "welcome", "you": info, "peers": peers})
        await hub.broadcast(code, {"type": "peer-joined", "peer": info}, exclude=participant_id)

        while True:
            raw = await websocket.receive_json()
            if not isinstance(raw, dict):
                continue
            kind = raw.get("type")
            if kind in {"offer", "answer", "ice"}:
                target = raw.get("to")
                if target is None:
                    continue
                raw["from"] = participant_id
                await hub.send_to(code, int(target), raw)
            elif kind == "media":
                audio = bool(raw.get("audio"))
                video = bool(raw.get("video"))
                hub.update(code, participant_id, audio=audio, video=video)
                db = _db()
                try:
                    row = participant_by_token(db, code, token)
                    row.audio_on = audio
                    row.video_on = video
                    db.commit()
                finally:
                    db.close()
                await hub.broadcast(
                    code,
                    {"type": "media", "participantId": participant_id, "audio": audio, "video": video},
                    exclude=participant_id,
                )
            elif kind == "chat":
                text = str(raw.get("text") or "").strip()
                if not text or len(text) > 2000:
                    continue
                db = _db()
                try:
                    row = participant_by_token(db, code, token)
                    if row.kicked or row.left_at is not None:
                        continue
                    message = save_message(db, row, text)
                    payload = {
                        "type": "chat",
                        "id": message.id,
                        "sender_name": message.sender_name,
                        "sender_id": message.sender_participant_id,
                        "body": message.body,
                        "sent_at": iso(message.sent_at),
                    }
                finally:
                    db.close()
                await hub.broadcast(code, payload)
            elif kind == "reaction":
                emoji = raw.get("emoji")
                if emoji not in REACTIONS:
                    continue
                info = hub.meta.get(code, {}).get(participant_id) or {}
                await hub.broadcast(
                    code,
                    {"type": "reaction", "emoji": emoji, "name": info.get("name", "")},
                )
            elif kind == "mute-all":
                info = hub.meta.get(code, {}).get(participant_id) or {}
                if info.get("role") != "host":
                    continue
                await hub.broadcast(code, {"type": "force-mute"}, exclude=participant_id)
            elif kind == "mute":
                info = hub.meta.get(code, {}).get(participant_id) or {}
                if info.get("role") != "host":
                    continue
                target = int(raw.get("participantId") or 0)
                if target and target != participant_id:
                    await hub.send_to(code, target, {"type": "force-mute"})
            elif kind == "remove":
                info = hub.meta.get(code, {}).get(participant_id) or {}
                if info.get("role") != "host":
                    continue
                target = int(raw.get("participantId") or 0)
                if not target or target == participant_id:
                    continue
                db = _db()
                try:
                    row = db.get(Participant, target)
                    if row and row.meeting.code == code:
                        row.kicked = True
                        row.left_at = utcnow()
                        db.commit()
                finally:
                    db.close()
                await hub.send_to(code, target, {"type": "removed"})
                target_ws = hub.rooms.get(code, {}).get(target)
                if target_ws:
                    await target_ws.close()
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        if participant_id is not None:
            hub.disconnect(code, participant_id)
            await hub.broadcast(code, {"type": "peer-left", "participantId": participant_id})
            db = _db()
            try:
                mark_left(db, participant_id)
            finally:
                db.close()
