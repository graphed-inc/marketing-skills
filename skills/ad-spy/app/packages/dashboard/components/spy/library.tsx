"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { Avatar, meter, Platform } from "./bits";
import { ago, mondayKey, platformName } from "./format";
import { ExternalIcon, GearIcon, PlayIcon, PlusIcon, RefreshIcon, SearchIcon, StarIcon } from "./icons";
import type { AdCard, Brand, BrandStats, Filters } from "./types";

const FORMATS = ["video", "image", "carousel", "text"];
const SORTS: [string, string][] = [
  ["newest", "Newest launched"],
  ["found", "Recently found"],
  ["longest", "Longest running"],
  ["oldest", "Oldest"],
];

function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function bars(rows: { k: string; n: number }[]) {
  if (!rows.length) return <div className="muted analyzing">Waiting for analysis…</div>;
  const max = Math.max(1, ...rows.map((row) => row.n));
  return rows.map((row) => (
    <div className="r" key={row.k}>
      <span className="lbl">{row.k}</span>
      <span className="track"><i className={meter(row.n / max)} /></span>
      <span className="n">{row.n}</span>
    </div>
  ));
}

function CardMedia({ ad }: { ad: AdCard }) {
  const [hover, setHover] = useState(false);
  const thumb = ad.thumb;
  if (thumb && (thumb.kind === "image" || thumb.poster)) {
    const src = thumb.kind === "video" ? thumb.poster || thumb.url : thumb.url;
    return (
      <div
        className="media"
        onMouseEnter={() => thumb.kind === "video" && setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <img loading="lazy" src={src || ""} alt="" />
        {hover && thumb.kind === "video" ? <video className="preview" muted playsInline loop autoPlay src={thumb.url} /> : null}
        {thumb.kind === "video" || ad.youtube ? <span className="play"><PlayIcon />Video</span> : null}
        {ad.mediaCount > 1 ? <span className="multi">1 / {ad.mediaCount}</span> : null}
      </div>
    );
  }
  if (thumb?.kind === "video") {
    return (
      <div className="media">
        <video muted playsInline preload="metadata" src={`${thumb.url}#t=0.5`} />
        <span className="play"><PlayIcon />Video</span>
      </div>
    );
  }
  return <div className="textad">{ad.body || ad.headline || "Text ad"}</div>;
}

function AdCardView({ ad, onOpen }: { ad: AdCard; onOpen: (id: number) => void }) {
  const fresh = ad.firstSeen ? Date.now() - new Date(ad.firstSeen).getTime() < 3 * 864e5 : false;
  return (
    <div className="ad" onClick={() => onOpen(ad.id)}>
      <div className="hd">
        <Avatar logo={ad.logo} name={ad.brand} size="md" />
        <span className="bn">{ad.brand}</span>
        <Platform id={ad.platform} />
      </div>
      <CardMedia ad={ad} />
      <div className="bd">
        {ad.headline ? <div className="hl">{ad.headline}</div> : null}
        {ad.hook ? <div className="hook">{ad.hook}</div> : ad.analysis !== "done" ? (
          <div className="muted analyzing">{ad.analysis === "error" ? "Analysis failed" : "Analyzing…"}</div>
        ) : null}
      </div>
      <div className="ft">
        {ad.active ? (
          <span className="badge badge-live"><span className="dot" />Active{ad.days ? ` · ${ad.days}d` : ""}</span>
        ) : (
          <span className="badge badge-off">Inactive{ad.days ? ` · ran ${ad.days}d` : ""}</span>
        )}
        <span className="badge badge-secondary">{ad.style || ad.format || ""}</span>
        {fresh ? <span className="badge badge-brand">New</span> : null}
      </div>
    </div>
  );
}

function BrandHead({
  brand,
  onPull,
  onEdit,
}: {
  brand: Brand;
  onPull: () => void;
  onEdit: () => void;
}) {
  const [stats, setStats] = useState<BrandStats | null>(null);
  useEffect(() => {
    let live = true;
    api<BrandStats>(`/api/brands/${brand.id}`).then((next) => { if (live) setStats(next); }).catch(() => {});
    return () => { live = false; };
  }, [brand.id, brand.ads, brand.pulling, brand.activeAds, brand.queued]);

  const links = [
    brand.fbPageId ? (
      <a key="fb" className="badge" target="_blank" rel="noreferrer" href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${brand.fbPageId}`}>
        <Platform id="facebook" />Meta library <ExternalIcon />
      </a>
    ) : null,
    brand.googleAdvertiserId || brand.googleDomain ? (
      <a key="g" className="badge" target="_blank" rel="noreferrer" href={brand.googleAdvertiserId ? `https://adstransparency.google.com/advertiser/${brand.googleAdvertiserId}` : `https://adstransparency.google.com/?domain=${encodeURIComponent(brand.googleDomain || "")}`}>
        <Platform id="google" />Google library <ExternalIcon />
      </a>
    ) : null,
    brand.linkedinCompanyId || brand.linkedinCompany ? (
      <a key="li" className="badge" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/ad-library/search?${brand.linkedinCompanyId ? `companyIds=${brand.linkedinCompanyId}` : `accountOwner=${encodeURIComponent(brand.linkedinCompany || "")}`}`}>
        <Platform id="linkedin" />LinkedIn library <ExternalIcon />
      </a>
    ) : null,
  ];
  const format = Object.fromEntries((stats?.byFormat || []).map((row) => [row.k, row.n]));
  const weeks = weekBars(stats?.weekly || []);
  const weekMax = Math.max(1, ...weeks.map((week) => week.n));
  const lastPull = stats?.pulls[0];

  return (
    <>
      <div className="bhead">
        <Avatar logo={brand.logo} name={brand.name} size="lg" />
        <div className="copy">
          <h2>{brand.name}</h2>
          <div className="links">{links}</div>
        </div>
        <button className="btn btn-outline btn-sm" type="button" disabled={brand.pulling} onClick={onPull}>
          {brand.pulling ? <><span className="spin" />Pulling…</> : <><RefreshIcon />Pull now</>}
        </button>
        <button className="btn btn-outline btn-sm btn-icon" type="button" title="Brand settings" onClick={onEdit}><GearIcon /></button>
      </div>
      <div className="stats">
        <div className="card stat"><div className="k">Active ads</div><div className="v">{brand.activeAds}</div><div className="s">{brand.ads} found in total</div></div>
        <div className="card stat"><div className="k">New this week</div><div className="v">{brand.new7}</div><div className="s">last pull {ago(brand.lastPulledAt)}</div></div>
        <div className="card stat">
          <div className="k">Longest running (active)</div>
          <div className="v">{stats?.running?.max ?? "–"}<span className="unit muted"> days</span></div>
          <div className="s">avg {stats?.running?.avg ? Math.round(stats.running.avg) : "–"} days</div>
        </div>
        <div className="card stat">
          <div className="k">Active mix</div>
          <div className="v mix">
            {FORMATS.filter((key) => format[key]).map((key) => <span key={key}>{format[key]} <span className="muted">{key}</span></span>).reduce<ReactNode[]>((nodes, node, index) => index ? [...nodes, " · ", node] : [node], []) || "–"}
          </div>
          <div className="s">{(stats?.byPlatform || []).map((row) => `${platformName(row.k)} ${row.active}`).join(" · ")}</div>
        </div>
      </div>
      <div className="panels">
        <div className="card panel">
          <h3>Ads launched per week</h3>
          <div className="bars">
            {weeks.map((week) => (
              <div key={week.k} className={meter(week.n / weekMax)} data-t={`${week.n} · wk of ${week.k.slice(5)}`} />
            ))}
          </div>
        </div>
        <div className="card panel"><h3>Creative styles</h3><div className="rows">{bars(stats?.byStyle || [])}</div></div>
        <div className="card panel"><h3>Hook types</h3><div className="rows">{bars(stats?.byHook || [])}</div></div>
      </div>
      {lastPull?.error ? <div className="badge badge-destructive note">Last {lastPull.platform} pull failed: {lastPull.error}</div> : null}
    </>
  );
}

function weekBars(weekly: { k: string; n: number }[]) {
  const byWeek = Object.fromEntries(weekly.map((week) => [week.k, week.n]));
  const start = new Date(`${mondayKey(new Date())}T00:00:00Z`);
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() - 7 * i);
    const key = day.toISOString().slice(0, 10);
    weeks.push({ k: key, n: byWeek[key] || 0 });
  }
  return weeks;
}

export function Library({
  view,
  brand,
  filters,
  styles,
  brands,
  reloadKey,
  onFilters,
  onOpen,
  onAdd,
  onPull,
  onEdit,
}: {
  view: "all" | "new" | "brand";
  brand: Brand | null;
  filters: Filters;
  styles: string[];
  brands: Brand[];
  reloadKey: number;
  onFilters: (next: Filters) => void;
  onOpen: (id: number) => void;
  onAdd: () => void;
  onPull: (brand: Brand) => void;
  onEdit: (brand: Brand) => void;
}) {
  const [ads, setAds] = useState<AdCard[]>([]);
  const [total, setTotal] = useState(0);
  const ticket = useRef(0);
  const query = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function load(next: Filters, append = false) {
    const id = ++ticket.current;
    const params = new URLSearchParams();
    for (const key of ["platform", "format", "status", "style", "sort", "q"] as const) {
      if (next[key]) params.set(key, next[key]);
    }
    if (view === "brand" && brand) params.set("brand", String(brand.id));
    if (view === "new") {
      params.set("new", "7");
      if (!next.sort || next.sort === "newest") params.set("sort", "found");
    }
    params.set("offset", append ? String(ads.length) : "0");
    params.set("limit", "60");
    const result = await api<{ ads: AdCard[]; total: number }>(`/api/ads?${params}`);
    if (id !== ticket.current) return;
    setAds((current) => append ? current.concat(result.ads) : result.ads);
    setTotal(result.total);
  }

  useEffect(() => {
    load(filters).catch(() => {});
    // Reload when the route, filters, or a finished pull changes. Search debounce calls load itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, brand?.id, filters.platform, filters.format, filters.status, filters.style, filters.sort, filters.q, reloadKey]);

  const title = view === "new" ? "New this week" : brand ? brand.name : "All ads";
  return (
    <>
      <div className="topbar">
        <h1>{title}</h1>
        <div className="grow" />
        <div className="search">
          <SearchIcon />
          <input
            placeholder="Search copy, transcripts, hooks, tags…"
            defaultValue={filters.q}
            key={`${view}:${brand?.id || ""}`}
            onChange={(event) => {
              const value = event.target.value.trim();
              clearTimeout(query.current);
              query.current = setTimeout(() => onFilters({ ...filters, q: value }), 250);
            }}
          />
        </div>
      </div>
      <div className="scroll">
        <div className="wrap">
          {brand ? <BrandHead brand={brand} onPull={() => onPull(brand)} onEdit={() => onEdit(brand)} /> : null}
          <div className="filters">
            <div className="seg">
              {[["", "All"], ["facebook", "Meta"], ["google", "Google"], ["linkedin", "LinkedIn"]].map(([value, label]) => (
                <button key={value || "all"} type="button" className={filters.platform === value ? "on" : ""} onClick={() => onFilters({ ...filters, platform: value })}>
                  {value ? <Platform id={value} /> : null}{label}
                </button>
              ))}
            </div>
            <select value={filters.format} onChange={(event) => onFilters({ ...filters, format: event.target.value })}>
              <option value="">All formats</option>
              {FORMATS.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
            <select value={filters.status} onChange={(event) => onFilters({ ...filters, status: event.target.value })}>
              <option value="">Active + inactive</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={filters.style} onChange={(event) => onFilters({ ...filters, style: event.target.value })}>
              <option value="">All styles</option>
              {styles.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
            <select value={filters.sort} onChange={(event) => onFilters({ ...filters, sort: event.target.value })}>
              {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className="count">{total.toLocaleString()} ad{total === 1 ? "" : "s"}</span>
          </div>
          {!ads.length ? (
            <div className="empty">
              <StarIcon />
              <h3>{brands.length ? "No ads match" : "Track your first competitor"}</h3>
              <div>{brands.length ? "Change the filters or search." : "Add a brand. Ad Spy pulls its Meta, Google and LinkedIn ads, saves every creative, and has Gemini watch and tag each one."}</div>
              {brands.length ? null : <div className="cta"><button className="btn btn-primary" type="button" onClick={onAdd}><PlusIcon />Track a brand</button></div>}
            </div>
          ) : (
            <>
              <div className="grid">{ads.map((ad) => <AdCardView key={ad.id} ad={ad} onOpen={onOpen} />)}</div>
              {ads.length < total ? <div className="more"><button className="btn btn-outline" type="button" onClick={() => load(filters, true)}>Load more</button></div> : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
