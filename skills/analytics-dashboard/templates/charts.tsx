"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { calendarWeeks, compact, shortDay } from "./format";

function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(Math.floor(node.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function svgId(raw: string, prefix: string) {
  return `${prefix}-${raw.replace(/:/g, "")}`;
}

type Tip = { x: number; y: number; label: string; value: string };

function HoverTip({ tip }: { tip: Tip }) {
  const below = tip.y < 52;
  return (
    <div
      className={`pointer-events-none absolute z-20 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs shadow-md ${below ? "" : "-translate-y-full"}`}
      style={{ left: tip.x, top: below ? tip.y + 12 : tip.y - 8 }}
    >
      <p className="text-muted-foreground">{tip.label}</p>
      <p className="font-medium tabular-nums text-popover-foreground">{tip.value}</p>
    </div>
  );
}

function Empty({ height, message }: { height: string; message: string }) {
  return (
    <div className={`flex ${height} items-center justify-center text-sm text-muted-foreground`}>
      {message}
    </div>
  );
}

function smoothLine(points: { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M${first.x},${first.y}`;
  let path = `M${first.x},${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    const mid = (from.x + to.x) / 2;
    path += ` C${mid},${from.y} ${mid},${to.y} ${to.x},${to.y}`;
  }
  return path;
}

function seriesPoints(
  data: { value: number }[],
  pad: { top: number; right: number; bottom: number; left: number },
  width: number,
  height: number,
) {
  const values = data.map((row) => row.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = maxValue - minValue || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yFor = (value: number) => pad.top + innerH - ((value - minValue) / span) * innerH;
  const points = data.map((row, index) => ({
    x: pad.left + (data.length === 1 ? innerW / 2 : (index / (data.length - 1)) * innerW),
    y: yFor(row.value),
    value: row.value,
  }));
  const tickValues = minValue < 0 ? [minValue, 0, maxValue] : [0, maxValue / 2, maxValue];
  return { points, yFor, tickValues };
}

function Grid({
  ticks,
  padLeft,
  padRight,
  width,
}: {
  ticks: { y: number; text: string }[];
  padLeft: number;
  padRight: number;
  width: number;
}) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={`${tick.text}-${tick.y}`}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={tick.y}
            y2={tick.y}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="3 6"
          />
          <text x={padLeft - 8} y={tick.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
            {tick.text}
          </text>
        </g>
      ))}
    </>
  );
}

function Plot({
  label,
  height,
  tip,
  children,
}: {
  label: string;
  height: number;
  tip: Tip | null;
  children: (width: number) => ReactNode;
}) {
  const { ref, width } = usePlotWidth();
  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block w-full"
          role="img"
          aria-label={label}
        >
          {children(width)}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {tip ? <HoverTip tip={tip} /> : null}
    </div>
  );
}

