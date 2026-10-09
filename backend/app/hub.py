"""In-memory presence for each meeting room. Media is peer-to-peer; this only relays signals."""

from __future__ import annotations

from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.rooms: dict[str, dict[int, WebSocket]] = {}
        self.meta: dict[str, dict[int, dict]] = {}

    def join(self, code: str, participant_id: int, ws: WebSocket, info: dict) -> list[dict]:
        self.rooms.setdefault(code, {})[participant_id] = ws
        self.meta.setdefault(code, {})[participant_id] = info
        return [peer for pid, peer in self.meta[code].items() if pid != participant_id]

    def disconnect(self, code: str, participant_id: int) -> None:
        self.rooms.get(code, {}).pop(participant_id, None)
        self.meta.get(code, {}).pop(participant_id, None)
        if code in self.rooms and not self.rooms[code]:
            self.rooms.pop(code, None)
            self.meta.pop(code, None)

    def update(self, code: str, participant_id: int, **fields) -> None:
        info = self.meta.get(code, {}).get(participant_id)
        if info:
            info.update(fields)

    async def send_to(self, code: str, participant_id: int, payload: dict) -> None:
        ws = self.rooms.get(code, {}).get(participant_id)
        if not ws:
            return
        try:
            await ws.send_json(payload)
        except Exception:
            self.disconnect(code, participant_id)

    async def broadcast(self, code: str, payload: dict, exclude: int | None = None) -> None:
        for pid in list(self.rooms.get(code, {})):
            if pid != exclude:
                await self.send_to(code, pid, payload)


hub = Hub()
