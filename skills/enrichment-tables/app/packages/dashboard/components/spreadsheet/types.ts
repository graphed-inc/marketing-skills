export type Json = null | string | number | boolean | Json[] | { [key: string]: Json };

export type CellTuple = [string, string, string];

export type Stats = {
  column_id?: number;
  queued: number;
  running: number;
  errors: number;
  filled: number;
  credits: number;
};

export type ColumnConfig = {
  expr?: string;
  preset?: string;
  tool?: string;
  body?: string;
  rate?: number;
  pick?: string;
  inputs?: Record<string, string>;
  kind?: string;
  verify?: boolean;
  steps?: { preset: string; inputs: Record<string, string> }[];
  prompt?: string;
  model?: string;
  web?: boolean;
  fields?: string[];
  method?: string;
  url?: string;
  headers?: string;
  runIf?: string;
};

export type Column = {
  id: number;
  name: string;
  type: string;
  width: number;
  position: number;
  auto_run: boolean;
  perRow: number;
  config: ColumnConfig;
  stats: Stats;
};

export type TableInfo = {
  id: number;
  name: string;
  columns: Column[];
};

export type TableListItem = {
  id: number;
  name: string;
  rowCount: number;
};

export type Row = {
  id: string;
  c: Record<string, CellTuple>;
};

export type PresetInput = {
  key: string;
  label: string;
  required?: boolean;
  match?: string[];
  default?: string;
};

export type PresetOutput = { name: string; path: string };

export type Preset = {
  id: string;
  name: string;
  desc: string;
  category: string;
  kind?: string;
  tool?: string;
  rate: number;
  local?: boolean;
  pick?: string[];
  inputs: PresetInput[];
  outputs: PresetOutput[];
};

export type LeadSource = {
  id: string;
  name: string;
  desc: string;
  rate: number;
  rateUnit: string;
  inputs: { key: string; label: string; default?: string }[];
  columns: Record<string, string>;
};

export type ModelOption = { id: string; name: string };

export type Meta = {
  presets: Preset[];
  sources: LeadSource[];
  models: ModelOption[];
  defaultModel: string;
  slug: string;
  agentPrompt: string;
};

export type SourceRun = {
  id: number;
  source: string;
  status: string;
  error: string | null;
  added: number;
  credits: number;
};

export type CellPath = { path: string; list?: boolean; value?: Json };

export type CellDetail = {
  display?: string;
  status?: string;
  error?: string;
  credits?: number;
  value?: Json;
  paths?: CellPath[];
};

export type Filter = { col: number | ""; op: string; val: string };

export type Sort = { id: number; dir: 1 | -1 };

export type Draft = {
  id?: number;
  type: string;
  name: string;
  openedName: string;
  description: string;
  auto_run: boolean;
  config: ColumnConfig;
  fieldsText: string;
  outputOn: boolean[];
};

export type Drawer =
  | { kind: "library"; tab: string; query: string }
  | { kind: "column"; draft: Draft; error: string; generating: boolean }
  | { kind: "inspect"; rowId: string; colId: number; cell: CellDetail; query: string }
  | { kind: "sources"; sourceId: string; values: Record<string, string> };

export type DialogState = {
  title: string;
  desc: string;
  input: boolean;
  value: string;
  ok: string;
  danger: boolean;
};

export type MenuEntry =
  | "-"
  | { label: string }
  | { text: string; run: () => void; danger?: boolean; hint?: string; icon?: IconName };

export type MenuState = { items: MenuEntry[]; rect: DOMRect };
export type PopKind = "filter" | "sort" | "fields";
export type PopState = { kind: PopKind; rect: DOMRect };

export type Toast = { id: number; msg: string; err: boolean };

export type IconName =
  | "plus" | "search" | "upload" | "download" | "users" | "more" | "table" | "x"
  | "text" | "formula" | "enrich" | "waterfall" | "ai" | "http" | "alert" | "play"
  | "chev" | "refresh" | "trash" | "loader" | "check" | "back" | "pencil" | "copy"
  | "sort" | "left" | "right" | "stop" | "braces" | "coins" | "mail" | "phone"
  | "building" | "user" | "wrench" | "filter" | "eye" | "eyeoff" | "map";

export type ChangeCell = [string, number, string, string, string];

export type Changes = {
  now: string;
  more: boolean;
  rowCount: number;
  stats: Stats[];
  sources: SourceRun[];
  columns: [number, string, number][];
  cells: ChangeCell[];
};

export type RowsPage = { total: number; now: string; rows: Row[] };
