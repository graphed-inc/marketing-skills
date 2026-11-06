export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addUtcDays(day: string, days: number): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isUtcDay(value: string | undefined): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Inclusive day count. Same start and end is 1. */
export function inclusiveDays(start: string, end: string): number {
  const ms =
    Date.parse(`${end.slice(0, 10)}T00:00:00Z`) -
    Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return 1;
  return Math.round(ms / 86_400_000) + 1;
}

/** Inclusive dates the page will query and draw. Longer ranges keep `end` and move `start` forward. */
export const MAX_WINDOW_DAYS = 366;

export function readWindow(
  startParam: string | undefined,
  endParam: string | undefined,
): { start: string; end: string } {
  const today = utcToday();
  const end = isUtcDay(endParam) ? endParam : today;
  const start = isUtcDay(startParam) ? startParam : addUtcDays(end, -29);
  const ordered = start <= end ? { start, end } : { start: end, end: start };
  if (inclusiveDays(ordered.start, ordered.end) <= MAX_WINDOW_DAYS) return ordered;
  return { start: addUtcDays(ordered.end, -(MAX_WINDOW_DAYS - 1)), end: ordered.end };
}

export function priorWindow(start: string, end: string): { start: string; end: string } {
  const span = inclusiveDays(start, end);
  const priorEnd = addUtcDays(start, -1);
  return { start: addUtcDays(priorEnd, -(span - 1)), end: priorEnd };
}

export function percentChange(current: number, prior: number): string | null {
  if (prior === 0) return null;
  const rounded = Math.round(((current - prior) / Math.abs(prior)) * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
