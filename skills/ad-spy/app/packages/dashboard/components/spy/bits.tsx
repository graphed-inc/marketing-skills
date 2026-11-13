import type { ReactNode } from "react";
import { PLATFORMS } from "./format";

export function Avatar({ logo, name, size = "" }: { logo?: string | null; name?: string | null; size?: string }) {
  const letter = (name || "?").slice(0, 1).toUpperCase();
  if (logo) return <img className={`av ${size}`.trim()} src={logo} alt="" />;
  return <span className={`av ${size}`.trim()}>{letter}</span>;
}

export function Platform({ id }: { id: string }) {
  const mark = PLATFORMS[id];
  return (
    <span className={`pf ${id}`} title={mark?.[1] || id}>
      {mark?.[0] || "?"}
    </span>
  );
}

export function Chips({ title, items, tone = "badge-secondary" }: { title: string; items?: string[]; tone?: string }) {
  if (!items?.length) return null;
  return (
    <div className="sec">
      <h4>{title}</h4>
      <div className="chips">
        {items.map((item) => (
          <span className={`badge ${tone}`} key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

// 0–20. Chart CSS maps p0…p20 onto width or height. Heat cells use a0…a10.
export function meter(ratio: number): string {
  const step = Math.max(0, Math.min(20, Math.round(ratio * 20)));
  return `p${step}`;
}
