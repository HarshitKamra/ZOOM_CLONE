from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app


def test_meeting_flows():
    with TestClient(app) as client:
        home = client.get("/api/home")
        assert home.status_code == 200
        body = home.json()
        assert body["user"]["name"] == "Harshit Kamra"
        assert len(body["upcoming"]) >= 1
        assert len(body["recent"]) >= 1
        assert "host_key" in body["personal_meeting"]
        assert body["personal_meeting"]["passcode"] == "123456"

        created = client.post("/api/meetings", json={"instant": True, "title": "", "duration_minutes": 30})
        assert created.status_code == 201
        meeting = created.json()
        assert len(meeting["code"]) == 11
        assert meeting["status"] == "live"
        assert meeting["host_key"]
        assert meeting["invite_path"].startswith("/j/")

        public = client.get(f"/api/meetings/{meeting['display_code']}")
        assert public.status_code == 200
        assert "host_key" not in public.json()
        assert "passcode" not in public.json()
        assert public.json()["requires_passcode"] is True

        missing = client.post(
            "/api/meetings/00000000000/join",
            json={"display_name": "Guest", "passcode": "000000"},
        )
        assert missing.status_code == 404

        bad = client.post(
            f"/api/meetings/{meeting['code']}/join",
            json={"display_name": "Guest", "passcode": "000000"},
        )
        assert bad.status_code == 403

        host = client.post(
            f"/api/meetings/{meeting['code']}/join",
            json={"display_name": "Harshit Kamra", "host_key": meeting["host_key"], "passcode": "nope"},
        )
        assert host.status_code == 200
        assert host.json()["role"] == "host"
        assert host.json()["meeting"]["passcode"] == meeting["passcode"]

        guest = client.post(
            f"/api/meetings/{meeting['code']}/join",
            json={"display_name": "Sam", "passcode": meeting["passcode"]},
        )
        assert guest.status_code == 200
        assert guest.json()["role"] == "participant"

        with client.websocket_connect(f"/ws/meetings/{meeting['code']}") as ws:
            ws.send_json({"type": "hello", "token": host.json()["token"]})
            welcome = ws.receive_json()
            assert welcome["type"] == "welcome"
            assert welcome["you"]["role"] == "host"

        when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        scheduled = client.post(
            "/api/meetings",
            json={
                "instant": False,
                "title": "Planning",
                "description": "Roadmap",
                "scheduled_at": when,
                "duration_minutes": 45,
            },
        )
        assert scheduled.status_code == 201
        again = client.get("/api/home").json()
        assert any(row["title"] == "Planning" for row in again["upcoming"])

        ended = client.post(
            f"/api/meetings/{meeting['code']}/end",
            json={"token": host.json()["token"]},
        )
        assert ended.status_code == 200
        blocked = client.post(
            f"/api/meetings/{meeting['code']}/join",
            json={"display_name": "Late", "passcode": meeting["passcode"]},
        )
        assert blocked.status_code == 409

        restarted = client.post(
            f"/api/meetings/{meeting['code']}/join",
            json={"display_name": "Harshit Kamra", "host_key": meeting["host_key"]},
        )
        assert restarted.status_code == 200
        assert restarted.json()["meeting"]["status"] == "live"
