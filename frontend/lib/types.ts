export type Meeting = {
  code: string;
  display_code: string;
  title: string;
  description: string;
  host_name: string;
  passcode?: string | null;
  requires_passcode: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  status: string;
  is_instant: boolean;
  is_personal: boolean;
  invite_path: string;
  host_key?: string | null;
};

export type User = {
  id: number;
  name: string;
  email: string;
  avatar_color: string;
  personal_meeting_code: string;
  personal_display_code: string;
};

export type HomeData = {
  user: User;
  personal_meeting: Meeting;
  upcoming: Meeting[];
  recent: Meeting[];
};

export type JoinSession = {
  participant_id: number;
  display_name: string;
  role: string;
  token: string;
  audio_on: boolean;
  video_on: boolean;
  meeting: Meeting;
};

export type ChatMessage = {
  id: number;
  sender_name: string;
  sender_id: number | null;
  body: string;
  sent_at: string;
};

export type PendingJoin = {
  code: string;
  name: string;
  passcode?: string;
  hostKey?: string | null;
  audio: boolean;
  video: boolean;
  share?: boolean;
};
