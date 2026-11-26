Object.assign(P, {
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  gap: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
});
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n] || ""}</svg>`;
function hydrate(root = document) {
  root.querySelectorAll("[data-i]").forEach((el) => {
    if (el.tagName === "I") { el.outerHTML = ic(el.dataset.i, el.className); return; }
    if (!el.querySelector("svg.i")) el.insertAdjacentHTML("afterbegin", ic(el.dataset.i));
  });
}
const S = window.S = { meta: null, projects: [], pid: null, token: 0, sel: null };

async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || (opts.body ? "POST" : "GET"), headers: opts.body ? { "content-type": "application/json" } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
function toast(msg, ms = 3000, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.innerHTML = ic(err ? "alert" : "check") + `<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), ms);
}
const fail = (e) => toast(e.message || String(e), 5000, true);
function ask({ title, desc = "", body = "", ok = "Continue", danger = false, read = null }) {
  return new Promise((resolve) => {
    const d = $("#dialog"), sh = $("#dshade");
    d.innerHTML = `<h3>${esc(title)}</h3>${desc ? `<p>${esc(desc)}</p>` : ""}${body}<div class="ft"><button class="btn btn-outline" id="dlg_no">Cancel</button><button class="btn ${danger ? "btn-destructive" : "btn-primary"}" id="dlg_ok">${esc(ok)}</button></div>`;
    hydrate(d);
    d.classList.add("on"); sh.classList.add("on");
    const done = (v) => { d.classList.remove("on"); sh.classList.remove("on"); resolve(v); };
    $("#dlg_no").onclick = () => done(null);
    sh.onclick = () => done(null);
    $("#dlg_ok").onclick = () => done(read ? read(d) : true);
    const first = d.querySelector("input,textarea,select");
    (first || $("#dlg_ok")).focus();
  });
}
function openDrawer(title, body, foot = "", desc = "") { $("#dtitle").textContent = title; $("#ddesc").textContent = desc; $("#ddesc").style.display = desc ? "" : "none"; $("#dbody").innerHTML = body; $("#dfoot").innerHTML = foot; $("#dfoot").style.display = foot ? "" : "none"; hydrate($("#drawer")); $("#drawer").classList.add("on"); $("#shade").classList.add("on"); $("#dbody").scrollTop = 0; }
function closeDrawer() { $("#drawer").classList.remove("on"); $("#shade").classList.remove("on"); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
// anchor: the element to open under. Pass it when menu() runs after an await (e.currentTarget is null by then).
function menu(e, items, anchor = e.currentTarget) {
  e.stopPropagation();
  const m = $("#menu");
  m.innerHTML = items.map((it, i) => it === "-" ? "<hr>" : it.label ? `<div class="ml">${esc(it.label)}</div>` : `<div class="mi" data-k="${i}">${it.icon ? ic(it.icon) : ""}${esc(it.t)}</div>`).join("");
  m.querySelectorAll(".mi").forEach((el) => { el.onclick = () => { m.classList.remove("on"); items[el.dataset.k].fn(); }; });
  const r = (anchor || e.target).getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - 240) + "px"; m.style.top = r.bottom + 4 + "px";
  m.classList.add("on");
}
document.addEventListener("click", () => $("#menu").classList.remove("on"));

