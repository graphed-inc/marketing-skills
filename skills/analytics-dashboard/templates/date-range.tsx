"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import type { DateRange as CalendarRange } from "react-day-picker";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, date || 1);
}

function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pretty(day: string): string {
  return parseDay(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateRange({
  start,
  end,
  presets,
}: {
  start: string;
  end: string;
  presets: { label: string; start: string; end: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<CalendarRange | undefined>({
    from: parseDay(start),
    to: parseDay(end),
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setRange({ from: parseDay(start), to: parseDay(end) });
  }

  function apply() {
    if (!range?.from) return;
    const from = formatDay(range.from);
    const to = formatDay(range.to ?? range.from);
    const [startDay, endDay] = from <= to ? [from, to] : [to, from];
    router.push(`?start=${startDay}&end=${endDay}`);
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const active = preset.start === start && preset.end === end;
          return (
            <a
              key={preset.label}
              href={`?start=${preset.start}&end=${preset.end}`}
              className={cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }))}
            >
              {preset.label}
            </a>
          );
        })}
      </div>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="justify-start gap-2 font-normal">
            <CalendarIcon className="size-4 text-muted-foreground" />
            {pretty(start)} – {pretty(end)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={parseDay(start)}
            selected={range}
            onSelect={setRange}
          />
          <div className="flex items-center justify-between gap-3 border-t p-3">
            <p className="text-xs text-muted-foreground">
              {range?.from ? pretty(formatDay(range.from)) : "Start"}
              {" – "}
              {range?.to ? pretty(formatDay(range.to)) : "End"}
            </p>
            <Button size="sm" type="button" onClick={apply} disabled={!range?.from}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
