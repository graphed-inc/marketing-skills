"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";

const G = { SCW: 300, COLW: 132, HDR: 84, ROWH: 236 };

function Icon({ className = "i", children }: { className?: string; children: ReactNode }) {
  return <svg className={className} viewBox="0 0 24 24">{children}</svg>;
}
const Plus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const Check = ({ sm = false }: { sm?: boolean }) => <Icon className={sm ? "i sm" : "i"}><path d="M20 6 9 17l-5-5" /></Icon>;
const Loader = () => <Icon className="i spin"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></Icon>;
const Play = () => <Icon><path d="M7 4v16l13-8z" fill="currentColor" /></Icon>;
const X = () => <Icon className="i sm"><path d="M18 6 6 18M6 6l12 12" /></Icon>;
const Film = () => <Icon><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" /></Icon>;
const Users = () => <Icon><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
const FileI = () => <Icon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></Icon>;
const GridI = () => <Icon><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>;
const Spark = () => <Icon><path d="M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z" /></Icon>;
const Search = () => <Icon className="i sm"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>;
const Edit = () => <Icon className="i sm"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>;
const Trash = () => <Icon className="i sm"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></Icon>;
const DownloadI = () => <Icon><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Icon>;

interface ApiError {
  error?: string;
}

function apiError(value: unknown, fallback: string): string {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as ApiError).error;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
}

