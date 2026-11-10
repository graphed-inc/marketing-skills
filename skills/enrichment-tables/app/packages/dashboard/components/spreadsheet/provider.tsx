"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { api } from "./api";
import { blankDraft, columnSig, defaultSteps, estimateDraft, fieldLabel, fmtCr, guessLocal, TYPE, visibleRows } from "./model";
import type {
  CellDetail, Changes, Column, ColumnConfig, DialogState, Draft, Drawer, Filter, MenuEntry, MenuState,
  Meta, PopState, Preset, Row, RowsPage, Sort, SourceRun, TableInfo, TableListItem, Toast,
} from "./types";

type State = {
  meta: Meta | null;
  tables: TableListItem[];
  table: TableInfo | null;
  rows: Row[];
  since: string | null;
  selected: Set<string>;
  sort: Sort | null;
  filters: Filter[];
  hidden: Set<number>;
  sources: SourceRun[];
  srcCredits: number;
  focus: { r: string; c: number } | null;
  tableQuery: string;
  query: string;
  toasts: Toast[];
  dialog: DialogState | null;
  menu: MenuState | null;
  pop: PopState | null;
  drawer: Drawer | null;
};

const initial: State = {
  meta: null, tables: [], table: null, rows: [], since: null, selected: new Set(), sort: null, filters: [],
  hidden: new Set(), sources: [], srcCredits: 0, focus: null, tableQuery: "", query: "", toasts: [],
  dialog: null, menu: null, pop: null, drawer: null,
};

export type Actions = ReturnType<typeof useActions>;

const SheetContext = createContext<{ state: State; view: Row[]; actions: Actions } | null>(null);

