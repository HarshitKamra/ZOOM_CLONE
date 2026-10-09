"use client";

import { useEffect, useRef, useState } from "react";
import { NAME_KEY } from "@/lib/format";
import type { Meeting } from "@/lib/types";
import { CameraIcon, CameraOffIcon, MicIcon, MicOffIcon } from "./icons";

export default function PreJoin({
  meeting,
  error,
  loading,
  initialName,
  initialPasscode,
  busy,
  onJoin,
  onHome,
}: {
  meeting: Meeting | null;
  error: string;
  loading: boolean;
  initialName: string;
  initialPasscode: string;
  busy: boolean;
  onJoin: (input: { name: string; passcode: string; audio: boolean; video: boolean }) => void;
  onHome: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [name, setName] = useState(initialName);
  const [passcode, setPasscode] = useState(initialPasscode);
  const [showPasscode, setShowPasscode] = useState(!initialPasscode);
  const [audio, setAudio] = useState(true);
  const [video, setVideo] = useState(true);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setName(initialName || localStorage.getItem(NAME_KEY) || "");
  }, [initialName]);

  useEffect(() => {
    if (error.toLowerCase().includes("passcode")) setShowPasscode(true);
  }, [error]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (!cancelled) setVideo(false);
        } catch {
          if (!cancelled) {
            setVideo(false);
            setAudio(false);
          }
          return;
        }
      }
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (videoRef.current && stream) videoRef.current.srcObject = stream;
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = audio;
    });
    stream?.getVideoTracks().forEach((track) => {
      track.enabled = video;
    });
  }, [audio, video]);

  const ended = meeting?.status === "ended";
  const needsPasscode = showPasscode || !!meeting?.requires_passcode;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setLocalError("Enter your name");
      return;
    }
    if (needsPasscode && passcode.replace(/\D/g, "").length < 4 && !initialPasscode) {
      setLocalError("Enter the passcode");
      return;
    }
    setLocalError("");
    onJoin({ name: name.trim(), passcode: passcode.trim() || initialPasscode, audio, video });
  }

  return (
    <div className="prejoin">
      <header className="prejoin-top">
        <button className="logo-lockup" onClick={onHome}>
          <img src="/brand/zoom-wordmark.jpg" alt="zoom" className="wordmark" />
        </button>
      </header>
      <main className="prejoin-main">
        <div className="preview">
          <video ref={videoRef} autoPlay playsInline muted className={video ? "mirror" : "hidden"} />
          {!video && <div className="preview-fallback">{name.trim() ? name.trim()[0]?.toUpperCase() : "?"}</div>}
          <div className="preview-controls">
            <button className={audio ? "round-ctrl" : "round-ctrl off"} onClick={() => setAudio((value) => !value)} type="button">
              {audio ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
            </button>
            <button className={video ? "round-ctrl" : "round-ctrl off"} onClick={() => setVideo((value) => !value)} type="button">
              {video ? <CameraIcon size={18} /> : <CameraOffIcon size={18} />}
            </button>
          </div>
        </div>
        <form className="prejoin-card" onSubmit={submit}>
          <h1>{loading ? "Joining…" : meeting?.title || "Join meeting"}</h1>
          {meeting && (
            <p className="hint">
              {meeting.host_name} · ID {meeting.display_code}
            </p>
          )}
          <label className="field">
            Your name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" autoFocus />
          </label>
          {needsPasscode && !initialPasscode && (
            <label className="field">
              Passcode
              <input value={passcode} onChange={(event) => setPasscode(event.target.value)} inputMode="numeric" />
            </label>
          )}
          {(error || localError) && <p className="error-text">{localError || error}</p>}
          <button className="btn-primary block" type="submit" disabled={busy || loading || !meeting || ended}>
            {busy ? "Joining…" : ended ? "Meeting ended" : "Join"}
          </button>
        </form>
      </main>
    </div>
  );
}
