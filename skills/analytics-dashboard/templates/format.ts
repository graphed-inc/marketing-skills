export function compact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function shortDay(day: string): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function weekdayTotals(rows: { day: string; value: number }[]): { label: string; value: number }[] {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const totals = names.map((label) => ({ label, value: 0 }));
  for (const row of rows) {
    const date = new Date(`${row.day.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    const index = (date.getUTCDay() + 6) % 7;
    const bucket = totals[index];
    if (bucket) bucket.value += row.value;
  }
  return totals;
}

/**
 * Shares of a window. Returns null when any group or the window total is
 * negative, because dropping those values would no longer add up to the scorecard.
 */
export function donutSlices(
  rows: { label: string; value: number }[],
  total: number,
): { label: string; value: number }[] | null {
  if (total < 0 || rows.some((row) => row.value < 0)) return null;
  const top = rows.slice(0, 5).map((row) => ({ label: row.label, value: row.value }));
  const listed = top.reduce((sum, row) => sum + row.value, 0);
  const other = total - listed;
  if (other > 0) top.push({ label: "Other", value: other });
  return top.filter((row) => row.value > 0);
}

export interface CalendarCell {
  day: string;
  /** Null when the day is outside the window or the query returned no row. */
  value: number | null;
  inRange: boolean;
  /** In the window, and the query returned no row. Distinct from a measured zero. */
  missing: boolean;
}

export function calendarWeeks(
  rows: { day: string; value: number }[],
  start: string,
  end: string,
): { label: string; cells: CalendarCell[] }[] {
  const values = new Map(rows.map((row) => [row.day.slice(0, 10), row.value]));
  const startDate = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const endDate = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || start > end) return [];

  const gridStart = new Date(startDate);
  gridStart.setUTCDate(gridStart.getUTCDate() - ((gridStart.getUTCDay() + 6) % 7));
  const gridEnd = new Date(endDate);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + ((7 - ((gridEnd.getUTCDay() + 6) % 7) - 1 + 7) % 7));

  const weeks: { label: string; cells: CalendarCell[] }[] = [];
  let cells: CalendarCell[] = [];
  let label = "";
  for (
    let cursor = new Date(gridStart);
    cursor.getTime() <= gridEnd.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.toISOString().slice(0, 10);
    const inRange = day >= start.slice(0, 10) && day <= end.slice(0, 10);
    const recorded = values.get(day);
    if (cells.length === 0) {
      label = cursor.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    }
    cells.push({
      day,
      value: inRange && recorded !== undefined ? recorded : null,
      inRange,
      missing: inRange && recorded === undefined,
    });
    if (cells.length === 7) {
      weeks.push({ label, cells });
      cells = [];
    }
  }
  return weeks;
}
