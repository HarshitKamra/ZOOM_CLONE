import type { Meeting } from "./types";

export function normalizeCode(raw: string) {
  return (raw || "").replace(/\D/g, "");
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() || "").join("");
  return letters || "?";
}

const COLORS = ["#0E72ED", "#F26D21", "#1C8B3C", "#7B61FF", "#E02828", "#0D9488", "#D97706"];

export function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function formatClock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string | null) {
  if (!iso) return "Scheduled";
  const date = new Date(iso);
  const today = new Date();
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(date) - start(today)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function sortUpcoming(rows: Meeting[]) {
  return [...rows].sort((a, b) => {
    if ((a.status === "live") !== (b.status === "live")) return a.status === "live" ? -1 : 1;
    return new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime();
  });
}

export function sortRecent(rows: Meeting[]) {
  return [...rows].sort(
    (a, b) =>
      new Date(b.ended_at || b.scheduled_at || 0).getTime() -
      new Date(a.ended_at || a.scheduled_at || 0).getTime()
  );
}

export function groupMeetings(rows: Meeting[], recent = false) {
  const groups: { label: string; items: Meeting[] }[] = [];
  for (const meeting of rows) {
    const label =
      !recent && meeting.status === "live"
        ? "Now"
        : dayLabel(recent ? meeting.ended_at || meeting.scheduled_at : meeting.scheduled_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(meeting);
    else groups.push({ label, items: [meeting] });
  }
  return groups;
}

export function invitation(meeting: Meeting, origin: string) {
  const when = meeting.scheduled_at
    ? new Date(meeting.scheduled_at).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Now";
  const link = origin + (meeting.invite_path || `/j/${meeting.code}`);
  const lines = [
    `${meeting.host_name} is inviting you to a Zoom meeting.`,
    "",
    `Topic: ${meeting.title}`,
    `Time: ${when}`,
    `Duration: ${meeting.duration_minutes} minutes`,
  ];
  if (meeting.description) lines.push("", meeting.description);
  lines.push("", "Join Zoom Meeting", link, "", `Meeting ID: ${meeting.display_code}`);
  if (meeting.passcode) lines.push(`Passcode: ${meeting.passcode}`);
  return lines.join("\n");
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export function sessionKey(code: string) {
  return `zoom-session:${normalizeCode(code)}`;
}

export const PENDING_JOIN = "zoom-pending-join";
export const NAME_KEY = "zoom-display-name";
