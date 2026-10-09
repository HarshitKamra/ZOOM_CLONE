type IconProps = { size?: number };

export function ZoomIcon({ name, size = 24 }: IconProps & { name: string }) {
  const url = `url(/zoom-icons/${name}.svg)`;
  return (
    <span
      className="zoom-icon"
      style={{
        width: size,
        height: size,
        maskImage: url,
        WebkitMaskImage: url,
      }}
    />
  );
}

function Base({ size = 24, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function Logo({ size = 32 }: IconProps) {
  return (
    <img
      src="/brand/zoom-icon.jpg"
      width={size}
      height={size}
      alt="Zoom"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), display: "block" }}
    />
  );
}

export function CameraIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="video-on" size={size} />;
}

export function CameraOffIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="video-off" size={size} />;
}

export function MicIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="mic-on" size={size} />;
}

export function MicOffIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="mic-off" size={size} />;
}

export function JoinIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="plus" size={size} />;
}

export function CalendarIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="calendar" size={size} />;
}

export function ScreenIcon({ size = 26 }: IconProps) {
  return <ZoomIcon name="desktop" size={size} />;
}

export function UsersIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="profile" size={size} />;
}

export function ChatIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="chat" size={size} />;
}

export function ShieldIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="shield-checkmark" size={size} />;
}

export function RecordIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="record" size={size} />;
}

export function ReactIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="emoji" size={size} />;
}

export function MoreIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="ellipsis-horizontal" size={size} />;
}

export function AppsIcon({ size = 18 }: IconProps) {
  return <ZoomIcon name="apps" size={size} />;
}

export function HomeIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="home" size={size} />;
}

export function ChatNavIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="team-chat" size={size} />;
}

export function MeetingsIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="video-on" size={size} />;
}

export function BoardIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="whiteboard" size={size} />;
}

export function ContactsIcon({ size = 22 }: IconProps) {
  return <ZoomIcon name="profile" size={size} />;
}

export function GearIcon({ size = 20 }: IconProps) {
  return <ZoomIcon name="setting" size={size} />;
}

export function BellIcon({ size = 20 }: IconProps) {
  return <ZoomIcon name="bell-notification-on" size={size} />;
}

export function SearchIcon({ size = 16 }: IconProps) {
  return <ZoomIcon name="magnifier" size={size} />;
}

export function InfoIcon({ size = 16 }: IconProps) {
  return <ZoomIcon name="information" size={size} />;
}

export function CopyIcon({ size = 16 }: IconProps) {
  return <ZoomIcon name="copy" size={size} />;
}

export function CloseIcon({ size = 18 }: IconProps) {
  return <ZoomIcon name="close" size={size} />;
}

export function CaretIcon({ size = 12 }: IconProps) {
  return <ZoomIcon name="chevron-small-down" size={size} />;
}

export function SendIcon({ size = 18 }: IconProps) {
  return (
    <Base size={size}>
      <path fill="currentColor" d="M3.5 11.2 20 4.5l-6.2 15.2-2.6-6.1-7.7-2.4z" />
    </Base>
  );
}
