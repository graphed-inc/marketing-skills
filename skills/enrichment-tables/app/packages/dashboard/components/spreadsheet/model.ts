import type { Column, ColumnConfig, Draft, Filter, IconName, Json, Preset, Row, Sort } from "./types";

export const ROWH = 36;
export const NUMW = 68;
export const ADDW = 156;

export const TYPE: Record<string, { icon: IconName; name: string; description: string; paid?: boolean }> = {
  text: { icon: "text", name: "Text", description: "Values you type, paste or import." },
  formula: { icon: "formula", name: "Formula", description: "JavaScript over other columns. Free and instant." },
  enrich: { icon: "enrich", name: "Enrichment", description: "One data provider per row: emails, phones, firmographics, search.", paid: true },
  waterfall: { icon: "waterfall", name: "Waterfall", description: "Try providers in order until one finds a value.", paid: true },
  ai: { icon: "ai", name: "AI", description: "Prompt an LLM per row, with optional web research.", paid: true },
  http: { icon: "http", name: "HTTP API", description: "Call any URL per row: webhooks, CRMs, your API." },
};

export const OPS: [string, string][] = [
  ["contains", "contains"],
  ["notcontains", "does not contain"],
  ["is", "is"],
  ["empty", "is empty"],
  ["notempty", "is not empty"],
  ["gt", ">"],
  ["lt", "<"],
  ["error", "has error"],
];

export const fmtCr = (n: number) => n < 0.01 && n > 0 ? "<0.01" : (Math.round(n * 100) / 100).toLocaleString();

export function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value);
}

export function linkLabel(value: string): string {
  return value.replace(/^https?:\/\/(www\.)?/, "");
}

export function presetIcon(preset: Preset): IconName {
  if (preset.kind === "email" || preset.kind === "verify") return "mail";
  if (preset.kind === "phone") return "phone";
  const byCategory: Record<string, IconName> = { People: "user", Companies: "building", Web: "http", Custom: "wrench" };
  return byCategory[preset.category] || "enrich";
}

export function columnSig(columns: { id: number; name: string; position: number }[]): string {
  return columns.map((c) => `${c.id}:${c.name}:${c.position}`).join("|");
}

export function visibleColumns(columns: Column[], hidden: Set<number>): Column[] {
  return columns.filter((c) => !hidden.has(c.id));
}

export function visibleRows(rows: Row[], query: string, filters: Filter[], sort: Sort | null): Row[] {
  const term = query.trim().toLowerCase();
  let view = rows;
  if (term) view = view.filter((row) => Object.values(row.c).some((cell) => String(cell[0]).toLowerCase().includes(term)));
  for (const filter of filters) {
    if (!filter.col) continue;
    const want = String(filter.val || "").toLowerCase();
    view = view.filter((row) => {
      const cell = row.c[filter.col];
      const display = String(cell ? cell[0] : "").toLowerCase();
      const status = cell ? cell[1] : "";
      switch (filter.op) {
        case "empty": return !display;
        case "notempty": return !!display;
        case "contains": return display.includes(want);
        case "notcontains": return !display.includes(want);
        case "is": return display === want;
        case "gt": return parseFloat(display) > parseFloat(want);
        case "lt": return parseFloat(display) < parseFloat(want);
        case "error": return status === "error";
        default: return true;
      }
    });
  }
  if (!sort) return view;
  const { id, dir } = sort;
  const key = (row: Row) => (row.c[id] ? row.c[id][0] : "");
  return [...view].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === "" && y !== "") return 1;
    if (y === "" && x !== "") return -1;
    const nx = parseFloat(x);
    const ny = parseFloat(y);
    return dir * (!isNaN(nx) && !isNaN(ny) ? nx - ny : String(x).localeCompare(String(y)));
  });
}

