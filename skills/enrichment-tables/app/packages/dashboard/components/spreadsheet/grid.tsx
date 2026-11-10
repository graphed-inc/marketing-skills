"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { api } from "./api";
import { Icon } from "./icons";
import { ADDW, fmtCr, isUrl, linkLabel, NUMW, ROWH, TYPE, visibleColumns } from "./model";
import { useSheet } from "./provider";
import type { CellDetail, Column, MenuEntry, Row } from "./types";

function place(width?: number, top?: number, height?: number) {
  return (node: HTMLDivElement | null) => {
    if (!node) return;
    if (width != null) node.style.width = `${width}px`;
    if (top != null) node.style.top = `${top}px`;
    if (height != null) node.style.height = `${height}px`;
  };
}

export function Grid() {
  const { state, view, actions } = useSheet();
  const columns = visibleColumns(state.table?.columns || [], state.hidden);
  const width = NUMW + columns.reduce((sum, column) => sum + column.width, 0) + ADDW;
  const [range, setRange] = useState({ a: 0, b: 40 });

  useEffect(() => {
    const wrap = actions.wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const a = Math.max(0, Math.floor(wrap.scrollTop / ROWH) - 8);
      const b = Math.min(view.length, a + Math.ceil(wrap.clientHeight / ROWH) + 16);
      setRange((prev) => prev.a === a && prev.b === b ? prev : { a, b });
    };
    measure();
    wrap.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      wrap.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [actions.wrapRef, view.length, columns.length, state.table?.id]);

  if (!state.table) {
    return (
      <div id="grid">
        <div className="empty">
          <div className="card">
            <div className="ico"><Icon name="table" /></div>
            <h2>Build a list, enrich it, send it</h2>
            <p>Pull people from a lead search or a CSV, then add columns that find emails, company data, and AI research. Use Ask your agent in the top right. It explains the app and builds the table for you.</p>
            <div className="row"><Button type="button" onClick={() => void actions.newTable()}><Icon name="plus" />New table</Button></div>
          </div>
        </div>
      </div>
    );
  }

  const allSelected = state.selected.size > 0 && state.selected.size === view.length;
  return (
    <div id="grid">
      <div className="hdr" ref={place(width)}>
        <div className="h sticky" ref={place(NUMW)}>
          <input type="checkbox" checked={allSelected} onClick={(event) => event.stopPropagation()} onChange={(event) => actions.toggleAll(event.target.checked)} />
        </div>
        {columns.map((column) => <Header key={column.id} column={column} onResize={startResize} />)}
        <div className="h add" onClick={() => actions.openLibrary()}><Icon name="plus" />Add column</div>
      </div>
      <div id="body" ref={place(width, undefined, view.length * ROWH)}>
        {view.slice(range.a, range.b).map((row, offset) => (
          <GridRow key={row.id} row={row} index={range.a + offset} columns={columns} />
        ))}
      </div>
      {state.rows.length === 0 && (
        <div className="empty">
          <div className="card">
            <div className="ico"><Icon name="users" /></div>
            <h2>No rows yet</h2>
            <p>Find leads, import a CSV, or add a row by hand.</p>
            <div className="row">
              <Button type="button" onClick={() => actions.openSources()}><Icon name="users" />Find leads</Button>
              <Button type="button" variant="outline" onClick={actions.pickCsv}><Icon name="upload" />Import CSV</Button>
              <Button type="button" variant="outline" onClick={() => void actions.addRows()}><Icon name="plus" />Row</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function startResize(event: MouseEvent, column: Column) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = column.width;
    const widthAt = (clientX: number) => Math.max(60, startW + clientX - startX);
    const move = (ev: globalThis.MouseEvent) => actions.resize(column.id, widthAt(ev.clientX), false);
    const up = (ev: globalThis.MouseEvent) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      actions.resize(column.id, widthAt(ev.clientX), true);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }
}

function Header({ column, onResize }: { column: Column; onResize: (event: MouseEvent, column: Column) => void }) {
  const { state, view, actions } = useSheet();
  const kind = TYPE[column.type] || TYPE.text!;
  const running = (column.stats?.queued || 0) + (column.stats?.running || 0);
  const rows = state.rows.length;
  const openRun = (event: MouseEvent) => {
    const items: MenuEntry[] = [
      { label: `Run ${column.name}` },
      { text: "All rows", icon: "play", hint: column.perRow ? `≈${fmtCr(column.perRow * rows)} cr` : "free", run: () => void actions.runColumn(column, "all") },
      { text: "Empty + errors", icon: "refresh", run: () => void actions.runColumn(column, "empty") },
      { text: "First 10 rows", icon: "play", hint: column.perRow ? `≈${fmtCr(column.perRow * Math.min(10, rows))} cr` : "", run: () => void actions.runColumn(column, "first10") },
    ];
    if (view.length !== rows) {
      items.push({ text: "Filtered rows only", icon: "filter", hint: `${view.length} rows`, run: () => void actions.runRows(column, view.map((row) => row.id)) });
    }
    actions.openMenu(event, items);
  };
  const openColumn = (event: MouseEvent) => {
    const items: MenuEntry[] = [{ label: column.name }];
    if (column.type !== "text") {
      items.push(
        { text: "Run all rows", icon: "play", hint: column.perRow ? `≈${fmtCr(column.perRow)} cr/row` : "free", run: () => void actions.runColumn(column, "all") },
        { text: "Run empty + errors", icon: "refresh", run: () => void actions.runColumn(column, "empty") },
        { text: "Run first 10 rows", icon: "play", run: () => void actions.runColumn(column, "first10") },
      );
      if (column.stats?.queued) items.push({ text: "Stop queued cells", icon: "stop", run: () => void actions.stopColumn(column.id) });
      items.push(
        { text: column.auto_run ? "Turn auto-run off" : "Turn auto-run on", icon: "refresh", hint: column.auto_run ? "on" : "off", run: () => void actions.toggleColumnAuto(column) },
        { text: "Edit column", icon: "pencil", run: () => actions.editColumn(column) },
        "-",
      );
    }
    items.push(
      { text: "Rename", icon: "pencil", run: () => void actions.renameColumn(column) },
      { text: "Sort A → Z", icon: "sort", run: () => actions.setSort({ id: column.id, dir: 1 }) },
      { text: "Sort Z → A", icon: "sort", run: () => actions.setSort({ id: column.id, dir: -1 }) },
    );
    if (state.sort) items.push({ text: "Clear sort", icon: "x", run: () => actions.setSort(null) });
    items.push(
      { text: "Move left", icon: "left", run: () => void actions.moveColumn(column, -1) },
      { text: "Move right", icon: "right", run: () => void actions.moveColumn(column, 1) },
      "-",
      { text: "Delete column", icon: "trash", danger: true, run: () => void actions.deleteColumn(column) },
    );
    actions.openMenu(event, items);
  };
  return (
    <div className="h" ref={place(column.width)} onClick={openColumn} title={column.name}>
      <span className={`tic ${kind.paid ? "paid" : ""}`}><Icon name={kind.icon} className="sm" /></span>
      <span className="nm">{column.name}</span>
      {column.auto_run && kind.paid ? <span className="auto-mark" title="Auto-run on"><Icon name="refresh" className="sm" /></span> : null}
      {running ? <span className="st r"><Icon name="loader" className="sm spin" />{running}</span> : null}
      {column.stats?.errors ? <span className="st e">{column.stats.errors}</span> : null}
      {column.type !== "text" && (
        <span className="run" title="Run column" onClick={openRun}><Icon name="play" /></span>
      )}
      <span className="rz" onMouseDown={(event) => onResize(event, column)} onClick={(event) => event.stopPropagation()} />
    </div>
  );
}

function GridRow({ row, index, columns }: { row: Row; index: number; columns: Column[] }) {
  const { state, actions } = useSheet();
  const selected = state.selected.has(row.id);
  return (
    <div className={`r ${selected ? "sel" : ""}`} ref={place(undefined, index * ROWH)} data-id={row.id}>
      <div className="c num sticky" ref={place(NUMW)}>
        <input type="checkbox" checked={selected} onChange={(event) => actions.toggleSelect(row.id, event.target.checked)} />
        {index + 1}
      </div>
      {columns.map((column) => column.type === "text"
        ? <TextCell key={column.id} row={row} column={column} />
        : <CalcCell key={column.id} row={row} column={column} />)}
    </div>
  );
}

function cellText(value: string) {
  if (!isUrl(value)) return value;
  return <a className="lnk" href={value} target="_blank" rel="noopener" onClick={(event) => event.stopPropagation()}>{linkLabel(value)}</a>;
}

function TextCell({ row, column }: { row: Row; column: Column }) {
  const { state, actions } = useSheet();
  const cell = row.c[column.id];
  const display = cell ? cell[0] : "";
  const focused = state.focus?.r === row.id && state.focus.c === column.id;
  const full = useRef(display);
  const done = useRef(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(display);
  const [ready, setReady] = useState(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (save) void actions.saveText(row.id, column.id, value, full.current);
  };
  const start = () => {
    done.current = false;
    setEditing(true);
    setReady(false);
    void api<CellDetail>(`/api/cells/${row.id}/${column.id}`).then((detail) => {
      full.current = detail.display ?? "";
      setValue(full.current);
      setReady(true);
    }).catch((error: Error) => {
      actions.toast(error.message, 4000, true);
      done.current = true;
      setEditing(false);
    });
  };
  return (
    <div className={`c ${focused ? "focus" : ""}`} ref={place(column.width)} title={display} onClick={() => actions.focusCell(row.id, column.id)} onDoubleClick={start}>
      {editing && ready ? (
        <input
          className="edit"
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish(true);
            if (event.key === "Escape") finish(false);
          }}
          onBlur={() => finish(true)}
        />
      ) : <span>{cellText(display)}</span>}
    </div>
  );
}

function CalcCell({ row, column }: { row: Row; column: Column }) {
  const { state, actions } = useSheet();
  const cell = row.c[column.id];
  const display = cell ? cell[0] : "";
  const status = cell ? cell[1] : "";
  const error = cell ? cell[2] : "";
  const focused = state.focus?.r === row.id && state.focus.c === column.id;
  let body = cellText(display);
  if (status === "queued") body = <span className="q"><span className="dot" />Queued</span>;
  else if (status === "running") body = <span className="q"><Icon name="loader" className="sm spin" />Running</span>;
  else if (status === "error") body = <span className="e" title={error}><Icon name="alert" className="sm" />{error.slice(0, 80) || "Error"}</span>;
  else if (status === "skipped") body = <span className="s" title={error}>—</span>;
  else if (status === "done" && !display) body = <span className="s" title={error || "no result"}>{error === "no match" ? "No match" : "—"}</span>;
  return (
    <div className={`c calc ${focused ? "focus" : ""}`} ref={place(column.width)} title={display} onClick={() => void actions.inspect(row.id, column.id)}>
      {body}
    </div>
  );
}
