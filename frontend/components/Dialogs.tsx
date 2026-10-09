"use client";

import { useEffect, useState } from "react";
import { ApiError, createMeeting, getMeeting } from "@/lib/api";
import { invitation, NAME_KEY, normalizeCode } from "@/lib/format";
import type { Prefs } from "@/lib/prefs";
import { savePrefs } from "@/lib/prefs";
import type { Meeting, PendingJoin, User } from "@/lib/types";
import { CloseIcon } from "./icons";

function Shell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation">
      <div
        className={wide ? "dialog wide" : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-pop
      >
        <header className="dialog-h">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function JoinDialog({
  prefs,
  onClose,
  onJoin,
}: {
  prefs: Prefs;
  onClose: () => void;
  onJoin: (pending: PendingJoin) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [found, setFound] = useState<Meeting | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) || "");
  }, []);

  useEffect(() => {
    const digits = normalizeCode(code);
    if (digits.length < 9) {
      setFound(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    getMeeting(digits)
      .then((meeting) => {
        if (cancelled) return;
        setFound(meeting);
        setError(meeting.status === "ended" ? "This meeting has ended" : "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFound(null);
        setError(err instanceof Error ? err.message : "Invalid meeting ID");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const digits = normalizeCode(code);
    if (digits.length < 9) {
      setError("Enter a meeting ID");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name");
      return;
    }
    if (found?.requires_passcode && normalizeCode(passcode).length < 4) {
      setError("Enter the passcode");
      return;
    }
    if (found?.status === "ended") {
      setError("This meeting has ended");
      return;
    }
    localStorage.setItem(NAME_KEY, name.trim());
    onJoin({
      code: digits,
      name: name.trim(),
      passcode: passcode.trim(),
      audio: !prefs.muteOnJoin,
      video: prefs.videoOnJoin,
    });
  }

  return (
    <Shell title="Join meeting" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="dialog-b">
          <label className="field">
            Meeting ID
            <input
              autoFocus
              inputMode="numeric"
              placeholder="Enter meeting ID"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError("");
              }}
            />
          </label>
          {found && found.status !== "ended" && <p className="hint">Meeting: {found.title}</p>}
          {(found?.requires_passcode || passcode) && (
            <label className="field">
              Passcode
              <input
                inputMode="numeric"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
              />
            </label>
          )}
          <label className="field">
            Your name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" />
          </label>
          {checking && <p className="hint">Checking meeting…</p>}
          {error && <p className="error-text">{error}</p>}
        </div>
        <footer className="dialog-f">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={checking}>
            Join
          </button>
        </footer>
      </form>
    </Shell>
  );
}

export function ScheduleDialog({
  userName,
  onClose,
  onCreated,
}: {
  userName: string;
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  const [title, setTitle] = useState(`${userName}'s Zoom Meeting`);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(
    `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`
  );
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Add a topic");
      return;
    }
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) {
      setError("Pick a date and time");
      return;
    }
    if (when.getTime() < Date.now() - 60_000) {
      setError("Pick a time in the future");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const meeting = await createMeeting({
        title: title.trim(),
        description: description.trim(),
        scheduled_at: when.toISOString(),
        duration_minutes: duration,
        instant: false,
      });
      onCreated(meeting);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not schedule the meeting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell title="Schedule meeting" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="dialog-b">
          <label className="field">
            Topic
            <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
          </label>
          <label className="field">
            Description
            <textarea
              rows={3}
              placeholder="Add a description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="split">
            <label className="field">
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>
            <label className="field">
              Time
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            </label>
            <label className="field">
              Duration
              <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                {[15, 30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint">Times use your local timezone. A meeting ID, passcode, and link are created when you save.</p>
          {error && <p className="error-text">{error}</p>}
        </div>
        <footer className="dialog-f">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </Shell>
  );
}

export function InviteDialog({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const text = invitation(meeting, window.location.origin);
  return (
    <Shell title="Meeting invitation" onClose={onClose} wide>
      <div className="dialog-b">
        <textarea className="invite-box" readOnly rows={12} value={text} />
      </div>
      <footer className="dialog-f">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            onClose();
          }}
        >
          Copy invitation
        </button>
      </footer>
    </Shell>
  );
}

export function SettingsDialog({
  user,
  prefs,
  onClose,
  onSave,
}: {
  user: User;
  prefs: Prefs;
  onClose: () => void;
  onSave: (prefs: Prefs) => void;
}) {
  const [videoOnJoin, setVideoOnJoin] = useState(prefs.videoOnJoin);
  const [muteOnJoin, setMuteOnJoin] = useState(prefs.muteOnJoin);

  return (
    <Shell title="Settings" onClose={onClose}>
      <div className="dialog-b">
        <p className="hint">
          Signed in as {user.name} · {user.email}
        </p>
        <label className="check">
          <input type="checkbox" checked={videoOnJoin} onChange={(event) => setVideoOnJoin(event.target.checked)} />
          Start with video
        </label>
        <label className="check">
          <input type="checkbox" checked={muteOnJoin} onChange={(event) => setMuteOnJoin(event.target.checked)} />
          Mute my microphone when joining
        </label>
      </div>
      <footer className="dialog-f">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const next = { videoOnJoin, muteOnJoin };
            savePrefs(next);
            onSave(next);
          }}
        >
          Save
        </button>
      </footer>
    </Shell>
  );
}
