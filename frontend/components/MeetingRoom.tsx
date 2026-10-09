"use client";

import { useEffect, useRef, useState } from "react";
import { endMeeting, getMessages, leaveMeeting, wsUrl } from "@/lib/api";
import { copyText, formatMessageTime, invitation } from "@/lib/format";
import type { ChatMessage, JoinSession, Meeting } from "@/lib/types";
import { useToast } from "@/lib/useToast";
import Avatar from "./Avatar";
import {
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  CloseIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  ReactIcon,
  RecordIcon,
  ScreenIcon,
  SendIcon,
  ShieldIcon,
  UsersIcon,
} from "./icons";

type Peer = {
  id: number;
  name: string;
  role: string;
  audio: boolean;
  video: boolean;
  stream: MediaStream | null;
};

type Signal = {
  type: string;
  from?: number;
  to?: number;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  peers?: Array<Omit<Peer, "stream">>;
  peer?: Omit<Peer, "stream">;
  participantId?: number;
  audio?: boolean;
  video?: boolean;
  message?: string;
  id?: number;
  sender_name?: string;
  sender_id?: number | null;
  body?: string;
  sent_at?: string;
  emoji?: string;
  name?: string;
};

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const REACTIONS = ["👍", "👏", "❤️", "😂", "😮", "🎉"];

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export default function MeetingRoom({
  meeting,
  session,
  shareOnStart,
  onLeft,
}: {
  meeting: Meeting;
  session: JoinSession;
  shareOnStart: boolean;
  onLeft: () => void;
}) {
  const toast = useToast();
  const [audioOn, setAudioOn] = useState(session.audio_on);
  const [videoOn, setVideoOn] = useState(session.video_on);
  const [sharing, setSharing] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [panel, setPanel] = useState<"people" | "chat" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [popover, setPopover] = useState<"security" | "leave" | "reactions" | "more" | null>(null);
  const [unread, setUnread] = useState(0);
  const [floats, setFloats] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [recording, setRecording] = useState(false);
  const [banner, setBanner] = useState("");
  const [ended, setEnded] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [mediaVersion, setMediaVersion] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pcsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const iceBuf = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef(session.audio_on);
  const videoRef = useRef(session.video_on);
  const sharingRef = useRef(false);
  const panelRef = useRef(panel);
  const intentional = useRef(false);
  const endedRef = useRef(false);
  const removedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const handler = useRef<(msg: Signal) => void>(() => {});
  panelRef.current = panel;

  function send(payload: object) {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  function videoSender(pc: RTCPeerConnection) {
    return (
      pc.getSenders().find((sender) => sender.track?.kind === "video") ||
      pc.getSenders().find((sender) => sender.track == null)
    );
  }

  async function publishVideo(track: MediaStreamTrack | null) {
    const local = localStreamRef.current;
    if (!local) return;
    for (const existing of [...local.getVideoTracks()]) {
      local.removeTrack(existing);
      if (existing !== track) existing.stop();
    }
    if (track) local.addTrack(track);
    for (const [id, pc] of pcsRef.current) {
      const sender = videoSender(pc);
      if (track && sender?.track) await sender.replaceTrack(track);
      else if (track && sender && sender.track == null) await sender.replaceTrack(track);
      else if (track) {
        pc.addTrack(track, local);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "offer", to: id, sdp: pc.localDescription });
      } else if (sender) {
        await sender.replaceTrack(null);
      }
    }
    if (selfVideoRef.current) selfVideoRef.current.srcObject = local;
    setLocalStream(local);
    setMediaVersion((value) => value + 1);
  }

  function createPc(remoteId: number) {
    const existing = pcsRef.current.get(remoteId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(ICE);
    pcsRef.current.set(remoteId, pc);
    localStreamRef.current?.getTracks().forEach((track) => {
      const stream = localStreamRef.current;
      if (stream) pc.addTrack(track, stream);
    });
    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: "ice", to: remoteId, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      setPeers((prev) => prev.map((peer) => (peer.id === remoteId ? { ...peer, stream } : peer)));
    };
    return pc;
  }

  async function flushIce(remoteId: number) {
    const pc = pcsRef.current.get(remoteId);
    const queued = iceBuf.current.get(remoteId) || [];
    iceBuf.current.set(remoteId, []);
    if (!pc) return;
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* a late candidate can arrive before the description is stable */
      }
    }
  }

  async function offerTo(remoteId: number) {
    const pc = createPc(remoteId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", to: remoteId, sdp: pc.localDescription });
  }

  async function addIce(remoteId: number, candidate: RTCIceCandidateInit) {
    const pc = pcsRef.current.get(remoteId);
    if (!pc || !pc.remoteDescription) {
      const queued = iceBuf.current.get(remoteId) ?? [];
      queued.push(candidate);
      iceBuf.current.set(remoteId, queued);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      /* ignore */
    }
  }

  function rememberPeer(peer: Omit<Peer, "stream">) {
    setPeers((prev) => {
      const existing = prev.find((item) => item.id === peer.id);
      if (!existing) return [...prev, { ...peer, stream: null }];
      return prev.map((item) =>
        item.id === peer.id ? { ...item, name: peer.name, role: peer.role, audio: peer.audio, video: peer.video } : item
      );
    });
  }

  handler.current = (msg) => {
    void (async () => {
      if (msg.type === "welcome") {
        const list = msg.peers || [];
        setPeers(list.map((peer) => ({ ...peer, stream: null })));
        // The newcomer offers. People already in the room wait for that offer.
        for (const peer of list) await offerTo(peer.id);
        return;
      }
      if (msg.type === "peer-joined" && msg.peer) {
        rememberPeer(msg.peer);
        return;
      }
      if (msg.type === "peer-left" && msg.participantId) {
        pcsRef.current.get(msg.participantId)?.close();
        pcsRef.current.delete(msg.participantId);
        setPeers((prev) => prev.filter((peer) => peer.id !== msg.participantId));
        return;
      }
      if (msg.type === "offer" && msg.from && msg.sdp) {
        const pc = createPc(msg.from);
        await pc.setRemoteDescription(msg.sdp);
        await flushIce(msg.from);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", to: msg.from, sdp: pc.localDescription });
        return;
      }
      if (msg.type === "answer" && msg.from && msg.sdp) {
        const pc = pcsRef.current.get(msg.from);
        if (!pc) return;
        await pc.setRemoteDescription(msg.sdp);
        await flushIce(msg.from);
        return;
      }
      if (msg.type === "ice" && msg.from && msg.candidate) {
        await addIce(msg.from, msg.candidate);
        return;
      }
      if (msg.type === "media" && msg.participantId) {
        setPeers((prev) =>
          prev.map((peer) =>
            peer.id === msg.participantId ? { ...peer, audio: !!msg.audio, video: !!msg.video } : peer
          )
        );
        return;
      }
      if (msg.type === "chat" && msg.id && msg.body && msg.sent_at) {
        const row: ChatMessage = {
          id: msg.id,
          sender_name: msg.sender_name || "Guest",
          sender_id: msg.sender_id ?? null,
          body: msg.body,
          sent_at: msg.sent_at,
        };
        setMessages((prev) => (prev.some((item) => item.id === row.id) ? prev : [...prev, row]));
        if (panelRef.current !== "chat" && row.sender_id !== session.participant_id) setUnread((count) => count + 1);
        return;
      }
      if (msg.type === "reaction" && msg.emoji) {
        const id = Date.now() + Math.random();
        setFloats((prev) => [...prev, { id, emoji: msg.emoji || "", x: 20 + Math.random() * 60 }]);
        window.setTimeout(() => setFloats((prev) => prev.filter((item) => item.id !== id)), 2400);
        return;
      }
      if (msg.type === "force-mute") {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) track.enabled = false;
        audioRef.current = false;
        setAudioOn(false);
        setBanner("The host muted you");
        send({ type: "media", audio: false, video: videoRef.current });
        return;
      }
      if (msg.type === "removed") {
        removedRef.current = true;
        setRemoved(true);
        return;
      }
      if (msg.type === "ended") {
        endedRef.current = true;
        setEnded(true);
        return;
      }
      if (msg.type === "error") {
        setBanner(msg.message || "Couldn't stay in the meeting");
        setDisconnected(true);
      }
    })();
  };

  useEffect(() => {
    intentional.current = false;
    let cancelled = false;
    let socket: WebSocket | null = null;

    async function capture() {
      if (shareOnStart) {
        try {
          const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            mic.getAudioTracks().forEach((track) => screen.addTrack(track));
          } catch {
            /* screen share still works without a microphone */
          }
          const micTrack = screen.getAudioTracks()[0];
          if (micTrack) micTrack.enabled = session.audio_on;
          return { stream: screen, sharing: true };
        } catch {
          /* the share picker was cancelled; fall back to the camera */
        }
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: session.video_on
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
            : false,
        });
        const micTrack = stream.getAudioTracks()[0];
        if (micTrack) micTrack.enabled = session.audio_on;
        return { stream, sharing: false };
      } catch {
        try {
          const micOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const micTrack = micOnly.getAudioTracks()[0];
          if (micTrack) micTrack.enabled = session.audio_on;
          return { stream: micOnly, sharing: false };
        } catch {
          return { stream: new MediaStream(), sharing: false };
        }
      }
    }

    (async () => {
      const captured = await capture();
      if (cancelled) {
        stopStream(captured.stream);
        return;
      }
      localStreamRef.current = captured.stream;
      audioRef.current = captured.stream.getAudioTracks()[0]?.enabled ?? false;
      videoRef.current = captured.stream.getVideoTracks().length > 0;
      sharingRef.current = captured.sharing;
      setAudioOn(audioRef.current);
      setVideoOn(videoRef.current);
      setSharing(captured.sharing);
      setLocalStream(captured.stream);
      const screenTrack = captured.sharing ? captured.stream.getVideoTracks()[0] : null;
      if (screenTrack) {
        screenTrack.onended = () => {
          if (sharingRef.current) void stopShare();
        };
      }

      try {
        const history = await getMessages(meeting.code);
        if (!cancelled) setMessages(history);
      } catch {
        /* chat history is optional on reconnect */
      }
      if (cancelled) return;

      socket = new WebSocket(wsUrl(`/ws/meetings/${meeting.code}`));
      wsRef.current = socket;
      if (cancelled) {
        socket.close();
        return;
      }
      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: "hello", token: session.token }));
      };
      socket.onmessage = (event) => {
        handler.current(JSON.parse(event.data) as Signal);
      };
      socket.onclose = () => {
        if (intentional.current || endedRef.current || removedRef.current) return;
        setDisconnected(true);
      };
    })();

    return () => {
      cancelled = true;
      intentional.current = true;
      socket?.close();
      wsRef.current?.close();
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      if (recorderRef.current && recorderRef.current.state === "recording") recorderRef.current.stop();
      stopStream(localStreamRef.current);
    };
    // The room is keyed by participant token. Sharing is chosen before this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.code, session.token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, panel]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(""), 2400);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key.toLowerCase() === "m") void toggleAudio();
      if (event.key.toLowerCase() === "v") void toggleVideo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function toggleAudio() {
    const local = localStreamRef.current;
    if (!local) return;
    let track = local.getAudioTracks()[0];
    if (!track) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        track = mic.getAudioTracks()[0];
        local.addTrack(track);
        for (const [id, pc] of pcsRef.current) {
          pc.addTrack(track, local);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "offer", to: id, sdp: pc.localDescription });
        }
      } catch {
        setBanner("Microphone isn't available");
        return;
      }
    } else {
      track.enabled = !track.enabled;
    }
    audioRef.current = track.enabled;
    setAudioOn(track.enabled);
    send({ type: "media", audio: track.enabled, video: videoRef.current });
  }

  async function toggleVideo() {
    if (sharingRef.current) {
      await stopShare();
      return;
    }
    if (videoRef.current) {
      videoRef.current = false;
      setVideoOn(false);
      await publishVideo(null);
      send({ type: "media", audio: audioRef.current, video: false });
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      const track = cam.getVideoTracks()[0];
      videoRef.current = true;
      setVideoOn(true);
      await publishVideo(track);
      send({ type: "media", audio: audioRef.current, video: true });
    } catch {
      setBanner("Camera isn't available");
    }
  }

  async function toggleShare() {
    if (sharingRef.current) {
      await stopShare();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      track.onended = () => {
        if (sharingRef.current) void stopShare();
      };
      sharingRef.current = true;
      videoRef.current = true;
      setSharing(true);
      setVideoOn(true);
      await publishVideo(track);
      send({ type: "media", audio: audioRef.current, video: true });
    } catch {
      /* picker dismissed */
    }
  }

  async function stopShare() {
    if (!sharingRef.current) return;
    sharingRef.current = false;
    setSharing(false);
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      videoRef.current = true;
      setVideoOn(true);
      await publishVideo(cam.getVideoTracks()[0]);
      send({ type: "media", audio: audioRef.current, video: true });
    } catch {
      videoRef.current = false;
      setVideoOn(false);
      await publishVideo(null);
      send({ type: "media", audio: audioRef.current, video: false });
    }
  }

  function toggleRecord() {
    if (session.role !== "host") return;
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
      recorderRef.current = null;
      setRecording(false);
      return;
    }
    const stream = localStreamRef.current;
    if (!stream || stream.getTracks().length === 0) {
      setBanner("Turn on the microphone or camera to record");
      return;
    }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      setBanner("Recording isn't supported in this browser");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${meeting.code}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function leave(endForAll = false) {
    intentional.current = true;
    const task = endForAll ? endMeeting(meeting.code, session.token) : leaveMeeting(meeting.code, session.token);
    void task.catch(() => undefined);
    wsRef.current?.close();
    onLeft();
  }

  function sendChat() {
    const text = draft.trim();
    if (!text) return;
    send({ type: "chat", text });
    setDraft("");
  }

  function openPanel(next: "people" | "chat") {
    setPopover(null);
    setPanel((current) => (current === next ? null : next));
    if (next === "chat") setUnread(0);
  }

  const people = [
    {
      id: session.participant_id,
      name: session.display_name,
      role: session.role,
      audio: audioOn,
      video: videoOn,
      self: true,
    },
    ...peers.map((peer) => ({ ...peer, self: false })),
  ].filter((person) => person.name.toLowerCase().includes(peopleQuery.trim().toLowerCase()));

  const count = 1 + peers.length;
  const galleryClass = count === 1 ? "n1" : count === 2 ? "n2" : count <= 4 ? "n4" : "many";
  const blocked = ended || removed;

  return (
    <div className="room">
      <header className="room-top">
        <div className="room-title">
          <ShieldIcon size={16} />
          <span>{meeting.title}</span>
          {recording && (
            <span className="rec-dot">
              <i /> REC
            </span>
          )}
        </div>
        <button
          className="id-chip"
          onClick={() => {
            void copyText(meeting.display_code);
            toast.show("Meeting ID copied");
          }}
        >
          ID: {meeting.display_code}
        </button>
      </header>
      <div className="room-body">
        <div className="stage">
          {banner && <div className="banner">{banner}</div>}
          <div className={`gallery ${count === 2 ? "speaker" : galleryClass}`}>
            {count === 2 &&
              peers.map((peer) => (
                <Tile
                  key={peer.id}
                  name={`${peer.name}${peer.role === "host" ? " (Host)" : ""}`}
                  audio={peer.audio}
                  video={peer.video}
                  stream={peer.stream}
                  mediaVersion={mediaVersion}
                />
              ))}
            <div className={count === 2 ? "self-pip" : undefined}>
              <Tile
                name={`${session.display_name} (${session.role === "host" ? "Host, " : ""}me)`}
                audio={audioOn}
                video={videoOn || sharing}
                stream={localStream}
                mirror={!sharing && videoOn}
                mediaVersion={mediaVersion}
                videoRef={selfVideoRef}
                muted
              />
            </div>
            {count !== 2 &&
              peers.map((peer) => (
                <Tile
                  key={peer.id}
                  name={`${peer.name}${peer.role === "host" ? " (Host)" : ""}`}
                  audio={peer.audio}
                  video={peer.video}
                  stream={peer.stream}
                  mediaVersion={mediaVersion}
                />
              ))}
          </div>
          {floats.map((float) => (
            <span key={float.id} className="float-emoji" style={{ left: `${float.x}%` }}>
              {float.emoji}
            </span>
          ))}
          {blocked && (
            <div className="room-overlay">
              <h2>{removed ? "The host removed you from the meeting" : "The meeting has ended"}</h2>
              <button className="btn-primary" onClick={onLeft}>
                Back to home
              </button>
            </div>
          )}
          {disconnected && !blocked && (
            <div className="room-overlay">
              <h2>Disconnected from the meeting</h2>
              <div className="overlay-actions">
                <button className="btn-primary" onClick={() => window.location.reload()}>
                  Rejoin
                </button>
                <button className="btn-ghost light" onClick={onLeft}>
                  Home
                </button>
              </div>
            </div>
          )}
        </div>
        {panel && (
          <aside className="panel">
            <header className="panel-h">
              <strong>{panel === "people" ? `Participants (${count})` : "Chat"}</strong>
              <div className="panel-actions">
                {panel === "people" && session.role === "host" && (
                  <button className="text-btn light" onClick={() => send({ type: "mute-all" })}>
                    Mute all
                  </button>
                )}
                <button className="icon-btn light" aria-label="Close panel" onClick={() => setPanel(null)}>
                  <CloseIcon />
                </button>
              </div>
            </header>
            {panel === "people" ? (
              <>
                <input
                  className="panel-search"
                  placeholder="Search participants"
                  value={peopleQuery}
                  onChange={(event) => setPeopleQuery(event.target.value)}
                />
                <div className="panel-scroll">
                  {people.map((person) => (
                    <div className="person" key={person.id}>
                      <Avatar name={person.name} size={32} />
                      <div className="grow">
                        <div className="nm">
                          {person.self ? `${session.display_name} (me)` : person.name}
                          {person.role === "host" && <span className="tag">Host</span>}
                        </div>
                      </div>
                      <span className={person.audio ? "mini" : "mini off"}>
                        {person.audio ? <MicIcon size={16} /> : <MicOffIcon size={16} />}
                      </span>
                      {session.role === "host" && !person.self && (
                        <>
                          <button className="text-btn light" onClick={() => send({ type: "mute", participantId: person.id })}>
                            Mute
                          </button>
                          <button
                            className="text-btn danger"
                            onClick={() => send({ type: "remove", participantId: person.id })}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="chat-log">
                  {messages.length === 0 && <p className="hint light">No messages yet. Say hello.</p>}
                  {messages.map((message) => (
                    <div className="chat-msg" key={message.id}>
                      <div>
                        <span className="who">
                          {message.sender_id === session.participant_id ? "You" : message.sender_name}
                        </span>
                        <span className="when">{formatMessageTime(message.sent_at)}</span>
                      </div>
                      <p>{message.body}</p>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form
                  className="chat-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendChat();
                  }}
                >
                  <input
                    value={draft}
                    placeholder="Type a message"
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button className="send" type="submit" aria-label="Send" disabled={!draft.trim()}>
                    <SendIcon />
                  </button>
                </form>
              </>
            )}
          </aside>
        )}
      </div>
      <footer className="controls">
        <div className="ctrl-side" />
        <div className="ctrl-group">
          <Ctrl label={audioOn ? "Mute" : "Unmute"} off={!audioOn} onClick={() => void toggleAudio()}>
            {audioOn ? <MicIcon /> : <MicOffIcon />}
          </Ctrl>
          <Ctrl label={videoOn && !sharing ? "Stop Video" : "Start Video"} off={!videoOn || sharing} onClick={() => void toggleVideo()}>
            {videoOn && !sharing ? <CameraIcon /> : <CameraOffIcon />}
          </Ctrl>
          <div className="ctrl-wrap">
            <Ctrl label="Security" onClick={() => setPopover(popover === "security" ? null : "security")}>
              <ShieldIcon />
            </Ctrl>
            {popover === "security" && (
              <div className="pop" data-pop>
                <strong>Meeting info</strong>
                <p>{meeting.title}</p>
                <button onClick={() => void copyText(meeting.display_code).then(() => toast.show("Meeting ID copied"))}>
                  Copy ID {meeting.display_code}
                </button>
                {meeting.passcode && (
                  <button onClick={() => void copyText(meeting.passcode || "").then(() => toast.show("Passcode copied"))}>
                    Copy passcode {meeting.passcode}
                  </button>
                )}
                <button
                  onClick={() =>
                    void copyText(invitation(meeting, window.location.origin)).then(() => toast.show("Invitation copied"))
                  }
                >
                  Copy invitation
                </button>
              </div>
            )}
          </div>
          <Ctrl label="Participants" badge={count} onClick={() => openPanel("people")}>
            <UsersIcon />
          </Ctrl>
          <Ctrl label="Chat" badge={unread || undefined} onClick={() => openPanel("chat")}>
            <ChatIcon />
          </Ctrl>
          <Ctrl label={sharing ? "Stop Share" : "Share Screen"} active={sharing} onClick={() => void toggleShare()}>
            <ScreenIcon />
          </Ctrl>
          {session.role === "host" && (
            <Ctrl label={recording ? "Stop" : "Record"} hot={recording} onClick={toggleRecord}>
              <RecordIcon />
            </Ctrl>
          )}
          <div className="ctrl-wrap">
            <Ctrl label="Reactions" onClick={() => setPopover(popover === "reactions" ? null : "reactions")}>
              <ReactIcon />
            </Ctrl>
            {popover === "reactions" && (
              <div className="pop row" data-pop>
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    className="emoji"
                    onClick={() => {
                      send({ type: "reaction", emoji });
                      setPopover(null);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ctrl-wrap">
            <Ctrl label="More" onClick={() => setPopover(popover === "more" ? null : "more")}>
              <MoreIcon />
            </Ctrl>
            {popover === "more" && (
              <div className="pop" data-pop>
                <button
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen();
                    else void document.documentElement.requestFullscreen();
                    setPopover(null);
                  }}
                >
                  Full screen
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="leave-wrap">
          {session.role === "host" ? (
            <div className="ctrl-wrap">
              <button className="leave-btn" onClick={() => setPopover(popover === "leave" ? null : "leave")}>
                End
              </button>
              {popover === "leave" && (
                <div className="pop leave-pop" data-pop>
                  <button onClick={() => leave(false)}>Leave meeting</button>
                  <button className="danger" onClick={() => leave(true)}>
                    End meeting for all
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="leave-btn" onClick={() => leave(false)}>
              Leave
            </button>
          )}
        </div>
      </footer>
      {toast.node}
    </div>
  );
}

function Ctrl({
  label,
  children,
  onClick,
  off,
  active,
  hot,
  badge,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  off?: boolean;
  active?: boolean;
  hot?: boolean;
  badge?: number;
}) {
  return (
    <button className={hot ? "ctrl hot" : active ? "ctrl active" : "ctrl"} onClick={onClick}>
      <span className={off ? "ctrl-icon off" : "ctrl-icon"}>{children}</span>
      <span className="ctrl-label">{label}</span>
      {!!badge && <span className="badge">{badge}</span>}
    </button>
  );
}

function Tile({
  name,
  audio,
  video,
  stream,
  mirror,
  mediaVersion,
  videoRef,
  muted,
}: {
  name: string;
  audio: boolean;
  video: boolean;
  stream: MediaStream | null;
  mirror?: boolean;
  mediaVersion: number;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  muted?: boolean;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = videoRef?.current || localRef.current;
    if (element && stream) element.srcObject = stream;
  }, [stream, mediaVersion, videoRef]);

  return (
    <div className="tile">
      {video && stream ? (
        <video
          ref={(node) => {
            localRef.current = node;
            if (videoRef) videoRef.current = node;
          }}
          autoPlay
          playsInline
          muted={muted}
          className={mirror ? "mirror" : undefined}
        />
      ) : (
        <div className="tile-avatar">
          <Avatar name={name} size={96} />
        </div>
      )}
      <div className="nameplate">
        {!audio && <MicOffIcon size={14} />}
        <span>{name}</span>
      </div>
    </div>
  );
}