// ---------- formatting ----------
const n = (x) => (x == null || x === "" ? "—" : Number(x).toLocaleString());
const n1 = (x) => (x == null ? "—" : (Math.round(x * 10) / 10).toLocaleString());
const cr = (x) => (x == null ? "—" : x > 0 && x < 0.01 ? "<0.01" : (Math.round(x * 100) / 100).toLocaleString());
const money = (x) => (x == null ? "—" : "$" + Number(x).toLocaleString(undefined, { maximumFractionDigits: Number(x) < 10 ? 2 : 0 }));
const cpc = (x) => (x == null ? "—" : "$" + Number(x).toFixed(2));
const plural = (k, one, many) => `${n(k)} ${Number(k) === 1 ? one : many || one + "s"}`;
const shortDate = (d) => new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
const ago = (t) => { if (!t) return ""; const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const kdCls = (v) => (v < 30 ? "kd-g" : v < 50 ? "kd-y" : v < 70 ? "kd-o" : "kd-r"); // not "r": clay-tables uses .r for grid rows
const kdWord = (v) => (v < 15 ? "Easy" : v < 30 ? "Fairly easy" : v < 50 ? "Medium" : v < 70 ? "Hard" : "Very hard");
const kdB = (v) => v == null ? '<span class="s">—</span>' : `<span class="kd ${kdCls(v)}" title="${kdWord(v)}">${v}</span>`;
const intentB = (v) => v ? `<span class="it ${v[0]}" title="${esc(v)}">${v[0].toUpperCase()}</span>` : '<span class="s">—</span>';
const aioTag = (on) => (on ? '<span class="tag" title="Google shows an AI Overview for this keyword">AIO</span>' : "");
const chg = (v) => v == null || v === 0 ? '<span class="s">—</span>' : `<span class="chg ${v > 0 ? "up" : "down"}">${v > 0 ? "▲" : "▼"} ${Math.abs(v)}</span>`;
// Change pill. invert: lower is better (positions).
const delta = (cur, prev, invert = false) => {
  if (cur == null || prev == null || prev === 0) return "";
  const p = invert ? Math.round((prev - cur) * 10) / 10 : pct(cur, prev);
  if (!p) return `<span class="pill">0${invert ? "" : "%"}</span>`;
  const good = p > 0;
  const txt = invert ? `${cur < prev ? "▲" : "▼"} ${Math.abs(p)}` : `${p > 0 ? "+" : "−"}${Math.abs(p)}%`;
  return `<span class="pill ${good ? "up" : "down"}">${txt}</span>`;
};
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || ""; } };
const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u || ""; } };
const link = (u, label) => u ? `<a class="lnk${label ? "" : " url"}" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">${esc(label || pathOf(u))}</a>` : '<span class="s">—</span>';
function spark(a, w = 84, h = 22, color = "var(--primary)") {
  const v = (a || []).map((x) => (x == null ? null : Number(x)));
  const nums = v.filter((x) => x != null);
  if (nums.length < 2) return '<span class="s">—</span>';
  const max = Math.max(...nums), min = Math.min(...nums), span = max - min || 1;
  const pts = v.map((x, i) => x == null ? null : `${(i / (v.length - 1)) * w},${h - 2 - ((x - min) / span) * (h - 4)}`).filter(Boolean).join(" ");
  return `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
// Rank history: lower is better, so flip it.
const rankSpark = (hist) => spark((hist || []).map(([, p]) => (p == null ? null : 101 - p)));
function setSel(sel, val, label) {
  if (!sel || val == null) return;
  val = String(val);
  if (![...sel.options].some((o) => o.value === val)) sel.add(new Option(label || val, val));
  sel.value = val;
}
const stat = (l, v, s = "", tip = "") => `<div class="stat"${tip ? ` title="${esc(tip)}"` : ""}><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
const nothing = (t) => `<div class="nothing">${ic("alert", "sm")}<span>${t}</span></div>`;
const more = (href, t = "View all") => `<a class="btn btn-ghost btn-xs noprint" style="margin-left:auto" href="${href}">${t}${ic("arrow", "sm")}</a>`;
// KPI strips: even rows (7 cells → 4 + 3, never 6 + 1).
function polish(root = document) {
  root.querySelectorAll(".stats").forEach((el) => {
    const k = el.children.length, rows = Math.ceil(k / 6), cols = Math.ceil(k / rows);
    el.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    const gap = rows * cols - k;
    if (gap && el.lastElementChild) el.lastElementChild.style.gridColumn = `span ${gap + 1}`;
  });
  root.querySelectorAll(".achart[data-pts]").forEach(mountChart);
  hydrate(root);
}
// Responsive area chart with y grid, date ticks and a hover readout. pts: [[label, value], …]
const areaChart = (pts, unit = "") => `<div class="achart" data-pts="${esc(JSON.stringify(pts))}" data-unit="${esc(unit)}"></div>`;
function mountChart(el) {
  const pts = JSON.parse(el.dataset.pts || "[]"); el.removeAttribute("data-pts");
  if (pts.length < 2) { el.innerHTML = nothing("Not enough days yet."); el.style.height = "auto"; return; }
  const max = Math.max(...pts.map((p) => p[1]), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step || 1;
  const W = 1000, H = 100, x = (i) => (i / (pts.length - 1)) * W, y = (v) => H - (v / top) * H;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xt = [0, Math.round((pts.length - 1) / 3), Math.round(((pts.length - 1) * 2) / 3), pts.length - 1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7700" stop-opacity=".16"/><stop offset="1" stop-color="#ff7700" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((t) => `<line x1="0" x2="${W}" y1="${H - t * H}" y2="${H - t * H}" stroke="${t ? "#f0f0f2" : "#e4e4e7"}" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("")}
    <polygon points="0,${H} ${line} ${W},${H}" fill="url(#ag)"/><polyline points="${line}" fill="none" stroke="#ff7700" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>
    ${ticks.map((t) => `<span class="yl" style="top:calc(8px + ${(1 - t)} * (100% - 34px))">${n(Math.round(top * t))}</span>`).join("")}
    ${xt.map((i, j) => `<span class="xl" style="left:calc(44px + ${i / (pts.length - 1)} * (100% - 44px));transform:translateX(${j === 0 ? "0" : j === xt.length - 1 ? "-100%" : "-50%"})">${esc(shortDate(pts[i][0]))}</span>`).join("")}
    <div class="vl"></div><div class="tip"></div>`;
  const svg = $("svg", el), vl = $(".vl", el), tip = $(".tip", el);
  el.onmousemove = (e) => {
    const r = svg.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const i = Math.round(f * (pts.length - 1)), px = r.left - el.getBoundingClientRect().left + (i / (pts.length - 1)) * r.width;
    vl.style.display = tip.style.display = "block"; vl.style.left = px + "px"; tip.style.left = Math.max(60, Math.min(el.clientWidth - 60, px)) + "px";
    tip.innerHTML = `<span class="muted">${esc(shortDate(pts[i][0]))}</span> · <b>${n(pts[i][1])}</b> ${esc(el.dataset.unit)}`;
  };
  el.onmouseleave = () => { vl.style.display = tip.style.display = "none"; };
}
const hbars = (items, max) => items.map(([t, v, you]) => `<div class="hbar"><span class="t" title="${esc(t)}">${esc(t)}</span><span class="tr2"><i class="${you ? "you" : ""}" style="width:${max ? Math.max(2, (v / max) * 100) : 0}%"></i></span><span class="n">${n(v)}</span></div>`).join("");
function tabs(el, names, cur, onPick) {
  el.innerHTML = `<div class="tabs">${names.map(([k, t]) => `<span class="tab ${k === cur ? "on" : ""}" data-k="${k}">${t}</span>`).join("")}</div>`;
  el.querySelectorAll(".tab").forEach((t) => { t.onclick = () => { el.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === t)); onPick(t.dataset.k); }; });
  onPick(cur);
}

// ---------- virtualized data grid ----------
const dash = (h) => (h === "—" || h === "<span>—</span>" ? '<span class="s">—</span>' : h);
function grid(el, o) {
  const ROW = 36;
  const st = { rows: o.rows || [], view: [], sort: o.sort || null, q: "", sel: new Set() };
  const cols = (o.select ? [{ k: "__sel", t: "", w: 40, f: () => "" }] : []).concat(o.cols);
  const total = cols.reduce((s, c) => s + (c.w || 140), 0);
  const val = (c, r) => (c.v ? c.v(r) : r[c.k]);
  const keyOf = o.key || ((r) => r.keyword || r.url || r.domain || JSON.stringify(r));
  el.innerHTML = `<div class="dg"><div class="dg-tools">${o.search === false ? `<b style="font-size:14px;padding-left:6px">${esc(o.title || "")}</b>` : `<div class="search"><i data-i="search" class="sm"></i><input class="q" placeholder="Filter rows…"></div>`}<span class="grow"></span>${o.tools || ""}${o.csv === false ? "" : `<button class="btn btn-ghost btn-sm" data-csv><i data-i="download"></i>Export CSV</button>`}</div>
    <div class="dg-scroll"><div class="hdr" style="width:${total}px;min-width:100%">${cols.map((c, i) => `<div class="h ${c.num ? "num" : ""}" data-c="${i}" title="${esc(c.tip || c.t)}" style="width:${c.w || 140}px;${i === cols.length - 1 ? "flex:1;" : ""}${c.k === "__sel" ? "justify-content:center;padding:0;" : ""}">${c.k === "__sel" ? `<input type="checkbox" data-all>` : c.num ? `<span data-ar></span><span class="nm" style="flex:none">${esc(c.t)}</span>` : `<span class="nm" style="flex:none">${esc(c.t)}</span><span data-ar></span>`}</div>`).join("")}</div><div class="bd" style="position:relative"></div></div>
    <div class="dg-foot"><span data-cnt></span><span data-foot></span><span class="grow"></span><span data-selinfo></span></div></div>`;
  hydrate(el);
  const sc = $(".dg-scroll", el), bd = $(".bd", el);
  const apply = () => {
    const q = st.q.toLowerCase();
    let v = q ? st.rows.filter((r) => cols.some((c) => c.k !== "__sel" && String(val(c, r) ?? "").toLowerCase().includes(q))) : st.rows.slice();
    if (st.sort) {
      const c = cols.find((x) => x.k === st.sort.k); const d = st.sort.dir;
      if (c) v.sort((a, b) => { const x = val(c, a), y = val(c, b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * d; });
    }
    st.view = v;
    const h = Math.min(Math.max(v.length, 2) * ROW + 41, o.height || Math.max(380, innerHeight - 250));
    sc.style.height = h + "px";
    bd.style.height = Math.max(v.length, 2) * ROW + "px";
    $("[data-cnt]", el).textContent = `${v.length.toLocaleString()}${v.length !== st.rows.length ? ` of ${st.rows.length.toLocaleString()}` : ""} ${v.length === 1 ? "row" : "rows"}`;
    el.querySelectorAll(".h[data-c]").forEach((h) => { const c = cols[h.dataset.c]; const on = st.sort && st.sort.k === c.k; h.classList.toggle("sorted", !!on); const ar = $("[data-ar]", h); if (ar) ar.textContent = on ? (st.sort.dir > 0 ? "↑" : "↓") : ""; });
    $("[data-foot]", el).textContent = o.foot ? " · " + o.foot(v) : "";
    paint(true);
  };
  let lastRange = "";
  const paint = (force) => {
    const top = Math.max(0, sc.scrollTop - 40), hgt = sc.clientHeight;
    const a = Math.max(0, Math.floor(top / ROW) - 8), b = Math.min(st.view.length, Math.ceil((top + hgt) / ROW) + 8);
    const rk = a + ":" + b;
    if (!force && rk === lastRange) return;
    lastRange = rk;
    let h = st.view.length ? "" : `<div class="nodata">${esc(o.empty || (st.q ? "No rows match the filter." : "No rows."))}</div>`;
    for (let i = a; i < b; i++) {
      const r = st.view[i], k = keyOf(r);
      h += `<div class="r ${o.onRow ? "click" : ""} ${st.sel.has(k) ? "sel" : ""}" data-ri="${i}" style="top:${i * ROW}px;width:${total}px;min-width:100%">${cols.map((c, j) => `<div class="c ${c.num ? "num2" : ""} ${c.k === "__sel" ? "sel0" : ""}" style="width:${c.w || 140}px;${j === cols.length - 1 ? "flex:1;" : ""}${c.num ? "justify-content:flex-end;" : ""}">${c.k === "__sel" ? `<input type="checkbox" data-s="${i}" ${st.sel.has(k) ? "checked" : ""}>` : dash(c.f ? c.f(r, i) : `<span>${esc(val(c, r) ?? "")}</span>`)}</div>`).join("")}</div>`;
    }
    bd.innerHTML = h;
  };
  sc.addEventListener("scroll", () => paint(false));
  const inp = $(".search input.q", el);
  if (inp) inp.oninput = () => { st.q = inp.value; apply(); };
  el.querySelectorAll(".h[data-c]").forEach((h) => h.onclick = (e) => {
    const c = cols[h.dataset.c]; if (c.k === "__sel" || c.nosort) return;
    st.sort = st.sort && st.sort.k === c.k ? { k: c.k, dir: -st.sort.dir } : { k: c.k, dir: c.num ? -1 : 1 };
    apply();
  });
  const selChanged = () => {
    $("[data-selinfo]", el).textContent = st.sel.size ? `${st.sel.size} selected` : "";
    const bulk = $("#bulk");
    if (st.sel.size && o.bulk) {
      S.sel = { rows: () => st.rows.filter((r) => st.sel.has(keyOf(r))), clear: () => { st.sel.clear(); selChanged(); paint(true); } };
      $("#bulkn").textContent = `${st.sel.size} selected`;
      $("#bulkacts").innerHTML = o.bulk.map((b, i) => `<button class="btn btn-outline btn-sm" data-b="${i}">${ic(b.icon || "plus")}${esc(b.t)}</button>`).join("");
      $("#bulkacts").querySelectorAll("[data-b]").forEach((x) => x.onclick = (e) => o.bulk[x.dataset.b].fn(S.sel.rows(), e));
      bulk.classList.add("on");
    } else bulk.classList.remove("on");
  };
  const all = $("[data-all]", el);
  if (all) all.onclick = (e) => { e.stopPropagation(); if (all.checked) st.view.forEach((r) => st.sel.add(keyOf(r))); else st.sel.clear(); selChanged(); paint(true); };
  bd.addEventListener("click", (e) => {
    const cb = e.target.closest("[data-s]");
    if (cb) { const r = st.view[cb.dataset.s], k = keyOf(r); cb.checked ? st.sel.add(k) : st.sel.delete(k); selChanged(); paint(true); e.stopPropagation(); return; }
    if (e.target.closest("a,button,input")) return;
    const row = e.target.closest(".r");
    if (row && o.onRow) o.onRow(st.view[row.dataset.ri]);
  });
  if ($("[data-csv]", el)) $("[data-csv]", el).onclick = () => {
    const cs = cols.filter((c) => c.k !== "__sel");
    const cell = (x) => { const s = Array.isArray(x) ? x.join(" ") : typeof x === "object" && x ? JSON.stringify(x) : String(x ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cs.map((c) => cell(c.t)).join(","), ...st.view.map((r) => cs.map((c) => cell(c.csv ? c.csv(r) : val(c, r))).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = (o.csv || "export") + ".csv"; a.click();
  };
  apply();
  return { set: (rows) => { st.rows = rows; apply(); }, rows: () => st.rows };
}
function clearSel() { if (S.sel) S.sel.clear(); $("#bulk").classList.remove("on"); }

// ---------- routing ----------
function go(h) { if (location.hash === h) route(); else location.hash = h; }
window.addEventListener("hashchange", route);
function parseHash() {
  const [path, qs] = location.hash.replace(/^#/, "").split("?");
  return { parts: (path || "/").split("/").filter(Boolean), qs: new URLSearchParams(qs || "") };
}
async function route() {
  const t = ++S.token;
  clearSel(); closeDrawer();
  const { parts, qs } = parseHash();
  const [a, b, c] = parts;
  S.pid = a === "p" ? Number(b) : null;
  const nav = a === "p" ? `p:${c || "overview"}` : a || "site";
  renderSidebar(nav);
  $("#tactions").innerHTML = "";
  $("#page").scrollTop = 0;
  const v = $("#view");
  v.innerHTML = "";
  const page = {
    site: pageSite, keywords: pageKeywords, serp: pageSerp, credits: pageCredits, links: pageLinks, mentions: pageMentions, lists: pageLists, agent: pageAgent,
    "p:overview": pageOverview, "p:gap": pageGap, "p:linkgap": pageLinkgap, "p:rank": pageRank, "p:gsc": pageGsc, "p:audit": pageAudit, "p:ai": pageAi, "p:backlinks": pageBacklinks, "p:local": pageLocal, "p:settings": pageSettings,
  }[nav] || pageSite;
  try { await page(v, qs, t); } catch (e) { if (t === S.token) v.innerHTML = `<div class="alert">${ic("alert")}<span>${esc(e.message)}</span></div>`; }
  polish(v);
}
const P_NAV = [["overview", "home", "Overview"], ["gap", "gap", "Keyword gap"], ["linkgap", "split", "Link gap"], ["backlinks", "link", "Backlinks"], ["rank", "trend", "Rank tracker"], ["gsc", "chart", "Search Console + GA4"], ["audit", "activity", "Site audit"], ["ai", "bot", "AI visibility"], ["local", "pin", "Local rank grid"], ["settings", "settings", "Settings"]];
function renderSidebar(nav) {
  document.querySelectorAll("[data-nav]").forEach((el) => el.classList.toggle("on", el.dataset.nav === nav));
  $("#projects").innerHTML = S.projects.length ? S.projects.map((p) => `<div class="tbl ${S.pid === p.id ? "open" : ""}" onclick="go('#/p/${p.id}')"><span class="av">${esc(p.name.replace(/^www\./, "")[0] || "?")}</span><span class="nm">${esc(p.name)}</span>${p.name !== p.domain ? `<span class="ct">${esc(p.domain)}</span>` : ""}</div>
    ${S.pid === p.id ? `<div class="sub">${P_NAV.map(([k, i, t]) => `<div class="tbl ${nav === "p:" + k ? "on" : ""}" onclick="go('#/p/${p.id}${k === "overview" ? "" : "/" + k}')">${ic(i, "sm")}<span class="nm">${t}</span></div>`).join("")}</div>` : ""}`).join("")
    : `<div class="desc" style="padding:4px 8px">No projects yet. A project tracks one site: keyword gap, ranks, Search Console + GA4, audits, AI visibility.</div>`;
}
const head = (title, crumb = "AI SEO Tool") => { $("#ttl").textContent = title; $("#crumb").textContent = crumb; document.title = `${title} · AI SEO Tool`; };
const proj = () => S.projects.find((p) => p.id === S.pid) || null;
async function needProject() {
  let p = proj();
  if (!p) { p = await api(`/api/projects/${S.pid}`); S.projects.push(p); }
  head(P_NAV.find(([k]) => k === (parseHash().parts[2] || "overview"))[2], p.name);
  return p;
}
async function loadProjects() { S.projects = await api("/api/projects"); }

// ---------- job runner (form + recent runs + polling) ----------
// Language: "" = the location's own language (server langOf).
const langSel = (id, v) => `<select id="${id}" style="width:150px"><option value="">Location default</option>${(S.meta.languages || []).map((l) => `<option value="${l.code}" ${v === l.code ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`;
const locSel = (id, v) => `<select id="${id}" style="width:170px">${S.meta.locations.map((l) => `<option value="${l.code}" ${Number(v) === l.code ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`;
async function runner(v, { kind, projectId = null, form, read, est, render, qs, t, runLabel = "Run", fill = null }) {
  v.insertAdjacentHTML("beforeend", `<div class="card noprint"><div class="formbar">${form}<div class="fact"><span class="est" data-est></span><button class="btn btn-primary" data-run><i data-i="play"></i>${runLabel}</button></div></div><div class="recent" data-recent></div></div><div data-out></div>`);
  hydrate(v);
  const out = $("[data-out]", v), estEl = $("[data-est]", v);
  const upd = () => { try { estEl.textContent = est ? est(read()) : ""; } catch { estEl.textContent = ""; } };
  v.querySelectorAll(".formbar input,.formbar select,.formbar textarea").forEach((x) => { x.addEventListener("input", upd); x.addEventListener("change", upd); });
  upd();
  const recent = async (cur) => {
    const jobs = await api(`/api/jobs?kind=${kind}${projectId ? `&project=${projectId}` : ""}&limit=14`);
    const el = $("[data-recent]", v);
    if (!el) return;
    el.innerHTML = jobs.length ? `<span class="hl" title="Saved runs open for free">${ic("clock", "sm")}History</span>` + jobs.map((j) => `<span class="chip ${Number(cur) === j.id ? "on" : ""}" data-j="${j.id}" title="${esc(new Date(j.created_at).toLocaleString())} · ${cr(j.credits)} credits">${j.status === "running" || j.status === "queued" ? ic("loader", "sm spin") : j.status === "error" ? ic("alert", "sm") : ""}${esc(j.title || kind)}<span class="muted">${ago(j.created_at)}</span></span>`).join("") : "";
    el.querySelectorAll("[data-j]").forEach((c) => c.onclick = () => go(location.hash.split("?")[0] + "?job=" + c.dataset.j));
  };
  $("[data-run]", v).onclick = async () => {
    try {
      const input = read();
      const j = await api("/api/jobs", { body: { kind, input, projectId } });
      go(location.hash.split("?")[0] + "?job=" + j.id);
    } catch (e) { fail(e); }
  };
  const jobId = qs.get("job");
  recent(jobId);
  if (!jobId) {
    const last = (await api(`/api/jobs?kind=${kind}${projectId ? `&project=${projectId}` : ""}&limit=1`))[0];
    if (last && last.status === "done" && t === S.token) return openJob(last.id, out, render, t, v, null, fill, upd);
    return;
  }
  return openJob(jobId, out, render, t, v, recent, fill, upd);
}
async function openJob(id, out, render, t, v, recent, fill, upd) {
  const t0 = Date.now();
  for (let i = 0; ; i++) {
    if (t !== S.token) return;
    const j = await api(`/api/jobs/${id}`);
    if (j.status === "done") {
      if (fill) { try { fill(j.input || {}); if (upd) upd(); } catch {} }
      out.innerHTML = `<div class="meta noprint">${ic("clock", "sm")}<span>Saved ${esc(new Date(j.finished_at || j.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))} · ${cr(j.credits)} credits · opening it again is free</span></div><div data-res></div>`;
      if (recent && i) recent(id);
      await render($("[data-res]", out), j.result, j);
      polish(out);
      return;
    }
    if (j.status === "error") { out.innerHTML = `<div class="alert">${ic("alert")}<span>${esc(j.error)}</span></div>`; if (recent) recent(id); return; }
    out.innerHTML = `<div class="progress">${ic("loader", "spin")}<span><b>${j.status === "queued" ? "Queued" : "Running"}</b>${j.progress ? " · " + esc(j.progress) : ""}</span><span class="grow"></span><span class="est">${Math.round((Date.now() - t0) / 1000)}s · ${cr(j.credits)} credits so far</span></div>`;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ---------- shared actions ----------
async function trackKeywords(kws, e) {
  kws = [...new Set(kws.filter(Boolean))];
  if (!kws.length) return;
  const add = async (p) => { const r = await api(`/api/projects/${p.id}/tracked`, { body: { keywords: kws } }); toast(`Tracking ${r.added} keywords in ${p.name}. First check is running.`); clearSel(); };
  if (S.pid) return add(proj()).catch(fail);
  if (!S.projects.length) return toast("Create a project first", 3000, true);
  if (S.projects.length === 1) return add(S.projects[0]).catch(fail);
  menu(e, [{ label: "Track in project" }, ...S.projects.map((p) => ({ t: p.name, icon: "target", fn: () => add(p).catch(fail) }))]);
}
const kwLink = (k) => `<a class="lnk" href="#/serp?kw=${encodeURIComponent(k)}" title="Open SERP">${esc(k)}</a>`;

// ---------- Site Explorer ----------
async function pageSite(v, qs, t) {
  head("Site Explorer");
  v.innerHTML = `<div class="ph"><div><h1>Site Explorer</h1><p>Organic keywords, top pages, competitors, backlink profile and tech stack for any domain.</p></div></div>`;
  await runner(v, {
    kind: "domain", qs, t,
    form: `<div class="f grow1"><label>Domain</label><input id="f_dom" placeholder="example.com" value="${esc(qs.get("d") || "")}"></div>
      <div class="f"><label>Location</label>${locSel("f_loc", 2840)}</div><div class="f"><label>Language</label>${langSel("f_lang", "")}</div>
      <div class="f"><label>Keywords to pull</label><select id="f_lim" style="width:130px"><option value="1000">1,000</option><option value="3000">3,000</option><option value="5000">5,000</option><option value="10000">10,000</option></select></div>`,
    read: () => ({ domain: $("#f_dom").value, loc: Number($("#f_loc").value), lang: $("#f_lang").value, limit: Number($("#f_lim").value) }),
    fill: (i) => { if (!qs.get("d")) $("#f_dom").value = i.domain || ""; if (i.loc) setSel($("#f_loc"), i.loc); setSel($("#f_lang"), i.lang || ""); if (i.limit) setSel($("#f_lim"), i.limit, n(i.limit)); },
    est: (i) => `≈ ${Math.round(8 + Math.ceil(i.limit / 1000) * 13)} credits`,
    render: renderSite,
  });
  if (qs.get("d") && !qs.get("job")) $("[data-run]", v).click();
}
async function renderSite(el, r) {
  const o = r.overview, b = r.backlinks || {};
  const bmax = Math.max(...o.buckets.map((x) => x[1]), 1);
  el.innerHTML = `<div class="rh"><h2>${esc(r.domain)}</h2><p>${esc(r.tech.title || "")}</p></div>
    <div class="stats">${stat("Organic keywords", n(o.keywords), `${n(o.top10)} in the top 10`)}${stat("Organic traffic", n(o.etv), "estimated visits / month")}${stat("Traffic value", money(o.trafficValue), "per month at CPC")}${stat("Domain rank", n(b.rank), "0–1,000 scale")}${stat("Referring domains", n(b.referringDomains), `${n(b.dofollowDomains)} dofollow`)}${stat("Backlinks", n(b.backlinks), `spam score ${n(b.spamScore)}`)}</div>
    <div class="grid2"><div class="card"><div class="card-h">Keywords by position</div><div class="card-b"><div class="bars">${o.buckets.map(([k, c]) => `<div class="b" title="${n(c)} keywords in positions ${k}"><span>${c >= 1000 ? (Math.round(c / 100) / 10) + "k" : c}</span><i style="height:${Math.max(1.5, (c / bmax) * 78)}%"></i><span class="x">${k}</span></div>`).join("")}</div></div></div>
    <div class="card"><div class="card-h">Keyword movement <span class="muted">since the last update</span></div><div class="card-b">${hbars([["New", o.isNew], ["Moved up", o.isUp], ["Moved down", o.isDown], ["Lost", o.isLost]], Math.max(o.isNew, o.isUp, o.isDown, o.isLost, 1))}<div class="desc">Paid search: ${plural(o.paidKeywords, "keyword")}, ${n(o.paidEtv)} estimated visits.</div></div></div></div>
    <div data-tabs></div><div data-tab></div>`;
  tabs($("[data-tabs]", el), [["kw", `Organic keywords · ${n(r.keywords.length)}`], ["pages", `Top pages · ${n(r.pagesTotal ?? r.pages.length)}`], ["comp", `Competitors · ${r.competitors.length}`], ["bl", "Backlinks"], ["tech", "Tech stack"]], "kw", (k) => {
    const box = $("[data-tab]", el);
    if (k === "kw") grid(box, { csv: `${r.domain}-keywords`, select: true, bulk: [{ t: "Track", icon: "trend", fn: (rows, e) => trackKeywords(rows.map((x) => x.keyword), e) }, SAVE], sort: { k: "etv", dir: -1 }, rows: r.keywords, cols: [
      { k: "keyword", t: "Keyword", w: 300, f: (x) => kwLink(x.keyword) + aioTag(x.aio) },
      { k: "pos", t: "Position", w: 80, num: 1, f: (x) => `<span class="pos">${n(x.pos)}</span>` },
      { k: "chg", t: "Change", w: 76, num: 1, tip: "Change since the previous update", v: (x) => (x.prev && x.pos ? x.prev - x.pos : null), f: (x) => x.isNew ? '<span class="tag new">NEW</span>' : chg(x.prev && x.pos ? x.prev - x.pos : null) },
      { k: "volume", t: "Volume", w: 84, num: 1, f: (x) => n(x.volume) }, { k: "kd", t: "KD", w: 56, num: 1, tip: "Keyword difficulty 0–100", f: (x) => kdB(x.kd) },
      { k: "intent", t: "Intent", w: 64, f: (x) => intentB(x.intent) }, { k: "cpc", t: "CPC", w: 74, num: 1, f: (x) => cpc(x.cpc) },
      { k: "etv", t: "Traffic", w: 78, num: 1, tip: "Estimated monthly visits from this keyword", f: (x) => n(Math.round(x.etv || 0)) }, { k: "url", t: "Ranking URL", w: 320, f: (x) => link(x.url) },
    ] });
    if (k === "pages") grid(box, { csv: `${r.domain}-pages`, sort: { k: "etv", dir: -1 }, rows: r.pages, cols: [
      { k: "url", t: "Page", w: 420, f: (x) => link(x.url) }, { k: "etv", t: "Traffic", w: 84, num: 1, tip: "Estimated monthly organic visits", f: (x) => n(x.etv) },
      { k: "keywords", t: "Keywords", w: 88, num: 1, f: (x) => n(x.keywords) }, { k: "top10", t: "In top 10", w: 90, num: 1, f: (x) => n(x.top10) },
      { k: "value", t: "Value", w: 84, num: 1, tip: "What this traffic would cost in ads, per month", f: (x) => money(x.value) },
      { k: "top", t: "Top keyword", w: 260, f: (x) => x.top ? kwLink(x.top) : '<span class="s">—</span>' }, { k: "topVolume", t: "Volume", w: 84, num: 1, f: (x) => n(x.topVolume) },
    ] });
    if (k === "comp") grid(box, { csv: `${r.domain}-competitors`, onRow: (x) => go(`#/site?d=${encodeURIComponent(x.domain)}`), sort: { k: "common", dir: -1 }, rows: r.competitors, empty: "No competitors found.", cols: [
      { k: "domain", t: "Domain", w: 280, f: (x) => `<b style="font-weight:500">${esc(x.domain)}</b>` }, { k: "common", t: "Shared keywords", w: 140, num: 1, f: (x) => n(x.common) },
      { k: "avgPos", t: "Avg position", w: 110, num: 1, f: (x) => n1(x.avgPos) }, { k: "keywords", t: "Their keywords", w: 130, num: 1, f: (x) => n(x.keywords) }, { k: "etv", t: "Their traffic", w: 130, num: 1, f: (x) => n(x.etv) },
      { k: "go", t: "", w: 120, nosort: 1, f: () => `<span class="muted" style="font-size:12px">Open ${ic("arrow", "sm")}</span>` },
    ] });
    if (k === "bl") { box.innerHTML = `<div class="note" style="margin-top:12px">${ic("link")}<span>This is the profile summary. <a class="lnk" style="text-decoration:underline" href="#/links?d=${encodeURIComponent(r.domain)}">Open the full backlink report</a> for every referring domain, backlink, anchor and new or lost link.</span></div>` + blBreakdown(b, true); polish(box); }
    if (k === "tech") {
      const groups = Object.entries(r.tech.technologies || {}).map(([g, x]) => [g.replace(/_/g, " "), Object.values(x).flat()]);
      box.innerHTML = `<div class="card mt"><div class="card-b flush"><div class="list">${groups.map(([g, list]) => `<div class="li"><span style="width:180px;text-transform:capitalize;color:var(--muted-foreground)">${esc(g)}</span><span class="t chips" style="margin:0">${[...new Set(list)].map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</span></div>`).join("") || nothing("No technologies detected.")}</div></div></div>`;
      polish(box);
    }
  });
}
function blBreakdown(b, quiet) {
  if (!b || !b.target) return nothing("No backlink data for this domain.");
  const box = (t, arr) => `<div class="card"><div class="card-h">${t}</div><div class="card-b">${arr.length ? hbars(arr, Math.max(...arr.map((x) => x[1]), 1)) : nothing("None.")}</div></div>`;
  return `<div class="stats">${stat("Domain rank", n(b.rank), "0–1,000 scale")}${stat("Referring domains", n(b.referringDomains), `${n(b.referringMainDomains)} main domains`)}${stat("Dofollow domains", n(b.dofollowDomains), b.referringDomains ? `${Math.round((b.dofollowDomains / b.referringDomains) * 100)}% of referring domains` : "")}${stat("Backlinks", n(b.backlinks))}${stat("IPs / subnets", `${n(b.referringIps)} / ${n(b.referringSubnets)}`)}${stat("Broken backlinks", n(b.brokenBacklinks), plural(b.brokenPages || 0, "broken page"))}</div>
    <div class="grid2">${box("Link attributes", b.attributes)}${box("Linking site types", b.platforms)}${box("Top TLDs", b.tld)}${box("Link position on the page", b.locations.map(([k, v]) => [k || "(not marked)", v]))}</div>
`;
}

// ---------- Keywords Explorer ----------
async function pageKeywords(v, qs, t) {
  head("Keywords Explorer");
  v.innerHTML = `<div class="ph"><div><h1>Keywords Explorer</h1><p>Volume, difficulty, CPC, intent and trend, plus the average referring domains of page-1 results. Ideas, suggestions, related terms and Google autocomplete.</p></div></div>`;
  await runner(v, {
    kind: "keywords", qs, t,
    form: `<div class="f grow1"><label>Seed keyword</label><input id="f_seed" placeholder="e.g. seo tool" value="${esc(qs.get("kw") || "")}"></div>
      <div class="f"><label>Location</label>${locSel("f_loc", 2840)}</div><div class="f"><label>Language</label>${langSel("f_lang", "")}</div>
      <div class="f"><label>Ideas per source</label><select id="f_lim" style="width:110px"><option>100</option><option selected>300</option><option>1000</option></select></div>`,
    read: () => ({ seed: $("#f_seed").value, loc: Number($("#f_loc").value), lang: $("#f_lang").value, limit: Number($("#f_lim").value) }),
    fill: (i) => { if (!qs.get("kw")) $("#f_seed").value = i.seed || ""; if (i.loc) setSel($("#f_loc"), i.loc); setSel($("#f_lang"), i.lang || ""); if (i.limit) setSel($("#f_lim"), i.limit); },
    est: (i) => `≈ ${Math.round(6 + (2 * i.limit + Math.min(i.limit, 300)) * 0.0115)} credits`,
    render: renderKeywords,
  });
}
async function renderKeywords(el, r) {
  const s = r.seedRow || {};
  el.innerHTML = `<div class="rh"><h2>${esc(r.seed)}</h2><a class="btn btn-outline btn-sm noprint" style="margin-left:auto" href="#/serp?kw=${encodeURIComponent(r.seed)}">${ic("search")}SERP + link barrier</a></div>
    <div class="stats">${stat("Search volume", n(s.volume), s.yoy != null ? `<span class="pill ${s.yoy >= 0 ? "up" : "down"}">${s.yoy >= 0 ? "+" : "−"}${Math.abs(s.yoy)}%</span> year on year` : "per month")}${stat("Keyword difficulty", s.kd != null ? `<span class="kd ${kdCls(s.kd)}" style="font-size:18px;height:30px;min-width:40px">${s.kd}</span><span class="kdword">${kdWord(s.kd)}</span>` : "—")}${stat("CPC", cpc(s.cpc), s.competition != null ? `ads competition ${Math.round(s.competition * 100)}%` : "")}${stat("Intent", s.intent ? esc(s.intent[0].toUpperCase() + s.intent.slice(1)) : "—")}${stat("Page-1 referring domains", n(s.avgRd), "average: the link barrier")}${stat("Trend", spark(s.trend, 132, 32), "last 12 months")}</div>
    <div data-tabs></div><div data-tab></div>`;
  const qn = r.keywords.filter((k) => k.question).length, ln = r.keywords.filter((x) => x.kd != null && x.kd < 30).length, an = r.keywords.filter((x) => x.source.includes("autocomplete")).length;
  tabs($("[data-tabs]", el), [["all", `All · ${n(r.keywords.length)}`], ["q", `Questions · ${qn}`], ["low", `Easy (KD < 30) · ${ln}`], ["ac", `Autocomplete · ${an}`]], "all", (k) => {
    const rows = k === "q" ? r.keywords.filter((x) => x.question) : k === "ac" ? r.keywords.filter((x) => x.source.includes("autocomplete")) : k === "low" ? r.keywords.filter((x) => x.kd != null && x.kd < 30) : r.keywords;
    grid($("[data-tab]", el), { csv: `keywords-${r.seed}`, select: true, bulk: [{ t: "Track", icon: "trend", fn: (rows, e) => trackKeywords(rows.map((x) => x.keyword), e) }, SAVE], sort: { k: "volume", dir: -1 }, rows, cols: [
      { k: "keyword", t: "Keyword", w: 320, f: (x) => kwLink(x.keyword) + aioTag(x.aio) },
      { k: "volume", t: "Volume", w: 84, num: 1, f: (x) => n(x.volume) }, { k: "kd", t: "KD", w: 56, num: 1, tip: "Keyword difficulty 0–100", f: (x) => kdB(x.kd) },
      { k: "cpc", t: "CPC", w: 74, num: 1, f: (x) => cpc(x.cpc) }, { k: "intent", t: "Intent", w: 64, f: (x) => intentB(x.intent) },
      { k: "avgRd", t: "Page-1 RDs", w: 96, num: 1, tip: "Average referring domains of the page-1 results", f: (x) => n(x.avgRd) }, { k: "trend", t: "Trend", w: 104, nosort: 1, v: (x) => (x.trend || []).join(" "), f: (x) => spark(x.trend) },
      { k: "source", t: "Source", w: 180, f: (x) => `<span class="muted" style="text-transform:capitalize">${esc(x.source)}</span>` },
    ] });
  });
}

// ---------- SERP checker ----------
const FEATURE = { ai_overview: "AI Overview", organic: "Organic", paid: "Ads", people_also_ask: "People Also Ask", related_searches: "Related searches", video: "Videos", images: "Images", local_pack: "Local pack", featured_snippet: "Featured snippet", discussions_and_forums: "Discussions and forums", top_stories: "Top stories", knowledge_graph: "Knowledge panel", perspectives: "Perspectives", shopping: "Shopping", twitter: "X posts", short_videos: "Short videos" };
async function pageSerp(v, qs, t) {
  head("SERP checker");
  v.innerHTML = `<div class="ph"><div><h1>SERP checker</h1><p>Who ranks on page 1 and how many referring domains each page has. The median and the weakest result show the real link barrier. Also AI Overview sources, People Also Ask and forum results.</p></div></div>`;
  await runner(v, {
    kind: "serp", qs, t, projectId: null,
    form: `<div class="f grow1"><label>Keyword</label><input id="f_kw" placeholder="e.g. best seo tool" value="${esc(qs.get("kw") || "")}"></div>
      <div class="f"><label>Location</label>${locSel("f_loc", 2840)}</div><div class="f"><label>Language</label>${langSel("f_lang", "")}</div>
      <div class="f"><label>Your domain</label><input id="f_dom" style="width:170px" placeholder="optional" value="${esc(proj() ? proj().domain : (S.projects[0] || {}).domain || "")}"></div>
      <div class="f"><label>Depth</label><select id="f_depth" style="width:96px"><option value="10">Top 10</option><option value="20">Top 20</option><option value="50">Top 50</option></select></div>
      <label class="check"><input type="checkbox" id="f_bar" checked>Link barrier</label>`,
    read: () => ({ keyword: $("#f_kw").value, loc: Number($("#f_loc").value), lang: $("#f_lang").value, domain: $("#f_dom").value, depth: Number($("#f_depth").value), barrier: $("#f_bar").checked }),
    fill: (i) => { if (!qs.get("kw")) $("#f_kw").value = i.keyword || ""; if (i.loc) setSel($("#f_loc"), i.loc); setSel($("#f_lang"), i.lang || ""); if (i.domain != null) $("#f_dom").value = i.domain; if (i.depth) setSel($("#f_depth"), i.depth, `Top ${i.depth}`); $("#f_bar").checked = i.barrier !== false; },
    est: (i) => `≈ ${Math.round((1.7 + (i.depth / 10) * 0.115 + (i.barrier ? 2.8 : 0)) * 10) / 10} credits`,
    render: renderSerp,
  });
  if (qs.get("kw") && !qs.get("job")) $("[data-run]", v).click();
}
async function renderSerp(el, r) {
  const m = r.metrics || {}, b = r.barrier;
  const cls = !b || b.min == null ? "" : b.min <= 25 ? "ok" : b.median > 100 ? "hard" : "";
  const verdict = b ? String(b.verdict).replace(/\b1 referring domains\b/, "1 referring domain") : "";
  const you = r.yourPos;
  el.innerHTML = `<div class="rh"><h2>${esc(r.keyword)}</h2><p>${r.organic.length} organic results</p><a class="btn btn-outline btn-sm noprint" style="margin-left:auto" href="#/keywords?kw=${encodeURIComponent(r.keyword)}">${ic("key")}Keyword ideas</a></div>
    ${b ? `<div class="verdict ${cls}">${ic("target")}<span>${esc(verdict)}</span></div>` : ""}
    <div class="stats">${stat("Search volume", n(m.volume), "per month")}${stat("Keyword difficulty", m.kd != null ? `<span class="kd ${kdCls(m.kd)}" style="font-size:16px;height:28px;min-width:36px">${m.kd}</span><span class="kdword">${kdWord(m.kd)}</span>` : "—")}${stat("CPC", cpc(m.cpc))}${b ? stat("Median page-1 RDs", n(b.median), "referring domains") + stat("Weakest page-1 RDs", n(b.min), b.weakest ? `#${b.weakest.pos} · ${esc(hostOf(b.weakest.url))}` : "") : ""}${stat("AI Overview", r.aio.present ? "Yes" : "No", r.aio.present ? plural(r.aio.refs.length, "source") : "")}${stat("Forums in the top 5", n(r.ugcTop5), r.ugcTop5 ? "content gap: Google lacks a dedicated page" : "Reddit, Quora and similar")}${you !== undefined ? stat("Your position", you ? n(you) : "—", you ? "" : `not in the top ${r.organic.length}`) : ""}</div>
    <div class="feat chips" style="margin:0 0 4px"><span class="muted" style="font-size:12.5px;margin-right:4px">SERP features</span>${r.features.map((f) => `<span class="badge badge-secondary">${esc(FEATURE[f] || f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))}</span>`).join("")}</div>
    <div data-org></div>
    <div class="grid2 mt"><div class="card"><div class="card-h">AI Overview sources <span class="muted">${r.aio.refs.length || ""}</span></div><div class="card-b flush"><div class="list">${r.aio.refs.map((x, i) => `<div class="li"><span class="n0">${i + 1}</span><span class="t">${link(x.url, x.title || x.url)}</span><span class="num">${esc(x.domain && x.domain !== "google.com" ? x.domain : x.source || hostOf(x.url))}</span></div>`).join("") || nothing("Google shows no AI Overview for this keyword.")}</div></div></div>
    <div class="card"><div class="card-h">People Also Ask <span class="muted">${r.paa.length || ""}</span></div><div class="card-b flush"><div class="list">${r.paa.map((q) => `<div class="li"><span class="t">${esc(q)}</span><a class="btn btn-ghost btn-xs" href="#/serp?kw=${encodeURIComponent(q)}">SERP${ic("arrow", "sm")}</a></div>`).join("") || nothing("None on this SERP.")}</div></div></div></div>`;
  const rd = new Map(((b && b.pages) || []).map((p) => [p.url, p]));
  const dom = String($("#f_dom") ? $("#f_dom").value : "").replace(/^www\./, "");
  const mine = (u) => dom && (hostOf(u) === dom || hostOf(u).endsWith("." + dom));
  grid($("[data-org]", el), { csv: `serp-${r.keyword}`, search: false, title: "Organic results", rows: r.organic, cols: [
    { k: "pos", t: "#", w: 52, num: 1, f: (x) => `<span class="pos">${x.pos}</span>` },
    { k: "title", t: "Result", w: 520, f: (x) => `<span style="overflow:hidden;text-overflow:ellipsis">${esc(x.title)} <span class="muted">· ${esc(x.domain)}</span></span>${mine(x.url) ? '<span class="tag you">YOU</span>' : ""}` },
    { k: "rd", t: "Page RDs", w: 96, num: 1, tip: "Referring domains linking to this page", v: (x) => (rd.get(x.url) || {}).rd, f: (x) => { const v = (rd.get(x.url) || {}).rd; return v == null ? '<span class="s">—</span>' : b && v === b.min ? `<b class="up">${n(v)}</b>` : n(v); } },
    { k: "dofollowRd", t: "Dofollow", w: 96, num: 1, tip: "Referring domains with a dofollow link", v: (x) => (rd.get(x.url) || {}).dofollowRd ?? (rd.get(x.url) || {}).backlinks, f: (x) => n((rd.get(x.url) || {}).dofollowRd) },
    { k: "url", t: "URL", w: 300, f: (x) => link(x.url) },
  ] });
}

// ---------- project: overview / report ----------
async function pageOverview(v, qs, t) {
  const p = await needProject();
  head("Overview", p.name);
  $("#tactions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="print()">${ic("printer")}Print report</button>`;
  v.innerHTML = `<div class="progress">${ic("loader", "spin")}<span>Loading the report…</span></div>`;
  const setup = (await api(`/api/jobs?kind=setup&project=${p.id}&limit=1`))[0];
  if (setup && setup.status !== "done" && setup.status !== "error") {
    v.innerHTML = `<div class="progress">${ic("loader", "spin")}<span><b>Setting up ${esc(p.domain)}</b> · ${esc(setup.progress || "finding Search Console, GA4 and competitors")}</span></div>`;
    setTimeout(async () => { if (t === S.token) { await loadProjects(); route(); } }, 2500);
    return;
  }
  const r = await api(`/api/projects/${p.id}/report`);
  if (t !== S.token) return;
  Object.assign(p, r.project);
  const g = r.gsc, rk = r.ranks, gc = g.connected !== false;
  const card = (title, href, body, extra = "") => `<div class="card"><div class="card-h">${title}${extra}${more(`#/p/${p.id}/${href}`)}</div><div class="card-b flush">${body}</div></div>`;
  const health = r.audit ? r.audit.health : null;
  v.innerHTML = `<div class="ph"><div><h1>${esc(p.name)}</h1><p class="about">${esc(p.about || p.domain)}</p><div class="chips"><span class="muted" style="font-size:12.5px;margin-right:2px">Competitors</span>${p.competitors.map((c) => `<a class="chip" href="#/site?d=${encodeURIComponent(c)}">${esc(c)}</a>`).join("") || `<a class="lnk" href="#/p/${p.id}/settings">add in settings</a>`}</div></div></div>
    <div class="stats">
      ${gc ? stat("Organic clicks", n(g.totals.cur.clicks), `${delta(g.totals.cur.clicks, g.totals.prev.clicks)} vs previous 28 days`) + stat("Impressions", n(g.totals.cur.impressions), `${delta(g.totals.cur.impressions, g.totals.prev.impressions)} vs previous 28 days`) + stat("Avg position", n1(g.totals.cur.position), g.totals.prev.position ? `${delta(g.totals.cur.position, g.totals.prev.position, true)} was ${n1(g.totals.prev.position)}` : "") : stat("Search Console", "—", `<a class="lnk" href="#/p/${p.id}/settings">Connect in settings</a>`)}
      ${g.ga4 ? stat("GA4 sessions", n(g.ga4.sessions), `${n(g.ga4.engaged)} engaged`) + stat("Key events", n(g.ga4.keyEvents), g.ga4.revenue ? money(g.ga4.revenue) + " revenue" : "last 28 days") : ""}
      ${stat("Site health", health != null ? `<span class="${health >= 80 ? "up" : health < 50 ? "down" : ""}">${health}%</span>` : "—", r.audit ? `${n(r.audit.crawled)} pages crawled` : "no audit yet")}
      ${stat("AI mention rate", r.ai ? r.ai.rate + "%" : "—", r.ai ? "of AI answers name you" : "no run yet")}
      ${stat("Tracked keywords", n(rk.tracked), rk.tracked ? `${n(rk.top3)} in top 3 · ${n(rk.top10)} in top 10` : "none yet")}
    </div>
    ${g.daily && g.daily.length ? `<div class="card"><div class="card-h">Organic clicks<span class="legend"><span><i></i>Search Console · last 28 days</span></span></div><div class="card-b">${areaChart(g.daily.map((d) => [d.day, d.clicks]), "clicks")}</div></div>` : ""}
    <div class="grid2 mt">
      ${card("Top keywords to target", "gap", r.gap && r.gap.shortlist.length ? `<div class="list">${r.gap.shortlist.map((x) => `<div class="li"><span class="n0">${x.rank}</span><span class="t">${kwLink(x.keyword)}</span><span class="num">${n(x.volume)}/mo</span>${x.weakestRd != null ? `<span class="pill" title="Weakest page-1 result">${plural(x.weakestRd, "RD")}</span>` : ""}</div>`).join("")}</div>` : nothing("Run a keyword gap to get the 20 keywords to target first."))}
      ${card("Almost there", "gsc", g.almostThere ? (g.almostThere.length ? `<div class="list">${g.almostThere.map((x) => `<div class="li"><span class="t">${kwLink(x.query)}</span><span class="num">${plural(x.impressions, "impression")}</span><span class="pill">#${n1(x.position)}</span></div>`).join("")}</div>` : nothing("No queries in positions 8–20.")) : nothing("Connect Search Console in settings."), '<span class="muted" style="margin-left:6px">positions 8–20</span>')}
      ${card("Rank movers", "rank", rk.movers.length ? `<div class="list">${rk.movers.map((x) => `<div class="li"><span class="t">${esc(x.keyword)}</span><span class="pos">${n(x.position)}</span>${chg(x.change7)}</div>`).join("")}</div>` : nothing(rk.tracked ? "No rank changes in the last 7 days." : "Track keywords to see movement."), '<span class="muted" style="margin-left:6px">7 days</span>')}
      ${card("AI share of voice", "ai", r.ai && r.ai.shareOfVoice.length ? `<div style="padding:10px 0">${hbars(r.ai.shareOfVoice.map((x) => [x.domain, x.answers, x.you]), Math.max(...r.ai.shareOfVoice.map((x) => x.answers), 1))}</div>${r.ai.gaps.length ? `<div class="list" style="border-top:1px solid var(--border)">${r.ai.gaps.map((x) => `<div class="li"><span class="t" title="${esc(x.prompt)}">${esc(x.prompt)}</span><span class="num">${esc(x.lostTo.join(", "))}</span></div>`).join("")}</div>` : ""}` : nothing(r.ai ? "No brand was named in the latest run." : "Add prompts and run AI visibility."))}
      ${card("Site audit errors", "audit", r.audit ? (Object.entries(r.audit.counts).filter(([id]) => S.meta.rules[id] && S.meta.rules[id][0] === "error").map(([id, c]) => `<div class="li"><span class="issue-sev sev-error"></span><span class="t">${esc(S.meta.rules[id][1])}</span><span class="num">${plural(c, "page")}</span></div>`).join("") || nothing("No errors.")) + (r.audit.diff ? `<div class="desc" style="padding:8px 0 10px">${r.audit.diff.newIssues} new · ${r.audit.diff.fixed} fixed since the last audit</div>` : "") : nothing("Run a site audit. It is free."))}
      ${card("Link gap", "linkgap", r.linkgap && r.linkgap.top.length ? `<div class="list">${r.linkgap.top.map((x) => `<div class="li"><span class="t">${esc(x.domain)}</span><span class="num">links to ${plural(x.count, "competitor")}</span><span class="pill">rank ${x.rank}</span></div>`).join("")}</div>` : nothing("Find the sites that link to your competitors and not to you."), r.linkgap ? `<span class="muted" style="margin-left:6px">${n(r.linkgap.total)} sites</span>` : "")}
      ${card("Referring domains", "backlinks", r.backlinks ? `<div style="padding:10px 0">${hbars(r.backlinks.map((x) => [x.target, x.referringDomains || 0, x.target === p.domain]), Math.max(...r.backlinks.map((x) => x.referringDomains || 0), 1))}</div>` : nothing("Compare backlink profiles with your competitors."), '<span class="muted" style="margin-left:6px">vs competitors</span>')}
    </div>`;
}

// ---------- project: keyword gap ----------
async function pageGap(v, qs, t) {
  const p = await needProject();
  v.innerHTML = `<div class="ph"><div><h1>Keyword gap</h1><p>Keywords your competitors rank in the top 20 for, and you do not. An AI check drops off-topic terms. Each keyword is scored on volume, intent, AI Overview and the real link barrier, and the best 20 make the shortlist.</p></div></div>`;
  await runner(v, {
    kind: "gap", projectId: p.id, qs, t, runLabel: "Find gaps",
    form: `<div class="f grow1"><label>Competitors (1–4)</label><input id="f_comp" value="${esc(p.competitors.join(", "))}" placeholder="rival1.com, rival2.com"></div>
      <div class="f"><label>Keywords per domain</label><select id="f_per" style="width:120px"><option value="1000">1,000</option><option value="2000">2,000</option><option value="5000">5,000</option></select></div>
      <div class="f"><label>Min volume</label><input id="f_minv" type="number" value="50" style="width:90px"></div>
      <div class="f"><label title="Check page-1 referring domains for the top N candidates">Link barrier for</label><select id="f_bt" style="width:110px"><option value="0">Off</option><option value="10">Top 10</option><option value="20" selected>Top 20</option><option value="40">Top 40</option></select></div>`,
    read: () => ({ competitors: $("#f_comp").value.split(/[\s,]+/).filter(Boolean), perDomain: Number($("#f_per").value), minVolume: Number($("#f_minv").value), barrierTop: Number($("#f_bt").value) }),
    fill: (i) => { if (i.competitors && i.competitors.length) $("#f_comp").value = i.competitors.join(", "); if (i.perDomain) setSel($("#f_per"), i.perDomain, n(i.perDomain)); if (i.minVolume != null) $("#f_minv").value = i.minVolume; if (i.barrierTop != null) setSel($("#f_bt"), i.barrierTop, i.barrierTop ? `Top ${i.barrierTop}` : "Off"); },
    est: (i) => `≈ ${Math.round((i.competitors.length * Math.ceil(i.perDomain / 1000) + Math.ceil(Math.max(i.perDomain, 2000) / 1000)) * 13 + i.barrierTop * 4.6 + 2)} credits`,
    render: (el, r) => renderGap(el, r, p),
  });
}
function renderGap(el, r, p) {
  const pulled = Object.values(r.counts).reduce((a, b) => a + b, 0);
  el.innerHTML = `<div class="stats">${stat("Candidates", n(r.candidates), "after brand and fit filters")}${stat("Missing", n(r.missing), "you do not rank at all")}${stat("Weak", n(r.weak), "you rank below 20")}${stat("Keywords compared", n(pulled), Object.entries(r.counts).map(([d, c]) => `${esc(d)} ${c >= 1000 ? Math.round(c / 100) / 10 + "k" : c}`).join(" · "))}</div><div data-tabs></div><div data-tab></div>`;
  const compCols = r.competitors.map((d) => ({ k: "c_" + d, t: d.replace(/\.[a-z.]+$/, ""), tip: `${d} position`, w: 92, num: 1, v: (x) => x.comps[d] ?? null, f: (x) => x.comps[d] ? `<a class="lnk" href="${esc(x.compUrls[d])}" target="_blank" rel="noopener" title="${esc(x.compUrls[d])}">${x.comps[d]}</a>` : '<span class="s">—</span>' }));
  const cols = [
    { k: "rank", t: "#", w: 44, num: 1, f: (x) => `<span class="muted">${x.rank}</span>` },
    { k: "keyword", t: "Keyword", w: 240, f: (x) => kwLink(x.keyword) + aioTag(x.aio) },
    { k: "score", t: "Score", w: 104, num: 1, tip: "Volume × intent × fit ÷ link barrier, scaled 0–100", f: (x) => `<span class="score"><i style="width:${Math.max(2, x.score * 0.62)}%"></i><b>${x.score}</b></span>` },
    { k: "volume", t: "Volume", w: 84, num: 1, f: (x) => n(x.volume) }, { k: "kd", t: "KD", w: 56, num: 1, f: (x) => kdB(x.kd) },
    { k: "intent", t: "Intent", w: 64, f: (x) => intentB(x.intent) },
    { k: "fit", t: "Fit", w: 56, num: 1, tip: "AI fit check: 3 = core buyer keyword, 0 = off-topic", f: (x) => x.fit == null ? '<span class="s">—</span>' : `<span title="${["off-topic", "loose", "related", "core"][x.fit]}">${x.fit}/3</span>` },
    { k: "yourPos", t: "You", w: 60, num: 1, tip: "Your position (blank = not ranking)", f: (x) => x.yourPos ? `<a class="lnk" href="${esc(x.yourUrl)}" target="_blank" rel="noopener" title="${esc(x.yourUrl)}">${x.yourPos}</a>` : '<span class="s">—</span>' },
    ...compCols,
    { k: "weakestRd", t: "Weakest RD", w: 100, num: 1, tip: "Referring domains of the weakest page-1 result (~ = page-1 average, not checked)", v: (x) => x.weakestRd ?? x.avgRd ?? null, csv: (x) => x.weakestRd ?? "", f: (x) => x.weakestRd != null ? `<b class="${x.weakestRd <= 25 ? "up" : ""}" title="${esc(String(x.verdict || "").replace(/\b1 referring domains\b/, "1 referring domain"))}">${n(x.weakestRd)}</b>` : x.avgRd != null ? `<span class="muted" title="Average page-1 referring domains. Not checked yet.">~${n(x.avgRd)}</span>` : '<span class="s">—</span>' },
    { k: "medianRd", t: "Median RD", w: 96, num: 1, tip: "Median referring domains of page-1 results", f: (x) => n(x.medianRd) },
  ];
  const bulk = [{ t: "Track", icon: "trend", fn: (rows, e) => trackKeywords(rows.map((x) => x.keyword), e) }, SAVE, { t: "Add as AI prompts", icon: "bot", fn: async (rows) => { await api(`/api/projects/${p.id}/prompts`, { body: { prompts: rows.map((x) => x.keyword) } }); toast(`Added ${plural(rows.length, "prompt")}`); clearSel(); } }];
  tabs($("[data-tabs]", el), [["top", "Top 20 shortlist"], ["all", `All candidates · ${n(r.rows.length)}`], ["missing", `Missing · ${n(r.missing)}`]], "top", (k) => {
    const rows = k === "top" ? r.rows.filter((x) => x.shortlist) : k === "missing" ? r.rows.filter((x) => x.gap === "missing") : r.rows;
    grid($("[data-tab]", el), { csv: `gap-${p.domain}-${k}`, select: true, bulk, sort: { k: "rank", dir: 1 }, rows, cols, empty: "No candidates. Try more competitors or a lower minimum volume." });
  });
}

// ---------- project: rank tracker ----------
async function pageRank(v, qs, t) {
  const p = await needProject();
  $("#tactions").innerHTML = `<button class="btn btn-outline btn-sm" id="b_imp">${ic("db")}Import from Search Console</button> <button class="btn btn-primary btn-sm" id="b_now">${ic("refresh")}Check now</button>`;
  const rows = await api(`/api/projects/${p.id}/ranks`);
  if (t !== S.token) return;
  const running = (await api(`/api/jobs?kind=rank&project=${p.id}&limit=1`))[0];
  const pos = rows.filter((r) => r.position != null);
  const up = rows.filter((r) => r.change7 > 0).length, down = rows.filter((r) => r.change7 < 0).length;
  v.innerHTML = `<div class="ph"><div><h1>Rank tracker</h1><p>Checked every morning (the <code>ranks</code> job in graphed.yaml), top ${p.rank_depth}, with real result URLs from Serper. Competitor positions come from the same results. About ${cr(rows.length * (p.rank_depth / 10) * 0.115)} credits a day for ${plural(rows.length, "keyword")}.</p></div></div>
    ${running && (running.status === "running" || running.status === "queued") ? `<div class="progress" style="margin:0 0 16px">${ic("loader", "spin")}<span>Checking ranks${running.progress ? " · " + esc(running.progress) : "…"}</span></div>` : ""}
    <div class="stats">${stat("Tracked", n(rows.length), "keywords")}${stat("Top 3", n(pos.filter((r) => r.position <= 3).length))}${stat("Top 10", n(pos.filter((r) => r.position <= 10).length))}${stat("Avg position", pos.length ? n1(pos.reduce((s, r) => s + r.position, 0) / pos.length) : "—", `of ${plural(pos.length, "ranking keyword")}`)}${stat("Improved", up ? `<span class="up">${up}</span>` : "0", "last 7 days")}${stat("Declined", down ? `<span class="down">${down}</span>` : "0", "last 7 days")}</div>
    <div class="card noprint"><div class="formbar"><div class="f grow1"><label>Add keywords</label><textarea id="f_kws" style="min-height:36px;height:36px;font-family:var(--font);font-size:14px;padding-top:7px" placeholder="One per line or comma separated"></textarea></div><div class="fact"><button class="btn btn-primary" id="b_add">${ic("plus")}Add and check</button></div></div></div>
    <div data-g></div>`;
  hydrate(v);
  $("#f_kws").addEventListener("focus", (e) => { e.target.style.height = "84px"; });
  $("#b_add").onclick = async () => { try { const r = await api(`/api/projects/${p.id}/tracked`, { body: { keywords: $("#f_kws").value } }); toast(`Added ${plural(r.added, "keyword")}. Checking now.`); route(); } catch (e) { fail(e); } };
  $("#b_now").onclick = async () => { try { await api(`/api/projects/${p.id}/check-now`, { body: {} }); toast("Rank check started"); route(); } catch (e) { fail(e); } };
  $("#b_imp").onclick = async () => { try { const r = await api(`/api/projects/${p.id}/tracked/import-gsc`, { body: { limit: 50 } }); toast(`Imported ${plural(r.added, "top query", "top queries")}. Press Check now.`); route(); } catch (e) { fail(e); } };
  grid($("[data-g]", v), {
    csv: `ranks-${p.domain}`, key: (x) => x.id, sort: { k: "position", dir: 1 }, rows, select: true, empty: "No keywords yet. Add some above, or import your top Search Console queries.",
    bulk: [{ t: "Stop tracking", icon: "trash", fn: async (sel) => { for (const x of sel) await api(`/api/tracked/${x.id}`, { method: "DELETE" }); toast(`Removed ${plural(sel.length, "keyword")}`); route(); } }],
    onRow: async (x) => {
      const s = await api(`/api/tracked/${x.id}/serp`);
      const mine = (u) => hostOf(u) === p.domain || hostOf(u).endsWith("." + p.domain);
      openDrawer(x.keyword, s ? `<div class="list">${s.top.map((o) => `<div class="li" style="${mine(o.url) ? "background:var(--primary-soft);margin:0 -8px;padding:8px 10px;border-radius:8px" : ""}"><span class="n0">${o.pos}</span><span class="t wrap">${esc(o.title)}<br><span class="muted" style="font-size:12px">${esc(o.url)}</span></span></div>`).join("")}</div>` : nothing("Not checked yet."), "", s ? `Top ${s.top.length} on ${shortDate(String(s.day).slice(0, 10))}` : "");
    },
    cols: [
      { k: "keyword", t: "Keyword", w: 280, f: (x) => `<span>${esc(x.keyword)}</span>` },
      { k: "position", t: "Position", w: 84, num: 1, f: (x) => x.position ? `<span class="pos">${x.position}</span>` : x.checked ? `<span class="muted" title="Not in the top ${p.rank_depth}">&gt;${p.rank_depth}</span>` : `<span class="q">${ic("loader", "sm spin")}</span>` },
      { k: "change1", t: "1d", w: 60, num: 1, f: (x) => chg(x.change1) }, { k: "change7", t: "7d", w: 60, num: 1, f: (x) => chg(x.change7) }, { k: "change30", t: "30d", w: 60, num: 1, f: (x) => chg(x.change30) },
      { k: "best", t: "Best", w: 64, num: 1, f: (x) => n(x.best) },
      ...p.competitors.map((c) => ({ k: "c_" + c, t: c.replace(/\.[a-z.]+$/, ""), tip: `${c} position`, w: 92, num: 1, v: (x) => (x.competitors || {})[c] ?? null, f: (x) => n((x.competitors || {})[c]) })),
      { k: "hist", t: "60 days", w: 104, nosort: 1, f: (x) => rankSpark(x.history) },
      { k: "url", t: "Ranking URL", w: 280, f: (x) => link(x.url) },
      { k: "checked", t: "Checked", w: 96, num: 1, f: (x) => `<span class="muted">${x.checked ? esc(shortDate(String(x.checked).slice(0, 10))) : ""}</span>` },
    ],
  });
}

// ---------- project: Search Console + GA4 ----------
async function pageGsc(v, qs, t) {
  const p = await needProject();
  const days = Number(qs.get("days") || 28);
  $("#tactions").innerHTML = `<select style="width:140px;height:32px;font-size:13px" onchange="go('#/p/${p.id}/gsc?days='+this.value)">${[7, 28, 90].map((d) => `<option value="${d}" ${d === days ? "selected" : ""}>Last ${d} days</option>`).join("")}</select>`;
  v.innerHTML = `<div class="progress">${ic("loader", "spin")}<span>Querying the Graphed warehouse…</span></div>`;
  const r = await api(`/api/projects/${p.id}/gsc?days=${days}`);
  if (t !== S.token) return;
  if (!r.connected) {
    v.innerHTML = `<div class="empty"><div class="card"><div class="ico">${ic("db")}</div><h2>Connect Search Console</h2><p>Search Console and GA4 come from your Graphed warehouse, at no credit cost. Pick the site and the property for ${esc(p.domain)} in Settings. If they are not there, add the Google Search Console and GA4 sources in Graphed first.</p><div class="row"><a class="btn btn-primary" href="#/p/${p.id}/settings">Open settings</a></div></div></div>`;
    return;
  }
  const T = r.totals, ctr = (x) => (x.impressions ? Math.round((x.clicks / x.impressions) * 1000) / 10 : null);
  v.innerHTML = `<div class="ph"><div><h1>Search Console + GA4</h1><p>${esc(r.site)} · last ${r.days} days against the ${r.days} days before. Real Google data from the Graphed warehouse, no credits.</p></div></div>
    <div class="stats">${stat("Clicks", n(T.cur.clicks), delta(T.cur.clicks, T.prev.clicks) + " vs previous")}${stat("Impressions", n(T.cur.impressions), delta(T.cur.impressions, T.prev.impressions) + " vs previous")}${stat("CTR", ctr(T.cur) != null ? ctr(T.cur) + "%" : "—", ctr(T.prev) != null ? `was ${ctr(T.prev)}%` : "")}${stat("Avg position", n1(T.cur.position), T.prev.position ? `${delta(T.cur.position, T.prev.position, true)} was ${n1(T.prev.position)}` : "")}
      ${r.ga4 ? stat("GA4 sessions", n(r.ga4.sessions), `${n(r.ga4.engaged)} engaged`) + stat("Organic sessions", n(r.ga4.organicSessions), r.ga4.sessions ? `${Math.round((r.ga4.organicSessions / r.ga4.sessions) * 100)}% of sessions` : "") + stat("Key events", n(r.ga4.keyEvents)) + (r.ga4.revenue ? stat("Revenue", money(r.ga4.revenue)) : "") : stat("GA4", "—", `<a class="lnk" href="#/p/${p.id}/settings">Connect in settings</a>`)}</div>
    <div class="card"><div class="card-h">Clicks per day<span class="legend"><span><i></i>Search Console · web</span></span></div><div class="card-b">${areaChart(r.daily.map((d) => [d.day, d.clicks]), "clicks")}</div></div>
    <div data-tabs></div><div data-tab></div>`;
  const track = { t: "Track", icon: "trend", fn: (rows, e) => trackKeywords(rows.map((x) => x.query), e) };
  tabs($("[data-tabs]", v), [["almost", `Almost there · ${r.almostThere.length}`], ["lost", `Lost clicks · ${r.lost.length}`], ["can", `Cannibalization · ${r.cannibal.length}`], ["pages", `Pages${r.ga4 ? " + GA4" : ""}`], ...(r.ga4 ? [["src", "Traffic sources"]] : [])], "almost", (k) => {
    const box = $("[data-tab]", v);
    if (k === "almost") grid(box, { csv: "almost-there", key: (x) => x.query, select: true, bulk: [track, SAVE], sort: { k: "impressions", dir: -1 }, rows: r.almostThere, empty: "No non-brand queries in positions 8–20.", cols: [
      { k: "query", t: "Query", w: 340, f: (x) => kwLink(x.query) }, { k: "position", t: "Position", w: 90, num: 1, f: (x) => `<span class="pos">${n1(x.position)}</span>` },
      { k: "impressions", t: "Impressions", w: 120, num: 1, f: (x) => n(x.impressions) }, { k: "clicks", t: "Clicks", w: 80, num: 1, f: (x) => n(x.clicks) }, { k: "page", t: "Page", w: 360, f: (x) => link(x.page) },
    ] });
    if (k === "lost") grid(box, { csv: "lost-clicks", key: (x) => x.query, select: true, bulk: [track], sort: { k: "change", dir: 1 }, rows: r.lost, empty: "No query lost clicks.", cols: [
      { k: "query", t: "Query", w: 340, f: (x) => kwLink(x.query) }, { k: "change", t: "Change", w: 90, num: 1, f: (x) => `<span class="down">${n(x.change)}</span>` },
      { k: "clicks", t: "Clicks now", w: 104, num: 1, f: (x) => n(x.clicks) }, { k: "prevClicks", t: "Before", w: 84, num: 1, f: (x) => n(x.prevClicks) },
      { k: "position", t: "Position now", w: 112, num: 1, f: (x) => n1(x.position) }, { k: "prevPosition", t: "Before", w: 84, num: 1, f: (x) => n1(x.prevPosition) },
    ] });
    if (k === "can") grid(box, { csv: "cannibalization", key: (x) => x.query, sort: { k: "impressions", dir: -1 }, rows: r.cannibal, empty: "No query splits its impressions across pages.", onRow: (x) => openDrawer(x.query, `<div class="list">${x.urls.map((u) => `<div class="li"><span class="t">${link(u.page, pathOf(u.page))}</span><span class="num">${plural(u.impressions, "impression")}</span><span class="pill">#${n1(u.position)}</span></div>`).join("")}</div><div class="note">${ic("alert")}<span>Two or more of your pages compete for this query. Merge them, or make one page the clear target and link to it from the others.</span></div>`, "", plural(x.pages, "page")), cols: [
      { k: "query", t: "Query", w: 340, f: (x) => esc(x.query) }, { k: "pages", t: "Pages", w: 70, num: 1 }, { k: "impressions", t: "Impressions", w: 120, num: 1, f: (x) => n(x.impressions) }, { k: "clicks", t: "Clicks", w: 80, num: 1, f: (x) => n(x.clicks) },
      { k: "urls", t: "Competing pages", w: 400, v: (x) => x.urls.map((u) => u.page).join(" "), f: (x) => `<span class="muted">${esc(x.urls.map((u) => pathOf(u.page)).join("  ·  "))}</span>` },
    ] });
    if (k === "pages") grid(box, { csv: "pages", key: (x) => x.page, sort: { k: "clicks", dir: -1 }, rows: r.pages, cols: [
      { k: "page", t: "Page", w: 340, f: (x) => link(x.page) }, { k: "clicks", t: "Clicks", w: 80, num: 1, f: (x) => n(x.clicks) }, { k: "impressions", t: "Impressions", w: 116, num: 1, f: (x) => n(x.impressions) },
      { k: "position", t: "Position", w: 84, num: 1, f: (x) => n1(x.position) }, { k: "queries", t: "Queries", w: 80, num: 1, f: (x) => n(x.queries) },
      ...(r.ga4 ? [{ k: "sessions", t: "Sessions", w: 90, num: 1, f: (x) => n(x.sessions) }, { k: "engaged", t: "Engaged", w: 90, num: 1, f: (x) => n(x.engaged) }, { k: "rate", t: "Eng. rate", w: 90, num: 1, f: (x) => (x.rate != null ? Math.round(x.rate * 100) + "%" : "—") }, { k: "keyEvents", t: "Key events", w: 100, num: 1, f: (x) => n(x.keyEvents) }, { k: "revenue", t: "Revenue", w: 90, num: 1, f: (x) => money(x.revenue) }] : []),
    ] });
    if (k === "src") { box.innerHTML = `<div class="card mt"><div class="card-h">Sessions by source / medium <span class="muted">GA4</span></div><div class="card-b">${hbars(r.ga4.sources.map((s) => [s.source, s.sessions]), Math.max(...r.ga4.sources.map((s) => s.sessions), 1))}</div></div>`; }
  });
}

// ---------- project: site audit ----------
async function pageAudit(v, qs, t) {
  const p = await needProject();
  v.innerHTML = `<div class="ph"><div><h1>Site audit</h1><p>Crawls ${esc(p.domain)} like a search engine: status codes, redirects, canonicals, noindex, titles, H1s, thin pages, broken links, orphan pages, sitemap and robots.txt. Runs every Monday. Free.</p></div></div>`;
  await runner(v, {
    kind: "audit", projectId: p.id, qs, t, runLabel: "Run audit",
    form: `<div class="f"><label>Pages to crawl</label><select id="f_max" style="width:130px"><option value="100">Up to 100</option><option value="300" selected>Up to 300</option><option value="1000">Up to 1,000</option><option value="2000">Up to 2,000</option></select></div><label class="check"><input type="checkbox" id="f_psi" checked>Lighthouse for the top 4 pages</label>`,
    read: () => ({ maxPages: Number($("#f_max").value), lighthouse: $("#f_psi").checked }),
    fill: (i) => { if (i.maxPages) setSel($("#f_max"), i.maxPages, `Up to ${n(i.maxPages)}`); $("#f_psi").checked = i.lighthouse !== false && i.pagespeed !== false; },
    est: (i) => (i.lighthouse ? "Crawl is free · Lighthouse ≈ 2.3 credits" : "Free"),
    render: renderAudit,
  });
}
function renderAudit(el, r) {
  const R = S.meta.rules, order = ["error", "warning", "notice"];
  const issues = Object.entries(r.counts).map(([id, c]) => ({ id, sev: R[id][0], label: R[id][1], count: c })).sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev) || b.count - a.count);
  const by = (s) => issues.filter((i) => i.sev === s).reduce((x, i) => x + i.count, 0);
  const col = r.health >= 80 ? "#16a34a" : r.health >= 50 ? "#f59e0b" : "#e7000b";
  const ring = `<svg width="30" height="30" viewBox="0 0 36 36" style="flex:none"><circle cx="18" cy="18" r="15.9" fill="none" stroke="#f4f4f5" stroke-width="4"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="${col}" stroke-width="4" stroke-dasharray="${r.health} 100" transform="rotate(-90 18 18)" stroke-linecap="round"/></svg>`;
  el.innerHTML = `<div class="stats">${stat("Health score", `${ring}${r.health}%`, "pages with no errors")}${stat("Pages crawled", n(r.crawled), `${n(r.sitemapUrls)} in the sitemap`)}${stat("Errors", by("error") ? `<span class="down">${n(by("error"))}</span>` : "0")}${stat("Warnings", n(by("warning")))}${stat("Notices", n(by("notice")))}${r.diff ? stat("Since last audit", `<span class="${r.diff.newIssues.length ? "down" : ""}">+${r.diff.newIssues.length}</span><span class="muted" style="font-weight:400">/</span><span class="${r.diff.fixed.length ? "up" : ""}">−${r.diff.fixed.length}</span>`, "new / fixed issues") : ""}</div>
    <div data-tabs></div><div data-tab></div>`;
  const pagesWith = (id) => r.pages.filter((p) => p.issues.some(([x]) => x === id));
  const sevB = (s) => `<span class="issue-sev sev-${s}"></span><span style="text-transform:capitalize">${s}</span>`;
  tabs($("[data-tabs]", el), [["issues", `Issues · ${issues.length}`], ["pages", `Pages · ${r.pages.length}`], ["speed", "Lighthouse"], ...(r.diff ? [["diff", "Changes"]] : [])], "issues", (k) => {
    const box = $("[data-tab]", el);
    if (k === "issues") grid(box, { csv: "audit-issues", key: (x) => x.id, rows: issues, search: false, title: "Issues found", empty: "No issues found.", onRow: (x) => {
      const ps = pagesWith(x.id);
      openDrawer(x.label, ps.length ? `<div class="list">${ps.slice(0, 500).map((p) => { const d = (p.issues.find(([i]) => i === x.id) || [])[1]; return `<div class="li"><span class="t wrap">${link(p.url, pathOf(p.url))}${d ? `<br><span class="muted" style="font-size:12px">${esc(d)}</span>` : ""}</span><span class="pill">${p.status ?? "—"}</span></div>`; }).join("")}</div>` : nothing("This is a site-level issue."), "", `${plural(x.count, "page")} · ${x.sev}`);
    }, cols: [
      { k: "sev", t: "Severity", w: 120, v: (x) => order.indexOf(x.sev), f: (x) => sevB(x.sev) },
      { k: "label", t: "Issue", w: 480, f: (x) => esc(x.label) }, { k: "count", t: "Pages", w: 90, num: 1, f: (x) => n(x.count) },
      { k: "go", t: "", w: 120, nosort: 1, f: () => `<span class="muted" style="font-size:12px">Show pages ${ic("arrow", "sm")}</span>` },
    ] });
    if (k === "pages") grid(box, { csv: "audit-pages", key: (x) => x.url, rows: r.pages, sort: { k: "issuesN", dir: -1 }, cols: [
      { k: "url", t: "URL", w: 340, f: (x) => link(x.url, pathOf(x.url)) }, { k: "status", t: "Status", w: 74, num: 1, f: (x) => x.status >= 400 || !x.status ? `<span class="down">${x.status ?? "—"}</span>` : x.status >= 300 ? `<span class="muted">${x.status}</span>` : x.status },
      { k: "ms", t: "Time", w: 80, num: 1, f: (x) => x.ms != null ? `${n(x.ms)} ms` : "—" },
      { k: "title", t: "Title", w: 280, f: (x) => `<span class="muted">${esc(x.title || "")}</span>` }, { k: "words", t: "Words", w: 74, num: 1, f: (x) => n(x.words) }, { k: "inlinks", t: "Inlinks", w: 76, num: 1 },
      { k: "issuesN", t: "Issues", w: 300, v: (x) => x.issues.length, csv: (x) => x.issues.map(([i]) => i).join(" "), f: (x) => x.issues.length ? `<span class="muted">${esc(x.issues.map(([i]) => R[i][1]).join(" · "))}</span>` : '<span class="up">None</span>' },
    ] });
    if (k === "speed") {
      const sc = (v) => v == null ? "" : `<span class="kd ${v >= 90 ? "kd-g" : v >= 50 ? "kd-y" : "kd-r"}">${v}</span>`, sec = (ms) => (ms != null ? (ms / 1000).toFixed(1) + " s" : "—");
      box.innerHTML = r.speed.length ? r.speed.map((s) => s.error ? `<div class="card mt"><div class="card-h">${link(s.url, pathOf(s.url))}<span class="muted" style="margin-left:auto;padding-right:8px">${esc(s.error)}</span></div></div>`
        : s.scores ? `<div class="card mt"><div class="card-h">${link(s.url, pathOf(s.url))}<span class="muted">mobile</span></div><div class="card-b"><div class="lh">${[["Performance", s.scores.performance], ["Accessibility", s.scores.accessibility], ["Best practices", s.scores.bestPractices], ["SEO", s.scores.seo]].map(([l, v]) => `<div><span class="muted">${l}</span>${sc(v)}</div>`).join("")}<div><span class="muted">LCP</span><b class="${s.lcp > 4000 ? "down" : s.lcp <= 2500 ? "up" : ""}">${sec(s.lcp)}</b></div><div><span class="muted">Blocking time</span><b>${s.tbt != null ? n(s.tbt) + " ms" : "—"}</b></div><div><span class="muted">CLS</span><b>${s.cls ?? "—"}</b></div></div>
          ${s.failed && s.failed.length ? `<div class="list" style="margin-top:10px;border-top:1px solid var(--border)">${s.failed.map((f) => `<div class="li"><span class="issue-sev sev-warning"></span><span class="t">${esc(f.title)}</span><span class="num">${esc(f.value)}</span></div>`).join("")}</div>` : ""}</div></div>`
        : `<div class="card mt"><div class="card-h">${link(s.url, pathOf(s.url))}<span class="muted" style="margin-left:auto;padding-right:8px">score ${s.score} · LCP ${sec(s.lcp ?? s.labLcp)}</span></div></div>`).join("") : `<div class="mt">${nothing("Lighthouse was off for this run.")}</div>`;
      polish(box);
    }
    if (k === "diff") { box.innerHTML = `<div class="grid2 mt"><div class="card"><div class="card-h">New issues <span class="muted">${r.diff.newIssues.length}</span></div><div class="card-b flush"><div class="list">${r.diff.newIssues.slice(0, 300).map(([i, u]) => `<div class="li"><span class="issue-sev sev-${R[i][0]}"></span><span class="t">${esc(R[i][1])}</span><span class="num">${esc(pathOf(u))}</span></div>`).join("") || nothing("None.")}</div></div></div><div class="card"><div class="card-h">Fixed <span class="muted">${r.diff.fixed.length}</span></div><div class="card-b flush"><div class="list">${r.diff.fixed.slice(0, 300).map(([i, u]) => `<div class="li">${ic("check", "sm")}<span class="t">${esc(R[i] ? R[i][1] : i)}</span><span class="num">${esc(pathOf(u))}</span></div>`).join("") || nothing("None.")}</div></div></div></div>`; polish(box); }
  });
}