function nearestIndex(points: { x: number }[], x: number) {
  let nearest = 0;
  let best = Infinity;
  points.forEach((point, index) => {
    const distance = Math.abs(point.x - x);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return nearest;
}

export function LineChart({
  data,
  label,
}: {
  data: { day: string; value: number }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (data.length === 0) return <Empty height="h-56" message="No rows in this window." />;
  const height = 228;
  const pad = { top: 16, right: 8, bottom: 28, left: 44 };

  return (
    <Plot label={label} height={height} tip={null}>
      {(width) => {
        const { points, yFor, tickValues } = seriesPoints(data, pad, width, height);
        const line = smoothLine(points);
        const point = active != null ? points[active] : null;
        const row = active != null ? data[active] : null;
        const marker = point ?? (points.length === 1 ? points[0] : null);
        return (
          <g
            onMouseMove={(event) => {
              const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
              if (!rect || rect.width === 0) return;
              const x = ((event.clientX - rect.left) / rect.width) * width;
              setActive(nearestIndex(points, x));
            }}
            onMouseLeave={() => setActive(null)}
          >
            <rect x={0} y={0} width={width} height={height} fill="transparent" />
            <Grid
              ticks={tickValues.map((value) => ({ y: yFor(value), text: compact(value) }))}
              padLeft={pad.left}
              padRight={pad.right}
              width={width}
            />
            <path d={line} fill="none" className="stroke-emerald-400/25" strokeWidth="7" strokeLinecap="round" />
            <path d={line} fill="none" className="stroke-emerald-400" strokeWidth="2.5" strokeLinecap="round" />
            {marker ? (
              <g>
                {point ? (
                  <line
                    x1={marker.x}
                    x2={marker.x}
                    y1={pad.top}
                    y2={height - pad.bottom}
                    stroke="currentColor"
                    className="text-border"
                  />
                ) : null}
                <circle cx={marker.x} cy={marker.y} r="6" className="fill-emerald-400/20" />
                <circle cx={marker.x} cy={marker.y} r="3.5" className="fill-card stroke-emerald-400" strokeWidth="2" />
              </g>
            ) : null}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((index) => {
              const mark = points[index];
              const day = data[index];
              if (!mark || !day) return null;
              const anchor = index === 0 ? "start" : index === data.length - 1 ? "end" : "middle";
              return (
                <text
                  key={day.day}
                  x={mark.x}
                  y={height - 8}
                  textAnchor={anchor}
                  className="fill-muted-foreground text-[11px]"
                >
                  {shortDay(day.day)}
                </text>
              );
            })}
            {point && row ? (
              <foreignObject
                x={Math.min(Math.max(point.x - 64, 4), width - 132)}
                y={Math.max(point.y - 46, 4)}
                width="128"
                height="40"
                style={{ pointerEvents: "none" }}
              >
                <div className="w-fit rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                  <p className="text-muted-foreground">{shortDay(row.day)}</p>
                  <p className="font-medium tabular-nums text-popover-foreground">{compact(row.value)}</p>
                </div>
              </foreignObject>
            ) : null}
          </g>
        );
      }}
    </Plot>
  );
}

export function AreaChart({
  data,
  label,
}: {
  data: { day: string; value: number }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const reactId = useId();
  const fillId = svgId(reactId, "area");
  if (data.length === 0) return <Empty height="h-56" message="No rows in this window." />;
  const height = 228;
  const pad = { top: 16, right: 8, bottom: 28, left: 44 };

  return (
    <Plot label={label} height={height} tip={null}>
      {(width) => {
        const { points, yFor, tickValues } = seriesPoints(data, pad, width, height);
        const line = smoothLine(points);
        const zeroY = yFor(0);
        const area = `${line} L${points[points.length - 1]?.x ?? pad.left},${zeroY} L${points[0]?.x ?? pad.left},${zeroY} Z`;
        const point = active != null ? points[active] : null;
        const row = active != null ? data[active] : null;
        const marker = point ?? (points.length === 1 ? points[0] : null);
        return (
          <g
            onMouseMove={(event) => {
              const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
              if (!rect || rect.width === 0) return;
              const x = ((event.clientX - rect.left) / rect.width) * width;
              setActive(nearestIndex(points, x));
            }}
            onMouseLeave={() => setActive(null)}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width={width} height={height} fill="transparent" />
            <Grid
              ticks={tickValues.map((value) => ({ y: yFor(value), text: compact(value) }))}
              padLeft={pad.left}
              padRight={pad.right}
              width={width}
            />
            <path d={area} fill={`url(#${fillId})`} />
            <path d={line} fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" />
            {marker ? (
              <g>
                {point ? (
                  <line x1={marker.x} x2={marker.x} y1={pad.top} y2={height - pad.bottom} className="stroke-border" />
                ) : null}
                <circle cx={marker.x} cy={marker.y} r="3.5" className="fill-card stroke-emerald-400" strokeWidth="2" />
              </g>
            ) : null}
            {point && row ? (
              <foreignObject
                x={Math.min(Math.max(point.x - 64, 4), width - 132)}
                y={Math.max(point.y - 46, 4)}
                width="128"
                height="40"
                style={{ pointerEvents: "none" }}
              >
                <div className="w-fit rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                  <p className="text-muted-foreground">{shortDay(row.day)}</p>
                  <p className="font-medium tabular-nums text-popover-foreground">{compact(row.value)}</p>
                </div>
              </foreignObject>
            ) : null}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((index) => {
              const mark = points[index];
              const day = data[index];
              if (!mark || !day) return null;
              const anchor = index === 0 ? "start" : index === data.length - 1 ? "end" : "middle";
              return (
                <text key={day.day} x={mark.x} y={height - 8} textAnchor={anchor} className="fill-muted-foreground text-[11px]">
                  {shortDay(day.day)}
                </text>
              );
            })}
          </g>
        );
      }}
    </Plot>
  );
}

export function ColumnChart({
  data,
  label,
}: {
  data: { label: string; value: number }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const reactId = useId();
  const fillId = svgId(reactId, "column");
  if (data.length === 0) return <Empty height="h-48" message="No rows in this window." />;
  const height = 200;

  return (
    <Plot label={label} height={height} tip={null}>
      {(width) => {
        const pad = { top: 12, right: 8, bottom: 24, left: 40 };
        const values = data.map((row) => row.value);
        const minValue = Math.min(0, ...values);
        const maxValue = Math.max(0, ...values);
        const span = maxValue - minValue || 1;
        const innerH = height - pad.top - pad.bottom;
        const innerW = width - pad.left - pad.right;
        const yFor = (value: number) => pad.top + innerH - ((value - minValue) / span) * innerH;
        const zeroY = yFor(0);
        const slot = innerW / data.length;
        const barW = Math.max(slot * 0.62, 4);
        const ticks = (minValue < 0 ? [minValue, 0, maxValue] : [0, maxValue]).map((value) => ({
          y: yFor(value),
          text: compact(value),
        }));
        const row = active != null ? data[active] : null;
        const barX = active != null ? pad.left + active * slot + (slot - barW) / 2 : 0;
        return (
          <>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity="1" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <Grid ticks={ticks} padLeft={pad.left} padRight={pad.right} width={width} />
            {data.map((item, index) => {
              const x = pad.left + index * slot + (slot - barW) / 2;
              const y = Math.min(yFor(item.value), zeroY);
              const barHeight = Math.abs(yFor(item.value) - zeroY);
              return (
                <g key={item.label} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
                  <rect x={pad.left + index * slot} y={pad.top} width={slot} height={innerH} fill="transparent" />
                  {barHeight > 0 ? (
                    <rect x={x} y={y} width={barW} height={barHeight} rx={5} fill={`url(#${fillId})`} />
                  ) : null}
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {item.label}
                  </text>
                </g>
              );
            })}
            {row && active != null ? (
              <foreignObject x={Math.min(Math.max(barX, 4), width - 120)} y={8} width="116" height="40" style={{ pointerEvents: "none" }}>
                <div className="w-fit rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                  <p className="text-muted-foreground">{row.label}</p>
                  <p className="font-medium tabular-nums text-popover-foreground">{compact(row.value)}</p>
                </div>
              </foreignObject>
            ) : null}
          </>
        );
      }}
    </Plot>
  );
}

export function BarChart({
  data,
  label,
}: {
  data: { label: string; value: number }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const reactId = useId();
  const fillId = svgId(reactId, "bar");
  if (data.length === 0) return <Empty height="h-40" message="No breakdown rows in this window." />;
  const rows = data.slice(0, 8);
  const rowH = 32;
  const height = rows.length * rowH + 4;

  return (
    <Plot label={label} height={height} tip={null}>
      {(width) => {
        const labelW = Math.min(180, Math.max(96, width * 0.28));
        const valueW = 56;
        const barX = labelW;
        const barMax = Math.max(width - labelW - valueW - 8, 8);
        const maxValue = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
        const activeRow = active != null ? rows[active] : null;
        return (
          <>
            <defs>
              <linearGradient id={fillId} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="1" />
              </linearGradient>
            </defs>
            {rows.map((row, index) => {
              const y = index * rowH;
              const magnitude = Math.abs(row.value);
              const barW = magnitude === 0 ? 0 : (magnitude / maxValue) * barMax;
              const text = row.label.length > 24 ? `${row.label.slice(0, 23)}…` : row.label;
              return (
                <g key={`${row.label}-${index}`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
                  <rect x={0} y={y} width={width} height={rowH} fill="transparent" />
                  <text x={0} y={y + 20} className="fill-foreground text-[12px]">
                    {text}
                  </text>
                  <rect x={barX} y={y + 8} width={barMax} height={12} rx={6} className="fill-muted" />
                  {barW > 0 ? <rect x={barX} y={y + 8} width={barW} height={12} rx={6} fill={`url(#${fillId})`} /> : null}
                  <text x={width} y={y + 20} textAnchor="end" className="fill-foreground text-[12px]">
                    {compact(row.value)}
                  </text>
                </g>
              );
            })}
            {activeRow && active != null ? (
              <foreignObject x={Math.max(width - 220, 8)} y={active * rowH} width="210" height="32" style={{ pointerEvents: "none" }}>
                <div className="ml-auto w-fit rounded-md border bg-popover px-2 py-0.5 text-xs shadow-md">
                  <span className="text-muted-foreground">{activeRow.label}</span>
                  <span className="ml-2 font-medium tabular-nums text-popover-foreground">{compact(activeRow.value)}</span>
                </div>
              </foreignObject>
            ) : null}
          </>
        );
      }}
    </Plot>
  );
}

const DONUT_COLORS = ["#34d399", "#6ee7b7", "#059669", "#a7f3d0", "#047857", "#64748b"];

export function DonutChart({
  data,
  label,
}: {
  data: { label: string; value: number }[];
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (data.length === 0 || total <= 0) {
    return <Empty height="h-48" message="No share to chart in this window." />;
  }
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const hovered = active != null ? data[active] : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative">
        <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label={label}>
          <circle cx="90" cy="90" r={radius} fill="none" className="stroke-muted" strokeWidth="16" />
          {data.map((row, index) => {
            const length = (row.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const color = DONUT_COLORS[index % DONUT_COLORS.length] ?? "#34d399";
            const element = (
              <circle
                key={`${row.label}-${index}`}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={active === index ? 20 : 16}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                transform="rotate(-90 90 90)"
                className="cursor-pointer"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              />
            );
            offset += length;
            return element;
          })}
          <text x="90" y="86" textAnchor="middle" className="fill-muted-foreground text-[11px]">
            Total
          </text>
          <text x="90" y="106" textAnchor="middle" className="fill-foreground text-[16px] font-semibold">
            {compact(hovered ? hovered.value : total)}
          </text>
        </svg>
        {hovered ? (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
            <p className="max-w-40 truncate text-muted-foreground">{hovered.label}</p>
            <p className="font-medium tabular-nums text-popover-foreground">
              {compact(hovered.value)} · {Math.round((hovered.value / total) * 100)}%
            </p>
          </div>
        ) : null}
      </div>
      <ul className="grid flex-1 gap-1.5 text-sm">
        {data.map((row, index) => {
          const color = DONUT_COLORS[index % DONUT_COLORS.length] ?? "#34d399";
          const share = Math.round((row.value / total) * 100);
          return (
            <li
              key={`${row.label}-${index}`}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
              <span className="text-muted-foreground tabular-nums">{share}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sparkline({ data }: { data: number[] }) {
  const reactId = useId();
  const fillId = svgId(reactId, "spark");
  if (data.length === 0) return null;
  const width = 120;
  const height = 36;
  const minValue = Math.min(0, ...data);
  const maxValue = Math.max(0, ...data);
  const span = maxValue - minValue || 1;
  const points = data.map((value, index) => ({
    x: data.length === 1 ? width / 2 : (index / (data.length - 1)) * width,
    y: height - ((value - minValue) / span) * (height - 4) - 2,
  }));
  const line = smoothLine(points);
  const zeroY = height - ((0 - minValue) / span) * (height - 4) - 2;
  const area = `${line} L${points[points.length - 1]?.x ?? 0},${zeroY} L${points[0]?.x ?? 0},${zeroY} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-24" aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function heatColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "hsl(var(--muted))";
  const strength = 0.22 + 0.78 * (value / max);
  return `rgba(52, 211, 153, ${strength})`;
}

function HeatLegend({ max }: { max: number }) {
  const steps = [0, 0.35, 0.6, 0.85, 1];
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>Low</span>
      <div className="flex gap-1">
        {steps.map((step) => (
          <span key={step} className="size-2.5 rounded-sm" style={{ backgroundColor: heatColor(step, 1) }} />
        ))}
      </div>
      <span>{compact(max)}</span>
    </div>
  );
}

function cellTip(event: MouseEvent<HTMLElement>, host: HTMLElement, label: string, value: string): Tip {
  const rect = host.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    label,
    value,
  };
}

export function CalendarHeatmap({
  data,
  start,
  end,
  label,
}: {
  data: { day: string; value: number }[];
  start: string;
  end: string;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const weeks = calendarWeeks(data, start, end);
  const inRange = weeks.flatMap((week) => week.cells).filter((cell) => cell.inRange);
  if (inRange.length === 0) return <Empty height="h-28" message="No days in this window" />;
  const max = Math.max(...inRange.map((cell) => cell.value ?? 0), 0);
  const weekday = ["M", "T", "W", "T", "F", "S", "S"];
  let lastMonth = "";
  const months = weeks.map((week) => {
    const show = week.label !== lastMonth;
    lastMonth = week.label;
    return show ? week.label : "";
  });

  return (
    <div ref={host} className="relative flex w-full flex-col gap-2" role="img" aria-label={label}>
      <div
        className="grid w-max max-w-full gap-1"
        style={{ gridTemplateColumns: `1.25rem repeat(${weeks.length}, 1rem)` }}
      >
        <span />
        {months.map((month, index) => (
          <span key={`${month}-${index}`} className="truncate text-[10px] text-muted-foreground">
            {month}
          </span>
        ))}
        {weekday.map((name, row) => (
          <div key={`${name}-${row}`} className="contents">
            <span className="flex items-center text-[10px] text-muted-foreground">{row % 2 === 0 ? name : ""}</span>
            {weeks.map((week) => {
              const cell = week.cells[row];
              if (!cell) return <span key={`${week.label}-${row}`} />;
              return (
                <span
                  key={cell.day}
                  className={
                    cell.missing
                      ? "size-4 rounded-[3px] ring-1 ring-inset ring-border"
                      : "size-4 rounded-[3px]"
                  }
                  style={{
                    backgroundColor:
                      cell.inRange && !cell.missing ? heatColor(cell.value ?? 0, max) : "transparent",
                  }}
                  onMouseEnter={(event) => {
                    if (!cell.inRange || !host.current) return;
                    setTip(
                      cellTip(
                        event,
                        host.current,
                        shortDay(cell.day),
                        cell.missing ? "No rows" : compact(cell.value ?? 0),
                      ),
                    );
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <HeatLegend max={max} />
      {tip ? <HoverTip tip={tip} /> : null}
    </div>
  );
}

function histogramBuckets(values: number[], count = 8): { label: string; value: number; end: string }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: compact(min), end: compact(min), value: values.length }];
  const width = (max - min) / count;
  const buckets = Array.from({ length: count }, (_, index) => ({
    label: compact(min + index * width),
    end: compact(min + (index + 1) * width),
    value: 0,
  }));
  for (const value of values) {
    const index = Math.min(count - 1, Math.floor((value - min) / width));
    const bucket = buckets[index];
    if (bucket) bucket.value += 1;
  }
  return buckets;
}

export function Histogram({ data, label }: { data: number[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const buckets = histogramBuckets(data);
  if (buckets.length === 0) return <Empty height="h-40" message="No daily values" />;
  const height = 168;

  return (
    <Plot label={label} height={height} tip={null}>
      {(width) => {
        const pad = { top: 12, right: 8, bottom: 24, left: 28 };
        const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
        const innerW = width - pad.left - pad.right;
        const innerH = height - pad.top - pad.bottom;
        const barW = innerW / buckets.length;
        const bucket = active != null ? buckets[active] : null;
        return (
          <>
            {buckets.map((item, index) => {
              const barH = (item.value / max) * innerH;
              const x = pad.left + index * barW;
              const y = pad.top + innerH - barH;
              return (
                <g key={`${item.label}-${index}`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
                  <rect x={x} y={pad.top} width={barW} height={innerH} fill="transparent" />
                  <rect
                    x={x + 2}
                    y={y}
                    width={Math.max(barW - 4, 0)}
                    height={barH}
                    rx="3"
                    fill="#34d399"
                    opacity={item.value === 0 ? 0.2 : 0.9}
                  />
                </g>
              );
            })}
            <text x={pad.left} y={height - 6} className="fill-muted-foreground text-[10px]">
              {buckets[0]?.label}
            </text>
            <text x={width - pad.right} y={height - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {compact(Math.max(...data))}
            </text>
            {bucket && active != null ? (
              <foreignObject
                x={Math.min(Math.max(pad.left + active * barW, 4), width - 140)}
                y={4}
                width="136"
                height="40"
                style={{ pointerEvents: "none" }}
              >
                <div className="w-fit rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                  <p className="text-muted-foreground">
                    {bucket.label}–{bucket.end}
                  </p>
                  <p className="font-medium tabular-nums text-popover-foreground">{bucket.value} days</p>
                </div>
              </foreignObject>
            ) : null}
          </>
        );
      }}
    </Plot>
  );
}

export function MatrixHeatmap({
  data,
  label,
}: {
  data: { label: string; week: string; value: number }[];
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  if (data.length === 0) return <Empty height="h-40" message="No grouped weeks" />;
  const totals = new Map<string, number>();
  for (const row of data) totals.set(row.label, (totals.get(row.label) ?? 0) + row.value);
  const labels = [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name]) => name);
  const weeks = [...new Set(data.map((row) => row.week.slice(0, 10)))].sort();
  const lookup = new Map(data.map((row) => [`${row.label}|${row.week.slice(0, 10)}`, row.value]));
  const max = Math.max(0, ...labels.flatMap((name) => weeks.map((week) => lookup.get(`${name}|${week}`) ?? 0)));

  return (
    <div ref={host} className="relative flex w-full flex-col gap-2" role="img" aria-label={label}>
      <div
        className="grid w-full gap-1"
        style={{ gridTemplateColumns: `minmax(5.5rem, 8rem) repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        <span />
        {weeks.map((week) => (
          <span key={week} className="truncate text-center text-[10px] text-muted-foreground">
            {shortDay(week)}
          </span>
        ))}
        {labels.map((name) => (
          <div key={name} className="contents">
            <span className="truncate pr-2 text-xs text-foreground">{name}</span>
            {weeks.map((week) => {
              const value = lookup.get(`${name}|${week}`) ?? 0;
              return (
                <span
                  key={`${name}-${week}`}
                  className="h-6 w-full rounded-sm"
                  style={{ backgroundColor: heatColor(value, max) }}
                  onMouseEnter={(event) => {
                    if (!host.current) return;
                    setTip(cellTip(event, host.current, `${name} · ${shortDay(week)}`, compact(value)));
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <HeatLegend max={max} />
      {tip ? <HoverTip tip={tip} /> : null}
    </div>
  );
}
