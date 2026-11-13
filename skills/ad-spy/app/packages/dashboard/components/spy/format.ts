export const PLATFORMS: Record<string, [string, string]> = {
  facebook: ["f", "Meta"],
  google: ["G", "Google"],
  linkedin: ["in", "LinkedIn"],
};

export function ago(value: string | null | undefined): string {
  if (!value) return "never";
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return "–";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function platformName(platform: string): string {
  return PLATFORMS[platform]?.[1] || platform;
}

export function mondayKey(date: Date): string {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() - ((next.getUTCDay() + 6) % 7));
  return next.toISOString().slice(0, 10);
}
