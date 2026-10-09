import type { ChatMessage, HomeData, JoinSession, Meeting } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export function wsUrl(path: string) {
  return `${API_URL.replace(/^http/, "ws")}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Can't reach the meeting server.");
  }
  if (!response.ok) {
    let detail = response.statusText || "Request failed";
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

export function getHome() {
  return request<HomeData>("/api/home");
}

export function getMeeting(code: string) {
  return request<Meeting>(`/api/meetings/${encodeURIComponent(code)}`);
}

export function createMeeting(body: {
  title?: string;
  description?: string;
  scheduled_at?: string | null;
  duration_minutes?: number;
  instant?: boolean;
}) {
  return request<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify(body) });
}

export function joinMeeting(
  code: string,
  body: {
    display_name: string;
    passcode?: string;
    host_key?: string | null;
    audio_on?: boolean;
    video_on?: boolean;
  }
) {
  return request<JoinSession>(`/api/meetings/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function leaveMeeting(code: string, token: string) {
  return request<{ ok: boolean }>(`/api/meetings/${encodeURIComponent(code)}/leave`, {
    method: "POST",
    body: JSON.stringify({ token }),
    keepalive: true,
  });
}

export function endMeeting(code: string, token: string) {
  return request<{ ok: boolean }>(`/api/meetings/${encodeURIComponent(code)}/end`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getMessages(code: string) {
  return request<ChatMessage[]>(`/api/meetings/${encodeURIComponent(code)}/messages`);
}
