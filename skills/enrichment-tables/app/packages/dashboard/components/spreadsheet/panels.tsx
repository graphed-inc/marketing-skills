"use client";

import { Button } from "@/components/ui/button";
import { Dialog as ConfirmDialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Fragment, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import { estimateDraft, fmtCr, libraryItems, presetIcon, TYPE } from "./model";
import { useSheet } from "./provider";
import type { Draft, Preset } from "./types";

const TABS: [string, string][] = [["all", "All"], ["people", "People"], ["companies", "Companies"], ["web", "Web"], ["ai", "AI"], ["utilities", "Utilities"]];
const SRC_ICON = { getleads_people: "users", apollo_people: "users", google_maps: "map" } as const;

export function Drawer() {
  const { state, view, actions } = useSheet();
  const drawer = state.drawer;
  const open = !!drawer;
  const column = drawer?.kind === "column" ? drawer.draft : null;
  const meta = state.meta;
  const title = !drawer ? ""
    : drawer.kind === "library" ? "Add enrichment"
    : drawer.kind === "inspect" ? state.table?.columns.find((item) => item.id === drawer.colId)?.name || "Cell"
    : drawer.kind === "sources" ? "Find leads"
    : column?.id ? `Edit ${column.name}` : `New ${(TYPE[column?.type || "text"] || TYPE.text!).name.toLowerCase()} column`;
  const desc = !drawer ? ""
    : drawer.kind === "library" ? "Pick a data source, an AI step, or a utility column. It runs once per row."
    : drawer.kind === "inspect" ? `Row ${view.findIndex((row) => row.id === drawer.rowId) + 1}`
    : drawer.kind === "sources" ? "Search a lead database and add the results as rows."
    : (TYPE[column?.type || ""] || TYPE.text!).description;
  const preset = column?.type === "enrich" ? meta?.presets.find((item) => item.id === column.config.preset) : undefined;
  const shownDesc = column?.type === "enrich" && preset ? preset.desc : desc;
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) actions.closeDrawer(); }}>
      <SheetContent side="right" className="flex w-[540px] max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[540px]">
        <SheetHeader className="sh-head space-y-0 text-left">
          <div>
            <SheetTitle id="dtitle">{title}</SheetTitle>
            <SheetDescription id="ddesc" className={shownDesc ? "" : "gone"}>{shownDesc || "Column settings"}</SheetDescription>
          </div>
        </SheetHeader>
        <div className="sh-body" id="dbody">
          {drawer?.kind === "library" && meta && <Library tab={drawer.tab} query={drawer.query} />}
          {drawer?.kind === "column" && meta && <ColumnForm draft={drawer.draft} error={drawer.error} generating={drawer.generating} presets={meta.presets} models={meta.models} />}
          {drawer?.kind === "inspect" && <Inspector drawer={drawer} />}
          {drawer?.kind === "sources" && meta && <Sources sourceId={drawer.sourceId} values={drawer.values} />}
        </div>
        <div className={`sh-foot ${drawer && drawer.kind !== "library" && (drawer.kind !== "inspect" || state.table?.columns.find((item) => item.id === drawer.colId)?.type !== "text") ? "" : "gone"}`} id="dfoot">
          {drawer?.kind === "column" && <ColumnFooter draft={drawer.draft} rows={state.rows.length} presets={meta?.presets || []} />}
          {drawer?.kind === "inspect" && state.table?.columns.find((item) => item.id === drawer.colId)?.type !== "text" && (
            <>
              <Button type="button" variant="outline" onClick={() => { const col = state.table?.columns.find((item) => item.id === drawer.colId); if (col) actions.editColumn(col); }}><Icon name="pencil" />Edit column</Button>
              <Button type="button" onClick={() => void actions.rerunCell(drawer.rowId, drawer.colId)}><Icon name="play" />Run this cell</Button>
            </>
          )}
          {drawer?.kind === "sources" && (
            <>
              <Button type="button" variant="outline" onClick={actions.closeDrawer}>Cancel</Button>
              <Button type="button" onClick={() => void actions.runSource()}><Icon name="search" />Find and add rows</Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Library({ tab, query }: { tab: string; query: string }) {
  const { state, actions } = useSheet();
  const items = libraryItems(state.meta?.presets || []).filter((item) => (tab === "all" || item.tab === tab) && `${item.name} ${item.desc} ${item.tool || ""}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="cmd">
      <div className="cmd-in"><Icon name="search" /><input id="libq" autoFocus placeholder="Search enrichments…" value={query} onChange={(event) => actions.setLibraryQuery(event.target.value)} /></div>
      <div className="tabs-pad"><div className="tabs">{TABS.map(([key, name]) => <span key={key} className={`tab ${key === tab ? "on" : ""}`} onClick={() => actions.setLibraryTab(key)}>{name}</span>)}</div></div>
      <div className="cmd-list" id="lib">
        {items.map((item) => (
          <div key={`${item.act}-${item.preset || item.type}-${item.name}`} className="pre" onClick={() => item.act === "preset" && item.preset ? void actions.pickPreset(item.preset) : actions.startColumn(item.type || "text", { kind: item.kind, web: item.web })}>
            <span className={`pi ${item.free ? "free" : ""}`}><Icon name={item.icon} className="sm" /></span>
            <div className="pb"><div className="pn">{item.name}</div><div className="pd">{item.desc}</div>{item.tool ? <div className="pt">{item.tool}</div> : null}</div>
            <span className="badge badge-secondary badge-mono">{item.cost}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnForm({ draft, error, generating, presets, models }: { draft: Draft; error: string; generating: boolean; presets: Preset[]; models: { id: string; name: string }[] }) {
  const { actions } = useSheet();
  const set = (next: Draft) => actions.updateDraft(next);
  const cfg = draft.config;
  const kind = TYPE[draft.type] || TYPE.text!;
  const preset = presets.find((item) => item.id === cfg.preset);
  return (
    <>
      <label className="label flush">Column name</label>
      <input value={draft.name} placeholder={kind.name} onChange={(event) => set({ ...draft, name: event.target.value })} />
      {draft.type === "text" && <p className="desc">Double-click a cell to type in it.</p>}
      {draft.type === "formula" && (
        <>
          <label className="label">Describe it <span className="opt">(AI writes the formula)</span></label>
          <div className="tpl">
            <input value={draft.description} placeholder="e.g. domain from Website, lowercase" onChange={(event) => set({ ...draft, description: event.target.value })} />
            <Button type="button" variant="outline" disabled={generating} onClick={() => void actions.generateFormula()}><Icon name={generating ? "loader" : "ai"} className={generating ? "spin" : ""} />{generating ? "Writing…" : "Generate"}</Button>
          </div>
          <label className="label">Formula</label>
          <Template value={cfg.expr || ""} area placeholder="domainOf({{Website}})" onChange={(expr) => set({ ...draft, config: { ...cfg, expr } })} exclude={draft.openedName} />
          <Chips exclude={draft.openedName} onInsert={(token, el) => insertValue(cfg.expr || "", token, el, (expr) => set({ ...draft, config: { ...cfg, expr } }))} />
          <p className="desc">One expression. <code>{"{{Column}}"}</code> is the cell text, <code>{"{{Column.path}}"}</code> is a field inside an enrichment result. Helpers: <code>domainOf</code> <code>emailDomain</code> <code>firstName</code> <code>lastName</code> <code>lower</code> <code>upper</code> <code>num</code> <code>empty</code>. Comparisons and ternaries are fine. It cannot run statements or read anything outside the row.</p>
        </>
      )}
      {draft.type === "enrich" && preset && (
        <>
          <div className="divider" />
          <div className="panel">
            <div className="panel-head"><span className="pre flush"><span className="pi"><Icon name={presetIcon(preset)} className="sm" /></span></span><b>{preset.name}</b><span className="badge badge-brand badge-mono">{preset.id === "custom" ? "custom" : `${fmtCr(preset.rate)} cr / row`}</span></div>
            {preset.tool ? <div className="tool-line">{preset.tool}</div> : null}
          </div>
          {preset.id === "custom" ? (
            <>
              <label className="label">Tool id</label>
              <input className="mono" value={cfg.tool || ""} placeholder="apify:owner~actor or serper:search" onChange={(event) => set({ ...draft, config: { ...cfg, tool: event.target.value } })} />
              <label className="label">Request body <span className="opt">(JSON, {"{{Column}}"} in values)</span></label>
              <Template value={cfg.body || ""} area onChange={(body) => set({ ...draft, config: { ...cfg, body } })} exclude={draft.openedName} />
              <Chips exclude={draft.openedName} onInsert={(token, el) => insertValue(cfg.body || "", token, el, (body) => set({ ...draft, config: { ...cfg, body } }))} />
              <label className="label">Credits per row <span className="opt">(for the cost preview)</span></label>
              <input type="number" step="0.001" value={cfg.rate || 0} onChange={(event) => set({ ...draft, config: { ...cfg, rate: Number(event.target.value) || 0 } })} />
            </>
          ) : (
            <>
              <div className="section">Inputs</div>
              <p className="desc tight">Map each input to a column. Use {"{ }"} to insert one.</p>
              {preset.inputs.map((input) => (
                <PresetInput key={input.key} input={input} value={cfg.inputs?.[input.key] || ""} exclude={draft.openedName} onChange={(value) => set({ ...draft, config: { ...cfg, inputs: { ...cfg.inputs, [input.key]: value } } })} />
              ))}
            </>
          )}
          <label className="label">Cell shows <span className="opt">(optional path)</span></label>
          <input className="mono" value={cfg.pick || ""} placeholder={preset.id === "custom" ? "e.g. organic.0.link" : (preset.pick || []).join(" | ") || "whole result"} onChange={(event) => set({ ...draft, config: { ...cfg, pick: event.target.value } })} />
          {!draft.id && preset.id !== "custom" && preset.outputs.length > 0 && (
            <>
              <div className="section">Add fields as columns</div>
              <div className="outs">
                {preset.outputs.map((output, index) => (
                  <label className="check" key={output.path}><input type="checkbox" checked={!!draft.outputOn[index]} onChange={(event) => set({ ...draft, outputOn: draft.outputOn.map((on, i) => i === index ? event.target.checked : on) })} />{output.name}</label>
                ))}
              </div>
              <p className="desc">You can add any other field later from a cell&apos;s result.</p>
            </>
          )}
        </>
      )}
      {draft.type === "waterfall" && (
        <>
          <label className="label">Find</label>
          <select value={cfg.kind || "email"} onChange={(event) => actions.setWaterfallKind(event.target.value)}>
            <option value="email">Work email</option>
            <option value="phone">Mobile phone</option>
          </select>
          {cfg.kind === "email" && <label className="check"><input type="checkbox" checked={!!cfg.verify} onChange={(event) => set({ ...draft, config: { ...cfg, verify: event.target.checked } })} /><span>Verify each email with Million Verifier<small>0.046 cr each. &quot;ok&quot; stops the waterfall, catch-all is kept as a fallback, invalid is dropped.</small></span></label>}
          <div className="section">Steps</div>
          <p className="desc tight-10">Run top to bottom. A step with empty inputs is skipped for free.</p>
          {(cfg.steps || []).map((step, index) => {
            const stepPreset = presets.find((item) => item.id === step.preset);
            if (!stepPreset) return null;
            return (
              <div className="step" key={`${step.preset}-${index}`}>
                <div className="sh">
                  <span className="n">{index + 1}</span><b>{stepPreset.name}</b>
                  <span className="badge badge-secondary badge-mono">{stepPreset.rate ? `${fmtCr(stepPreset.rate)} cr` : "free"}</span>
                  <Button type="button" variant="ghost" size="icon-xs" title="Up" onClick={() => actions.moveStep(index, -1)}><Icon name="left" className="sm" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" title="Down" onClick={() => actions.moveStep(index, 1)}><Icon name="right" className="sm" /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" title="Remove" onClick={() => actions.deleteStep(index)}><Icon name="x" className="sm" /></Button>
                </div>
                <details>
                  <summary>Inputs <Icon name="chev" className="sm" /></summary>
                  {stepPreset.inputs.map((input) => (
                    <PresetInput key={input.key} input={input} value={step.inputs[input.key] || ""} exclude={draft.openedName} onChange={(value) => {
                      const steps = (cfg.steps || []).map((item, i) => i === index ? { ...item, inputs: { ...item.inputs, [input.key]: value } } : item);
                      set({ ...draft, config: { ...cfg, steps } });
                    }} />
                  ))}
                </details>
              </div>
            );
          })}
          <StepAdder presets={presets} kind={cfg.kind || "email"} used={(cfg.steps || []).map((step) => step.preset)} />
        </>
      )}
      {draft.type === "ai" && (
        <>
          <label className="label">Prompt</label>
          <Template value={cfg.prompt || ""} area placeholder="In one short sentence, what does {{Company}} sell? Website: {{Website}}" onChange={(prompt) => set({ ...draft, config: { ...cfg, prompt } })} exclude={draft.openedName} />
          <Chips exclude={draft.openedName} onInsert={(token, el) => insertValue(cfg.prompt || "", token, el, (prompt) => set({ ...draft, config: { ...cfg, prompt } }))} />
          <label className="label">Model</label>
          <select value={cfg.model || ""} onChange={(event) => set({ ...draft, config: { ...cfg, model: event.target.value } })}>
            {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={!!cfg.web} onChange={(event) => set({ ...draft, config: { ...cfg, web: event.target.checked } })} /><span>Web research agent<small>Google search and page reads before it answers. About 1–3 credits per row.</small></span></label>
          <label className="label">Output fields <span className="opt">(optional, comma separated)</span></label>
          <input value={draft.fieldsText} placeholder="ceo_name, pricing_model, b2b_or_b2c" onChange={(event) => set({ ...draft, fieldsText: event.target.value })} />
          <p className="desc">With fields, the AI returns JSON and {draft.id ? "you can add each field as a column from a cell's result." : "each field becomes its own column."}</p>
        </>
      )}
      {draft.type === "http" && (
        <>
          <div className="http-grid">
            <div>
              <label className="label">Method</label>
              <select value={cfg.method || "POST"} onChange={(event) => set({ ...draft, config: { ...cfg, method: event.target.value } })}>
                {["GET", "POST", "PUT", "PATCH"].map((method) => <option key={method}>{method}</option>)}
              </select>
            </div>
            <div>
              <label className="label">URL</label>
              <Template value={cfg.url || ""} placeholder="https://hooks.example.com/…" onChange={(url) => set({ ...draft, config: { ...cfg, url } })} exclude={draft.openedName} />
            </div>
          </div>
          <label className="label">Headers <span className="opt">(JSON)</span></label>
          <Template value={cfg.headers || ""} area onChange={(headers) => set({ ...draft, config: { ...cfg, headers } })} exclude={draft.openedName} />
          <label className="label">Body <span className="opt">(JSON, {"{{Column}}"} in values)</span></label>
          <Template value={cfg.body || ""} area onChange={(body) => set({ ...draft, config: { ...cfg, body } })} exclude={draft.openedName} />
          <Chips exclude={draft.openedName} onInsert={(token, el) => insertValue(cfg.body || "", token, el, (body) => set({ ...draft, config: { ...cfg, body } }))} />
          <label className="label">Cell shows <span className="opt">(optional path)</span></label>
          <input className="mono" value={cfg.pick || ""} onChange={(event) => set({ ...draft, config: { ...cfg, pick: event.target.value } })} />
        </>
      )}
      {draft.type !== "text" && (
        <>
          <div className="divider" />
          <RunCondition key={`${draft.id || "new"}-${draft.type}`} startOpen={!!cfg.runIf}>
            <Template value={cfg.runIf || ""} placeholder="{{Email result}} !== 'ok'" onChange={(runIf) => set({ ...draft, config: { ...cfg, runIf } })} exclude={draft.openedName} />
            <p className="desc">Optional formula. The row runs only when it is true. Rows with empty required inputs are always skipped at no cost.</p>
          </RunCondition>
          <label className="check"><input type="checkbox" checked={!!draft.auto_run} onChange={(event) => set({ ...draft, auto_run: event.target.checked })} /><span>Auto-run<small>Run on new rows, and again when an input changes.</small></span></label>
        </>
      )}
      {error && <div className="alert"><Icon name="alert" /><span>{error}</span></div>}
    </>
  );
}

function RunCondition({ startOpen, children }: { startOpen: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.open = startOpen; }, []);
  return (
    <details ref={ref}>
      <summary className="summary-strong">Run condition <Icon name="chev" className="sm" /></summary>
      {children}
    </details>
  );
}

function ColumnFooter({ draft, rows, presets }: { draft: Draft; rows: number; presets: Preset[] }) {
  const { actions } = useSheet();
  const per = estimateDraft(draft, presets);
  const cost = per ? ` · ≈${fmtCr(per * rows)} cr` : "";
  return draft.id ? (
    <>
      <Button type="button" variant="outline" onClick={actions.closeDrawer}>Cancel</Button>
      <Button type="button" variant="outline" onClick={() => void actions.saveColumn("none")}>Save</Button>
      {draft.type !== "text" && <Button type="button" onClick={() => void actions.saveColumn("all")}><Icon name="play" />Save and run{cost}</Button>}
    </>
  ) : (
    <>
      <Button type="button" variant="ghost" className="back" onClick={() => actions.openLibrary()}><Icon name="back" />Back</Button>
      <Button type="button" variant="outline" onClick={() => void actions.saveColumn("none")}>Save</Button>
      {draft.type !== "text" && <Button type="button" variant="outline" onClick={() => void actions.saveColumn("first10")}>Run 10 rows</Button>}
      {draft.type !== "text" && <Button type="button" onClick={() => void actions.saveColumn("all")}><Icon name="play" />Run {rows.toLocaleString()} rows{cost}</Button>}
    </>
  );
}

function PresetInput({ input, value, exclude, onChange }: { input: Preset["inputs"][number]; value: string; exclude: string; onChange: (value: string) => void }) {
  return (
    <>
      <label className="label">{input.label}{input.required ? "" : <> <span className="opt">(optional)</span></>}</label>
      <Template value={value} onChange={onChange} exclude={exclude} />
    </>
  );
}

function Template({ value, onChange, area, placeholder, exclude }: { value: string; onChange: (value: string) => void; area?: boolean; placeholder?: string; exclude: string }) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const { state, actions } = useSheet();
  const insert = (event: MouseEvent) => {
    const names = (state.table?.columns || []).map((column) => column.name).filter((name) => name !== exclude);
    if (!names.length) return actions.toast("No columns yet");
    actions.openMenu(event, [{ label: "Insert column" }, ...names.map((name) => ({
      text: name,
      icon: TYPE[state.table?.columns.find((column) => column.name === name)?.type || "text"]?.icon || "text",
      run: () => insertValue(ref.current?.value || value, `{{${name}}}`, ref.current, onChange),
    }))]);
  };
  const props = { ref, value, placeholder, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
  return (
    <div className="tpl">
      {area ? <textarea {...props} /> : <input {...props} />}
      <Button type="button" variant="outline" size="icon" title="Insert a column" onClick={insert}><Icon name="braces" /></Button>
    </div>
  );
}

function Chips({ exclude, onInsert }: { exclude: string; onInsert: (token: string, el: HTMLInputElement | HTMLTextAreaElement | null) => void }) {
  const { state } = useSheet();
  return (
    <div className="chips">
      {(state.table?.columns || []).filter((column) => column.name !== exclude).map((column) => (
        <span key={column.id} className="chip" onClick={(event) => onInsert(`{{${column.name}}}`, event.currentTarget.parentElement?.previousElementSibling?.querySelector("input, textarea") || null)}>{column.name}</span>
      ))}
    </div>
  );
}

function insertValue(value: string, token: string, el: HTMLInputElement | HTMLTextAreaElement | null, onChange: (value: string) => void) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? start;
  const next = value.slice(0, start) + token + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el?.focus();
    const caret = start + token.length;
    el?.setSelectionRange(caret, caret);
  });
}

function StepAdder({ presets, kind, used }: { presets: Preset[]; kind: string; used: string[] }) {
  const { actions } = useSheet();
  const available = presets.filter((preset) => preset.kind === kind && !used.includes(preset.id));
  if (!available.length) return null;
  return (
    <select value="" onChange={(event) => actions.addStep(event.target.value)}>
      <option value="">Add a step…</option>
      {available.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
    </select>
  );
}

function Inspector({ drawer }: { drawer: { rowId: string; colId: number; cell: import("./types").CellDetail; query: string } }) {
  const { state, actions } = useSheet();
  const column = state.table?.columns.find((item) => item.id === drawer.colId);
  const cell = drawer.cell;
  const badge = cell.status === "error" ? "badge-destructive" : cell.status === "running" || cell.status === "queued" ? "badge-brand" : "badge-secondary";
  const kind = TYPE[column?.type || "text"] || TYPE.text!;
  const paths = (cell.paths || []).filter((item) => item.path.toLowerCase().includes(drawer.query.toLowerCase()));
  return (
    <>
      <div className="badge-row">
        <span className={`badge ${badge}`}>{cell.status || "empty"}</span>
        {cell.credits ? <span className="badge"><Icon name="coins" className="sm" />{fmtCr(cell.credits)} credits</span> : null}
        <span className="badge badge-secondary"><Icon name={kind.icon} className="sm" />{kind.name}</span>
      </div>
      {cell.error && <div className={`alert ${cell.status === "error" ? "" : "alert-muted"}`}><Icon name="alert" /><span>{cell.error}</span></div>}
      {cell.display && <><label className="label">Value</label><div className="value">{cell.display}</div></>}
      {!!cell.paths?.length && (
        <>
          <div className="section">Result fields</div>
          <p className="desc tight-10"><Icon name="plus" className="sm" /> adds a column that pulls this field for every row. Free.</p>
          <div className="search full"><Icon name="search" className="sm" /><input placeholder="Filter fields…" value={drawer.query} onChange={(event) => actions.setInspectQuery(event.target.value)} /></div>
          <div className="kv-wrap"><div className="kv" id="kv">
            {paths.map((item) => {
              const text = item.list && Array.isArray(item.value) ? `[${item.value.length} items]` : item.value == null ? "null" : typeof item.value === "string" || typeof item.value === "number" || typeof item.value === "boolean" ? String(item.value) : JSON.stringify(item.value);
              return (
                <Fragment key={item.path}>
                  <div className="p" title={item.path}>{item.path}</div>
                  <div title={text}>{text.slice(0, 200)}</div>
                  <div className="a"><Button type="button" variant="ghost" size="icon-xs" title="Add as column" onClick={() => void actions.addField(drawer.colId, item.path)}><Icon name="plus" className="sm" /></Button></div>
                </Fragment>
              );
            })}
          </div></div>
          <details className="details-gap"><summary>Raw JSON <Icon name="chev" className="sm" /></summary><pre className="json">{JSON.stringify(cell.value, null, 2).slice(0, 200000)}</pre></details>
        </>
      )}
    </>
  );
}

function Sources({ sourceId, values }: { sourceId: string; values: Record<string, string> }) {
  const { state, actions } = useSheet();
  const sources = state.meta?.sources || [];
  const source = sources.find((item) => item.id === sourceId) || sources[0];
  if (!source) return null;
  return (
    <>
      <div className="types stack">
        {sources.map((item) => (
          <div key={item.id} className={`type row ${item.id === source.id ? "on" : ""}`} onClick={() => actions.openSources(item.id)}>
            <span className="ti paid"><Icon name={SRC_ICON[item.id as keyof typeof SRC_ICON] || "users"} /></span>
            <div className="copy"><b>{item.name}</b><br /><span>{item.desc}</span></div>
            <span className="badge badge-secondary badge-mono">{item.rate ? `${fmtCr(item.rate)} cr/${item.rateUnit}` : "free"}</span>
          </div>
        ))}
      </div>
      <div className="divider" />
      {source.inputs.map((input) => (
        <div key={input.key}>
          <label className="label">{input.label}</label>
          <input value={values[input.key] ?? ""} onChange={(event) => actions.setSourceValue(input.key, event.target.value)} />
        </div>
      ))}
      <p className="desc">Adds columns: {Object.keys(source.columns).join(", ")}.</p>
      {!!state.sources.length && (
        <>
          <div className="section">Recent runs</div>
          {state.sources.slice(0, 5).map((run) => (
            <div className="desc row" key={run.id}>
              <span className={`badge ${run.status === "error" ? "badge-destructive" : run.status === "done" ? "badge-secondary" : "badge-brand"}`}>{run.status}</span>
              {run.source} · {run.added} rows{run.error ? ` · ${run.error.slice(0, 120)}` : ""}
            </div>
          ))}
        </>
      )}
    </>
  );
}

export function Popover() {
  const { state } = useSheet();
  const ref = useRef<HTMLDivElement>(null);
  const pop = state.pop;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !pop) return;
    el.style.left = `${Math.max(8, Math.min(pop.rect.left, window.innerWidth - el.offsetWidth - 10))}px`;
    el.style.top = `${pop.rect.bottom + 6}px`;
  }, [pop]);
  return (
    <div id="pop" className={pop ? "on" : ""} ref={ref} onClick={(event) => event.stopPropagation()}>
      {pop?.kind === "filter" && <Filters />}
      {pop?.kind === "sort" && <SortPopover />}
      {pop?.kind === "fields" && <Fields />}
    </div>
  );
}

function Filters() {
  const { state, actions } = useSheet();
  return (
    <>
      <h4>Filter rows</h4>
      {state.filters.map((filter, index) => (
        <div className="frow" key={index}>
          <select value={filter.col} onChange={(event) => actions.setFilter(index, { ...filter, col: event.target.value ? Number(event.target.value) : "" })}>
            <option value="">Column…</option>
            {(state.table?.columns || []).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
          </select>
          <select value={filter.op} onChange={(event) => actions.setFilter(index, { ...filter, op: event.target.value })}>
            {[["contains", "contains"], ["notcontains", "does not contain"], ["is", "is"], ["empty", "is empty"], ["notempty", "is not empty"], ["gt", ">"], ["lt", "<"], ["error", "has error"]].map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
          {["empty", "notempty", "error"].includes(filter.op) ? <span /> : <input value={filter.val} placeholder="Value" onChange={(event) => actions.setFilter(index, { ...filter, val: event.target.value })} />}
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => actions.removeFilter(index)}><Icon name="x" className="sm" /></Button>
        </div>
      ))}
      <div className="row-actions">
        <Button type="button" variant="outline" size="sm" onClick={actions.addFilter}><Icon name="plus" />Add filter</Button>
        <span className="grow" />
        {!!state.filters.length && <Button type="button" variant="ghost" size="sm" onClick={actions.clearFilters}>Clear</Button>}
      </div>
    </>
  );
}

function SortPopover() {
  const { state, actions } = useSheet();
  const sort = state.sort || { id: 0, dir: 1 as const };
  return (
    <>
      <h4>Sort rows</h4>
      <div className="frow sort">
        <select value={state.sort?.id || ""} onChange={(event) => actions.setSort(event.target.value ? { id: Number(event.target.value), dir: state.sort?.dir || 1 } : null)}>
          <option value="">None</option>
          {(state.table?.columns || []).map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
        <select value={String(sort.dir)} onChange={(event) => { if (state.sort) actions.setSort({ ...state.sort, dir: Number(event.target.value) === -1 ? -1 : 1 }); }}>
          <option value="1">A → Z</option>
          <option value="-1">Z → A</option>
        </select>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => { actions.setSort(null); actions.closePop(); }}><Icon name="x" className="sm" /></Button>
      </div>
    </>
  );
}

function Fields() {
  const { state, actions } = useSheet();
  return (
    <>
      <h4>Fields</h4>
      {(state.table?.columns || []).map((column) => (
        <div className="fld" key={column.id} onClick={() => actions.toggleField(column.id)}>
          <input type="checkbox" checked={!state.hidden.has(column.id)} readOnly />
          <Icon name={(TYPE[column.type] || TYPE.text!).icon} className="sm" />
          <span>{column.name}</span>
        </div>
      ))}
      <div className="row-actions"><Button type="button" variant="ghost" size="sm" onClick={actions.showAllFields}>Show all</Button></div>
    </>
  );
}

export function Menu() {
  const { state, actions } = useSheet();
  const menu = state.menu;
  const anchor = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el || !menu) return;
    el.style.setProperty("--menu-x", `${Math.max(8, Math.min(menu.rect.left, window.innerWidth - 250))}px`);
    el.style.setProperty("--menu-y", `${Math.max(8, menu.rect.bottom + 4)}px`);
  }, [menu]);
  return (
    <DropdownMenu open={!!menu} onOpenChange={(open) => { if (!open) actions.closeMenu(); }}>
      <DropdownMenuTrigger ref={anchor} className="menu-anchor" tabIndex={-1} aria-hidden />
      <DropdownMenuContent align="start" className="min-w-56">
        {menu?.items.map((item, index) => item === "-" ? <DropdownMenuSeparator key={index} /> : "label" in item ? <DropdownMenuLabel key={index}>{item.label}</DropdownMenuLabel> : (
          <DropdownMenuItem key={index} className={item.danger ? "text-destructive focus:text-destructive" : ""} onSelect={() => item.run()}>
            {item.icon ? <Icon name={item.icon} /> : null}<span>{item.text}</span>{item.hint ? <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Dialog() {
  const { state, actions } = useSheet();
  const dialog = state.dialog;
  const ref = useRef<HTMLInputElement>(null);
  return (
    <ConfirmDialog open={!!dialog} onOpenChange={(open) => { if (!open) actions.resolveDialog(null); }}>
      <DialogContent>
        {dialog && (
          <>
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              <DialogDescription className={dialog.desc ? "whitespace-pre-line" : "sr-only"}>{dialog.desc || "Confirm this action."}</DialogDescription>
            </DialogHeader>
            {dialog.input && <DialogInput initial={dialog.value} inputRef={ref} onSubmit={(value) => actions.resolveDialog(value.trim() || null)} onCancel={() => actions.resolveDialog(null)} />}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => actions.resolveDialog(null)}>Cancel</Button>
              <Button type="button" autoFocus={!dialog.input} variant={dialog.danger ? "destructive" : "default"} onClick={() => actions.resolveDialog(dialog.input ? (ref.current?.value.trim() || null) : true)}>{dialog.ok}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </ConfirmDialog>
  );
}

function DialogInput({ initial, inputRef, onSubmit, onCancel }: { initial: string; inputRef: { current: HTMLInputElement | null }; onSubmit: (value: string) => void; onCancel: () => void }) {
  return <input id="dlg_in" className="dlg-input" defaultValue={initial} autoFocus ref={inputRef} onKeyDown={(event) => { if (event.key === "Enter") onSubmit(event.currentTarget.value); if (event.key === "Escape") onCancel(); }} />;
}

export function Toasts() {
  const { state } = useSheet();
  return (
    <div id="toasts">
      {state.toasts.map((toast) => (
        <div className={`toast ${toast.err ? "err" : ""}`} key={toast.id}><Icon name={toast.err ? "alert" : "check"} /><span>{toast.msg}</span></div>
      ))}
    </div>
  );
}

export function BulkBar() {
  const { state, actions } = useSheet();
  const columns = state.table?.columns || [];
  const run = (event: MouseEvent) => {
    const runnable = columns.filter((column) => column.type !== "text");
    if (!runnable.length) return actions.toast("Add a column first");
    actions.openMenu(event, [
      { label: "Run on selected rows" },
      ...runnable.map((column) => ({
        text: column.name,
        icon: (TYPE[column.type] || TYPE.text!).icon,
        hint: column.perRow ? `≈${fmtCr(column.perRow * state.selected.size)} cr` : "free",
        run: () => void actions.runRows(column, [...state.selected]),
      })),
    ]);
  };
  return (
    <div id="bulk" className={state.selected.size ? "on" : ""}>
      <b id="bulkn">{state.selected.size} selected</b>
      <Button type="button" variant="outline" size="sm" onClick={run}><Icon name="play" />Run column</Button>
      <Button type="button" variant="ghost" size="sm" className="bulk-delete" onClick={() => void actions.bulkDelete()}><Icon name="trash" />Delete</Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={actions.clearSelection}><Icon name="x" /></Button>
    </div>
  );
}