export function useSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("Spreadsheet is not mounted");
  return ctx;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function useActions(patch: (fn: (state: State) => State) => State, ref: { current: State }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollEpoch = useRef(0);
  const dialogResolve = useRef<((value: string | boolean | null) => void) | null>(null);
  const toastId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const toast = (msg: string, ms = 3000, err = false) => {
    const id = ++toastId.current;
    patch((s) => ({ ...s, toasts: [...s.toasts, { id, msg, err }] }));
    setTimeout(() => patch((s) => ({ ...s, toasts: s.toasts.filter((item) => item.id !== id) })), ms);
  };

  const ask = (opts: DialogState) => new Promise<string | boolean | null>((resolve) => {
    dialogResolve.current = resolve;
    patch((s) => ({ ...s, dialog: opts }));
  });

  const resolveDialog = (value: string | boolean | null) => {
    patch((s) => ({ ...s, dialog: null }));
    dialogResolve.current?.(value);
    dialogResolve.current = null;
  };

  const confirmCost = async (rows: number, total: number, what: string) => {
    if (total < 1) return true;
    return ask({
      title: `Run ${what} on ${rows.toLocaleString()} rows?`,
      desc: `Up to ≈${fmtCr(total)} credits ($${(total / 100).toFixed(2)}). Rows with empty inputs are skipped and cost nothing.`,
      input: false, value: "", ok: "Run", danger: false,
    });
  };

  const closeMenu = () => patch((s) => ({ ...s, menu: null }));
  const closePop = () => patch((s) => ({ ...s, pop: null }));

  const openMenu = (event: MouseEvent, items: MenuEntry[]) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    patch((s) => ({ ...s, menu: { items, rect }, pop: null }));
  };

  const openPop = (event: MouseEvent, kind: PopState["kind"]) => {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    patch((s) => ({ ...s, pop: { kind, rect }, menu: null }));
  };

  const loadTables = async () => {
    const tables = await api<TableListItem[]>("/api/tables");
    patch((s) => ({ ...s, tables }));
  };

  const loadRows = async () => {
    const table = ref.current.table;
    if (!table) return;
    const all: Row[] = [];
    let off = 0;
    let now: string | null = null;
    for (;;) {
      const page = await api<RowsPage>(`/api/tables/${table.id}/rows?offset=${off}&limit=2000`);
      now = now || page.now;
      all.push(...page.rows);
      off += page.rows.length;
      if (!page.rows.length || off >= page.total) break;
    }
    if (ref.current.table?.id !== table.id) return;
    patch((s) => ({ ...s, rows: all, since: now }));
  };

  const refreshTable = async () => {
    const id = ref.current.table?.id;
    if (!id) return;
    const table = await api<TableInfo>(`/api/tables/${id}`);
    if (ref.current.table?.id !== id) return;
    patch((s) => ({ ...s, table }));
  };

  const poll = async (soon = false) => {
    if (timer.current) clearTimeout(timer.current);
    const ticket = ++pollEpoch.current;
    if (soon) {
      timer.current = setTimeout(() => void poll(false), 400);
      return;
    }
    const current = ref.current;
    const resume = () => {
      if (ticket !== pollEpoch.current) return;
      if (ref.current.table?.id !== current.table?.id) void poll(false);
    };
    if (current.table) {
      const id = current.table.id;
      try {
        const change = await api<Changes>(`/api/tables/${id}/changes?since=${encodeURIComponent(current.since ?? "")}`);
        if (ticket !== pollEpoch.current) return;
        if (ref.current.table?.id !== id) {
          void poll(false);
          return;
        }
        const before = ref.current.sources.filter((s) => s.status === "queued" || s.status === "running").map((s) => s.id);
        const srcCredits = change.sources.reduce((sum, source) => sum + (source.credits || 0), 0);
        for (const source of change.sources) if (before.includes(source.id) && source.status === "done") toast(`Added ${source.added} leads`);
        for (const source of change.sources) if (before.includes(source.id) && source.status === "error") toast(`Find leads failed: ${source.error}`, 6000, true);
        const rowsChanged = change.rowCount !== ref.current.rows.length;
        const columnsChanged = change.columns.map((c) => `${c[0]}:${c[1]}:${c[2]}`).join("|") !== columnSig(ref.current.table.columns);
        patch((s) => ({ ...s, since: change.now, sources: change.sources, srcCredits }));
        if (rowsChanged || columnsChanged) {
          await refreshTable();
          await loadRows();
          if (rowsChanged) void loadTables();
        } else {
          const stats = new Map(change.stats.map((item) => [item.column_id, item]));
          patch((s) => {
            if (!s.table) return s;
            let headChanged = false;
            const columns = s.table.columns.map((column) => {
              const next = stats.get(column.id) || { column_id: column.id, queued: 0, running: 0, errors: 0, filled: 0, credits: 0 };
              if (JSON.stringify(next) !== JSON.stringify(column.stats)) { headChanged = true; return { ...column, stats: next }; }
              return column;
            });
            const rows = s.rows.map((row) => ({ ...row, c: { ...row.c } }));
            const byId = new Map(rows.map((row) => [row.id, row]));
            for (const [rid, cid, display, status, error] of change.cells) {
              const row = byId.get(rid);
              if (row) row.c[cid] = [display, status, error];
            }
            return { ...s, table: headChanged || columns !== s.table.columns ? { ...s.table, columns } : s.table, rows: change.cells.length ? rows : s.rows };
          });
        }
        if (ticket !== pollEpoch.current) return;
        if (ref.current.table?.id !== id) {
          void poll(false);
          return;
        }
        if (change.more) {
          timer.current = setTimeout(() => void poll(false), 30);
          return;
        }
        const busy = (ref.current.table?.columns || []).some((c) => c.stats.queued || c.stats.running)
          || change.sources.some((s) => s.status === "queued" || s.status === "running");
        timer.current = setTimeout(() => void poll(false), busy ? 1500 : 6000);
        return;
      } catch (error) {
        console.warn(error);
        resume();
        if (ticket !== pollEpoch.current) return;
      }
    }
    timer.current = setTimeout(() => void poll(false), 6000);
  };

  const openTable = async (id: number) => {
    location.hash = String(id);
    const table = await api<TableInfo>(`/api/tables/${id}`);
    let hidden = new Set<number>();
    try { hidden = new Set(JSON.parse(localStorage.getItem(`hidden-${id}`) || "[]") as number[]); }
    catch { hidden = new Set(); }
    patch((s) => ({ ...s, table, selected: new Set(), sort: null, filters: [], query: "", hidden, focus: null }));
    await loadRows();
    await loadTables();
    void poll(false);
  };

  const boot = async () => {
    const meta = await api<Meta>("/api/meta");
    patch((s) => ({ ...s, meta }));
    await loadTables();
    const id = Number(location.hash.slice(1)) || ref.current.tables[0]?.id;
    if (id) {
      try { await openTable(id); return; }
      catch (error) { toast(messageOf(error), 4000, true); }
    }
    void poll(false);
  };

  const stop = () => { if (timer.current) clearTimeout(timer.current); };

  const saveHidden = (hidden: Set<number>) => {
    const id = ref.current.table?.id;
    if (id) localStorage.setItem(`hidden-${id}`, JSON.stringify([...hidden]));
    patch((s) => ({ ...s, hidden }));
  };

  const setDrawer = (drawer: Drawer | null) => patch((s) => ({ ...s, drawer, focus: drawer ? s.focus : null }));

  const names = () => (ref.current.table?.columns || []).map((c) => c.name);

  const columnDraft = (type: string, opts: { kind?: string; web?: boolean } = {}) => {
    const meta = ref.current.meta;
    if (!meta) return;
    const defaults: Record<string, ColumnConfig> = {
      text: {},
      formula: { expr: "" },
      enrich: {},
      waterfall: { kind: opts.kind || "email", verify: true, steps: [] },
      ai: { prompt: "", model: meta.defaultModel, web: !!opts.web, fields: [] },
      http: { method: "POST", url: "", headers: "{}", body: "{}" },
    };
    const name = type === "waterfall" ? (opts.kind === "phone" ? "Mobile phone" : "Work email") : opts.web ? "Research" : "";
    const config = defaults[type] || {};
    if (type === "waterfall") config.steps = defaultSteps(meta.presets, config.kind || "email", names());
    const draft = blankDraft(type, config, name, type === "formula");
    patch((s) => ({ ...s, drawer: { kind: "column", draft, error: "", generating: false } }));
  };

  const actions = {
    fileRef, wrapRef, toast, ask, resolveDialog, openMenu, closeMenu, closePop, boot, stop, poll, openTable,
    setTableQuery: (tableQuery: string) => patch((s) => ({ ...s, tableQuery })),
    setQuery: (query: string) => patch((s) => ({ ...s, query })),
    newTable: async () => {
      const name = await ask({ title: "New table", desc: "Name the list. You can rename it later.", input: true, value: "Untitled table", ok: "Create table", danger: false });
      if (typeof name !== "string") return;
      const table = await api<TableInfo>("/api/tables", { body: { name } });
      await loadTables();
      await openTable(table.id);
    },
    renameTable: async (value: string) => {
      const table = ref.current.table;
      if (!table || !value.trim() || value.trim() === table.name) return;
      const next = await api<TableInfo>(`/api/tables/${table.id}`, { method: "PATCH", body: { name: value } });
      patch((s) => ({ ...s, table: { ...s.table!, ...next, columns: next.columns || s.table!.columns } }));
      await loadTables();
    },
    duplicateTable: async () => {
      const table = ref.current.table;
      if (!table) return;
      const copy = await api<TableInfo>(`/api/tables/${table.id}/duplicate`, { body: {} });
      await loadTables();
      await openTable(copy.id);
      toast("Copied columns to a new table");
    },
    addRows: async (count = 1) => {
      const table = ref.current.table;
      if (!table) return;
      if (!table.columns.length) {
        await api(`/api/tables/${table.id}/columns`, { body: { name: "Name", type: "text" } });
        await refreshTable();
      }
      await api(`/api/tables/${table.id}/rows`, { body: { count } });
      await loadRows();
      await loadTables();
      if (wrapRef.current) wrapRef.current.scrollTop = 1e9;
    },
    deleteTable: async () => {
      const table = ref.current.table;
      if (!table) return;
      if (!(await ask({ title: `Delete "${table.name}"?`, desc: "This deletes every row and column. You cannot undo it.", input: false, value: "", ok: "Delete", danger: true }))) return;
      await api(`/api/tables/${table.id}`, { method: "DELETE" });
      location.hash = "";
      patch((s) => ({ ...s, table: null, rows: [], selected: new Set(), focus: null }));
      await loadTables();
    },
    tableMenu: (event: MouseEvent) => openMenu(event, [
      { text: "Duplicate table", icon: "copy", run: () => void actions.duplicateTable() },
      { text: "Add 10 empty rows", icon: "plus", run: () => void actions.addRows(10) },
      "-",
      { text: "Delete table", icon: "trash", danger: true, run: () => void actions.deleteTable() },
    ]),
    toggleSelect: (id: string, on: boolean) => patch((s) => {
      const selected = new Set(s.selected);
      if (on) selected.add(id); else selected.delete(id);
      return { ...s, selected };
    }),
    toggleAll: (on: boolean) => patch((s) => ({ ...s, selected: on ? new Set(visibleRows(s.rows, s.query, s.filters, s.sort).map((row) => row.id)) : new Set() })),
    clearSelection: () => patch((s) => ({ ...s, selected: new Set() })),
    focusCell: (r: string, c: number) => patch((s) => ({ ...s, focus: { r, c } })),
    saveText: async (rowId: string, colId: number, text: string, previous: string) => {
      if (text === previous) return;
      patch((s) => ({
        ...s,
        rows: s.rows.map((row) => row.id === rowId ? { ...row, c: { ...row.c, [colId]: [text, "done", ""] } } : row),
      }));
      try { await api(`/api/cells/${rowId}/${colId}`, { method: "PUT", body: { text } }); }
      catch (error) { toast(messageOf(error), 4000, true); }
      void poll(true);
    },
    resize: (id: number, width: number, save: boolean) => {
      patch((s) => !s.table ? s : ({ ...s, table: { ...s.table, columns: s.table.columns.map((c) => c.id === id ? { ...c, width } : c) } }));
      if (save) void api(`/api/columns/${id}`, { method: "PATCH", body: { width } });
    },
    importCsv: async (file: File | undefined) => {
      const table = ref.current.table;
      if (!file || !table) return;
      toast(`Importing ${file.name}…`);
      try {
        const csv = await file.text();
        const result = await api<{ added: number }>(`/api/tables/${table.id}/import`, { body: { csv } });
        toast(`Added ${result.added.toLocaleString()} rows`);
        await refreshTable();
        await loadRows();
        await loadTables();
        void poll(true);
      } catch (error) { toast(messageOf(error), 5000, true); }
    },
    exportCsv: () => {
      const table = ref.current.table;
      if (table) location.href = `/api/tables/${table.id}/export.csv`;
    },
    copyPrompt: () => {
      const text = ref.current.meta?.agentPrompt;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => toast("Copied. Paste it to your agent.")).catch(() => toast("Could not copy", 3000, true));
    },
    pickCsv: () => fileRef.current?.click(),
    toggleAuto: async () => {
      const table = ref.current.table;
      if (!table) return;
      const paid = table.columns.filter((c) => TYPE[c.type]?.paid);
      const on = !(paid.length > 0 && paid.every((c) => c.auto_run));
      if (!paid.length) return toast("Add a paid column first");
      const next = await api<TableInfo>(`/api/tables/${table.id}`, { method: "PATCH", body: { auto_run: on } });
      patch((s) => ({ ...s, table: next }));
      toast(on ? "Auto-update on: new rows and changed inputs run paid columns" : "Auto-update off");
    },
    openFilters: (event: MouseEvent) => {
      event.stopPropagation();
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      patch((s) => ({ ...s, filters: s.filters.length ? s.filters : [{ col: "", op: "contains", val: "" }], pop: { kind: "filter", rect }, menu: null }));
    },
    setFilter: (index: number, filter: Filter) => patch((s) => ({ ...s, filters: s.filters.map((item, i) => i === index ? filter : item) })),
    addFilter: () => patch((s) => ({ ...s, filters: [...s.filters, { col: "", op: "contains", val: "" }] })),
    removeFilter: (index: number) => patch((s) => ({ ...s, filters: s.filters.filter((_, i) => i !== index) })),
    clearFilters: () => patch((s) => ({ ...s, filters: [], pop: null })),
    openSort: (event: MouseEvent) => openPop(event, "sort"),
    setSort: (sort: Sort | null) => patch((s) => ({ ...s, sort })),
    openFields: (event: MouseEvent) => openPop(event, "fields"),
    toggleField: (id: number) => {
      const hidden = new Set(ref.current.hidden);
      if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
      saveHidden(hidden);
    },
    showAllFields: () => saveHidden(new Set()),
    closeDrawer: () => setDrawer(null),
    openLibrary: (tab = "all") => patch((s) => ({ ...s, drawer: { kind: "library", tab, query: "" } })),
    setLibraryTab: (tab: string) => patch((s) => s.drawer?.kind === "library" ? { ...s, drawer: { ...s.drawer, tab } } : s),
    setLibraryQuery: (query: string) => patch((s) => s.drawer?.kind === "library" ? { ...s, drawer: { ...s.drawer, query } } : s),
    startColumn: (type: string, opts: { kind?: string; web?: boolean } = {}) => {
      if (type === "enrich") { actions.openLibrary(); return; }
      columnDraft(type, opts);
    },
    pickPreset: async (id: string) => {
      const meta = ref.current.meta;
      const table = ref.current.table;
      if (!meta || !table) return;
      const preset = meta.presets.find((item) => item.id === id);
      if (!preset) return;
      const inputs = id === "custom" ? {} : await api<Record<string, string>>(`/api/tables/${table.id}/guess?preset=${id}`);
      const config: ColumnConfig = id === "custom"
        ? { preset: "custom", tool: "", body: "{\n  \n}", rate: 0 }
        : { preset: id, inputs };
      const draft = blankDraft("enrich", config, preset.name.replace(/\s*\(.*\)$/, ""), false, preset.outputs.map((_, i) => i < 3));
      patch((s) => ({ ...s, drawer: { kind: "column", draft, error: "", generating: false } }));
    },
    updateDraft: (draft: Draft) => patch((s) => s.drawer?.kind === "column" ? { ...s, drawer: { ...s.drawer, draft } } : s),
    setWaterfallKind: (kind: string) => {
      const meta = ref.current.meta;
      const drawer = ref.current.drawer;
      if (!meta || drawer?.kind !== "column") return;
      const steps = defaultSteps(meta.presets, kind, names());
      actions.updateDraft({ ...drawer.draft, config: { ...drawer.draft.config, kind, steps } });
    },
    moveStep: (index: number, dir: number) => {
      const drawer = ref.current.drawer;
      if (drawer?.kind !== "column") return;
      const steps = [...(drawer.draft.config.steps || [])];
      const next = index + dir;
      if (next < 0 || next >= steps.length) return;
      const swap = steps[index];
      steps[index] = steps[next]!;
      steps[next] = swap!;
      actions.updateDraft({ ...drawer.draft, config: { ...drawer.draft.config, steps } });
    },
    deleteStep: (index: number) => {
      const drawer = ref.current.drawer;
      if (drawer?.kind !== "column") return;
      const steps = (drawer.draft.config.steps || []).filter((_, i) => i !== index);
      actions.updateDraft({ ...drawer.draft, config: { ...drawer.draft.config, steps } });
    },
    addStep: (presetId: string) => {
      const meta = ref.current.meta;
      const drawer = ref.current.drawer;
      if (!meta || drawer?.kind !== "column" || !presetId) return;
      const preset = meta.presets.find((item) => item.id === presetId);
      if (!preset) return;
      const steps = [...(drawer.draft.config.steps || []), { preset: preset.id, inputs: guessLocal(preset, names()) }];
      actions.updateDraft({ ...drawer.draft, config: { ...drawer.draft.config, steps } });
    },
    saveColumn: async (run: "none" | "all" | "first10") => {
      const drawer = ref.current.drawer;
      const table = ref.current.table;
      const meta = ref.current.meta;
      if (!drawer || drawer.kind !== "column" || !table || !meta) return;
      const draft = parsedDraft(drawer.draft);
      try {
        if ((run === "all" || run === "first10") && draft.type !== "text") {
          const per = estimateDraft(draft, meta.presets);
          const count = run === "first10" ? Math.min(10, ref.current.rows.length) : ref.current.rows.length;
          if (!(await confirmCost(count, per * count, `"${draft.name || TYPE[draft.type]?.name || "column"}"`))) return;
        }
        const outputs = draftOutputs(draft, meta.presets);
        const result = draft.id
          ? await api<{ queued: number; table: TableInfo }>(`/api/columns/${draft.id}`, { method: "PATCH", body: { name: draft.name, config: draft.config, auto_run: draft.auto_run, run } })
          : await api<{ queued: number; table: TableInfo }>(`/api/tables/${table.id}/columns`, { body: { name: draft.name, type: draft.type, config: draft.config, auto_run: draft.auto_run, outputs, run } });
        patch((s) => ({ ...s, table: result.table, drawer: null, focus: null }));
        toast(result.queued ? `Queued ${result.queued.toLocaleString()} cells` : "Column saved");
        void poll(true);
      } catch (error) {
        patch((s) => s.drawer?.kind === "column" ? { ...s, drawer: { ...s.drawer, error: messageOf(error) } } : s);
      }
    },
    editColumn: (column: Column) => {
      const config = JSON.parse(JSON.stringify(column.config)) as ColumnConfig;
      const preset = ref.current.meta?.presets.find((item) => item.id === config.preset);
      const draft = { ...blankDraft(column.type, config, column.name, column.auto_run, (preset?.outputs || []).map((_, i) => i < 3)), id: column.id };
      patch((s) => ({ ...s, drawer: { kind: "column", draft, error: "", generating: false } }));
    },
    runColumn: async (column: Column, mode: "all" | "empty" | "first10") => {
      if (column.perRow) {
        const est = await api<{ rows: number; total: number }>(`/api/columns/${column.id}/estimate?mode=${mode}`);
        if (!(await confirmCost(est.rows, est.total, `"${column.name}"`))) return;
      }
      const result = await api<{ queued: number }>(`/api/columns/${column.id}/run`, { body: { mode } });
      toast(`Queued ${result.queued.toLocaleString()} cells`);
      void poll(true);
    },
    runRows: async (column: Column, ids: string[], counted = false) => {
      if (!(await confirmCost(ids.length, (column.perRow || 0) * ids.length, `"${column.name}"`))) return;
      const result = await api<{ queued: number }>(`/api/columns/${column.id}/run`, { body: { rowIds: ids } });
      toast(counted ? `Queued ${result.queued.toLocaleString()} cells` : `Queued ${result.queued} cells`);
      void poll(true);
    },
    stopColumn: async (id: number) => {
      const result = await api<{ stopped: number }>(`/api/columns/${id}/stop`, { body: {} });
      toast(`Stopped ${result.stopped} cells`);
      void poll(true);
    },
    toggleColumnAuto: async (column: Column) => {
      const next = await api<{ table: TableInfo }>(`/api/columns/${column.id}`, { method: "PATCH", body: { auto_run: !column.auto_run } });
      patch((s) => ({ ...s, table: next.table }));
      toast(`Auto-run ${!column.auto_run ? "on" : "off"}`);
    },
    renameColumn: async (column: Column) => {
      const name = await ask({ title: "Rename column", desc: "Formulas and prompts that use this column are updated too.", input: true, value: column.name, ok: "Rename", danger: false });
      if (typeof name !== "string" || name === column.name) return;
      const next = await api<{ table: TableInfo }>(`/api/columns/${column.id}`, { method: "PATCH", body: { name } });
      patch((s) => ({ ...s, table: next.table }));
    },
    moveColumn: async (column: Column, dir: number) => {
      const columns = ref.current.table?.columns || [];
      const index = columns.findIndex((item) => item.id === column.id);
      const target = index + dir;
      if (target < 0 || target >= columns.length) return;
      const other = columns[target];
      if (!other) return;
      const after = target + dir;
      const position = after < 0 ? other.position - 1 : after >= columns.length ? other.position + 1 : (other.position + (columns[after]?.position || other.position)) / 2;
      const next = await api<{ table: TableInfo }>(`/api/columns/${column.id}`, { method: "PATCH", body: { position } });
      patch((s) => ({ ...s, table: next.table }));
    },
    deleteColumn: async (column: Column) => {
      if (!(await ask({ title: `Delete "${column.name}"?`, desc: "Its values are deleted. You cannot undo this.", input: false, value: "", ok: "Delete", danger: true }))) return;
      const table = await api<TableInfo>(`/api/columns/${column.id}`, { method: "DELETE" });
      patch((s) => ({ ...s, table }));
    },
    bulkDelete: async () => {
      const table = ref.current.table;
      const ids = [...ref.current.selected];
      if (!table || !ids.length) return;
      if (!(await ask({ title: `Delete ${ids.length} rows?`, desc: "You cannot undo this.", input: false, value: "", ok: "Delete rows", danger: true }))) return;
      await api(`/api/tables/${table.id}/rows/delete`, { body: { ids } });
      patch((s) => ({ ...s, selected: new Set() }));
      await refreshTable();
      await loadRows();
      await loadTables();
    },
    inspect: async (rowId: string, colId: number) => {
      patch((s) => ({ ...s, focus: { r: rowId, c: colId } }));
      const cell = await api<CellDetail>(`/api/cells/${rowId}/${colId}`);
      patch((s) => ({ ...s, drawer: { kind: "inspect", rowId, colId, cell, query: "" }, focus: { r: rowId, c: colId } }));
    },
    setInspectQuery: (query: string) => patch((s) => s.drawer?.kind === "inspect" ? { ...s, drawer: { ...s.drawer, query } } : s),
    rerunCell: async (rowId: string, colId: number) => {
      const column = ref.current.table?.columns.find((item) => item.id === colId);
      if (column && !(await confirmCost(1, column.perRow || 0, `"${column.name}"`))) return;
      await api(`/api/cells/${rowId}/${colId}/run`, { body: {} });
      patch((s) => ({ ...s, drawer: null, focus: null }));
      toast("Queued 1 cell");
      void poll(true);
    },
    addField: async (colId: number, path: string) => {
      const table = ref.current.table;
      const source = table?.columns.find((item) => item.id === colId);
      if (!table || !source) return;
      const result = await api<{ table: TableInfo; column: { name: string } }>(`/api/tables/${table.id}/columns`, {
        body: { name: fieldLabel(path), type: "formula", config: { expr: `{{${source.name}.${path}}}` }, auto_run: true, after: colId, run: "all" },
      });
      patch((s) => ({ ...s, table: result.table }));
      toast(`Added column "${result.column.name}"`);
      void poll(true);
    },
    openSources: (id?: string) => {
      const meta = ref.current.meta;
      if (!meta?.sources.length) return;
      const source = meta.sources.find((item) => item.id === id) || meta.sources[0];
      if (!source) return;
      const values = Object.fromEntries(source.inputs.map((input) => [input.key, input.default || ""]));
      patch((s) => ({ ...s, drawer: { kind: "sources", sourceId: source.id, values } }));
    },
    setSourceValue: (key: string, value: string) => patch((s) => s.drawer?.kind === "sources" ? { ...s, drawer: { ...s.drawer, values: { ...s.drawer.values, [key]: value } } } : s),
    runSource: async () => {
      const drawer = ref.current.drawer;
      const table = ref.current.table;
      const meta = ref.current.meta;
      if (drawer?.kind !== "sources" || !table || !meta) return;
      const source = meta.sources.find((item) => item.id === drawer.sourceId);
      if (!source) return;
      const max = Number(drawer.values.limit || drawer.values.max || drawer.values.perPage || 0);
      if (source.rateUnit !== "search" && !(await confirmCost(max, source.rate * max, source.name))) return;
      await api(`/api/tables/${table.id}/sources`, { body: { source: source.id, input: drawer.values } });
      patch((s) => ({ ...s, drawer: null, focus: null }));
      toast("Finding leads. Rows appear when the search finishes.");
      void poll(true);
    },
    generateFormula: async () => {
      const drawer = ref.current.drawer;
      const table = ref.current.table;
      if (drawer?.kind !== "column" || !table || !drawer.draft.description.trim()) return;
      const description = drawer.draft.description.trim();
      patch((s) => s.drawer?.kind === "column" ? { ...s, drawer: { ...s.drawer, generating: true } } : s);
      try {
        const result = await api<{ expr: string }>("/api/ai/formula", { body: { tableId: table.id, description } });
        const current = ref.current.drawer;
        if (current?.kind === "column") actions.updateDraft({ ...current.draft, config: { ...current.draft.config, expr: result.expr } });
      } catch (error) { toast(messageOf(error), 4000, true); }
      finally { patch((s) => s.drawer?.kind === "column" ? { ...s, drawer: { ...s.drawer, generating: false } } : s); }
    },
  };

  return actions;
}