export function estimateDraft(draft: Draft, presets: Preset[]): number {
  const cfg = draft.config;
  const preset = (id: string | undefined) => presets.find((item) => item.id === id);
  if (draft.type === "enrich") return cfg.preset === "custom" ? Number(cfg.rate) || 0 : preset(cfg.preset)?.rate || 0;
  if (draft.type === "waterfall") return (cfg.steps || []).reduce((sum, step) => sum + (preset(step.preset)?.rate || 0), 0) + (cfg.verify ? 0.046 : 0);
  if (draft.type === "ai") return cfg.web ? 2.5 : String(cfg.model).includes("sonnet") ? 0.6 : 0.1;
  return 0;
}

export function guessLocal(preset: Preset, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const input of preset.inputs) {
    let hit: string | undefined;
    for (const source of input.match || []) {
      const re = new RegExp(source, "i");
      hit = names.find((name) => re.test(name.trim()));
      if (hit) break;
    }
    out[input.key] = hit ? `{{${hit}}}` : (input.default || "");
  }
  return out;
}

export function defaultSteps(presets: Preset[], kind: string, names: string[]): { preset: string; inputs: Record<string, string> }[] {
  return presets.filter((preset) => preset.kind === kind).map((preset) => ({ preset: preset.id, inputs: guessLocal(preset, names) }));
}

export type LibraryItem = {
  tab: string;
  icon: IconName;
  name: string;
  desc: string;
  tool?: string;
  cost: string;
  free?: boolean;
  act: "start" | "preset";
  type?: string;
  kind?: string;
  web?: boolean;
  preset?: string;
};

export function libraryItems(presets: Preset[]): LibraryItem[] {
  const items: LibraryItem[] = [
    { tab: "ai", icon: "ai", name: "Use AI", desc: "Prompt an LLM per row: classify, summarize, write first lines.", cost: "≈0.1 cr", act: "start", type: "ai" },
    { tab: "ai", icon: "search", name: "AI web research agent", desc: "Searches Google and reads pages, then answers. Output fields become columns.", cost: "≈2.5 cr", act: "start", type: "ai", web: true },
    { tab: "people", icon: "waterfall", name: "Find work email (waterfall)", desc: "Tries providers in order until one finds a verified email.", cost: "pay per step", act: "start", type: "waterfall", kind: "email" },
    { tab: "people", icon: "waterfall", name: "Find mobile phone (waterfall)", desc: "Tries phone providers in order until one finds a number.", cost: "pay per step", act: "start", type: "waterfall", kind: "phone" },
  ];
  const tabOf: Record<string, string> = { People: "people", Companies: "companies", Web: "web", Custom: "utilities" };
  for (const preset of presets) {
    if (preset.local) continue;
    items.push({
      tab: tabOf[preset.category] || "utilities",
      icon: presetIcon(preset),
      name: preset.name,
      desc: preset.desc,
      tool: preset.tool,
      cost: preset.id === "custom" ? "varies" : !preset.rate ? "free" : preset.rate < 0.01 ? "<0.01 cr" : `${fmtCr(preset.rate)} cr`,
      act: "preset",
      preset: preset.id,
    });
  }
  items.push(
    { tab: "utilities", icon: "formula", name: "Formula", desc: "An expression over other columns. AI can write it for you.", cost: "free", free: true, act: "start", type: "formula" },
    { tab: "utilities", icon: "http", name: "HTTP API", desc: "Call any URL per row: webhooks, CRMs, your own API.", cost: "free", free: true, act: "start", type: "http" },
    { tab: "utilities", icon: "text", name: "Text column", desc: "An empty column you type into.", cost: "free", free: true, act: "start", type: "text" },
  );
  return items;
}

export function blankDraft(type: string, config: ColumnConfig, name: string, autoRun: boolean, outputOn: boolean[] = []): Draft {
  return { type, name, openedName: name, description: "", auto_run: autoRun, config, fieldsText: (config.fields || []).join(", "), outputOn };
}

export function fieldLabel(path: string): string {
  const last = path.split(".").filter((part) => !/^\d+$/.test(part)).pop() || path;
  return last.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
}

export function pathText(list: boolean | undefined, value: Json | undefined): string {
  if (list && Array.isArray(value)) return `[${value.length} items]`;
  if (value == null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