// ---------- project: AI visibility ----------
async function pageAi(v, qs, t) {
  const p = await needProject();
  const prompts = await api(`/api/projects/${p.id}/prompts`);
  if (t !== S.token) return;
  v.innerHTML = `<div class="ph"><div><h1>AI visibility</h1><p>Buyer questions go to ChatGPT, Perplexity, Gemini and Claude with web search on, several times each because answers change, plus Google AI Overviews. See how often you are named, who is named in your place, and which sites the engines cite. Runs every Monday.</p></div></div>
    <div class="card noprint"><div class="card-h">Prompts <span class="muted">${prompts.length}</span><button class="btn btn-ghost btn-sm" style="margin-left:auto" id="b_sug">${ic("ai")}Suggest prompts</button></div><div class="card-b flush"><div class="list" style="max-height:280px;overflow:auto">${prompts.map((x) => `<div class="li"><span class="t">${esc(x.prompt)}</span><button class="btn btn-ghost btn-xs btn-icon" title="Remove" data-del="${x.id}">${ic("x", "sm")}</button></div>`).join("") || nothing("No prompts yet. Write the questions a buyer asks, or press Suggest prompts.")}</div></div>
    <div class="formbar" style="border-top:1px solid var(--border)"><div class="f grow1"><input id="f_pr" placeholder="Add a prompt, e.g. best seo tool for a small agency (paste many, one per line)"></div><button class="btn btn-outline" id="b_addp">${ic("plus")}Add</button></div></div>
    <div data-run class="mt"></div>`;
  hydrate(v);
  v.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await api(`/api/prompts/${b.dataset.del}`, { method: "DELETE" }); route(); });
  const addP = async () => { const s = $("#f_pr").value.split("\n").map((x) => x.trim()).filter(Boolean); if (!s.length) return; await api(`/api/projects/${p.id}/prompts`, { body: { prompts: s } }).catch(fail); route(); };
  $("#b_addp").onclick = addP;
  $("#f_pr").onkeydown = (e) => { if (e.key === "Enter") addP(); };
  $("#f_pr").onpaste = (e) => { const tx = (e.clipboardData || window.clipboardData).getData("text"); if (tx.includes("\n")) { e.preventDefault(); $("#f_pr").value = tx; addP(); } };
  $("#b_sug").onclick = async () => {
    const b = $("#b_sug"); b.disabled = true; b.innerHTML = `${ic("loader", "spin")}Thinking…`;
    try {
      const r = await api(`/api/projects/${p.id}/prompts/suggest`, { body: {} });
      const ok = await ask({ title: "Suggested prompts", desc: "Untick any you do not want.", ok: "Add selected", body: `<div style="max-height:50vh;overflow:auto;margin-top:8px">${r.prompts.map((x, i) => `<label class="check" style="margin-top:10px"><input type="checkbox" data-sp="${i}" checked><span>${esc(x)}</span></label>`).join("")}</div>`, read: (d) => [...d.querySelectorAll("[data-sp]")].filter((c) => c.checked).map((c) => r.prompts[c.dataset.sp]) });
      if (ok && ok.length) { await api(`/api/projects/${p.id}/prompts`, { body: { prompts: ok } }); route(); }
    } catch (e) { fail(e); } finally { const b = $("#b_sug"); if (b) { b.disabled = false; b.innerHTML = `${ic("ai")}Suggest prompts`; } }
  };
  const eng = S.meta.engines;
  await runner($("[data-run]", v), {
    kind: "ai", projectId: p.id, qs, t, runLabel: "Run check",
    form: `<div class="f"><label>Engines</label><div class="checks">${eng.map((e) => `<label class="check" style="height:auto"><input type="checkbox" data-eng="${e.id}" checked>${esc(e.name)}</label>`).join("")}</div></div>
      <div class="f"><label>Runs per prompt</label><select id="f_runs" style="width:100px"><option value="1">1</option><option value="3" selected>3</option><option value="5">5</option></select></div>`,
    read: () => ({ engines: [...document.querySelectorAll("[data-eng]")].filter((c) => c.checked).map((c) => c.dataset.eng), runs: Number($("#f_runs").value) }),
    fill: (i) => { if (i.runs) setSel($("#f_runs"), i.runs); },
    est: (i) => `≈ ${Math.round(prompts.length * (i.engines.filter((x) => x !== "aio").length * i.runs * 0.8 + (i.engines.includes("aio") ? 0.25 : 0)))} credits for ${plural(prompts.length, "prompt")}`,
    render: async (el, r, job) => {
      renderAi(el, await api(`/api/projects/${p.id}/ai?job=${job.id}`), p, job);
      const tr = await api(`/api/projects/${p.id}/ai/trend`).catch(() => []);
      if (tr.length >= 2) el.insertAdjacentHTML("afterbegin", `<div class="card" style="margin-top:16px"><div class="card-h">Mention rate over time<span class="legend"><span><i></i>% of answers that name you · ${tr.length} runs</span></span></div><div class="card-b">${areaChart(tr.map((x) => [x.day, x.rate]), "% named")}</div></div>`);
    },
  });
}
function renderAi(el, r, p, job) {
  const sov = r.shareOfVoice, max = Math.max(...sov.map((x) => x.answers), 1);
  const failedNote = r.failed ? `<div class="alert" style="margin-bottom:12px">${ic("alert")}<span>${plural(r.failed, "request")} failed in this run and ${r.failed === 1 ? "is" : "are"} not counted. The rates use the ${plural(r.runs, "answer")} that came back.${(r.errors || []).length ? `<br><small>${r.errors.map(esc).join("<br>")}</small>` : ""}</span></div>` : "";
  el.innerHTML = `${failedNote}<div class="stats">${stat("Mention rate", r.rate + "%", `of ${plural(r.runs, "answer")}`)}${r.engines.map((e) => stat(esc(e.name), e.rate + "%", `${e.mentioned} of ${plural(e.runs, "answer")}`)).join("")}</div>
    <div class="grid2"><div class="card"><div class="card-h">Share of voice <span class="muted">answers that name each brand</span></div><div class="card-b">${sov.length ? hbars(sov.map((x) => [x.domain, x.answers, x.you]), max) : nothing("No brand was named in these answers.")}</div></div>
    <div class="card"><div class="card-h">Where a competitor wins</div><div class="card-b flush"><div class="list">${r.gaps.slice(0, 12).map((g) => `<div class="li"><span class="t" title="${esc(g.prompt)}">${esc(g.prompt)}</span><span class="num">${esc(g.lostTo.slice(0, 3).join(", "))}</span><span class="pill">${g.rate}%</span></div>`).join("") || nothing("No prompt where a competitor is named and you are not.")}</div></div></div></div>
    <div data-tabs></div><div data-tab></div>`;
  tabs($("[data-tabs]", el), [["prompts", `Prompts · ${r.prompts.length}`], ["cited", `Cited sites · ${r.cited.length}`]], "prompts", (k) => {
    const box = $("[data-tab]", el);
    if (k === "prompts") grid(box, { csv: "ai-prompts", key: (x) => x.id, rows: r.prompts, sort: { k: "rate", dir: 1 }, onRow: async (x) => {
      const a = await api(`/api/prompts/${x.id}/answers?job=${job.id}`);
      openDrawer(x.prompt, a.map((y) => `<div class="section" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${esc((S.meta.engines.find((e) => e.id === y.engine) || {}).name || y.engine)}<span class="muted" style="font-weight:400">run ${y.run_no}</span>${y.mentioned ? `<span class="pill up">named #${y.position}</span>` : '<span class="pill down">not named</span>'}${y.brands.filter((b) => b !== p.domain).map((b) => `<span class="badge">${esc(b)}</span>`).join("")}</div><div class="answer">${esc(y.answer)}</div>${y.citations.length ? `<div class="chips">${y.citations.slice(0, 12).map((c) => `<a class="chip" href="${esc(c)}" target="_blank" rel="noopener">${esc(hostOf(c))}</a>`).join("")}</div>` : ""}`).join("") || nothing("No answers stored."), "", `${x.rate}% of answers name ${p.domain}`);
    }, cols: [
      { k: "prompt", t: "Prompt", w: 420, f: (x) => esc(x.prompt) }, { k: "rate", t: "Named", w: 84, num: 1, tip: "Share of answers that name you", f: (x) => `<b>${x.rate}%</b>` },
      ...S.meta.engines.map((e) => ({ k: "e_" + e.id, t: e.name.replace("Google ", ""), w: e.id === "aio" ? 104 : 92, num: 1, v: (x) => x.engines[e.id] ? x.engines[e.id].mentioned / x.engines[e.id].runs : null, f: (x) => x.engines[e.id] ? `<span class="${x.engines[e.id].mentioned ? "up" : "muted"}">${x.engines[e.id].mentioned}/${x.engines[e.id].runs}</span>` : '<span class="s">—</span>' })),
      { k: "lostTo", t: "Named instead", w: 260, v: (x) => x.lostTo.join(" "), f: (x) => `<span class="muted">${esc(x.lostTo.join(", "))}</span>` },
    ] });
    if (k === "cited") grid(box, { csv: "ai-cited-sites", key: (x) => x.domain, rows: r.cited, sort: { k: "answers", dir: -1 }, empty: "The engines cited no sites.", cols: [
      { k: "domain", t: "Cited site", w: 320, f: (x) => `${esc(x.domain)}${x.you ? '<span class="tag you">YOU</span>' : ""}` },
      { k: "answers", t: "Answers citing it", w: 150, num: 1 },
      { k: "act", t: "", w: 240, nosort: 1, f: (x) => x.you ? "" : '<span class="muted" style="font-size:12px">Outreach target: pitch a mention or a link</span>' },
    ] });
  });
}

// ---------- save to keyword list (bulk action on every keyword grid) ----------
async function saveToList(rows, e) {
  const items = rows.map((x) => ({ keyword: x.keyword || x.query || x.question, volume: x.volume, kd: x.kd, cpc: x.cpc, intent: x.intent, avgRd: x.avgRd, aio: x.aio })).filter((x) => x.keyword);
  if (!items.length) return;
  const anchor = e.currentTarget;
  e.stopPropagation();
  const lists = await api("/api/lists");
  const add = async (l) => { const r = await api(`/api/lists/${l.id}/keywords`, { body: { keywords: items } }); toast(`Saved ${plural(r.added, "keyword")} to ${l.name}`); clearSel(); };
  menu(e, [{ label: "Save to list" }, ...lists.map((l) => ({ t: `${l.name} · ${l.keywords}`, icon: "list", fn: () => add(l).catch(fail) })), ...(lists.length ? ["-"] : []),
    { t: "New list…", icon: "plus", fn: async () => { const name = await ask({ title: "New keyword list", ok: "Create and save", body: `<label class="label">Name</label><input id="nl_name" placeholder="e.g. Q1 blog targets">`, read: (d) => $("#nl_name", d).value.trim() }); if (name) add(await api("/api/lists", { body: { name } })).catch(fail); } }], anchor);
}
const rankB = (v) => v == null ? '<span class="s">—</span>' : `<span class="kd ${v >= 300 ? "kd-g" : v >= 120 ? "kd-y" : "kd-n"}" title="Rank of the linking site, 0–1,000">${v}</span>`;
const SAVE = { t: "Save to list", icon: "list", fn: (rows, e) => saveToList(rows, e) };

// ---------- Backlinks (any domain, and per project with competitors) ----------
const linksForm = (dom, extra = "") => `${dom}
  <div class="f"><label>Rows per table</label><select id="f_lim" style="width:120px"><option value="500">500</option><option value="1000" selected>1,000</option><option value="3000">3,000</option><option value="5000">5,000</option></select></div>${extra}
  <label class="check"><input type="checkbox" id="f_do">Dofollow only</label><label class="check" title="Off: the best link from each site. On: every link."><input type="checkbox" id="f_all">Every link</label>`;
const linksEst = (i) => `≈ ${Math.round(19.5 + (i.limit / 1000) * 7 * (i.allLinks ? 1.5 : 1) + (i.competitors ? i.competitors.length * 2.8 : 0))} credits`;
async function pageLinks(v, qs, t) {
  head("Backlinks");
  v.innerHTML = `<div class="ph"><div><h1>Backlinks</h1><p>Every site that links to a domain: referring domains, backlinks with anchors, top linked pages, and new and lost links per month.</p></div></div>`;
  await runner(v, {
    kind: "links", qs, t,
    form: linksForm(`<div class="f grow1"><label>Domain</label><input id="f_dom" placeholder="example.com" value="${esc(qs.get("d") || "")}"></div>`),
    read: () => ({ domain: $("#f_dom").value, limit: Number($("#f_lim").value), dofollow: $("#f_do").checked, allLinks: $("#f_all").checked }),
    fill: (i) => { if (!qs.get("d")) $("#f_dom").value = i.domain || ""; setSel($("#f_lim"), i.limit, n(i.limit)); $("#f_do").checked = !!i.dofollow; $("#f_all").checked = !!i.allLinks; },
    est: linksEst, render: (el, r) => renderLinks(el, r, null),
  });
  if (qs.get("d") && !qs.get("job")) $("[data-run]", v).click();
}
async function pageBacklinks(v, qs, t) {
  const p = await needProject();
  v.innerHTML = `<div class="ph"><div><h1>Backlinks</h1><p>Who links to ${esc(p.domain)}: referring domains, backlinks with anchors, top linked pages, new and lost links per month, and your profile next to each competitor.</p></div></div>`;
  await runner(v, {
    kind: "links", projectId: p.id, qs, t,
    form: linksForm(`<div class="f grow1"><label>Compare with</label><input id="f_comp" value="${esc(p.competitors.join(", "))}" placeholder="rival1.com, rival2.com"></div>`),
    read: () => ({ competitors: $("#f_comp").value.split(/[\s,]+/).filter(Boolean), limit: Number($("#f_lim").value), dofollow: $("#f_do").checked, allLinks: $("#f_all").checked }),
    fill: (i) => { if (i.competitors && i.competitors.length) $("#f_comp").value = i.competitors.join(", "); setSel($("#f_lim"), i.limit, n(i.limit)); $("#f_do").checked = !!i.dofollow; $("#f_all").checked = !!i.allLinks; },
    est: linksEst, render: (el, r) => renderLinks(el, r, p),
  });
}
function renderLinks(el, r, p) {
  const s = r.summary || {}, last = r.newLost[r.newLost.length - 1] || {}, T = r.totals || {};
  const nlMax = Math.max(...r.newLost.map((x) => Math.max(x.newRd, x.lostRd)), 1);
  el.innerHTML = `<div class="rh"><h2>${esc(r.domain)}</h2>${p ? "" : `<a class="btn btn-outline btn-sm noprint" style="margin-left:auto" href="#/site?d=${encodeURIComponent(r.domain)}">${ic("globe")}Site Explorer</a>`}</div>
    <div class="stats">${stat("Domain rank", n(s.rank), "0–1,000 scale")}${stat("Referring domains", n(s.referringDomains ?? T.referringDomains), `${n(s.dofollowDomains)} dofollow`)}${stat("Backlinks", n(s.backlinks), `spam score ${n(s.spamScore)}`)}${stat("New referring domains", `<span class="up">+${n(last.newRd)}</span>`, last.date ? `month to ${shortDate(last.date)}` : "last month")}${stat("Lost referring domains", last.lostRd ? `<span class="down">−${n(last.lostRd)}</span>` : "0", "same month")}${stat("Broken backlinks", n(s.brokenBacklinks), plural(s.brokenPages || 0, "broken page"))}</div>
    <div class="grid2"><div class="card"><div class="card-h">Referring domains over time</div><div class="card-b">${areaChart(r.history.map((h) => [h.date, h.referringDomains]), "referring domains")}</div></div>
    <div class="card"><div class="card-h">New and lost referring domains<span class="legend"><span><i style="background:#16a34a"></i>New</span><span><i style="background:#e7000b"></i>Lost</span></span></div><div class="card-b"><div class="bars pair">${r.newLost.map((x) => `<div class="b" title="${esc(shortDate(x.date))}: +${n(x.newRd)} / −${n(x.lostRd)}"><span>${x.newRd ? "+" + n(x.newRd) : ""}</span><div class="two"><i class="g" style="height:${Math.max(2, (x.newRd / nlMax) * 100)}%"></i><i class="l" style="height:${x.lostRd ? Math.max(2, (x.lostRd / nlMax) * 100) : 0}%"></i></div><span class="x">${esc(shortDate(x.date).split(" ")[0])}</span></div>`).join("") || nothing("No history yet.")}</div></div></div></div>
    <div data-tabs></div><div data-tab></div>`;
  const rk = rankB;
  const follow = (x) => x ? '<span class="tag new">DOFOLLOW</span>' : '<span class="tag" style="margin:0">NOFOLLOW</span>';
  const tabsList = [["rd", `Referring domains · ${n(T.referringDomains)}`], ["bl", `Backlinks · ${n(T.backlinks)}`], ["an", `Anchors · ${n(T.anchors)}`], ["pg", `Top linked pages · ${n(T.pages)}`], ...(r.compare && r.compare.length > 1 ? [["cmp", "vs competitors"]] : []), ["pro", "Profile"]];
  tabs($("[data-tabs]", el), tabsList, r.compare && r.compare.length > 1 && p ? "rd" : "rd", (k) => {
    const box = $("[data-tab]", el);
    const shown = (rows, total) => (total != null && total > rows.length ? (v) => `top ${n(rows.length)} of ${n(total)} by rank` : null);
    if (k === "rd") grid(box, { csv: `${r.domain}-referring-domains`, key: (x) => x.domain, sort: { k: "rank", dir: -1 }, rows: r.referringDomains, foot: shown(r.referringDomains, T.referringDomains), onRow: (x) => go(`#/site?d=${encodeURIComponent(x.domain)}`), cols: [
      { k: "domain", t: "Referring domain", w: 300, f: (x) => esc(x.domain) }, { k: "rank", t: "Rank", w: 76, num: 1, f: (x) => rk(x.rank) },
      { k: "backlinks", t: "Links to target", w: 130, num: 1, f: (x) => n(x.backlinks) }, { k: "dofollow", t: "Type", w: 110, v: (x) => (x.dofollow ? 1 : 0), f: (x) => follow(x.dofollow) },
      { k: "spam", t: "Spam", w: 70, num: 1, f: (x) => x.spam ? `<span class="${x.spam >= 50 ? "down" : ""}">${x.spam}</span>` : "0" },
      { k: "firstSeen", t: "First seen", w: 120, num: 1, f: (x) => `<span class="muted">${x.firstSeen ? esc(shortDate(x.firstSeen) + " " + x.firstSeen.slice(0, 4)) : "—"}</span>` },
      { k: "lost", t: "Status", w: 120, f: (x) => x.lost ? `<span class="down">Lost ${esc(shortDate(x.lost))}</span>` : '<span class="muted">Live</span>' },
    ] });
    if (k === "bl") grid(box, { csv: `${r.domain}-backlinks`, key: (x) => x.from + "|" + x.to + "|" + x.anchor, sort: { k: "domainRank", dir: -1 }, rows: r.backlinks, foot: shown(r.backlinks, T.backlinks), cols: [
      { k: "from", t: "Linking page", w: 380, v: (x) => x.from, f: (x) => `<span style="overflow:hidden;text-overflow:ellipsis">${link(x.from, x.title || x.from)} <span class="muted">· ${esc(x.domainFrom)}</span></span>` },
      { k: "domainRank", t: "Rank", w: 70, num: 1, f: (x) => rk(x.domainRank) },
      { k: "anchor", t: "Anchor", w: 240, f: (x) => x.anchor ? esc(x.anchor) : `<span class="muted">${x.type === "image" ? "(image)" : "(no text)"}</span>` },
      { k: "to", t: "Target page", w: 220, f: (x) => link(x.to) }, { k: "dofollow", t: "Type", w: 106, v: (x) => (x.dofollow ? 1 : 0), f: (x) => follow(x.dofollow) },
      { k: "firstSeen", t: "First seen", w: 110, num: 1, f: (x) => `<span class="muted">${x.firstSeen ? esc(shortDate(x.firstSeen) + " " + x.firstSeen.slice(2, 4)) : "—"}</span>${x.isNew ? '<span class="tag new" style="margin-left:6px">NEW</span>' : ""}` },
    ] });
    if (k === "an") grid(box, { csv: `${r.domain}-anchors`, key: (x) => x.anchor, sort: { k: "referringDomains", dir: -1 }, rows: r.anchors, cols: [
      { k: "anchor", t: "Anchor text", w: 460, f: (x) => esc(x.anchor) }, { k: "referringDomains", t: "Referring domains", w: 150, num: 1, f: (x) => n(x.referringDomains) },
      { k: "backlinks", t: "Backlinks", w: 110, num: 1, f: (x) => n(x.backlinks) }, { k: "firstSeen", t: "First seen", w: 130, num: 1, f: (x) => `<span class="muted">${x.firstSeen ? esc(shortDate(x.firstSeen) + " " + x.firstSeen.slice(0, 4)) : "—"}</span>` },
    ] });
    if (k === "pg") grid(box, { csv: `${r.domain}-linked-pages`, key: (x) => x.url, sort: { k: "referringDomains", dir: -1 }, rows: r.pages, cols: [
      { k: "url", t: "Page", w: 460, f: (x) => link(x.url) }, { k: "referringDomains", t: "Referring domains", w: 150, num: 1, f: (x) => n(x.referringDomains) },
      { k: "dofollowDomains", t: "Dofollow", w: 100, num: 1, f: (x) => n(x.dofollowDomains) }, { k: "backlinks", t: "Backlinks", w: 110, num: 1, f: (x) => n(x.backlinks) }, { k: "rank", t: "Page rank", w: 100, num: 1, f: (x) => n(x.rank) },
    ] });
    if (k === "cmp") grid(box, { csv: "backlinks-compare", key: (x) => x.target, search: false, title: "Backlink profiles", rows: r.compare, cols: [
      { k: "target", t: "Domain", w: 240, f: (x) => `${esc(x.target)}${x.target === r.domain ? '<span class="tag you">YOU</span>' : ""}` },
      { k: "rank", t: "Rank", w: 76, num: 1, f: (x) => n(x.rank) }, { k: "referringDomains", t: "Ref. domains", w: 116, num: 1, f: (x) => n(x.referringDomains) },
      { k: "dofollowDomains", t: "Dofollow", w: 96, num: 1, f: (x) => n(x.dofollowDomains) }, { k: "backlinks", t: "Backlinks", w: 104, num: 1, f: (x) => n(x.backlinks) },
      { k: "referringSubnets", t: "Subnets", w: 86, num: 1, f: (x) => n(x.referringSubnets) }, { k: "spamScore", t: "Spam", w: 70, num: 1, f: (x) => n(x.spamScore) }, { k: "brokenBacklinks", t: "Broken", w: 80, num: 1, f: (x) => n(x.brokenBacklinks) },
    ] });
    if (k === "pro") { box.innerHTML = blBreakdown(s, true); polish(box); }
  });
}

// ---------- project: link gap ----------
async function pageLinkgap(v, qs, t) {
  const p = await needProject();
  v.innerHTML = `<div class="ph"><div><h1>Link gap</h1><p>Sites that link to your competitors and not to ${esc(p.domain)}. A site that links to two or more of them is the best outreach target: it links to sites like yours.</p></div></div>`;
  await runner(v, {
    kind: "linkgap", projectId: p.id, qs, t, runLabel: "Find link gaps",
    form: `<div class="f grow1"><label>Competitors (1–4)</label><input id="f_comp" value="${esc(p.competitors.join(", "))}" placeholder="rival1.com, rival2.com"></div>
      <div class="f"><label>Sites to pull</label><select id="f_lim" style="width:120px"><option value="500">500</option><option value="1000" selected>1,000</option><option value="3000">3,000</option><option value="5000">5,000</option></select></div>`,
    read: () => ({ competitors: $("#f_comp").value.split(/[\s,]+/).filter(Boolean), limit: Number($("#f_lim").value) }),
    fill: (i) => { if (i.competitors && i.competitors.length) $("#f_comp").value = i.competitors.join(", "); setSel($("#f_lim"), i.limit, n(i.limit)); },
    est: (i) => `≈ ${Math.round((i.competitors.length + (i.competitors.length > 1 ? 1 : 0)) * (2.8 + (i.limit / 1000) * 3.5))} credits`,
    render: (el, r) => {
      const N = r.competitors.length, clean = r.rows.filter((x) => x.dofollow && x.spam < 30 && x.rank >= 100);
      el.innerHTML = `<div class="stats">${stat("Sites in the gap", n(r.rows.length), r.perCompetitor ? Object.entries(r.perCompetitor).map(([c, t]) => `${esc(c)} ${t >= 1000 ? Math.round(t / 100) / 10 + "k" : t}`).join(" · ") : "")}${N > 1 ? stat(`Link to all ${N}`, n(r.all)) : ""}${N > 2 ? stat("Link to 2 or more", n(r.multi), "among the loaded sites") : ""}${stat("Strong targets", n(clean.length), "dofollow, rank 100+, low spam")}</div><div data-tabs></div><div data-tab></div>`;
      const cols = [
        { k: "domain", t: "Site", w: 300, f: (x) => `<a class="lnk" href="https://${esc(x.domain)}" target="_blank" rel="noopener noreferrer">${esc(x.domain)}</a>` },
        { k: "rank", t: "Rank", w: 76, num: 1, tip: "Rank of the linking site, 0–1,000", f: (x) => rankB(x.rank) },
        ...(N > 1 ? [{ k: "count", t: "Links to", w: 96, num: 1, tip: "How many of your competitors this site links to", f: (x) => `<b>${x.count}</b><span class="muted">/${N}</span>` }] : []),
        ...r.competitors.map((c) => ({ k: "c_" + c, t: c.replace(/\.[a-z.]+$/, ""), tip: `Links to ${c}`, w: 100, num: 1, v: (x) => x.links[c] ?? null, f: (x) => (x.links[c] ? n(x.links[c]) : '<span class="s">—</span>') })),
        { k: "dofollow", t: "Type", w: 110, v: (x) => (x.dofollow ? 1 : 0), f: (x) => x.dofollow ? '<span class="tag new">DOFOLLOW</span>' : '<span class="tag" style="margin:0">NOFOLLOW</span>' },
        { k: "spam", t: "Spam", w: 70, num: 1, f: (x) => x.spam ? `<span class="${x.spam >= 50 ? "down" : ""}">${x.spam}</span>` : "0" },
        { k: "firstSeen", t: "Newest link", w: 120, num: 1, tip: "Recent links show what still works", f: (x) => `<span class="muted">${x.firstSeen ? esc(shortDate(x.firstSeen) + " " + x.firstSeen.slice(0, 4)) : "—"}</span>` },
      ];
      tabs($("[data-tabs]", el), [["strong", `Strong targets · ${n(clean.length)}`], ...(N > 1 ? [["multi", `Link to 2+ · ${n(r.multi)}`]] : []), ["all", `All · ${n(r.rows.length)}`]], "strong", (k) => {
        const rows = k === "strong" ? clean : k === "multi" ? r.rows.filter((x) => x.count >= 2) : r.rows;
        grid($("[data-tab]", el), { csv: `link-gap-${p.domain}-${k}`, key: (x) => x.domain, rows, cols, sort: N > 1 ? { k: "count", dir: -1 } : { k: "rank", dir: -1 }, empty: "No sites in this view." });
      });
    },
  });
}

// ---------- AI mentions (what AI answers already say) ----------
async function pageMentions(v, qs, t) {
  head("AI mentions");
  v.innerHTML = `<div class="ph"><div><h1>AI mentions</h1><p>Questions where Google AI Overviews and ChatGPT already cite a domain, or answer about a keyword. Shows the answer, the sites it cites, and how often people ask. No prompts are run: this reads a database of real AI answers.</p></div></div>`;
  await runner(v, {
    kind: "mentions", qs, t, runLabel: "Look up",
    form: `<div class="f grow1"><label>Domain or keyword</label><input id="f_t" placeholder="example.com, or a topic like seo tool" value="${esc(qs.get("q") || "")}"></div>
      <div class="f"><label>Location</label>${locSel("f_loc", 2840)}</div><div class="f"><label>Language</label>${langSel("f_lang", "")}</div>
      <div class="f"><label>Questions per engine</label><select id="f_lim" style="width:110px"><option>50</option><option selected>100</option><option>300</option></select></div>
      <div class="f"><label>Engines</label><div class="checks"><label class="check" style="height:auto"><input type="checkbox" id="f_g" checked>Google AI</label><label class="check" style="height:auto"><input type="checkbox" id="f_c" checked>ChatGPT</label></div></div>`,
    read: () => ({ target: $("#f_t").value, loc: Number($("#f_loc").value), lang: $("#f_lang").value, limit: Number($("#f_lim").value), platforms: [$("#f_g").checked && "google", $("#f_c").checked && "chat_gpt"].filter(Boolean) }),
    fill: (i) => { if (!qs.get("q")) $("#f_t").value = i.target || ""; setSel($("#f_loc"), i.loc); setSel($("#f_lang"), i.lang || ""); setSel($("#f_lim"), i.limit); if (i.platforms) { $("#f_g").checked = i.platforms.includes("google"); $("#f_c").checked = i.platforms.includes("chat_gpt"); } },
    est: (i) => `≈ ${Math.round(23.2 + i.platforms.length * (11.5 + i.limit * 0.115))} credits`,
    render: (el, r) => {
      const PL = { google: "Google AI", chat_gpt: "ChatGPT" }, dmax = Math.max(...r.citedDomains.map((d) => d.mentions), 1);
      el.innerHTML = `<div class="rh"><h2>${esc(r.target)}</h2><p>${r.kind === "domain" ? "AI answers that cite this site" : "AI answers about this topic"}</p></div>
        <div class="stats">${stat("AI answers", n(r.mentions), "in the database")}${stat("AI search volume", n(r.volume), "monthly, all questions")}${r.platforms.map((p) => stat(PL[p.key] || p.key, n(p.mentions), `${n(p.volume)} search volume`)).join("")}</div>
        <div class="grid2"><div class="card"><div class="card-h">Most cited sites <span class="muted">in these answers</span></div><div class="card-b">${r.citedDomains.length ? hbars(r.citedDomains.slice(0, 10).map((d) => [d.domain, d.mentions, d.you]), dmax) : nothing("No cited sites.")}</div></div>
        <div class="card"><div class="card-h">Brands named <span class="muted">in these answers</span></div><div class="card-b">${r.brands.length ? hbars(r.brands.slice(0, 10).map((b) => [b.key, b.mentions]), Math.max(...r.brands.map((b) => b.mentions), 1)) : nothing("The database has no brand names for these answers.")}</div></div></div>
        <div data-tabs></div><div data-tab></div>`;
      tabs($("[data-tabs]", el), [["q", `Questions · ${n(r.questions.length)}`], ["d", `Cited sites · ${r.citedDomains.length}`], ["p", `Top cited pages · ${r.topPages.length}`]], "q", (k) => {
        const box = $("[data-tab]", el);
        if (k === "q") grid(box, { csv: `ai-mentions-${r.target}`, key: (x) => x.platform + "|" + x.question, rows: r.questions, sort: { k: "volume", dir: -1 }, select: true, empty: "No AI answers found.",
          bulk: [SAVE, { t: "Add as AI prompts", icon: "bot", fn: (rows, e) => { const add = async (p) => { await api(`/api/projects/${p.id}/prompts`, { body: { prompts: rows.map((x) => x.question) } }); toast(`Added ${plural(rows.length, "prompt")} to ${p.name}`); clearSel(); }; if (!S.projects.length) return toast("Create a project first", 3000, true); S.projects.length === 1 ? add(S.projects[0]).catch(fail) : menu(e, S.projects.map((p) => ({ t: p.name, icon: "target", fn: () => add(p).catch(fail) }))); } }],
          onRow: (x) => openDrawer(x.question, `<div class="section" style="margin-top:0">${esc(PL[x.platform] || x.platform)} answer</div><div class="answer" style="max-height:340px">${esc(x.answer || "(no answer text stored)")}</div><div class="section">Sources cited</div><div class="list">${x.sources.map((s, i) => `<div class="li"><span class="n0">${i + 1}</span><span class="t">${link(s.url, s.title || s.url)}</span><span class="num">${esc(s.domain)}</span></div>`).join("") || nothing("None.")}</div>`, "", `${n(x.volume)} AI searches a month · last seen ${esc(x.lastSeen || "—")}`),
          cols: [
            { k: "question", t: "Question", w: 460, f: (x) => esc(x.question) }, { k: "platform", t: "Engine", w: 110, f: (x) => `<span class="muted">${esc(PL[x.platform] || x.platform)}</span>` },
            { k: "volume", t: "AI volume", w: 100, num: 1, tip: "Estimated monthly AI searches for this question", f: (x) => n(x.volume) },
            ...(r.kind === "domain" ? [{ k: "yourPosition", t: "Cited as", w: 96, num: 1, tip: "Position of the domain among the cited sources", f: (x) => x.yourPosition ? `<b>#${x.yourPosition}</b>` : '<span class="s">—</span>' }] : []),
            { k: "sourceCount", t: "Sources", w: 84, num: 1 }, { k: "src", t: "Cited sites", w: 320, nosort: 1, v: (x) => x.sources.map((s) => s.domain).join(" "), f: (x) => `<span class="muted">${esc([...new Set(x.sources.map((s) => s.domain))].slice(0, 4).join(" · "))}</span>` },
          ] });
        if (k === "d") grid(box, { csv: `ai-cited-sites-${r.target}`, key: (x) => x.domain, rows: r.citedDomains, sort: { k: "mentions", dir: -1 }, onRow: (x) => go(`#/mentions?q=${encodeURIComponent(x.domain)}`), cols: [
          { k: "domain", t: "Cited site", w: 340, f: (x) => `${esc(x.domain)}${x.you ? '<span class="tag you">YOU</span>' : ""}` }, { k: "mentions", t: "AI answers", w: 120, num: 1, f: (x) => n(x.mentions) }, { k: "volume", t: "AI search volume", w: 150, num: 1, f: (x) => n(x.volume) },
        ] });
        if (k === "p") grid(box, { csv: `ai-top-pages-${r.target}`, key: (x) => x.url, rows: r.topPages, sort: { k: "mentions", dir: -1 }, cols: [
          { k: "url", t: "Page", w: 520, f: (x) => link(x.url, x.url.replace(/^https?:\/\/(www\.)?/, "")) }, { k: "mentions", t: "AI answers", w: 110, num: 1, f: (x) => n(x.mentions) },
          { k: "google", t: "Google AI", w: 100, num: 1, f: (x) => n(x.google) }, { k: "chatgpt", t: "ChatGPT", w: 100, num: 1, f: (x) => n(x.chatgpt) }, { k: "volume", t: "AI search volume", w: 150, num: 1, f: (x) => n(x.volume) },
        ] });
      });
    },
  });
  if (qs.get("q") && !qs.get("job")) $("[data-run]", v).click();
}

// ---------- project: local rank grid ----------
async function pageLocal(v, qs, t) {
  const p = await needProject();
  v.innerHTML = `<div class="ph"><div><h1>Local rank grid</h1><p>Where a business ranks in Google Maps for one keyword, at each point of a grid around it. Rank changes street by street, so one number is not enough.</p></div></div>`;
  await runner(v, {
    kind: "local", projectId: p.id, qs, t, runLabel: "Check grid",
    form: `<div class="f grow1"><label>Business (name + city)</label><input id="f_biz" placeholder="e.g. Blue Bottle Coffee Oakland"></div>
      <div class="f"><label>Keyword</label><input id="f_kw" style="width:200px" placeholder="e.g. coffee shop"></div>
      <div class="f"><label>Grid</label><select id="f_size" style="width:100px"><option value="3">3 × 3</option><option value="5" selected>5 × 5</option><option value="7">7 × 7</option></select></div>
      <div class="f"><label>Point spacing</label><select id="f_km" style="width:110px"><option value="0.8">0.5 mi</option><option value="1.6" selected>1 mi</option><option value="3.2">2 mi</option><option value="8">5 mi</option></select></div>`,
    read: () => ({ business: $("#f_biz").value, keyword: $("#f_kw").value, size: Number($("#f_size").value), spacingKm: Number($("#f_km").value) }),
    fill: (i) => { $("#f_biz").value = i.business || ""; $("#f_kw").value = i.keyword || ""; setSel($("#f_size"), i.size, `${i.size} × ${i.size}`); setSel($("#f_km"), i.spacingKm, `${i.spacingKm} km`); },
    est: (i) => `≈ ${Math.round((i.size * i.size + 1) * 0.345 * 10) / 10} credits`,
    render: (el, r) => {
      const cls = (k) => (k == null ? "none" : k <= 3 ? "a" : k <= 10 ? "b" : "c");
      el.innerHTML = `<div class="rh"><h2>${esc(r.business.title)}</h2><p>${esc(r.business.address)}</p></div>
        <div class="stats">${stat("Average rank", r.avgRank != null ? n1(r.avgRank) : "—", `for "${esc(r.keyword)}"`)}${stat("In the top 3", `${r.top3}<span class="muted" style="font-size:15px;font-weight:500">/ ${r.total} points</span>`)}${stat("Found in the top 20", `${r.found}<span class="muted" style="font-size:15px;font-weight:500">/ ${r.total} points</span>`)}${stat("Rating", r.business.rating != null ? `${r.business.rating} ★` : "—", r.business.reviews != null ? plural(r.business.reviews, "review") : "")}</div>
        <div class="grid2"><div class="card"><div class="card-h">Rank at each point <span class="muted">north is up · ${r.spacingKm} km apart</span></div><div class="card-b"><div class="lgrid" style="grid-template-columns:repeat(${r.size},1fr)">${r.grid.map((g) => `<div class="pt ${cls(g.rank)} ${g.r === (r.size - 1) / 2 && g.c === (r.size - 1) / 2 ? "me" : ""}" title="${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}&#10;Top 3: ${esc(g.top.join(" · "))}">${g.rank ?? "20+"}</div>`).join("")}</div>
          <div class="legend" style="margin:14px 0 0;padding:0"><span><i style="background:#16a34a"></i>Top 3</span><span><i style="background:#f59e0b"></i>4–10</span><span><i style="background:#fb923c"></i>11–20</span><span><i style="background:#e4e4e7"></i>Not found</span></div></div></div>
        <div data-c></div></div>`;
      grid($("[data-c]", el), { csv: `local-competitors-${r.keyword}`, key: (x) => x.title, search: false, title: "Who ranks around you", rows: r.competitors, sort: { k: "top3", dir: -1 }, height: 420, cols: [
        { k: "title", t: "Business", w: 240, f: (x) => x.website ? `<a class="lnk" href="${esc(x.website)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title) },
        { k: "top3", t: "Top 3", w: 70, num: 1, tip: "Grid points where it ranks in the top 3" }, { k: "avgRank", t: "Avg rank", w: 90, num: 1, f: (x) => n1(x.avgRank) },
        { k: "rating", t: "Rating", w: 76, num: 1, f: (x) => x.rating ?? "—" }, { k: "reviews", t: "Reviews", w: 90, num: 1, f: (x) => n(x.reviews) },
      ] });
    },
  });
  if (!$("#f_biz").value) $("#f_biz").value = p.name === p.domain ? "" : p.name;
}

// ---------- keyword lists ----------
async function pageLists(v, qs, t) {
  head("Keyword lists");
  const lists = await api("/api/lists");
  if (t !== S.token) return;
  const id = Number(parseHash().parts[1]) || (lists[0] && lists[0].id) || null;
  const newList = `<button class="btn btn-outline btn-sm" id="l_new">${ic("plus")}New list</button>`;
  v.innerHTML = `<div class="ph"><div><h1>Keyword lists</h1><p>Keywords you saved from any page. Refresh their numbers, see who ranks for them, or send them to the rank tracker.</p></div></div>
    <div class="card noprint"><div class="recent" style="border-top:0;border-radius:12px"><span class="hl">${ic("list", "sm")}Lists</span>${lists.map((l) => `<span class="chip ${l.id === id ? "on" : ""}" onclick="go('#/lists/${l.id}')">${esc(l.name)}<span class="muted">${l.keywords}</span></span>`).join("") || '<span class="muted" style="font-size:13px">No lists yet. Select keywords on any page and press Save to list.</span>'}<span class="grow"></span>${newList}</div></div><div data-l></div>`;
  hydrate(v);
  $("#l_new").onclick = async () => { const name = await ask({ title: "New keyword list", ok: "Create", body: `<label class="label">Name</label><input id="nl_name" placeholder="e.g. Q1 blog targets">`, read: (d) => $("#nl_name", d).value.trim() }); if (name) { const l = await api("/api/lists", { body: { name } }).catch(fail); if (l) go(`#/lists/${l.id}`); } };
  if (!id) return;
  const { list, rows } = await api(`/api/lists/${id}`);
  if (t !== S.token) return;
  const box = $("[data-l]", v), vol = rows.reduce((s, r) => s + (r.volume || 0), 0), withKd = rows.filter((r) => r.kd != null);
  $("#tactions").innerHTML = `<button class="btn btn-outline btn-sm" id="l_ref" title="≈ ${cr(Math.ceil(rows.length / 700) * 1.4 + rows.length * 0.0115)} credits">${ic("refresh")}Refresh metrics</button> <button class="btn btn-outline btn-sm" id="l_who" title="≈ 3 credits">${ic("users")}Who ranks</button> <button class="btn btn-ghost btn-sm btn-icon" id="l_del" title="Delete list" style="color:var(--destructive)">${ic("trash")}</button>`;
  box.innerHTML = `<div class="rh"><h2>${esc(list.name)}</h2><p>${plural(rows.length, "keyword")}</p></div>
    <div class="stats">${stat("Keywords", n(rows.length))}${stat("Total volume", n(vol), "searches a month")}${stat("Average KD", withKd.length ? Math.round(withKd.reduce((s, r) => s + r.kd, 0) / withKd.length) : "—")}${stat("Easy keywords", n(rows.filter((r) => r.kd != null && r.kd < 30).length), "KD under 30")}</div>
    <div class="card noprint"><div class="formbar"><div class="f grow1"><label>Add keywords</label><textarea id="l_add" style="min-height:36px;height:36px;font-family:var(--font);font-size:14px;padding-top:7px" placeholder="One per line or comma separated"></textarea></div><div class="fact"><button class="btn btn-primary" id="l_addb">${ic("plus")}Add</button></div></div></div>
    <div data-g></div><div data-who></div>`;
  hydrate(v);
  $("#l_add").addEventListener("focus", (e) => { e.target.style.height = "84px"; });
  $("#l_addb").onclick = async () => { const r = await api(`/api/lists/${id}/keywords`, { body: { keywords: $("#l_add").value } }).catch(fail); if (r) { toast(`Added ${plural(r.added, "keyword")}. Press Refresh metrics for their numbers.`); route(); } };
  $("#l_ref").onclick = async () => { const b = $("#l_ref"); b.disabled = true; b.innerHTML = `${ic("loader", "spin")}Refreshing…`; try { const r = await api(`/api/lists/${id}/refresh`, { body: {} }); toast(`Refreshed ${r.refreshed} of ${plural(r.keywords, "keyword")}`); route(); } catch (e) { fail(e); b.disabled = false; } };
  $("#l_del").onclick = async () => { if (await ask({ title: `Delete ${list.name}?`, desc: "The list and its saved keywords are removed. Tracked keywords stay.", ok: "Delete list", danger: true })) { await api(`/api/lists/${id}`, { method: "DELETE" }); go("#/lists"); } };
  $("#l_who").onclick = async () => {
    const b = $("#l_who"); b.disabled = true; b.innerHTML = `${ic("loader", "spin")}Looking…`;
    try {
      const r = await api(`/api/lists/${id}/competitors`, { body: {} });
      $("[data-who]", box).innerHTML = `<div class="rh"><h2>Who ranks for this list</h2><p>top ${plural(r.keywords, "keyword")} by volume</p></div><div data-wg></div>`;
      grid($("[data-wg]", box), { csv: `list-${list.name}-competitors`, key: (x) => x.domain, rows: r.domains, sort: { k: "keywords", dir: -1 }, onRow: (x) => go(`#/site?d=${encodeURIComponent(x.domain)}`), height: 420, cols: [
        { k: "domain", t: "Domain", w: 300, f: (x) => esc(x.domain) }, { k: "keywords", t: "Keywords ranked", w: 140, num: 1, f: (x) => `<b>${n(x.keywords)}</b><span class="muted">/${r.keywords}</span>` },
        { k: "avgPos", t: "Avg position", w: 120, num: 1, f: (x) => n1(x.avgPos) }, { k: "etv", t: "Est. traffic", w: 120, num: 1, f: (x) => n(x.etv) }, { k: "visibility", t: "Visibility", w: 110, num: 1, f: (x) => x.visibility ?? "—" },
      ] });
      $("[data-who]", box).scrollIntoView({ behavior: "smooth" });
    } catch (e) { fail(e); } finally { b.disabled = false; b.innerHTML = `${ic("users")}Who ranks`; }
  };
  grid($("[data-g]", box), { csv: `list-${list.name}`, key: (x) => x.keyword, rows, sort: { k: "volume", dir: -1 }, select: true, empty: "This list is empty. Add keywords above, or save them from any keyword table.",
    bulk: [{ t: "Track", icon: "trend", fn: (sel, e) => trackKeywords(sel.map((x) => x.keyword), e) }, { t: "Remove", icon: "trash", fn: async (sel) => { await api(`/api/lists/${id}/remove`, { body: { keywords: sel.map((x) => x.keyword) } }); toast(`Removed ${plural(sel.length, "keyword")}`); route(); } }],
    cols: [
      { k: "keyword", t: "Keyword", w: 360, f: (x) => kwLink(x.keyword) + aioTag(x.aio) }, { k: "volume", t: "Volume", w: 90, num: 1, f: (x) => n(x.volume) }, { k: "kd", t: "KD", w: 60, num: 1, f: (x) => kdB(x.kd) },
      { k: "cpc", t: "CPC", w: 80, num: 1, f: (x) => cpc(x.cpc) }, { k: "intent", t: "Intent", w: 70, f: (x) => intentB(x.intent) }, { k: "avgRd", t: "Page-1 RDs", w: 100, num: 1, f: (x) => n(x.avgRd) },
      { k: "trend", t: "Trend", w: 110, nosort: 1, v: (x) => (x.trend || []).join(" "), f: (x) => spark(x.trend) }, { k: "added", t: "Added", w: 110, num: 1, f: (x) => `<span class="muted">${esc(shortDate(String(x.added).slice(0, 10)))}</span>` },
    ] });
}

// ---------- agent access (MCP) ----------
async function pageAgent(v, qs, t) {
  head("Agent access");
  const r = await api("/api/tokens");
  if (t !== S.token) return;
  const url = location.origin + "/mcp";
  v.innerHTML = `<div class="ph"><div><h1>Agent access</h1><p>Connect Claude Code, Cursor or any MCP client to this app. The agent can run every tool here: keyword research, site overview, SERP checks, keyword gap, backlinks, link gap, AI mentions, rank tracking, Search Console and audits. It spends this account's Graphed credits.</p></div><span class="grow"></span><button class="btn btn-primary" id="a_new">${ic("plus")}Create token</button></div>
    <div class="card"><div class="card-h">MCP endpoint</div><div class="card-b"><div class="codeline"><code>${esc(url)}</code><button class="btn btn-ghost btn-xs" data-copy="${esc(url)}">${ic("copy", "sm")}Copy</button></div><div class="desc">Streamable HTTP. Send <code>Authorization: Bearer &lt;token&gt;</code>. A request without a valid token is refused.</div></div></div>
    <div class="grid2 mt"><div data-tk></div><div data-tl></div></div>`;
  hydrate(v);
  const wire = (root) => root.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); toast("Copied"); });
  wire(v);
  grid($("[data-tk]", v), { csv: false, key: (x) => x.id, search: false, title: "Tokens", rows: r.tokens, height: 360, empty: "No tokens yet. Create one to connect an agent.", cols: [
    { k: "name", t: "Name", w: 200, f: (x) => esc(x.name) }, { k: "prefix", t: "Token", w: 130, f: (x) => `<code>${esc(x.prefix)}…</code>` },
    { k: "last_used_at", t: "Last used", w: 120, f: (x) => `<span class="muted">${x.last_used_at ? ago(x.last_used_at) : "never"}</span>` },
    { k: "act", t: "", w: 90, nosort: 1, f: (x) => `<button class="btn btn-ghost btn-xs" style="color:var(--destructive)" data-rev="${x.id}">Revoke</button>` },
  ] });
  $("[data-tk]", v).addEventListener("click", async (e) => { const b = e.target.closest("[data-rev]"); if (!b) return; if (await ask({ title: "Revoke this token?", desc: "Agents that use it lose access at once.", ok: "Revoke", danger: true })) { await api(`/api/tokens/${b.dataset.rev}`, { method: "DELETE" }); route(); } });
  grid($("[data-tl]", v), { csv: false, key: (x) => x.name, search: false, title: `Tools · ${r.tools.length}`, rows: r.tools, height: 360, onRow: (x) => openDrawer(x.name, `<div class="value">${esc(x.description)}</div>`), cols: [
    { k: "name", t: "Tool", w: 170, f: (x) => `<code>${esc(x.name)}</code>` }, { k: "description", t: "What it does", w: 420, f: (x) => `<span class="muted">${esc(x.description)}</span>` },
  ] });
  $("#a_new").onclick = async () => {
    const name = await ask({ title: "Create token", desc: "Name it after the agent or person that will use it.", ok: "Create", body: `<label class="label">Name</label><input id="tk_name" placeholder="e.g. Claude Code on my Mac">`, read: (d) => $("#tk_name", d).value.trim() || "Agent" });
    if (!name) return;
    const tk = await api("/api/tokens", { body: { name } }).catch(fail);
    if (!tk) return;
    const cmd = `claude mcp add --transport http ai-seo-tool ${url} --header "Authorization: Bearer ${tk.token}"`;
    openDrawer("Token created", `<div class="alert alert-muted" style="margin-top:0">${ic("alert")}<span>Copy the token now. It is shown one time only.</span></div>
      <div class="section">Token</div><div class="codeline"><code>${esc(tk.token)}</code><button class="btn btn-ghost btn-xs" data-copy="${esc(tk.token)}">${ic("copy", "sm")}Copy</button></div>
      <div class="section">Add to Claude Code</div><div class="codeline"><code>${esc(cmd)}</code><button class="btn btn-ghost btn-xs" data-copy="${esc(cmd)}">${ic("copy", "sm")}Copy</button></div>
      <div class="section">Any other MCP client</div><div class="desc">URL <code>${esc(url)}</code>, transport HTTP, header <code>Authorization: Bearer ${esc(tk.prefix)}…</code></div>
      <div class="section">Then ask</div><div class="value">Use ai-seo-tool: find the keyword gap for project 1 and tell me the 5 keywords to write first.</div>`, `<button class="btn btn-primary" onclick="closeDrawer();route()">Done</button>`);
    wire($("#drawer"));
  };
}

// ---------- project: settings ----------
async function pageSettings(v, qs, t) {
  const p = await api(`/api/projects/${S.pid}`);
  head("Settings", p.name);
  const src = await api("/api/warehouse/sources").catch(() => ({ gsc: [], ga4: [] }));
  if (t !== S.token) return;
  const gv = p.gsc_schema ? `${p.gsc_schema}|${p.gsc_site}` : "", av = p.ga4_schema ? `${p.ga4_schema}|${p.ga4_property}` : "";
  const sec = (h, d, body, cls = "") => `<section class="setsec ${cls}"><div><h3>${h}</h3><div class="desc">${d}</div></div><div class="fields">${body}</div></section>`;
  v.innerHTML = `<div class="ph"><div><h1>Settings</h1><p>${esc(p.domain)}</p></div></div>
    ${sec("Project", "The name in the sidebar and the site this project tracks.", `<label class="label">Name</label><input id="s_name" value="${esc(p.name)}"><label class="label">Domain</label><input value="${esc(p.domain)}" disabled><label class="label">Location</label>${locSel("s_loc", p.location)}<label class="label">Language</label>${langSel("s_lang", p.language)}`)}
    ${sec("Market", "Used by the keyword gap, rank tracker, AI visibility and the fit check.", `<label class="label">Competitors <span class="opt">up to 4, comma separated</span></label><input id="s_comp" value="${esc(p.competitors.join(", "))}"><label class="label">Brand terms <span class="opt">other names for you, matched in AI answers and removed from gap results</span></label><input id="s_brand" value="${esc(p.brand_terms.join(", "))}" placeholder="e.g. graphed ai"><label class="label">About <span class="opt">what you sell, and to whom</span></label><textarea id="s_about" style="font-family:var(--font);font-size:14px;min-height:96px">${esc(p.about)}</textarea>`)}
    ${sec("Graphed warehouse", "Search Console and GA4 sources synced into this Graphed account. Reading them costs no credits.", `<label class="label">Search Console site</label><select id="s_gsc"><option value="">Not connected</option>${src.gsc.map((x) => `<option value="${esc(x.schema + "|" + x.site)}" ${gv === x.schema + "|" + x.site ? "selected" : ""}>${esc(x.site)} · ${esc(x.schema)}</option>`).join("")}</select><label class="label">GA4 property</label><select id="s_ga4"><option value="">Not connected</option>${src.ga4.map((x) => `<option value="${esc(x.schema + "|" + x.property)}" ${av === x.schema + "|" + x.property ? "selected" : ""}>${esc(x.name)} · ${esc(x.schema)}</option>`).join("")}</select>`)}
    ${sec("Schedules", "Rank checks run every morning. The audit and AI check run every Monday. Times are set by the jobs in graphed.yaml.", `<label class="label">Rank tracking depth</label><select id="s_depth">${[10, 20, 30, 50, 100].map((d) => `<option value="${d}" ${p.rank_depth === d ? "selected" : ""}>Top ${d} · ${cr((d / 10) * 0.115)} credits per keyword per day</option>`).join("")}</select><label class="check"><input type="checkbox" id="s_wa" ${p.weekly_audit ? "checked" : ""}><span>Weekly site audit<small>Free</small></span></label><label class="check"><input type="checkbox" id="s_wai" ${p.weekly_ai ? "checked" : ""}><span>Weekly AI visibility check<small>3 runs per prompt on every engine</small></span></label>`)}
    ${sec("Delete project", "Removes tracked keywords, rank history, prompts, AI answers and saved runs. You cannot undo this.", `<button class="btn btn-outline" style="color:var(--destructive);border-color:#fecaca" id="s_del">${ic("trash")}Delete ${esc(p.name)}</button>`)}
    <div class="setbar"><button class="btn btn-primary" id="s_save">Save changes</button><span class="muted" id="s_state" style="font-size:13px"></span></div>`;
  v.querySelectorAll("input,select,textarea").forEach((x) => x.addEventListener("input", () => { $("#s_state").textContent = "Unsaved changes"; }));
  $("#s_save").onclick = async () => {
    const sp = (x) => { const [schema, ...rest] = x.split("|"); return x ? { schema, site: rest.join("|"), property: rest.join("|") } : null; };
    try {
      const u = await api(`/api/projects/${p.id}`, { method: "PATCH", body: { name: $("#s_name").value, competitors: $("#s_comp").value, brandTerms: $("#s_brand").value, about: $("#s_about").value, location: Number($("#s_loc").value), language: $("#s_lang").value, gsc: sp($("#s_gsc").value), ga4: sp($("#s_ga4").value), rankDepth: Number($("#s_depth").value), weeklyAudit: $("#s_wa").checked, weeklyAi: $("#s_wai").checked } });
      Object.assign(proj() || {}, u); await loadProjects(); renderSidebar("p:settings"); $("#s_state").textContent = "Saved"; toast("Saved");
    } catch (e) { fail(e); }
  };
  $("#s_del").onclick = async () => { if (await ask({ title: `Delete ${p.name}?`, desc: "This removes tracked keywords, rank history, prompts, AI answers and saved runs for this project. You cannot undo this.", ok: "Delete project", danger: true })) { await api(`/api/projects/${p.id}`, { method: "DELETE" }); await loadProjects(); go("#/site"); } };
}

// ---------- credits ----------
const TOOL_NAME = (id) => {
  const m = String(id).match(/^(dataforseo|serper|llm):(.*)$/);
  if (!m) return id;
  if (m[1] === "llm") return "AI · " + m[2].replace(/:online$/, " with web search");
  const t = m[2].replace(/\.live(\.advanced)?$/, "").replace(/^labs\./, "").replace(/^google_ads\./, "ads ").replace(/[._]/g, " ");
  return (m[1] === "dataforseo" ? "DataForSEO · " : "Serper · ") + t;
};
async function pageCredits(v) {
  head("Credits");
  const r = await api("/api/credits");
  const days = []; const byDay = new Map(r.days.map((d) => [d.day, d.credits]));
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([d, byDay.get(d) || 0]); }
  const m = Math.max(...days.map((d) => d[1]), 1);
  v.innerHTML = `<div class="ph"><div><h1>Credits</h1><p>Graphed credits this app spent (1 credit = 1¢). Every paid lookup is cached, so opening a saved run again is free.</p></div></div>
    <div class="stats">${stat("Today", cr(r.d1), money(r.d1 / 100))}${stat("Last 7 days", cr(r.d7), money(r.d7 / 100))}${stat("Last 30 days", cr(r.d30), money(r.d30 / 100))}${stat("All time", cr(r.total), money(r.total / 100))}${stat("Cached lookups", n(r.cachedLookups), "free to reopen")}</div>
    <div class="card"><div class="card-h">Credits per day <span class="muted">last 30 days</span></div><div class="card-b"><div class="bars">${days.map(([d, c], i) => `<div class="b ${c ? "" : "zero"}" title="${esc(shortDate(d))}: ${cr(c)} credits"><span>${c ? Math.round(c) : ""}</span><i style="height:${c ? Math.max(2, (c / m) * 78) : 1.5}%"></i><span class="x">${i % 5 === 4 || i === 29 ? esc(shortDate(d)) : ""}</span></div>`).join("")}</div></div></div>
    <div class="grid2 mt"><div data-t></div><div data-p></div></div>`;
  grid($("[data-t]", v), { csv: "credits-by-tool", key: (x) => x.tool, search: false, title: "By tool · 30 days", rows: r.tools, sort: { k: "credits", dir: -1 }, cols: [{ k: "tool", t: "Tool", w: 320, v: (x) => TOOL_NAME(x.tool), f: (x) => `<span title="${esc(x.tool)}">${esc(TOOL_NAME(x.tool))}</span>` }, { k: "calls", t: "Calls", w: 80, num: 1, f: (x) => n(x.calls) }, { k: "credits", t: "Credits", w: 90, num: 1, f: (x) => cr(x.credits) }] });
  grid($("[data-p]", v), { csv: "credits-by-project", key: (x) => x.name, search: false, title: "By project · 30 days", rows: r.projects, sort: { k: "credits", dir: -1 }, cols: [{ k: "name", t: "Project", w: 260, f: (x) => x.name === "(no project)" ? '<span class="muted">Research (no project)</span>' : esc(x.name) }, { k: "credits", t: "Credits", w: 100, num: 1, f: (x) => cr(x.credits) }] });
}

// ---------- new project ----------
async function newProject() {
  const r = await ask({ title: "New project", desc: "One site to grow. Graphed finds its Search Console and GA4 in the warehouse and suggests competitors.", ok: "Create project",
    body: `<label class="label">Domain</label><input id="np_dom" placeholder="example.com"><label class="label">Competitors <span class="opt">(optional, comma separated; leave empty to auto-pick)</span></label><input id="np_comp" placeholder="rival1.com, rival2.com"><label class="label">Location</label>${locSel("np_loc", 2840)}<label class="label">Language</label>${langSel("np_lang", "")}`,
    read: (d) => ({ domain: $("#np_dom", d).value, competitors: $("#np_comp", d).value, location: Number($("#np_loc", d).value), language: $("#np_lang", d).value }) });
  if (!r || !r.domain) return;
  try { const p = await api("/api/projects", { body: r }); await loadProjects(); go(`#/p/${p.id}`); } catch (e) { fail(e); }
}

// ---------- boot ----------
(async () => {
  hydrate();
  try {
    S.meta = await api("/api/meta");
    await loadProjects();
    api("/api/credits").then((c) => { $("#cr30").textContent = cr(c.d30); }).catch(() => {});
  } catch (e) { fail(e); }
  if (!location.hash) location.hash = S.projects.length ? `#/p/${S.projects[0].id}` : "#/site";
  route();
})();