function parsedDraft(draft: Draft): Draft {
  const name = draft.name.trim() || draft.openedName;
  const config = { ...draft.config };
  if (typeof config.tool === "string") config.tool = config.tool.trim();
  if (config.pick !== undefined && !config.pick.trim()) delete config.pick;
  else if (config.pick) config.pick = config.pick.trim();
  if (draft.type !== "text" && config.runIf !== undefined) config.runIf = config.runIf.trim();
  if (draft.type === "ai") config.fields = draft.fieldsText.split(",").map((part) => part.trim().replace(/\s+/g, "_")).filter(Boolean);
  return { ...draft, name, config };
}

function draftOutputs(draft: Draft, presets: Preset[]): { name: string; path: string }[] {
  if (draft.id) return [];
  if (draft.type === "enrich") {
    const preset = presets.find((item) => item.id === draft.config.preset);
    if (!preset || preset.id === "custom") return [];
    return preset.outputs.filter((_, index) => draft.outputOn[index]);
  }
  if (draft.type === "ai") {
    return (draft.config.fields || []).map((field) => ({
      name: field.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      path: field,
    }));
  }
  return [];
}

export function SpreadsheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const ref = useRef(state);
  ref.current = state;
  const patch = (fn: (state: State) => State) => {
    const next = fn(ref.current);
    ref.current = next;
    setState(next);
    return next;
  };
  const actions = useActions(patch, ref);
  const alive = useRef(actions);
  alive.current = actions;
  useEffect(() => {
    const onPointer = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const element = target instanceof Element ? target : target.parentElement;
      // The column menu is a portaled Radix menu, so it has no #menu node.
      // Clearing it on mousedown removes the item before onSelect runs.
      if (document.getElementById("pop")?.contains(target)) return;
      if (element?.closest("[role='menu']")) return;
      patch((s) => s.menu || s.pop ? { ...s, menu: null, pop: null } : s);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !ref.current.dialog && ref.current.drawer) patch((s) => ({ ...s, drawer: null, focus: null }));
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    void alive.current.boot();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      alive.current.stop();
    };
  }, []);
  const view = useMemo(() => visibleRows(state.rows, state.query, state.filters, state.sort), [state.rows, state.query, state.filters, state.sort]);
  return <SheetContext.Provider value={{ state, view, actions }}>{children}</SheetContext.Provider>;
}
