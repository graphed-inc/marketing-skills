"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Grid } from "./grid";
import { Icon } from "./icons";
import { fmtCr, TYPE } from "./model";
import { BulkBar, Dialog, Drawer, Menu, Popover, Toasts } from "./panels";
import { SpreadsheetProvider, useSheet } from "./provider";

export function Spreadsheet() {
  return (
    <SpreadsheetProvider>
      <Frame />
    </SpreadsheetProvider>
  );
}

function Frame() {
  const { state, view, actions } = useSheet();
  const table = state.table;
  const columns = table?.columns || [];
  const credits = columns.reduce((sum, column) => sum + (column.stats?.credits || 0), 0) + state.srcCredits;
  const running = columns.reduce((sum, column) => sum + (column.stats?.queued || 0) + (column.stats?.running || 0), 0);
  const finding = state.sources.filter((source) => source.status === "queued" || source.status === "running").length;
  const busy = [running ? `${running.toLocaleString()} running` : "", finding ? "finding leads" : ""].filter(Boolean).join(" · ");
  const paid = columns.filter((column) => TYPE[column.type]?.paid);
  const autoOn = paid.length > 0 && paid.every((column) => column.auto_run);
  const filters = state.filters.filter((filter) => filter.col).length;
  const shown = state.tables.filter((item) => !state.tableQuery.trim() || item.name.toLowerCase().includes(state.tableQuery.trim().toLowerCase()));
  return (
    <div id="app">
      <aside>
        <div className="sb-head"><div className="ws-ico">W</div><div className="sb-title"><b>Workspace</b><span>Enrichment tables</span></div></div>
        <div className="search-pad"><div className="search full"><Icon name="search" className="sm" /><input id="tsearch" placeholder="Search tables…" value={state.tableQuery} onChange={(event) => actions.setTableQuery(event.target.value)} /></div></div>
        <div className="sb-group">
          <div className="sb-label"><span>Tables</span><Button type="button" variant="ghost" size="icon-xs" title="New table" onClick={() => void actions.newTable()}><Icon name="plus" /></Button></div>
          <div id="tables">
            {shown.length ? shown.map((item) => (
              <div key={item.id} className={`tbl ${table?.id === item.id ? "on" : ""}`} onClick={() => void actions.openTable(item.id)}>
                <Icon name="table" /><span className="nm">{item.name}</span><span className="ct">{item.rowCount.toLocaleString()}</span>
              </div>
            )) : <div className="desc pad">No tables yet</div>}
          </div>
        </div>
        <div className="sb-foot">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void actions.newTable()}><Icon name="plus" />New table</Button>
          <div className="fine">Paid columns bill credits per row</div>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span className="crumb">Workspace</span><span className="sep tilt" />
          <TableName />
          <span className="grow" />
          <span className={`badge badge-brand ${table && busy ? "" : "gone"}`} id="busy"><Icon name="loader" className="sm spin" />{busy}</span>
          <span className={`badge ${table ? "" : "gone"}`} id="credits" title="Credits spent in this table (1 credit = 1¢)"><Icon name="coins" className="sm" />{fmtCr(credits)} credits</span>
          <label className={`switch ${autoOn ? "on" : ""} ${table ? "" : "gone"}`} id="autosw" onClick={() => void actions.toggleAuto()} title="Run paid columns on new rows and when inputs change"><span className="tr" />Auto-update</label>
          <Button type="button" variant="outline" size="sm" className={table ? "" : "gone"} id="exportbtn" onClick={actions.exportCsv}><Icon name="download" />Export</Button>
          <Button type="button" variant="ghost" size="icon-sm" className={table ? "" : "gone"} id="morebtn" onClick={actions.tableMenu} title="More"><Icon name="more" /></Button>
          <Button type="button" variant="outline" size="sm" id="agentbtn" onClick={actions.copyPrompt} title="Copy a prompt that explains this app to your agent"><Icon name="copy" />Ask your agent</Button>
        </div>
        <div className={`toolbar ${table ? "" : "gone"}`} id="toolbar">
          <span className="viewtab"><Icon name="table" className="sm" />Default view</span>
          <span className="sep" />
          <Button type="button" variant="ghost" size="sm" id="filterbtn" onClick={actions.openFilters}><Icon name="filter" />Filter{filters ? <span className="cnt">{filters}</span> : null}</Button>
          <Button type="button" variant="ghost" size="sm" id="sortbtn" onClick={actions.openSort}><Icon name="sort" />Sort{state.sort ? <span className="cnt">1</span> : null}</Button>
          <Button type="button" variant="ghost" size="sm" id="fieldsbtn" onClick={actions.openFields}><Icon name={state.hidden.size ? "eyeoff" : "eye"} />Fields{state.hidden.size ? <span className="cnt">{state.hidden.size} hidden</span> : null}</Button>
          <div className="search narrow"><Icon name="search" className="sm" /><input id="search" placeholder="Search…" value={state.query} onChange={(event) => actions.setQuery(event.target.value)} /></div>
          <span className="grow" />
          <Button type="button" variant="outline" size="sm" onClick={() => actions.openSources()}><Icon name="users" />Find leads</Button>
          <Button type="button" variant="outline" size="sm" onClick={actions.pickCsv}><Icon name="upload" />Import CSV</Button>
          <Button type="button" size="sm" onClick={() => actions.openLibrary()}><Icon name="plus" />Add enrichment</Button>
          <input ref={actions.fileRef} className="gone" type="file" id="csvfile" accept=".csv,text/csv" onChange={(event) => { void actions.importCsv(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        <div id="gridwrap" ref={actions.wrapRef}><Grid /></div>
        <div className={`gfoot ${table ? "" : "gone"}`} id="gfoot">
          <Button type="button" variant="ghost" size="xs" onClick={() => void actions.addRows()}><Icon name="plus" className="sm" />Add row</Button>
          <span className="sep" />
          <span id="footinfo">{view.length === state.rows.length ? `${state.rows.length.toLocaleString()} rows` : `${view.length.toLocaleString()} of ${state.rows.length.toLocaleString()} rows`}</span>
          <span className="grow" />
          <span id="footsel">{state.selected.size ? `${state.selected.size} selected` : ""}</span>
        </div>
      </main>
      <BulkBar />
      <Drawer />
      <Dialog />
      <Menu />
      <Popover />
      <Toasts />
    </div>
  );
}

function TableName() {
  const { state, actions } = useSheet();
  const name = state.table?.name || "";
  const [value, setValue] = useState(name);
  useEffect(() => {
    if (document.activeElement?.id !== "tname") setValue(name);
  }, [name]);
  return (
    <input
      id="tname"
      className={state.table ? "" : "gone"}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void actions.renameTable(value)}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );
}
