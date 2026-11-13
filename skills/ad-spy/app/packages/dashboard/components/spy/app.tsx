"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { Avatar, Platform } from "./bits";
import { AddBrandDialog, EditBrandDialog } from "./dialogs";
import { AdDrawer, CellDrawer } from "./drawers";
import { ago } from "./format";
import { Gaps } from "./gaps";
import { CopyIcon, EyeIcon, GridIcon, PlusIcon, RefreshIcon, SparkIcon, TargetIcon } from "./icons";
import { Library } from "./library";
import type { AppState, Brand, DrawerState, Filters } from "./types";

type View = "gaps" | "all" | "new" | "brand";

function subscribeHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function parseHash(hash: string): { view: View; brandId: number | null } {
  const [head, id] = hash.replace(/^#\/?/, "").split("/");
  if (head === "brand" && id) return { view: "brand", brandId: Number(id) };
  if (head === "new") return { view: "new", brandId: null };
  if (head === "all") return { view: "all", brandId: null };
  return { view: "gaps", brandId: null };
}

const EMPTY_FILTERS: Filters = { platform: "", format: "", status: "", style: "", sort: "newest", q: "" };

export function SpyApp() {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => "#/gaps");
  const route = parseHash(hash);
  const [state, setState] = useState<AppState | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<{ kind: "add"; prefill?: string } | { kind: "edit"; brand: Brand } | null>(null);
  const [replaceSite, setReplaceSite] = useState(false);
  const [gridReload, setGridReload] = useState(0);
  const [gapReload, setGapReload] = useState(0);
  const gridSig = useRef("");
  const gapSig = useRef("");
  const latestGrid = useRef("");
  const latestGap = useRef("");
  const pendingGrid = useRef(false);
  const pendingGap = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const routeKey = `${route.view}:${route.brandId ?? ""}`;
  const seenRoute = useRef(routeKey);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  const loadState = useCallback(async () => {
    const next = await api<AppState>("/api/state");
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    if (!location.hash || location.hash.startsWith("#/chat")) location.hash = "#/gaps";
    loadState().catch((error: Error) => notify(error.message));
  }, [loadState, notify]);

  useEffect(() => {
    if (seenRoute.current === routeKey) return;
    seenRoute.current = routeKey;
    setDrawer(null);
    if (route.view === "brand") setFilters((current) => ({ ...current, style: "" }));
  }, [routeKey, route.view]);

  useEffect(() => {
    if (drawer) return;
    if (pendingGrid.current) {
      pendingGrid.current = false;
      gridSig.current = latestGrid.current;
      setGridReload((value) => value + 1);
    }
    if (pendingGap.current) {
      pendingGap.current = false;
      gapSig.current = latestGap.current;
      setGapReload((value) => value + 1);
    }
  }, [drawer]);

  useEffect(() => {
    const timer = setInterval(async () => {
      const next = await loadState().catch(() => null);
      if (!next) return;
      const market = next.market;
      const gaps = market
        ? `${market.status}|${market.stage}|${JSON.stringify(market.progress?.voices || {})}|${market.progress?.voices_tagged}|${market.progress?.ads_tagged}|${next.brands.length}`
        : "none";
      latestGap.current = gaps;
      if (route.view === "gaps" && gaps !== gapSig.current) {
        if (drawer || replaceSite) pendingGap.current = true;
        else {
          const first = gapSig.current === "";
          gapSig.current = gaps;
          if (!first) setGapReload((value) => value + 1);
        }
      }
      const grid = `${next.totals.ads}|${next.totals.queued}|${next.brands.map((brand) => `${brand.id}:${brand.pulling}:${brand.ads}`).join(",")}`;
      latestGrid.current = grid;
      if (route.view !== "gaps" && grid !== gridSig.current) {
        if (drawer) pendingGrid.current = true;
        else {
          const first = gridSig.current === "";
          gridSig.current = grid;
          if (!first) setGridReload((value) => value + 1);
        }
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [drawer, loadState, replaceSite, route.view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawer(null);
      setDialog(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const brand = state?.brands.find((item) => item.id === route.brandId) || null;
  const view = route.view;

  async function copyPrompt() {
    const { prompt } = await api<{ prompt: string }>("/api/agent-prompt");
    await navigator.clipboard.writeText(prompt);
    notify("Copied. Paste it into Claude Code to query this app's database.");
  }

  return (
    <div id="app">
      <aside>
        <div className="sb-head">
          <div className="logo"><EyeIcon /></div>
          <div><b>Ad Spy</b><span>Competitor ad library</span></div>
        </div>
        <div className="sb-group">
          <a className={`nav ${view === "gaps" ? "on" : ""}`} href="#/gaps">
            <TargetIcon /><span className="nm">Positioning gaps</span>
            <span className="ct">{state?.market?.status === "running" ? <span className="spin" /> : !state?.market ? <span className="badge badge-brand">Start</span> : ""}</span>
          </a>
          <a className={`nav ${view === "all" ? "on" : ""}`} href="#/all">
            <GridIcon /><span className="nm">All ads</span><span className="ct">{state?.totals.ads || ""}</span>
          </a>
          <a className={`nav ${view === "new" ? "on" : ""}`} href="#/new">
            <SparkIcon /><span className="nm">New this week</span><span className="ct">{state?.totals.new7 || ""}</span>
          </a>
        </div>
        <div className="sb-label">
          <span>Brands</span>
          <button className="btn btn-ghost btn-icon btn-xs" type="button" title="Track a brand" onClick={() => setDialog({ kind: "add" })}><PlusIcon /></button>
        </div>
        <div className="sb-scroll">
          <div className="sb-group">
            {state?.brands.length ? state.brands.map((item) => (
              <a className={`nav ${view === "brand" && brand?.id === item.id ? "on" : ""}`} href={`#/brand/${item.id}`} key={item.id}>
                <Avatar logo={item.logo} name={item.name} />
                <span className="nm">{item.name}</span>
                {item.pulling || item.queued ? <span className="spin" title="Working" /> : <span className="ct">{item.activeAds}</span>}
              </a>
            )) : <div className="fine">No brands yet. Click + to track a competitor.</div>}
          </div>
        </div>
        <div className="sb-foot">
          <button className="btn btn-outline btn-sm" type="button" onClick={() => copyPrompt().catch((error: Error) => notify(error.message))}>
            <CopyIcon />Ask your agent
          </button>
          <button className="btn btn-outline btn-sm" type="button" onClick={() => {
            api("/api/pull-all", { method: "POST" }).then(() => notify("Pulling new ads for every brand…")).catch((error: Error) => notify(error.message));
          }}>
            <RefreshIcon />Pull new ads now
          </button>
          <div className="fine">
            Pulls daily at 6am MT · last {ago(state?.totals.last_pull)}
            <br />
            {state?.totals.queued ? `${state.totals.queued} ads being analyzed · ` : ""}
            {Number(state?.totals.credits || 0).toFixed(1)} credits used
          </div>
        </div>
      </aside>
      <main>
        {!state ? <div className="scroll"><div className="empty"><span className="spin" /></div></div> : view === "gaps" ? (
          <Gaps
            state={state}
            replaceSite={replaceSite}
            reloadKey={gapReload}
            onStarted={() => { setReplaceSite(false); loadState().catch(() => {}); }}
            onReplace={() => setReplaceSite(true)}
            onTrack={(prefill) => setDialog({ kind: "add", prefill })}
            onOpenCell={(cell, brief) => setDrawer({ kind: "cell", brief, ...cell })}
            onToast={notify}
          />
        ) : (
          <Library
            view={view}
            brand={view === "brand" ? brand : null}
            filters={filters}
            styles={state.styles}
            brands={state.brands}
            reloadKey={gridReload}
            onFilters={setFilters}
            onOpen={(id) => setDrawer({ kind: "ad", id })}
            onAdd={() => setDialog({ kind: "add" })}
            onPull={(item) => {
              api(`/api/brands/${item.id}/pull`, { method: "POST" })
                .then(() => notify("Pulling new ads…"))
                .catch((error: Error) => notify(error.message));
            }}
            onEdit={(item) => setDialog({ kind: "edit", brand: item })}
          />
        )}
      </main>
      {drawer?.kind === "ad" ? (
        <AdDrawer
          id={drawer.id}
          back={drawer.back}
          onClose={() => setDrawer(null)}
          onBack={drawer.back ? () => { const back = drawer.back; if (back) setDrawer({ kind: "cell", ...back }); } : undefined}
          onToast={notify}
        />
      ) : null}
      {drawer?.kind === "cell" ? (
        <CellDrawer
          cell={drawer}
          onClose={() => setDrawer(null)}
          onOpenAd={(id) => setDrawer({ kind: "ad", id, back: drawer })}
        />
      ) : null}
      {dialog?.kind === "add" ? (
        <AddBrandDialog
          prefill={dialog.prefill}
          onClose={() => setDialog(null)}
          onError={notify}
          onSaved={(id) => {
            setDialog(null);
            notify("Tracking. First pull is running…");
            loadState().then(() => { location.hash = `#/brand/${id}`; }).catch(() => {});
          }}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <EditBrandDialog
          brand={dialog.brand}
          onClose={() => setDialog(null)}
          onError={notify}
          onSaved={() => {
            setDialog(null);
            notify("Saved");
            loadState().catch(() => {});
          }}
          onDeleted={() => {
            setDialog(null);
            loadState().then(() => { location.hash = "#/all"; }).catch(() => {});
          }}
        />
      ) : null}
      <div className={`toast ${toast ? "on" : ""}`}>{toast}</div>
    </div>
  );
}