async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const r = await fetch(path, body !== undefined || method ? {
    method: method || "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  } : {});
  const d: unknown = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(apiError(d, r.statusText));
  return d as T;
}

const personOf = (name?: string) => String(name || "").split(" · ")[0];
const busy = (v: any) => v && (v.status === "queued" || v.status === "running");
const mins = (s: number) => (s < 60 ? "<1 min" : `~${Math.round(s / 60)} min`);
const cr = (n: number) => Math.round(n).toLocaleString();
const usd = (credits: number) => "$" + (credits / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (t?: string) => {
  const d = new Date(t || 0);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
const keyOf = (sid: number, aid: number) => `${sid}:${aid}`;
const pairSig = (ps: { script_id: number; avatar_id: number }[]) => ps.map((p) => `${p.script_id}:${p.avatar_id}`).join(",");

function place(x: number, y: number, w?: number, h?: number) {
  return (node: HTMLDivElement | null) => {
    if (!node) return;
    node.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    if (w != null) node.style.width = `${w}px`;
    if (h != null) node.style.height = `${h}px`;
  };
}
function box(w?: number, h?: number) {
  return (node: HTMLDivElement | null) => {
    if (!node) return;
    if (w != null) node.style.width = `${w}px`;
    if (h != null) node.style.height = `${h}px`;
  };
}
function Bar({ pct }: { pct: number }) {
  return <div className="bar"><i ref={(n) => { if (n) n.style.width = `${Math.round((pct || 0) * 100)}%`; }} /></div>;
}

function gridGeom(opts: { count: number; minW?: number; rowH?: number; gap: number; extraH?: number; width: number; height: number; scrollTop: number; offsetTop: number }) {
  const pad = 24;
  const W = Math.max(0, opts.width - pad * 2);
  let cols = 1;
  let cw = W;
  let ch = opts.rowH || 0;
  if (opts.minW) {
    cols = Math.max(1, Math.floor((W + opts.gap) / (opts.minW + opts.gap)));
    cw = (W - opts.gap * (cols - 1)) / cols;
    ch = Math.round((cw * 16) / 9) + (opts.extraH || 0);
  }
  const rows = Math.ceil(opts.count / cols) || 0;
  const rh = ch + opts.gap;
  const height = (rows ? rows * rh - opts.gap : 0) + pad * 2;
  const top = opts.scrollTop - opts.offsetTop - pad;
  const r0 = Math.max(0, Math.floor(top / Math.max(rh, 1)) - 2);
  const r1 = Math.min(Math.max(rows - 1, -1), Math.ceil((top + opts.height) / Math.max(rh, 1)) + 2);
  const items: { i: number; x: number; y: number; w: number; h: number }[] = [];
  const last = Math.min(opts.count - 1, (r1 + 1) * cols - 1);
  for (let i = Math.max(0, r0 * cols); i <= last; i++) {
    items.push({ i, x: pad + (i % cols) * (cw + opts.gap), y: pad + Math.floor(i / cols) * rh, w: cw, h: ch });
  }
  return { height, items };
}

interface BoardSummary { id: number; name: string; scripts: number; avatars: number }
interface AvatarRow { id: number; name: string; thumb?: string; persona?: string }
interface ScriptRow { id: number; text: string; words?: number; fits?: boolean; angle?: string; brand?: string; used?: number; created_at?: string }
interface Clip { id: number; status: string; script_id?: number; avatar_id?: number; board_id?: number; url?: string; poster?: string; file?: string; error?: string; secs?: number; est_credits?: number; avatar?: string; avatar_thumb?: string; script?: string; created_at?: string; report?: { wrong_pct?: number; unfixed?: { at: string }[] }; progress?: { label?: string; left?: number; pct?: number } }
interface BoardView { id: number; name: string; scripts: ScriptRow[]; avatars: AvatarRow[]; cells: Clip[]; research: { id: number; status: string }[] }
interface StudioState { avatars: AvatarRow[]; counts?: Record<string, number> }
interface Estimate { total: number; seconds?: number; pairs?: { script_id: number; avatar_id: number }[]; rows?: { tooLong?: boolean }[] }
interface ResearchJob { id: number; status: string; url?: string; stage?: string; brand?: string }
interface StudioStore {
  route: string;
  boards: BoardSummary[];
  state: StudioState | null;
  avatars: AvatarRow[];
  boardId: number;
  b: BoardView | null;
  cm: Map<string, Clip>;
  sel: Set<string>;
  est: Estimate | null;
  vids: Clip[];
  scripts: ScriptRow[];
  vf: { status: string; person: string; board: string; q: string };
  af: string;
  sq: string;
  poll: ReturnType<typeof setTimeout> | 0;
  researchPoll: ReturnType<typeof setTimeout> | 0;
  researching: ResearchJob[];
  missing: string;
  estT: ReturnType<typeof setTimeout> | 0;
  hadResearch: boolean;
}

declare global {
  interface Window {
    wrap: HTMLDivElement | null;
    S: StudioStore;
    selectEmpty: () => void;
    clearSel: () => void;
    openAddScripts: () => void;
    openAddAvatars: () => void;
    newBoard: () => void;
  }
}

export function Studio() {
  const store = useRef<StudioStore>({
    route: "",
    boards: [],
    state: null,
    avatars: [],
    boardId: 0,
    b: null,
    cm: new Map(),
    sel: new Set(),
    est: null,
    vids: [],
    scripts: [],
    vf: { status: "", person: "", board: "", q: "" },
    af: "",
    sq: "",
    poll: 0,
    researchPoll: 0,
    researching: [],
    missing: "",
    estT: 0,
    hadResearch: false,
  }).current;
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<{ el: HTMLDivElement | null }>({ el: null });
  const fn = useRef<{ refreshBoard: () => Promise<void>; refreshOutputs: () => Promise<void>; pollResearch: () => Promise<void>; route: () => Promise<void> }>({
    refreshBoard: async () => {},
    refreshOutputs: async () => {},
    pollResearch: async () => {},
    route: async () => {},
  });
  const toastTimer = useRef(0);
  const [, setTick] = useState(0);
  const [view, setView] = useState({ top: 0, left: 0, w: 1200, h: 800 });
  const [dialog, setDialog] = useState<any>(null);
  const [sheet, setSheet] = useState<null | "scripts" | "avatars">(null);
  const [toastMsg, setToastMsg] = useState("");
  const draw = () => setTick((n) => n + 1);

  function toast(s: string) {
    setToastMsg(s);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(""), 3500);
  }
  function closeAll() {
    document.querySelector<HTMLVideoElement>("#dialog video")?.pause();
    setDialog(null);
    setSheet(null);
  }
  async function loadState() {
    store.state = await api<StudioState>("/api/state");
    store.avatars = store.state.avatars;
  }
  async function loadBoards() { store.boards = await api<BoardSummary[]>("/api/boards"); }
  function selectable(s: any, aid: number) {
    if (s.fits === false) return false;
    const v = store.cm.get(keyOf(s.id, aid));
    return !v || v.status === "canceled";
  }
  function pairs() {
    return [...store.sel].map((k) => {
      const [s, a] = k.split(":").map(Number);
      return { script_id: s!, avatar_id: a! };
    });
  }
  function selChanged() {
    store.est = null;
    draw();
    clearTimeout(store.estT);
    if (store.sel.size && store.sel.size <= 100) store.estT = setTimeout(() => { void estimate(); }, 400);
  }
  async function estimate() {
    const snap = pairs();
    const sig = pairSig(snap);
    try {
      const e = await api<Estimate>("/api/estimate", { pairs: snap, engine: "seedance" });
      if (pairSig(pairs()) !== sig) return;
      store.est = { ...e, pairs: snap };
      draw();
    } catch (e: any) { toast(e.message); }
  }
  function toggleKeys(ks: string[], on: boolean) {
    for (const k of ks) on ? store.sel.add(k) : store.sel.delete(k);
    selChanged();
  }
  function selectEmpty() {
    if (!store.b) return;
    for (const s of store.b.scripts) for (const a of store.b.avatars) if (selectable(s, a.id)) store.sel.add(keyOf(s.id, a.id));
    selChanged();
  }
  function clearSel() { store.sel.clear(); selChanged(); }
  function rowState(s: ScriptRow) {
    if (!store.b) return { ks: [] as string[], st: "" };
    const ks = store.b.avatars.filter((a) => selectable(s, a.id)).map((a) => keyOf(s.id, a.id));
    const n = ks.filter((k: string) => store.sel.has(k)).length;
    return { ks, st: !ks.length ? "" : n === ks.length ? "on" : n ? "part" : "" };
  }
  function colState(a: AvatarRow) {
    if (!store.b) return { ks: [] as string[], st: "" };
    const ks = store.b.scripts.filter((s) => selectable(s, a.id)).map((s) => keyOf(s.id, a.id));
    const n = ks.filter((k: string) => store.sel.has(k)).length;
    return { ks, st: !ks.length ? "" : n === ks.length ? "on" : n ? "part" : "" };
  }
  async function refreshBoard() {
    clearTimeout(store.poll);
    const id = store.boardId;
    try {
      const b = await api<BoardView>(`/api/boards/${id}`);
      if (store.boardId !== id || !store.route.startsWith("/campaign/")) return;
      store.b = b;
      store.missing = "";
      store.cm = new Map(b.cells.map((v) => [keyOf(v.script_id || 0, v.avatar_id || 0), v]));
      const sm = new Map(b.scripts.map((s) => [s.id, s]));
      for (const k of [...store.sel]) {
        const [sid, aid] = k.split(":").map(Number);
        if (!sm.has(sid) || !b.avatars.some((a) => a.id === aid) || !selectable(sm.get(sid), aid!)) store.sel.delete(k);
      }
      draw();
      const active = b.cells.some(busy) || b.research.some((p) => p.status !== "error");
      store.poll = setTimeout(() => { void fn.current.refreshBoard(); }, active ? 5000 : 10 * 60_000);
    } catch (e: any) {
      store.b = null;
      store.missing = e.message;
      draw();
    }
  }
  async function refreshOutputs() {
    clearTimeout(store.poll);
    const vs = await api<Clip[]>("/api/videos");
    if (store.route !== "/outputs") return;
    store.vids = vs;
    draw();
    const n = vs.filter(busy).length;
    store.poll = setTimeout(() => { void fn.current.refreshOutputs(); }, n ? 5000 : 10 * 60_000);
  }
  async function pollResearch() {
    if (store.route !== "/scripts") return;
    const ps = (await api<ResearchJob[]>("/api/projects")).filter((p) => ["queued", "running"].includes(p.status));
    store.researching = ps;
    draw();
    clearTimeout(store.researchPoll);
    if (ps.length) { store.hadResearch = true; store.researchPoll = setTimeout(() => { void fn.current.pollResearch(); }, 4000); }
    else if (store.hadResearch) {
      store.hadResearch = false;
      store.scripts = await api<ScriptRow[]>("/api/scripts");
      draw();
      toast("New scripts are in");
    }
  }
  async function route() {
    store.route = location.hash.slice(1);
    clearTimeout(store.poll);
    store.sel.clear();
    store.est = null;
    setDialog(null);
    setSheet(null);
    if (wrapRef.current) { wrapRef.current.scrollTop = 0; wrapRef.current.scrollLeft = 0; }
    if (!store.state) await Promise.all([loadState(), loadBoards()]);
    draw();
    const m = store.route.match(/^\/campaign\/(\d+)$/);
    if (m) { store.boardId = +m[1]!; await refreshBoard(); return; }
    if (store.route === "/outputs") return refreshOutputs();
    if (store.route === "/avatars") { await loadState(); store.poll = setTimeout(() => { if (store.route === "/avatars") void fn.current.route(); }, 10 * 60_000); draw(); return; }
    if (store.route === "/scripts") { store.scripts = await api<ScriptRow[]>("/api/scripts"); if (store.route !== "/scripts") return; draw(); void pollResearch(); return; }
    location.hash = store.boards[0] ? `/campaign/${store.boards[0].id}` : "/outputs";
  }
  async function newBoard() {
    const b = await api<BoardSummary>("/api/boards", { name: "Untitled campaign" });
    await loadBoards();
    location.hash = `/campaign/${b.id}`;
    setTimeout(() => { const t = document.getElementById("tname") as HTMLInputElement | null; if (t) { t.focus(); t.select(); } }, 300);
  }
  async function renameBoard(name: string) {
    await api(`/api/boards/${store.boardId}`, { name }, "PATCH");
    await loadBoards();
    if (store.b) store.b.name = name;
    draw();
  }
  async function setBoard(patch: any) {
    await api(`/api/boards/${store.boardId}`, patch, "PATCH");
    await loadBoards();
    await refreshBoard();
  }
  async function openAddAvatars() {
    await loadState();
    setSheet("avatars");
    draw();
  }
  function generate() {
    const e = store.est;
    if (!e || !e.pairs) return;
    const n = (e.rows || []).filter((r) => !r.tooLong).length;
    setDialog({ kind: "generate", n, total: e.total, seconds: e.seconds, snap: e.pairs });
  }
  async function refreshCurrent() {
    await loadState();
    draw();
    if (store.route.startsWith("/campaign/")) await refreshBoard();
    else if (store.route === "/outputs") await refreshOutputs();
  }
  async function play(id: number) {
    setDialog({ kind: "player", v: await api<Clip>(`/api/videos/${id}`) });
  }
  async function download(btn: HTMLButtonElement, id: number) {
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Downloading";
    try {
      const v = await api<Clip>(`/api/videos/${id}`);
      if (!v.url) throw new Error("No file");
      const blob = await (await fetch(v.url)).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = v.file || `ugc-${id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e: any) { toast("Download failed: " + e.message); }
    btn.disabled = false;
    btn.innerHTML = label;
  }

  fn.current = { refreshBoard, refreshOutputs, pollResearch, route };

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setView({ top: el.scrollTop, left: el.scrollLeft, w: el.clientWidth, h: el.clientHeight }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    const onHash = () => { void fn.current.route(); };
    window.addEventListener("hashchange", onHash);
    const side = setInterval(() => { loadState().then(draw).catch(() => {}); }, 60_000);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    document.addEventListener("keydown", onKey);
    void fn.current.route();
    return () => { window.removeEventListener("hashchange", onHash); clearInterval(side); document.removeEventListener("keydown", onKey); clearTimeout(store.poll); };
  }, []);
  useEffect(() => {
    window.wrap = wrapRef.current;
    window.S = store;
    window.selectEmpty = selectEmpty;
    window.clearSel = clearSel;
    window.openAddScripts = () => setSheet("scripts");
    window.openAddAvatars = () => { void openAddAvatars(); };
    window.newBoard = () => { void newBoard(); };
  });

  function onContentClick(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!t || !store.b && t.dataset.act !== "avatar" && t.dataset.act !== "addavatar" && t.dataset.act !== "play" && t.dataset.act !== "editscript" && t.dataset.act !== "tocampaign" && t.dataset.act !== "delscript") {
      if (!t) return;
    }
    if (!t) return;
    const d = t.dataset;
    const b = store.b;
    if (d.act === "cell" && d.k) { store.sel.has(d.k) ? store.sel.delete(d.k) : store.sel.add(d.k); selChanged(); }
    if (d.act === "row" && b) { const s = b.scripts.find((x) => x.id === +d.sid!); if (s) { const r = rowState(s); toggleKeys(r.ks, r.st !== "on"); } }
    if (d.act === "col" && b) { const a = b.avatars.find((x) => x.id === +d.aid!); if (a) { const c = colState(a); toggleKeys(c.ks, c.st !== "on"); } }
    if (d.act === "rmcol" && b) void setBoard({ avatar_ids: b.avatars.map((a: any) => a.id).filter((x: number) => x !== +d.aid!) });
    if (d.act === "rmrow" && b) void setBoard({ script_ids: b.scripts.map((s: any) => s.id).filter((x: number) => x !== +d.sid!) });
    if (d.act === "editscript") {
      const list = store.route.startsWith("/campaign/") ? b?.scripts || [] : store.scripts;
      const s = list.find((x: any) => x.id === +d.sid!);
      if (s) setDialog({ kind: "edit-script", script: s, after: store.route.startsWith("/campaign/") ? "board" : "scripts" });
    }
    if (d.act === "play") void play(+d.id!);
    if (d.act === "avatar") { const a = store.avatars.find((x: any) => x.id === +d.id!); if (a) setDialog({ kind: "edit-avatar", avatar: a }); }
    if (d.act === "addavatar") setDialog({ kind: "add-avatar" });
    if (d.act === "tocampaign") setDialog({ kind: "to-campaign", ids: [+d.sid!] });
    if (d.act === "delscript") setDialog({ kind: "delete-script", id: +d.sid! });
  }

  const c = (store.state && store.state.counts) || {};
  const r = store.route;
  const nav = (href: string, icon: ReactNode, name: string, ct: string | number, on: boolean) => (
    <a className={"nav" + (on ? " on" : "")} href={"#" + href} key={href + name}>{icon}<span className="nm">{name}</span>{ct !== "" ? <span className="ct">{ct}</span> : null}</a>
  );

  const b = store.b;
  const campaign = r.startsWith("/campaign/");
  const nSel = store.sel.size;
  const genDisabled = !nSel || nSel > 100 || !store.est;
  const genText = !nSel ? "Generate" : nSel > 100 ? "100 clips max per batch" : store.est ? `Generate ${nSel} · ${usd(store.est.total)}` : `Generate ${nSel} …`;
  const done = b ? b.cells.filter((v: any) => v.status === "done").length : 0;
  const running = b ? b.cells.filter(busy).length : 0;
  const bad = b ? b.cells.filter((v: any) => v.status === "error" || v.status === "bad_take").length : 0;

  let head: ReactNode = null;
  let left: ReactNode = null;
  let cells: ReactNode = null;
  if (campaign && b && b.scripts.length && b.avatars.length) {
    const c0 = Math.max(0, Math.floor(view.left / G.COLW) - 1);
    const c1 = Math.min(b.avatars.length - 1, Math.ceil((view.left + view.w - G.SCW) / G.COLW) + 1);
    const r0 = Math.max(0, Math.floor((view.top - G.HDR) / G.ROWH) - 1);
    const r1 = Math.min(b.scripts.length - 1, Math.ceil((view.top + view.h - G.HDR) / G.ROWH) + 1);
    const heads = [];
    const lefts = [];
    const clips = [];
    for (let col = c0; col <= c1; col++) {
      const a = b.avatars[col];
      const cs = colState(a).st;
      heads.push(
        <div key={a.id} className="vi" ref={place(G.SCW + col * G.COLW, 0)}>
          <div className={"hc " + cs} data-act="col" data-aid={a.id} title={a.persona || ""}>
            <img src={a.thumb} alt="" loading="lazy" /><span>{a.name}</span>
            <button className="btn btn-ghost btn-xs btn-icon x" data-act="rmcol" data-aid={a.id} title="Remove column"><X /></button>
          </div>
        </div>,
      );
    }
    for (let row = r0; row <= r1; row++) {
      const s = b.scripts[row];
      const rs = rowState(s).st;
      lefts.push(
        <div key={s.id} className="vi" ref={place(0, row * G.ROWH)}>
          <div className="sr">
            <div className="top">
              <button className={"ck " + rs} data-act="row" data-sid={s.id} title="Select this row"><Check sm /></button>
              <span className="num">#{row + 1}</span>
              {s.brand ? <span className="badge">{s.brand}</span> : null}
              <span className="grow" />
              <span className="acts">
                <button className="btn btn-ghost btn-xs btn-icon" data-act="editscript" data-sid={s.id} title="Edit"><Edit /></button>
                <button className="btn btn-ghost btn-xs btn-icon" data-act="rmrow" data-sid={s.id} title="Remove from campaign"><X /></button>
              </span>
            </div>
            <p>{s.text}</p>
            <div className="meta">
              <span className={"badge " + (s.fits === false ? "badge-destructive" : "badge-secondary")}>{s.words ?? "?"} words{s.fits === false ? " · too long" : ""}</span>
              {s.angle ? <span className="muted f12">{s.angle}</span> : null}
            </div>
          </div>
        </div>,
      );
      for (let col = c0; col <= c1; col++) {
        const a = b.avatars[col];
        const k = keyOf(s.id, a.id);
        const v = store.cm.get(k);
        clips.push(
          <div key={k} className="vi cl" ref={place(G.SCW + col * G.COLW, row * G.ROWH)}>
            <Clip s={s} a={a} v={v} k={k} selected={store.sel.has(k)} />
          </div>,
        );
      }
    }
    head = heads; left = lefts; cells = clips;
  }

  const outList = store.vids.filter((v) => {
    const f = store.vf;
    return (!f.status || (f.status === "done" ? v.status === "done" : f.status === "busy" ? busy(v) : ["error", "bad_take"].includes(v.status)))
      && (!f.person || personOf(v.avatar) === f.person) && (!f.board || String(v.board_id) === f.board) && (!f.q || String(v.script || "").toLowerCase().includes(f.q));
  });
  const outGeom = gridGeom({ count: outList.length, minW: 176, gap: 16, extraH: 56, width: view.w, height: view.h, scrollTop: view.top, offsetTop: layerRef.current.el?.offsetTop || 0 });
  const avatarList = store.avatars.filter((a) => !store.af || personOf(a.name) === store.af);
  const avGeom = gridGeom({ count: avatarList.length + 1, minW: 160, gap: 16, width: view.w, height: view.h, scrollTop: view.top, offsetTop: layerRef.current.el?.offsetTop || 0 });
  const scriptList = store.scripts.filter((s) => !store.sq || s.text.toLowerCase().includes(store.sq));
  const scGeom = gridGeom({ count: scriptList.length, rowH: 96, gap: 8, width: view.w, height: view.h, scrollTop: view.top, offsetTop: layerRef.current.el?.offsetTop || 0 });
  const people = [...new Set(store.avatars.map((a) => personOf(a.name)))];

  return (
    <>
      <div id="app">
        <aside>
          <div className="sb-head"><div className="ws-ico">U</div><div className="grow"><b>UGC Studio</b><span>Talking-head videos at scale</span></div></div>
          <div className="sb-group" id="side">
            {nav("/outputs", <Film />, "Outputs", (c.active ? `${c.active} rendering · ` : "") + (c.videos ?? ""), r === "/outputs")}
            {nav("/avatars", <Users />, "Avatars", store.avatars.length, r === "/avatars")}
            {nav("/scripts", <FileI />, "Scripts", c.scripts ?? "", r === "/scripts")}
            <div className="sb-label"><span>Campaigns</span><button className="btn btn-ghost btn-xs btn-icon" title="New campaign" onClick={() => void newBoard()}><Plus /></button></div>
            {store.boards.length ? store.boards.map((board) => nav(`/campaign/${board.id}`, <GridI />, board.name, `${board.scripts}×${board.avatars}`, r === `/campaign/${board.id}`)) : <div className="muted nav-empty">No campaigns yet</div>}
          </div>
          <div className="sb-foot">
            <button className="btn btn-outline btn-sm btn-block" onClick={() => void newBoard()}><Plus />New campaign</button>
            <div className="fine">Seedance 2.5 · about $4.80 per 30 s</div>
          </div>
        </aside>
        <main>
          <div className="topbar" id="top">
            {campaign ? (
              <>
                <span className="crumb">Campaigns</span><span className="sep tilt" />
                <input id="tname" type="text" key={store.boardId + ":" + (b?.name || "")} defaultValue={b?.name || ""} title="Rename" onBlur={(e) => { if (b && e.target.value !== b.name) void renameBoard(e.target.value); }} />
                <span className="grow" />
                <button className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: "research", boardId: store.boardId })}><Spark />Write from website</button>
                <button className="btn btn-outline btn-sm" onClick={() => setSheet("scripts")}><Plus />Scripts</button>
                <button className="btn btn-outline btn-sm" onClick={() => void openAddAvatars()}><Plus />Avatars</button>
                <button className="btn btn-primary btn-sm" id="gen" disabled={genDisabled} onClick={generate}>{genText}</button>
                <button className="btn btn-ghost btn-sm btn-icon" title="Delete campaign" onClick={() => b && setDialog({ kind: "delete-board" })}><Trash /></button>
              </>
            ) : null}
            {r === "/outputs" ? <><span className="title">Outputs</span><span className="badge badge-secondary" id="vcount">{outList.length}</span><span className="grow" /><span id="vrun" className="muted f13">{store.vids.filter(busy).length ? `${store.vids.filter(busy).length} rendering` : ""}</span></> : null}
            {r === "/avatars" ? <><span className="title">Avatars</span><span className="badge badge-secondary">{store.avatars.length}</span><span className="grow" /><button className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: "add-avatar" })}><Plus />Add avatar</button></> : null}
            {r === "/scripts" ? <><span className="title">Scripts</span><span className="badge badge-secondary" id="scount">{store.scripts.length}</span><span className="grow" /><button className="btn btn-outline btn-sm" onClick={() => setDialog({ kind: "research", boardId: null })}><Spark />Write from website</button><button className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: "new-script" })}><Plus />New script</button></> : null}
          </div>
          <div className="toolbar" id="tools">
            {campaign && b ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={selectEmpty}><Check sm />Select all empty</button>
                <button className="btn btn-ghost btn-sm" onClick={clearSel}>Clear selection</button>
                <span className="sep" /><span className="muted f13">Click a cell, a script or an avatar to select clips. Click a finished clip to play it.</span>
                <span className="grow" /><span id="research">{(b.research || []).map((p: any) => p.status === "error"
                  ? <span key={p.id} className="badge badge-destructive">Research failed: {p.brand || p.url}</span>
                  : <span key={p.id} className="badge badge-brand"><Loader /> {p.brand || String(p.url).replace(/^https?:\/\//, "")}: {p.stage || "starting"}…</span>)}</span>
              </>
            ) : null}
            {r === "/outputs" ? (
              <>
                {[["", "All"], ["done", "Done"], ["busy", "Rendering"], ["failed", "Failed"]].map(([k, l]) => (
                  <button key={k || "all"} className={"chip" + (store.vf.status === k ? " on" : "")} data-st={k} onClick={() => { store.vf.status = k!; draw(); }}>{l}</button>
                ))}
                <span className="sep" />
                <select id="vfp" value={store.vf.person} onChange={(e) => { store.vf.person = e.target.value; draw(); }}><option value="">All avatars</option>{people.map((p) => <option key={p}>{p}</option>)}</select>
                <select id="vfb" value={store.vf.board} onChange={(e) => { store.vf.board = e.target.value; draw(); }}><option value="">All campaigns</option>{store.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select>
                <div className="search"><Search /><input type="search" id="vfq" placeholder="Search scripts" value={store.vf.q} onChange={(e) => { store.vf.q = e.target.value.toLowerCase(); draw(); }} /></div>
              </>
            ) : null}
            {r === "/avatars" ? (
              <>
                {["", ...people].map((p) => <button key={p || "all"} className={"chip" + (store.af === p ? " on" : "")} data-p={p} onClick={() => { store.af = p; draw(); }}>{p || "All"}</button>)}
                <span className="grow" /><span className="muted f13">All avatars share one cloned voice. Click one to edit it.</span>
              </>
            ) : null}
            {r === "/scripts" ? (
              <>
                <div className="search"><Search /><input type="search" id="sq" placeholder="Search scripts" value={store.sq} onChange={(e) => { store.sq = e.target.value.toLowerCase(); draw(); }} /></div>
                <span className="grow" /><span id="rstat">{store.researching.map((p) => <span key={p.id} className="badge badge-brand"><Loader /> {p.brand || String(p.url).replace(/^https?:\/\//, "")}: {p.stage || "starting"}…</span>)}</span>
              </>
            ) : null}
          </div>
          <div id="wrap" ref={wrapRef}>
            <div id="content" onClick={onContentClick}>
              {campaign && store.missing ? <div className="empty"><h3>Campaign not found</h3>{store.missing}</div> : null}
              {campaign && b && (!b.scripts.length || !b.avatars.length) ? (
                <div className="empty">
                  <h3>{!b.scripts.length && !b.avatars.length ? "Set up this campaign" : !b.scripts.length ? "Add scripts" : "Add avatars"}</h3>
                  Scripts become rows and avatars become columns. Each cell is one clip: pick the cells you want and generate them all at once.
                  <div className="row">
                    {!b.scripts.length ? <><button className="btn btn-outline" onClick={() => setDialog({ kind: "research", boardId: store.boardId })}><Spark />Write from website</button><button className="btn btn-outline" onClick={() => setSheet("scripts")}><Plus />Add scripts</button></> : null}
                    {!b.avatars.length ? <button className="btn btn-primary" onClick={() => void openAddAvatars()}><Plus />Add avatars</button> : null}
                  </div>
                </div>
              ) : null}
              {campaign && b && b.scripts.length && b.avatars.length ? (
                <div className="bd" id="bd" data-names={b.avatars.map((a: any) => a.name).join("|")} data-scripts={b.scripts.length} data-avatars={b.avatars.length} ref={box(G.SCW + b.avatars.length * G.COLW)}>
                  <div className="bd-head" id="bdh">
                    <div className="bd-corner"><b>Scripts</b><span id="corner">{b.scripts.length} rows · {b.avatars.length} avatars</span></div>
                    {head}
                  </div>
                  <div className="bd-body" id="bdb" ref={box(undefined, b.scripts.length * G.ROWH)}>
                    <div className="bd-left" id="bdl" ref={box(undefined, b.scripts.length * G.ROWH)}>{left}</div>
                    <div className="bd-cells" id="bdc" ref={box(G.SCW + b.avatars.length * G.COLW, b.scripts.length * G.ROWH)}>{cells}</div>
                  </div>
                </div>
              ) : null}
              {r === "/outputs" ? (
                outList.length ? (
                  <div className="vl" id="vg" ref={(node) => { layerRef.current.el = node; if (node) node.style.height = `${outGeom.height}px`; }}>
                    {outGeom.items.map((it) => <div key={outList[it.i].id} className="vi" ref={place(it.x, it.y, it.w, it.h)}><OutCard v={outList[it.i]} /></div>)}
                  </div>
                ) : <div className="vl" id="vg"><div className="empty"><h3>{store.vids.length ? "No clips match" : "No clips yet"}</h3>{store.vids.length ? "Change the filters." : "Open a campaign, pick cells, and press Generate."}</div></div>
              ) : null}
              {r === "/avatars" ? (
                <div className="vl" id="ag2" ref={(node) => { layerRef.current.el = node; if (node) node.style.height = `${avGeom.height}px`; }}>
                  {avGeom.items.map((it) => (
                    <div key={it.i < avatarList.length ? avatarList[it.i].id : "add"} className="vi" ref={place(it.x, it.y, it.w, it.h)}>
                      {it.i === avatarList.length ? (
                        <div className="empty tile" data-act="addavatar"><Plus /><span>Add avatar</span></div>
                      ) : (
                        <div className="av" data-act="avatar" data-id={avatarList[it.i].id} title={avatarList[it.i].persona}><img src={avatarList[it.i].thumb} alt="" loading="lazy" /><div className="name">{avatarList[it.i].name}</div></div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              {r === "/scripts" ? (
                scriptList.length ? (
                  <div className="vl" id="sl" ref={(node) => { layerRef.current.el = node; if (node) node.style.height = `${scGeom.height}px`; }}>
                    {scGeom.items.map((it) => {
                      const s = scriptList[it.i];
                      return (
                        <div key={s.id} className="vi" ref={place(it.x, it.y, it.w, it.h)}>
                          <div className="card srow">
                            <div className="grow"><p>{s.text}</p>
                              <div className="meta">
                                <span className={"badge " + (s.fits === false ? "badge-destructive" : "badge-secondary")}>{s.words ?? "?"} words</span>
                                {s.brand ? <span className="badge">{s.brand}</span> : null}
                                {s.used ? <span className="badge badge-success">{s.used} clip{s.used === 1 ? "" : "s"}</span> : null}
                                {s.angle ? <span>{s.angle}</span> : null}
                                <span>{when(s.created_at)}</span>
                              </div>
                            </div>
                            <div className="acts">
                              <button className="btn btn-outline btn-sm" data-act="tocampaign" data-sid={s.id}><Plus />Campaign</button>
                              <button className="btn btn-ghost btn-sm btn-icon" data-act="editscript" data-sid={s.id} title="Edit"><Edit /></button>
                              <button className="btn btn-ghost btn-sm btn-icon" data-act="delscript" data-sid={s.id} title="Delete"><Trash /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="vl" id="sl"><div className="empty"><h3>{store.scripts.length ? "No scripts match" : "Write your first script"}</h3>Paste one, or let it write 10 from your website.</div></div>
              ) : null}
            </div>
          </div>
          <div className="gfoot" id="foot">
            {campaign && b ? <><span id="fcount">{b.scripts.length} scripts × {b.avatars.length} avatars · {done} done{running ? ` · ${running} rendering` : ""}{bad ? ` · ${bad} failed` : ""}</span><span className="grow" /><span id="fsel">{nSel ? `${nSel} selected${store.est ? ` · ~${cr(store.est.total)} credits ($${(store.est.total / 100).toFixed(2)}) · ready in ${mins(store.est.seconds || 0)}` : ""}` : ""}</span></> : null}
            {r === "/outputs" ? <><span>{outList.length} of {store.vids.length} clips</span><span className="grow" /><span>Click a clip to play or download it</span></> : null}
            {r === "/avatars" ? <span>{avatarList.length} avatars</span> : null}
            {r === "/scripts" ? <><span>{scriptList.length} scripts</span><span className="grow" /><span>Add a script to a campaign to render it with many avatars</span></> : null}
          </div>
        </main>
      </div>
      <div id="shade" className={dialog || sheet ? "on" : ""} onClick={closeAll} />
      {sheet === "scripts" && b ? <AddScripts boardId={store.boardId} existing={b.scripts.map((s: any) => s.id)} onClose={closeAll} onAdded={() => { closeAll(); void loadBoards().then(() => refreshBoard()); }} toast={toast} /> : null}
      {sheet === "avatars" && b ? <AddAvatars avatars={store.avatars} existing={b.avatars.map((a: any) => a.id)} onClose={closeAll} toast={toast} onUpload={() => { closeAll(); setDialog({ kind: "add-avatar" }); }} onAdded={(ids) => { closeAll(); void setBoard({ avatar_ids: [...b.avatars.map((a: any) => a.id), ...ids] }); }} /> : null}
      {dialog ? <Dialogs dialog={dialog} boards={store.boards} onClose={closeAll} toast={toast} onRefresh={refreshCurrent} download={download} setDialog={setDialog} route={store.route} boardId={store.boardId} onBoard={() => void refreshBoard()} onResearch={() => { void pollResearch(); }} onScripts={async () => { await loadState(); store.scripts = await api<ScriptRow[]>("/api/scripts"); draw(); }} onBoards={async () => { await loadBoards(); draw(); }} onAvatarAdded={async (a: AvatarRow) => { closeAll(); await loadState(); draw(); if (store.route.startsWith("/campaign/") && store.b) await setBoard({ avatar_ids: [...store.b.avatars.map((x) => x.id), a.id] }); else if (store.route === "/avatars") await route(); }} /> : null}
      <div id="toast" className={toastMsg ? "on" : ""}>{toastMsg}</div>
    </>
  );
}

function Clip({ s, a, v, k, selected }: { s: any; a: any; v: any; k: string; selected: boolean }) {
  if (!v || v.status === "canceled") {
    if (s.fits === false) return <div className="clip off">Too long</div>;
    return selected
      ? <div className="clip sel" data-act="cell" data-k={k}><Check /><div className="lab">Selected</div></div>
      : <div className="clip blank" data-act="cell" data-k={k}><Plus /></div>;
  }
  const pr = v.progress || {};
  if (busy(v)) return (
    <div className="clip vid busy" data-act="play" data-id={v.id} data-status={v.status}>
      <img src={a.thumb} alt="" loading="lazy" />
      <div className="lab"><Loader /><br />{pr.label || (v.status === "queued" ? "Waiting" : "Starting")}<small>{pr.left ? mins(pr.left) + " left" : ""}</small></div>
      <Bar pct={pr.pct || 0} />
    </div>
  );
  if (v.status === "error") return <div className="clip vid err" data-act="play" data-id={v.id} data-status="error"><img src={a.thumb} alt="" loading="lazy" /><div className="lab"><span className="badge badge-destructive">Failed</span></div></div>;
  const unfixed = (v.report?.unfixed || []).length;
  return (
    <div className="clip vid" data-act="play" data-id={v.id} data-status={v.status}>
      <img src={v.poster || a.thumb} alt="" loading="lazy" />
      <span className="pl"><Play /></span>
      {v.status === "bad_take" ? <span className="badge badge-destructive tag">Take failed</span> : unfixed ? <span className="badge badge-brand tag">Listen</span> : null}
    </div>
  );
}

function OutCard({ v }: { v: any }) {
  const pr = v.progress || {};
  let tile;
  if (busy(v)) tile = (
    <div className="vc" data-act="play" data-id={v.id}><img className="dim" src={v.avatar_thumb || ""} alt="" loading="lazy" />
      <div className="mid"><div><Loader /><br />{pr.label || "Waiting"}<small>{pr.left ? mins(pr.left) + " left" : ""}</small></div></div>
      <Bar pct={pr.pct || 0} /><div className="st">{v.avatar}</div></div>
  );
  else if (v.status === "done" || v.status === "bad_take") tile = (
    <div className="vc" data-act="play" data-id={v.id}><img src={v.poster || v.avatar_thumb || ""} alt="" loading="lazy" />
      <div className="st">{v.avatar}{v.status === "bad_take" ? <span className="badge badge-destructive">Take failed</span> : (v.report?.unfixed || []).length ? <span className="badge badge-brand">Listen</span> : null}</div></div>
  );
  else tile = (
    <div className="vc" data-act="play" data-id={v.id}><img className="dim" src={v.avatar_thumb || ""} alt="" loading="lazy" />
      <div className="mid">{v.status === "canceled" ? "Canceled" : <span className="badge badge-destructive">Failed</span>}</div><div className="st">{v.avatar}</div></div>
  );
  return <div className="vcard">{tile}<div className="cap"><b>{v.script}</b>{when(v.created_at)}{v.secs ? ` · ${Math.round(v.secs)} s` : ""}</div></div>;
}

function AddScripts({ boardId, existing, onClose, onAdded, toast }: { boardId: number; existing: number[]; onClose: () => void; onAdded: () => void; toast: (s: string) => void }) {
  const [lib, setLib] = useState<ScriptRow[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [paste, setPaste] = useState("");
  const [busyGo, setBusyGo] = useState(false);
  useEffect(() => { void api<ScriptRow[]>("/api/scripts").then(setLib); }, []);
  const on = new Set(existing);
  const texts = paste.split(/\n\s*---+\s*\n/).map((t) => t.trim()).filter(Boolean);
  const shown = lib.filter((s) => !on.has(s.id) && (!q || s.text.toLowerCase().includes(q)));
  const n = texts.length + pick.size;
  return (
    <div id="sheet" className="on">
      <div className="sh"><div className="grow"><h3 id="shTitle">Add scripts</h3><p className="desc" id="shDesc">Each script becomes a row. Paste new ones, or pick saved ones.</p></div><button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="sb" id="shBody">
        <label className="label tight">Paste scripts</label>
        <textarea id="paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Type or paste a script. About 90-105 words fits 30 seconds.\n\nMore than one? Put a line with only --- between scripts."} />
        <div className="row-mid"><b>Saved scripts</b><span className="grow" /><div className="search narrow"><Search /><input type="search" id="libq" placeholder="Search scripts" onChange={(e) => setQ(e.target.value.toLowerCase())} /></div></div>
        <div id="lib">
          {shown.length ? shown.slice(0, 200).map((s) => (
            <div key={s.id} className={"pick" + (pick.has(s.id) ? " on" : "")} data-id={s.id} onClick={() => setPick((prev) => { const nset = new Set(prev); nset.has(s.id) ? nset.delete(s.id) : nset.add(s.id); return nset; })}>
              <span className={"ck" + (pick.has(s.id) ? " on" : "")}><Check sm /></span>
              <div className="grow"><p>{s.text}</p><div className="muted meta-line">{s.words ?? "?"} words{s.brand ? " · " + s.brand : ""}{s.used ? ` · used ${s.used}×` : ""}</div></div>
            </div>
          )) : <p className="desc">No saved scripts{q ? " match" : " left to add"}.</p>}
        </div>
      </div>
      <div className="sf" id="shFoot">
        <span className="muted f13" id="addN">{n ? `${n} to add` : ""}</span><span className="grow" />
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" id="addGo" disabled={busyGo} onClick={async () => {
          if (!texts.length && !pick.size) return toast("Paste a script or pick one");
          setBusyGo(true);
          try { await api(`/api/boards/${boardId}/scripts`, { texts, script_ids: [...pick] }); onAdded(); }
          catch (e: any) { setBusyGo(false); toast(e.message); }
        }}>Add scripts</button>
      </div>
    </div>
  );
}

function AddAvatars({ avatars, existing, onClose, onAdded, onUpload, toast }: { avatars: any[]; existing: number[]; onClose: () => void; onAdded: (ids: number[]) => void; onUpload: () => void; toast: (s: string) => void }) {
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [person, setPerson] = useState("");
  const on = new Set(existing);
  const people = [...new Set(avatars.map((a) => personOf(a.name)))];
  const shown = avatars.filter((a) => !person || personOf(a.name) === person);
  return (
    <div id="sheet" className="on">
      <div className="sh"><div className="grow"><h3>Add avatars</h3><p className="desc">Each avatar becomes a column. Click to pick, then add.</p></div><button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="sb">
        <div className="chips" id="ppl">
          {["", ...people].map((p) => <button key={p || "all"} className={"chip" + (person === p ? " on" : "")} data-p={p} onClick={() => setPerson(p)}>{p || "All"}</button>)}
        </div>
        <div className="agrid" id="ag">
          {shown.map((a) => (
            <div key={a.id} className={"av" + (pick.has(a.id) ? " on" : "") + (on.has(a.id) ? " dim" : "")} data-id={a.id} title={on.has(a.id) ? "Already a column" : a.persona} onClick={() => { if (on.has(a.id)) return; setPick((prev) => { const nset = new Set(prev); nset.has(a.id) ? nset.delete(a.id) : nset.add(a.id); return nset; }); }}>
              <img src={a.thumb} alt="" loading="lazy" /><span className="tick"><Check sm /></span><div className="name">{a.name}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sf">
        <button className="btn btn-ghost btn-sm" id="agAll" onClick={() => setPick((prev) => { const nset = new Set(prev); shown.forEach((a) => { if (!on.has(a.id)) nset.add(a.id); }); return nset; })}>Pick all shown</button>
        <button className="btn btn-ghost btn-sm" onClick={onUpload}><Plus />Upload new</button>
        <span className="grow" />
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" id="agGo" onClick={() => {
          if (!pick.size) return toast("Pick at least one avatar");
          onAdded(avatars.map((a) => a.id).filter((id) => pick.has(id)));
        }}>{pick.size ? `Add ${pick.size} avatar${pick.size === 1 ? "" : "s"}` : "Add avatars"}</button>
      </div>
    </div>
  );
}

function Dialogs(props: any) {
  const { dialog, onClose, toast, boards, onRefresh, download, setDialog, onBoard, onResearch, onScripts, onBoards, onAvatarAdded, route } = props;
  const wide = dialog.kind === "new-script" || dialog.kind === "edit-script";
  return (
    <div id="dialog" className={(wide ? "wide " : "") + "on"}>
      {dialog.kind === "generate" ? (
        <>
          <h3>Generate {dialog.n} clip{dialog.n === 1 ? "" : "s"}?</h3>
          <p className="desc lg">This spends about <b>{cr(dialog.total)} Graphed credits</b> (${(dialog.total / 100).toFixed(2)}). Clips render in parallel; all done in about {mins(dialog.seconds || 0).replace("~", "")}.</p>
          <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" id="yes" onClick={async (e) => {
            const button = e.currentTarget;
            button.disabled = true;
            try {
              await api("/api/videos", { pairs: dialog.snap, engine: "seedance", board_id: props.boardId, confirm: true });
              if (window.S) { window.S.sel.clear(); window.S.est = null; }
              onClose();
              toast(`${dialog.n} clips rendering`);
              await onRefresh();
            } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err)); button.disabled = false; }
          }}>Generate</button></div>
        </>
      ) : null}
      {dialog.kind === "delete-board" ? (
        <>
          <h3>Delete &quot;{window.S?.b?.name}&quot;?</h3>
          <p className="desc lg">The campaign goes away. Its scripts stay in Scripts and its clips stay in Outputs.</p>
          <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-destructive" id="dYes" onClick={async () => { await api(`/api/boards/${props.boardId}`, undefined, "DELETE"); onClose(); await onBoards(); location.hash = ""; }} >Delete campaign</button></div>
        </>
      ) : null}
      {dialog.kind === "research" ? <Research boardId={dialog.boardId} onClose={onClose} toast={toast} onStarted={() => { onClose(); toast("Research started"); if (dialog.boardId) onBoard(); else onResearch(); }} /> : null}
      {dialog.kind === "player" ? <Player v={dialog.v} onClose={onClose} toast={toast} onRefresh={onRefresh} download={download} setDialog={setDialog} /> : null}
      {dialog.kind === "new-take" ? (
        <>
          <h3>Render a new take?</h3>
          <p className="desc lg">Same script and voice, a new Seedance take. About <b>{cr(dialog.credits)} credits</b> (${(dialog.credits / 100).toFixed(2)}).</p>
          <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" id="ntYes" onClick={async (e) => { const button = e.currentTarget; button.disabled = true; try { await api(`/api/videos/${dialog.id}/rerender`, { confirm: true }); onClose(); toast("New take started"); void onRefresh(); } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err)); button.disabled = false; } }}>New take</button></div>
        </>
      ) : null}
      {dialog.kind === "delete-video" ? (
        <>
          <h3>Delete this clip?</h3><p className="desc lg">This cannot be undone.</p>
          <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-destructive" id="dYes" onClick={async () => { await api(`/api/videos/${dialog.id}`, undefined, "DELETE"); onClose(); void onRefresh(); }}>Delete</button></div>
        </>
      ) : null}
      {dialog.kind === "add-avatar" ? <AvatarForm onClose={onClose} toast={toast} onSaved={onAvatarAdded} /> : null}
      {dialog.kind === "edit-avatar" ? <EditAvatar a={dialog.avatar} onClose={onClose} toast={toast} onSaved={async () => { onClose(); if (route === "/avatars") await onScripts(); }} /> : null}
      {dialog.kind === "new-script" ? <NewScript onClose={onClose} onSaved={async () => { onClose(); await onScripts(); }} /> : null}
      {dialog.kind === "edit-script" ? <EditScript script={dialog.script} onClose={onClose} toast={toast} onSaved={async () => { onClose(); if (dialog.after === "board") onBoard(); else await onScripts(); }} /> : null}
      {dialog.kind === "delete-script" ? (
        <>
          <h3>Delete this script?</h3><p className="desc lg">It leaves every campaign. Clips made from it stay in Outputs.</p>
          <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-destructive" id="dsY" onClick={async () => { await api(`/api/scripts/${dialog.id}`, undefined, "DELETE"); onClose(); await onScripts(); }}>Delete</button></div>
        </>
      ) : null}
      {dialog.kind === "to-campaign" ? (
        <>
          <h3>Add to a campaign</h3><p className="desc">The script becomes a new row.</p>
          <div className="stack">
            {boards.map((board: any) => <button key={board.id} className="btn btn-outline start" onClick={async () => { await api(`/api/boards/${board.id}/scripts`, { script_ids: dialog.ids }); onClose(); await onBoards(); toast("Added to the campaign"); await onScripts(); }}><GridI />{board.name}<span className="grow" /><span className="muted">{board.scripts}×{board.avatars}</span></button>)}
            <button className="btn btn-ghost start" onClick={async () => { const created = await api<{ id: number }>("/api/boards", { name: "Untitled campaign" }); await api(`/api/boards/${created.id}/scripts`, { script_ids: dialog.ids }); onClose(); await onBoards(); toast("Added to the campaign"); await onScripts(); }}><Plus />New campaign</button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Research({ boardId, onClose, onStarted, toast }: { boardId: number | null; onClose: () => void; onStarted: () => void; toast: (s: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <>
      <h3>Write scripts from a website</h3>
      <p className="desc">It reads the site, finds what buyers complain about on Reddit, and writes 10 scripts around their pains and the outcomes they want. {boardId ? "The scripts land as new rows in this campaign." : "The scripts land in Scripts."} About 25-40 credits, 3-6 minutes.</p>
      <label className="label">Website</label>
      <input type="text" id="rUrl" placeholder="https://yourcompany.com" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" id="rGo" onClick={async () => { if (!url.trim()) return; try { await api("/api/projects", { url: url.trim(), n: 10, board_id: boardId || null }); onStarted(); } catch (e: any) { toast(e.message); } }}>Write 10 scripts</button></div>
    </>
  );
}

function Player({ v, onClose, download, setDialog, onRefresh }: any) {
  const unfixed = v.report?.unfixed || [];
  const actions = <><button className="btn btn-ghost" onClick={() => setDialog({ kind: "delete-video", id: v.id })}>Delete</button><span className="grow" /></>;
  if (v.status === "bad_take") return (
    <>
      <video src={v.url} poster={v.poster || ""} controls autoPlay playsInline />
      <p className="desc lg"><span className="badge badge-destructive">Take failed: words are wrong</span> {Math.round((v.report?.wrong_pct || 0) * 100)}% of the script came out wrong, more than the fixer can repair. A new take usually reads right.</p>
      <div className="ft">{actions}<button className="btn btn-primary" onClick={() => setDialog({ kind: "new-take", id: v.id, credits: Math.round(v.est_credits || 0) })}>New take</button></div>
    </>
  );
  if (v.status === "done") return (
    <>
      <video src={v.url} poster={v.poster || ""} controls autoPlay playsInline />
      <p className="desc"><b className="ink">{v.avatar}</b> · {v.secs ? Math.round(v.secs) + " s" : ""}{unfixed.length ? <> · <span className="badge badge-brand">Listen at {unfixed.map((u: any) => u.at + "s").join(", ")}</span> a word may be off there</> : null}</p>
      <div className="ft">{actions}<button className="btn btn-outline" onClick={() => setDialog({ kind: "new-take", id: v.id, credits: Math.round(v.est_credits || 0) })}>New take</button><button className="btn btn-primary" onClick={(e) => void download(e.currentTarget, v.id)}><DownloadI />Download</button></div>
    </>
  );
  const pr = v.progress || {};
  return (
    <>
      <h3>{v.status === "error" ? "This clip failed" : v.status === "canceled" ? "Canceled" : "Still rendering"}</h3>
      <p className="desc lg">{v.error || (pr.label ? `${pr.label} · ${mins(pr.left)} left` : "Waiting for a slot")}</p>
      {busy(v) ? <div className="meter"><i ref={(n) => { if (n) n.style.width = `${Math.round((pr.pct || 0) * 100)}%`; }} /></div> : null}
      <div className="ft">
        {v.status === "error" || v.status === "canceled"
          ? <>{actions}<button className="btn btn-primary" onClick={async () => { await api(`/api/videos/${v.id}/retry`, {}); onClose(); void onRefresh(); }}>Try again</button></>
          : <><button className="btn btn-outline" onClick={async () => { await api(`/api/videos/${v.id}/cancel`, {}); onClose(); void onRefresh(); }}>Cancel clip</button><button className="btn btn-primary" onClick={onClose}>OK</button></>}
      </div>
    </>
  );
}

function AvatarForm({ onClose, toast, onSaved }: any) {
  const name = useRef<HTMLInputElement>(null);
  const persona = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <h3>Add avatar</h3><p className="desc">A 9:16 selfie photo, face near the top, looking at the camera.</p>
      <label className="label">Name</label><input type="text" id="aName" placeholder="Jess" ref={name} />
      <label className="label">Who they are <span className="muted weight">(helps the script writer)</span></label><input type="text" id="aPersona" placeholder="Dental office manager in her 30s" ref={persona} />
      <label className="label">Photo</label><input type="file" id="aImg" accept="image/png,image/jpeg" ref={file} />
      <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" id="aSave" onClick={async (e) => {
        const f = file.current?.files?.[0];
        if (!f || !name.current?.value.trim()) return toast("Name and photo are required");
        const button = e.currentTarget;
        button.disabled = true;
        try {
          const image = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
          const a = await api("/api/avatars", { name: name.current?.value.trim(), persona: persona.current?.value || "", image });
          await onSaved(a);
        } catch (err: unknown) { toast(err instanceof Error ? err.message : String(err)); button.disabled = false; }
      }}>Add avatar</button></div>
    </>
  );
}

function EditAvatar({ a, onClose, onSaved }: any) {
  const name = useRef<HTMLInputElement>(null);
  const persona = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="pair">
        <img className="shot" src={a.thumb} alt="" />
        <div className="grow"><h3>Edit avatar</h3>
          <label className="label">Name</label><input type="text" id="eName" defaultValue={a.name} ref={name} />
          <label className="label">Who they are</label><input type="text" id="ePersona" defaultValue={a.persona} ref={persona} />
        </div>
      </div>
      <div className="ft">
        <button className="btn btn-ghost" id="eDel" onClick={async () => { await api(`/api/avatars/${a.id}`, { archived: true }, "PATCH"); onClose(); await onSaved(); }}>Remove</button>
        <span className="grow" /><button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" id="eSave" onClick={async () => { await api(`/api/avatars/${a.id}`, { name: name.current?.value.trim() || a.name, persona: persona.current?.value || "" }, "PATCH"); await onSaved(); }}>Save</button>
      </div>
    </>
  );
}

function NewScript({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <h3>New script</h3><p className="desc">About 90-105 words fits 30 seconds. Put a line with only --- between scripts to add several.</p>
      <textarea id="nsT" ref={ref} autoFocus />
      <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" id="nsGo" onClick={async () => {
        const texts = (ref.current?.value || "").split(/\n\s*---+\s*\n/).map((t) => t.trim()).filter(Boolean);
        if (!texts.length) return;
        for (const text of texts) await api("/api/scripts", { text });
        await onSaved();
      }}>Save</button></div>
    </>
  );
}

function EditScript({ script, onClose, toast, onSaved }: any) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <h3>Edit script</h3><p className="desc">Clips already rendered keep the old words.</p>
      <textarea id="esT" defaultValue={script.text} ref={ref} />
      <div className="ft"><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" id="esGo" onClick={async () => { try { await api(`/api/scripts/${script.id}`, { text: ref.current?.value || "" }, "PATCH"); await onSaved(); } catch (e: any) { toast(e.message); } }}>Save</button></div>
    </>
  );
}
