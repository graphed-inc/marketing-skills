// Pure helpers: {{Column}} templates, JSON paths, display text. No I/O (covered by npm test).
//
// A token is {{Column Name}} or {{Column Name.path.to.field}}. Column names may hold spaces and
// dots, so a token is matched to the LONGEST column name it starts with.

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function tokens(str: unknown): string[] {
  return [...String(str ?? "").matchAll(TOKEN)].map((m) => m[1]);
}

// Every string inside a config object (deep), so deps can be found in nested settings.
export function strings(obj: unknown, out: string[] = []): string[] {
  if (obj == null) return out;
  if (typeof obj === "string") out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => strings(v, out));
  else if (typeof obj === "object") Object.values(obj).forEach((v) => strings(v, out));
  return out;
}

// "Enrich Company.organization.industry" → { name: "Enrich Company", path: "organization.industry" }
export function resolveToken(token: string, names: string[]): { name: string; path: string } | null {
  let best = null;
  for (const n of names) {
    if (token === n || token.startsWith(n + ".")) {
      if (!best || n.length > best.length) best = n;
    }
  }
  if (!best) return null;
  return { name: best, path: token.slice(best.length + 1) };
}

// Column names a config depends on.
export function deps(config: unknown, names: string[]): string[] {
  const set = new Set<string>();
  for (const s of strings(config)) for (const t of tokens(s)) {
    const r = resolveToken(t, names);
    if (r) set.add(r.name);
  }
  return [...set];
}

// get({a:{b:[{c:1}]}}, "a.b.0.c") → 1. Also "a.b[0].c".
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur === "string") { try { cur = JSON.parse(cur); } catch { return undefined; } }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// Short text for a grid cell.
export function display(v: unknown, max = 500): string {
  if (v == null) return "";
  if (typeof v === "string") return v.length > max ? v.slice(0, max) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return "";
    if (v.every((x) => x == null || typeof x !== "object")) return display(v.filter((x) => x != null).join(", "), max);
    return `${v.length} item${v.length === 1 ? "" : "s"}`;
  }
  const rec = v as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (!keys.length) return "";
  return display(keys.slice(0, 4).map((k) => `${k}: ${scalar(rec[k])}`).join(" · "), max);
}
const scalar = (x: unknown) => (x == null ? "" : typeof x === "object" ? (Array.isArray(x) ? `[${x.length}]` : "{…}") : String(x));

export const isEmpty = (v: unknown): boolean =>
  v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

// ctx: Map(name → { display, value }). Token without path → display text; with path → the raw value at the path.
export function lookup(token: string, ctx: Map<string, { display?: unknown; value?: unknown }>): unknown {
  const r = resolveToken(token, [...ctx.keys()]);
  if (!r) return undefined;
  const cell = ctx.get(r.name);
  if (!cell) return undefined;
  if (!r.path) return cell.display ?? "";
  return getPath(cell.value, r.path);
}

// Render a template to a string. Missing tokens render "" and are reported in `missing`.
export function render(str: unknown, ctx: Map<string, { display?: unknown; value?: unknown }>, missing: string[] = []): string {
  return String(str ?? "").replace(TOKEN, (_, t) => {
    const v = lookup(t, ctx);
    if (isEmpty(v)) { missing.push(t); return ""; }
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

// Render every string in an object. A string that is exactly one token keeps the raw value
// (so {"urls": "{{Links}}"} can pass an array). Empty keys are dropped.
export function renderDeep(obj: unknown, ctx: Map<string, { display?: unknown; value?: unknown }>, missing: string[] = []): unknown {
  if (typeof obj === "string") {
    const only = obj.match(/^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/);
    if (only) {
      const v = lookup(only[1], ctx);
      if (isEmpty(v)) { missing.push(only[1]); return undefined; }
      if (typeof v === "string") { const s = v.trim(); if (/^[[{]/.test(s)) { try { return JSON.parse(s); } catch {} } }
      return v;
    }
    const out = render(obj, ctx, missing);
    return out === "" ? undefined : out;
  }
  if (Array.isArray(obj)) return obj.map((v) => renderDeep(v, ctx, missing)).filter((v) => v !== undefined);
  if (obj && typeof obj === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const r = renderDeep(v, ctx, missing);
      if (r !== undefined && !(typeof r === "string" && r === "")) o[k] = r;
    }
    return o;
  }
  return obj;
}

// Rewrite {{Old...}} → {{New...}} in every string of a config (column rename).
export function renameTokens(config: unknown, oldName: string, newName: string, names: string[]): unknown {
  const fix = (s: string) => s.replace(TOKEN, (m, t) => {
    const r = resolveToken(t, names);
    if (!r || r.name !== oldName) return m;
    return `{{${newName}${r.path ? "." + r.path : ""}}}`;
  });
  const walk = (o: unknown): unknown => {
    if (typeof o === "string") return fix(o);
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)]));
    return o;
  };
  return walk(config);
}

// Leaf paths of a JSON value, for the cell inspector's "add as column" list.
export function leafPaths(v: unknown, prefix = "", out: { path: string; value?: unknown; list?: boolean }[] = [], depth = 0) {
  if (out.length > 400 || depth > 6) return out;
  if (v == null || typeof v !== "object") { if (prefix) out.push({ path: prefix, value: v }); return out; }
  if (Array.isArray(v)) {
    if (prefix) out.push({ path: prefix, value: v, list: true });
    v.slice(0, 3).forEach((x, i) => leafPaths(x, prefix ? `${prefix}.${i}` : String(i), out, depth + 1));
    return out;
  }
  for (const [k, x] of Object.entries(v)) leafPaths(x, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  return out;
}

// Minimal CSV (RFC 4180: quotes, escaped quotes, newlines in quotes).
export function parseCsv(text: string): string[][] {
  const rows = []; let row = []; let f = ""; let q = false;
  text = String(text).replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}

export function toCsv(rows: unknown[][]): string {
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
