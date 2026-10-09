"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getMeeting, joinMeeting, leaveMeeting } from "@/lib/api";
import { NAME_KEY, normalizeCode, PENDING_JOIN, sessionKey } from "@/lib/format";
import type { JoinSession, Meeting, PendingJoin } from "@/lib/types";
import MeetingRoom from "./MeetingRoom";
import PreJoin from "./PreJoin";

export default function CallScreen() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const code = normalizeCode(String(params.code || ""));
  const linkPasscode = search.get("pwd") || "";
  const [phase, setPhase] = useState<"loading" | "prejoin" | "room">("loading");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [session, setSession] = useState<JoinSession | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);

  useEffect(() => {
    const flag = { cancelled: false };
    (async () => {
      try {
        const found = await getMeeting(code);
        if (flag.cancelled) return;
        setMeeting(found);
        const pendingRaw = sessionStorage.getItem(PENDING_JOIN);
        const pending = pendingRaw ? (JSON.parse(pendingRaw) as PendingJoin) : null;
        if (search.get("go") === "1" && pending && normalizeCode(pending.code) === code) {
          sessionStorage.removeItem(PENDING_JOIN);
          try {
            const joined = await joinMeeting(code, {
              display_name: pending.name,
              passcode: pending.passcode,
              host_key: pending.hostKey,
              audio_on: pending.audio,
              video_on: pending.video,
            });
            if (flag.cancelled) {
              await leaveMeeting(code, joined.token);
              return;
            }
            sessionStorage.setItem(sessionKey(code), JSON.stringify(joined));
            setSession(joined);
            setMeeting(joined.meeting);
            setShare(!!pending.share);
            setPhase("room");
            router.replace(`/meeting/${code}`);
            return;
          } catch (err) {
            if (flag.cancelled) return;
            setError(err instanceof Error ? err.message : "Could not join");
            setPhase("prejoin");
            return;
          }
        }
        const savedRaw = sessionStorage.getItem(sessionKey(code));
        if (savedRaw && found.status !== "ended") {
          if (flag.cancelled) return;
          setSession(JSON.parse(savedRaw) as JoinSession);
          setPhase("room");
          return;
        }
        if (found.status === "ended") setError("This meeting has ended");
        setPhase("prejoin");
      } catch (err) {
        if (flag.cancelled) return;
        setMeeting(null);
        setError(err instanceof Error ? err.message : "Invalid meeting ID");
        setPhase("prejoin");
      }
    })();
    return () => {
      flag.cancelled = true;
    };
    // Read the invite query once per meeting id. Replacing the URL must not rejoin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function joinFromPreview(input: { name: string; passcode: string; audio: boolean; video: boolean }) {
    setBusy(true);
    setError("");
    try {
      const joined = await joinMeeting(code, {
        display_name: input.name,
        passcode: input.passcode || linkPasscode,
        audio_on: input.audio,
        video_on: input.video,
      });
      localStorage.setItem(NAME_KEY, input.name);
      sessionStorage.setItem(sessionKey(code), JSON.stringify(joined));
      setSession(joined);
      setMeeting(joined.meeting);
      setPhase("room");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  function exit() {
    sessionStorage.removeItem(sessionKey(code));
    router.push("/");
  }

  if (phase === "loading") {
    return (
      <div className="boot dark">
        <p>Joining…</p>
      </div>
    );
  }

  if (phase === "room" && session) {
    return <MeetingRoom meeting={session.meeting} session={session} shareOnStart={share} onLeft={exit} />;
  }

  return (
    <PreJoin
      meeting={meeting}
      error={error}
      loading={false}
      initialName=""
      initialPasscode={linkPasscode}
      busy={busy}
      onJoin={(input) => void joinFromPreview(input)}
      onHome={() => router.push("/")}
    />
  );
}
