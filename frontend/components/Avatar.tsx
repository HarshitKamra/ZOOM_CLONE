import { colorFor, initials } from "@/lib/format";

export default function Avatar({
  name,
  color,
  size = 32,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: color || colorFor(name), fontSize: size }}
      aria-hidden="true"
    >
      <span className="avatar-letters">{initials(name)}</span>
    </span>
  );
}
