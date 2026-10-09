# Zoom Clone

A Zoom Workplace-style video meeting app: signed-in home, instant meetings, join by ID or invite link, scheduling, and an in-meeting room with camera, screen share, chat, and host controls.

**Live app:** https://zoom-clone-ochre-sigma.vercel.app

**API:** https://zoom-clone-api-alpha.vercel.app

**Demo Video Link** https://drive.google.com/file/d/12DqBAWgPbwNwniM0U_khJOer-9nNEP6c/view?usp=sharing
There is no login screen. The app opens as **Harshit Kamra** (`harshit.kamra@example.com`).

## Tech stack

- Frontend: Next.js (App Router) and React
- Backend: Python and FastAPI
- Database: SQLite via SQLAlchemy
- Realtime: FastAPI WebSocket for signaling, presence, and meeting chat
- Media: browser WebRTC, peer-to-peer, using a public STUN server

## Setup

Use two terminals.

### API

```bash
cd backend
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

macOS / Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API creates `backend/data/zoom.db` and seeds it on first launch. Delete that file to reseed.

Check [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) and the docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### Web app

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If the API is not on port 8000, copy `frontend/.env.example` to `frontend/.env.local` and set `NEXT_PUBLIC_API_URL`.

### Tests

```bash
cd backend
.venv\Scripts\python -m pytest
```

On macOS / Linux, use `.venv/bin/python -m pytest`.

## What you can do

- **New meeting** starts an instant meeting, creates an 11-digit ID and invite link, and opens the room.
- **Join** checks that the meeting exists, asks for a display name and passcode, then enters the room. Invite links look like `http://localhost:3000/j/84729133011?pwd=482193`.
- **Schedule** stores a title, description, local date and time, and duration, then shows the meeting under Upcoming.
- Inside a meeting: mute, camera, screen share, chat, reactions, participants, and local recording (host). The host can mute one person, mute all, remove someone, leave, or end the meeting for everyone.

To try two people, open the invite link in a second browser window, use a different name, and allow the camera.

## Database

```
users 1—N meetings            host
users 1—N participants        optional; guests keep user_id null
meetings 1—N participants
meetings 1—N chat_messages
participants 1—N chat_messages
```

| Table | What it stores |
| --- | --- |
| `users` | Name, email, personal meeting code, avatar color |
| `meetings` | 11-digit code, title, description, host, passcode, host key, schedule, duration, status |
| `participants` | Display name, role, join token, audio/video, kicked, joined and left times |
| `chat_messages` | Sender, body, and time, tied to a meeting and a participant |

`meetings.status` is `scheduled`, `live`, or `ended`. A personal room is a normal meeting with `is_personal`. `host_key` lets the signed-in host start or reopen a meeting. Guests join with the passcode. `participants.token` is the credential for the socket, mute, remove, and end-meeting calls.

## Sample data

The API seeds this on startup:

| Meeting | ID | Passcode |
| --- | --- | --- |
| Harshit Kamra's personal room | 842 1930 4412 | 123456 |
| Design sync | 847 2913 3011 | 482193 |
| Customer onboarding | 859 1022 8473 | 220198 |
| Sprint planning | 863 0019 2847 | 771540 |
| 1:1 with Sam | 871 2345 0918 | 330291 |

Also seeded: Sam Rivera (`sam.rivera@example.com`) as a contact, and three ended meetings (Daily standup, Product review, Interview — frontend). Daily standup includes two chat messages.

## Assumptions

- One demo user is always signed in. Camera-on and mute-on-entry live in the browser.
- Passcodes are required for guests and shown to the host. A valid host key skips the passcode.
- Video is peer-to-peer and capped at 6 people. A media server would be the next step.
- Recording saves your own microphone and camera as a WebM file on this computer. It is not a cloud recording.
- Times are stored in UTC and shown in the browser's timezone.
- Summaries are written from the meeting title, time, host, and duration. There is no transcript.
- Whiteboards, Pricing, Admin Center, Download, Upgrade, calendar connect, and Edit meeting are interface only.
- Team chat typed on the Chat page stays in that browser tab. Meeting chat is stored in the database.

## Deploy

The frontend and the API are both on Vercel. `NEXT_PUBLIC_API_URL` is set to the API origin.

On Vercel the database is a temporary SQLite file inside the function, and a live function stops after about five minutes. A long meeting can drop, and meetings created there can disappear when the server recycles. Running the API locally with `backend/data/zoom.db` keeps the data on disk.

The API allows any origin so the deployed site can call it. `backend/Dockerfile` runs the same API with `uvicorn` on `$PORT` if you host it somewhere else.
