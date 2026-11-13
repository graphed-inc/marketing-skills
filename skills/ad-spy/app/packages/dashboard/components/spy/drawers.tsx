"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Avatar, Chips, Platform } from "./bits";
import { ago, dateLabel, platformName } from "./format";
import { CloseIcon, ExternalIcon, StarIcon } from "./icons";
import type { AdDetail, Brief, CellData, CellRef } from "./types";

const TABS = [
  ["analysis", "Analysis"],
  ["transcript", "Transcript"],
  ["copy", "Copy"],
  ["details", "Details"],
] as const;

function youtubeId(url: string | null): string | null {
  return url ? (url.match(/[?&]v=([\w-]{6,})/) || [])[1] || null : null;
}

export function AdDrawer({
  id,
  back,
  onClose,
  onBack,
  onToast,
}: {
  id: number;
  back?: { p: number; t: number };
  onClose: () => void;
  onBack?: () => void;
  onToast: (message: string) => void;
}) {
  const [ad, setAd] = useState<AdDetail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("analysis");
  useEffect(() => {
    let live = true;
    api<AdDetail>(`/api/ads/${id}`).then((next) => { if (live) setAd(next); }).catch((error: Error) => onToast(error.message));
    return () => { live = false; };
  }, [id, onToast]);

  const video = youtubeId(ad?.youtube || null);
  return (
    <>
      <div className="ov show" onClick={onClose} />
      <div className="drawer show">
        {!ad ? <div className="dr-head"><span className="spin" /></div> : (
          <>
            <div className="dr-head">
              {back && onBack ? <button className="btn btn-ghost btn-sm" type="button" onClick={onBack}>← Back</button> : null}
              <Avatar logo={ad.logo} name={ad.brand} size="md" />
              <b className="dr-name">{ad.brand}</b>
              <Platform id={ad.platform} />
              {ad.active ? <span className="badge badge-live"><span className="dot" />Active</span> : <span className="badge badge-off">Inactive</span>}
              <span className="muted dr-meta">{dateLabel(ad.startedAt)} → {ad.active ? "today" : dateLabel(ad.endedAt)}{ad.days ? ` · ${ad.days} days` : ""}</span>
              <div className="grow" />
              {ad.url ? <a className="btn btn-outline btn-sm" target="_blank" rel="noreferrer" href={ad.url}>Ad library <ExternalIcon /></a> : null}
              {ad.link ? <a className="btn btn-outline btn-sm" target="_blank" rel="noreferrer" href={ad.link}>Landing page <ExternalIcon /></a> : null}
              <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={onClose}><CloseIcon /></button>
            </div>
            <div className="dr-body">
              <div className="dr-media">
                {video ? <iframe src={`https://www.youtube-nocookie.com/embed/${video}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> : ad.media.length ? ad.media.map((item) => (
                  <div key={item.url}>
                    {item.kind === "video" ? <video controls playsInline preload="metadata" poster={item.poster || undefined} src={item.url} /> : <img src={item.url} alt="" />}
                    {item.title ? <div className="cap">{item.title}</div> : null}
                  </div>
                )) : (
                  <div className="card text-card">
                    <div className="hl">{ad.headline || ""}</div>
                    <div className="pre">{ad.body || ""}</div>
                  </div>
                )}
              </div>
              <div className="dr-side">
                <div className="tabs">
                  {TABS.map(([key, label]) => (
                    <button key={key} type="button" className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{label}</button>
                  ))}
                </div>
                <div className="tabpane">
                  {tab === "analysis" ? <Analysis ad={ad} onToast={onToast} /> : null}
                  {tab === "transcript" ? <Transcript ad={ad} onToast={onToast} /> : null}
                  {tab === "copy" ? <Copy ad={ad} /> : null}
                  {tab === "details" ? <Details ad={ad} onToast={onToast} /> : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function reanalyze(ad: AdDetail, onToast: (message: string) => void) {
  return async () => {
    await api(`/api/ads/${ad.id}/reanalyze`, { method: "POST" });
    onToast("Queued for analysis");
  };
}

function Analysis({ ad, onToast }: { ad: AdDetail; onToast: (message: string) => void }) {
  if (ad.analysis !== "done") {
    return (
      <>
        <div className="muted">{ad.analysis === "error" ? `Analysis failed: ${ad.analysisError || ""}` : "Gemini is analyzing this ad…"}</div>
        <div className="mt12"><button className="btn btn-outline btn-sm" type="button" onClick={reanalyze(ad, onToast)}>Analyze again</button></div>
      </>
    );
  }
  return (
    <>
      {ad.summary ? <p className="summary">{ad.summary}</p> : null}
      {ad.hook ? <div className="sec flush"><h4>Hook{ad.hookType ? ` · ${ad.hookType}` : ""}</h4><div className="quote">{ad.hook}</div></div> : null}
      <div className="sec"><div className="kv">
        {ad.angle ? <><div className="k">Angle</div><div>{ad.angle}</div></> : null}
        {ad.offer ? <><div className="k">Offer</div><div>{ad.offer}</div></> : null}
        {ad.style ? <><div className="k">Style</div><div className="cap">{ad.style}</div></> : null}
        {ad.audience ? <><div className="k">Audience</div><div>{ad.audience}</div></> : null}
        {ad.extra?.speaker ? <><div className="k">On screen</div><div>{ad.extra.speaker}</div></> : null}
        {ad.cta ? <><div className="k">CTA</div><div>{ad.cta}</div></> : null}
        {ad.duration ? <><div className="k">Length</div><div>{Math.round(ad.duration)}s</div></> : null}
      </div></div>
      <Chips title="Pain points" items={ad.pains} />
      <Chips title="Benefits" items={ad.benefits} />
      <Chips title="Emotions" items={ad.emotions} />
      <Chips title="Tags" items={ad.tags} tone="badge-brand" />
      {ad.visual ? <div className="sec"><h4>What&apos;s on screen</h4><div className="pre">{ad.visual}</div></div> : null}
    </>
  );
}

function Transcript({ ad, onToast }: { ad: AdDetail; onToast: (message: string) => void }) {
  return (
    <>
      {ad.transcript ? <div className="sec flush"><h4>Spoken</h4><div className="pre">{ad.transcript}</div></div> : <div className="muted">No speech in this ad.</div>}
      {ad.onScreenText ? <div className="sec"><h4>On-screen text</h4><div className="pre">{ad.onScreenText}</div></div> : null}
      {ad.transcript ? <div className="mt16"><button className="btn btn-outline btn-sm" type="button" onClick={() => { navigator.clipboard.writeText(ad.transcript || ""); onToast("Copied"); }}>Copy transcript</button></div> : null}
    </>
  );
}

function Copy({ ad }: { ad: AdDetail }) {
  return (
    <div className="kv">
      <div className="k">Headline</div><div>{ad.headline || "–"}</div>
      <div className="k">Body</div><div className="pre">{ad.body || "–"}</div>
      <div className="k">Button</div><div>{ad.cta || "–"}</div>
      <div className="k">Link</div><div className="break">{ad.link ? <a target="_blank" rel="noreferrer" href={ad.link}>{ad.link}</a> : "–"}</div>
      {ad.poster ? <><div className="k">Posted by</div><div>{ad.poster}</div></> : null}
    </div>
  );
}

function Details({ ad, onToast }: { ad: AdDetail; onToast: (message: string) => void }) {
  return (
    <>
      <div className="kv">
        <div className="k">Platform</div><div>{platformName(ad.platform)}{ad.placements.length ? ` · ${ad.placements.join(", ")}` : ""}</div>
        <div className="k">Format</div><div className="cap">{ad.format}</div>
        <div className="k">Launched</div><div>{dateLabel(ad.startedAt)}</div>
        <div className="k">Last shown</div><div>{ad.active ? "Running now" : dateLabel(ad.endedAt)}</div>
        <div className="k">Days running</div><div>{ad.days ?? "–"}</div>
        {ad.impressions ? <><div className="k">Impressions</div><div>{ad.impressions}</div></> : null}
        {ad.variants ? <><div className="k">Variations</div><div>{ad.variants}</div></> : null}
        {ad.regions.length ? <><div className="k">Regions</div><div>{ad.regions.join(", ")}</div></> : null}
        <div className="k">Found</div><div>{dateLabel(ad.firstSeen)} · seen {ago(ad.lastSeen)}</div>
        <div className="k">Analyzed</div><div>{ad.analyzedAt ? `${dateLabel(ad.analyzedAt)} · ${Number(ad.credits).toFixed(2)} credits` : "–"}</div>
        <div className="k">Ad ID</div><div><code>{ad.id}</code></div>
      </div>
      <div className="mt16"><button className="btn btn-outline btn-sm" type="button" onClick={reanalyze(ad, onToast)}>Analyze again</button></div>
    </>
  );
}

function Briefs({ list }: { list: Brief[] }) {
  const latest = list[0];
  if (!latest) return null;
  if (latest.status === "running") {
    return <div className="card writing"><span className="typing"><i /><i /><i /></span><span className="muted hint">Writing 3 concepts from customer language…</span></div>;
  }
  if (latest.status === "error") return <div className="badge badge-destructive mb16">{latest.error}</div>;
  const content = latest.content || {};
  return (
    <>
      <div className="sec flush"><h4>Ad concepts</h4></div>
      {content.positioning ? <div className="quote gap"><b>Position to own:</b> {content.positioning}</div> : null}
      {(content.concepts || []).map((concept, index) => (
        <div className="concept" key={`${concept.title}-${index}`}>
          <h5>{index + 1}. {concept.title} {concept.format ? <span className="badge badge-secondary">{concept.format}</span> : null}</h5>
          <div className="ln"><b>Hook</b> “{concept.hook}”</div>
          <div className="ln"><b>Angle</b> {concept.angle}</div>
          <ol>{(concept.script || []).map((line) => <li key={line}>{line}</li>)}</ol>
          {concept.visual ? <div className="ln"><b>Visual</b> {concept.visual}</div> : null}
          {concept.cta ? <div className="ln"><b>CTA</b> {concept.cta}</div> : null}
          {concept.why_open ? <div className="ln"><b>Why it&apos;s open</b> {concept.why_open}</div> : null}
          {concept.customer_words?.length ? <div className="chips mt12">{concept.customer_words.map((word) => <span className="badge badge-brand" key={word}>“{word}”</span>)}</div> : null}
        </div>
      ))}
      {list.length > 1 ? <div className="desc saved">{list.length - 1} earlier set{list.length > 2 ? "s" : ""} saved.</div> : null}
    </>
  );
}

export function CellDrawer({
  cell,
  onClose,
  onOpenAd,
}: {
  cell: CellRef & { brief?: boolean };
  onClose: () => void;
  onOpenAd: (id: number) => void;
}) {
  const [data, setData] = useState<CellData | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");

  function query() {
    const params = new URLSearchParams({ p: String(cell.p), t: String(cell.t) });
    if (cell.brand) params.set("brand", cell.brand);
    if (cell.platform) params.set("platform", cell.platform);
    if (cell.active) params.set("active", "1");
    return params;
  }

  useEffect(() => {
    let live = true;
    api<CellData>(`/api/gaps/cell?${query()}`).then((next) => { if (live) setData(next); });
    return () => { live = false; };
    // Filters are part of the cell the user opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.p, cell.t, cell.brand, cell.platform, cell.active]);

  useEffect(() => {
    if (!data || !cell.brief || data.briefs.length) return;
    write();
    // Start one brief when the opening card asked for concepts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cell.brief]);

  useEffect(() => {
    const running = data?.briefs.find((brief) => brief.status === "running");
    if (!running) return;
    let live = true;
    const timer = setInterval(async () => {
      const next = await api<Brief>(`/api/briefs/${running.id}`).catch(() => null);
      if (!live || !next || next.status === "running") return;
      setData((current) => current && { ...current, briefs: current.briefs.map((brief) => brief.id === next.id ? next : brief) });
      setWriting(false);
    }, 2000);
    return () => { live = false; clearInterval(timer); };
  }, [data]);

  async function write() {
    setWriting(true);
    setWriteError("");
    try {
      const started = await api<{ id: number }>("/api/gaps/brief", { method: "POST", body: { p: cell.p, t: cell.t } });
      setData((current) => current && { ...current, briefs: [{ id: started.id, status: "running" }, ...current.briefs] });
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : "Could not write concepts");
      setWriting(false);
    }
  }

  return (
    <>
      <div className="ov show" onClick={onClose} />
      <div className="drawer show">
        {!data ? <div className="dr-head"><span className="spin" /></div> : (
          <>
            <div className="dr-head">
              <div className="dr-title-wrap">
                <div className="muted dr-sub">{data.persona.name} ×</div>
                <b className="dr-name">{data.theme.name}</b>
              </div>
              <span className={`badge ${data.theme.kind === "pain" ? "badge-brand" : "badge-secondary"}`}>{data.theme.kind === "pain" ? "Pain" : "Desired outcome"}</span>
              {cell.voices != null ? <span className="muted dr-meta">{cell.voices} customers · {cell.ads} competitor ads</span> : null}
              <div className="grow" />
              <button className="btn btn-primary btn-sm" type="button" disabled={writing} onClick={write}><StarIcon />Write ad concepts</button>
              {writeError ? <span className="badge badge-destructive">{writeError}</span> : null}
              <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={onClose}><CloseIcon /></button>
            </div>
            <div className="cell-body">
              <div>
                <div className="sec flush"><h4>What customers say ({data.quotes.length})</h4></div>
                <div className="desc nudge">{data.persona.description} · {data.theme.description}</div>
                <div className="quotes">
                  {data.quotes.length ? data.quotes.map((quote, index) => (
                    <div className="qt" key={`${quote.url || quote.text}-${index}`}>
                      “{quote.quote || quote.text.slice(0, 280)}”
                      <div className="src">
                        <span className={`src-b ${quote.source}`}>{quote.source}</span>
                        {quote.title ? <span className="ttl">{quote.title}</span> : null}
                        {quote.url ? <a className="ext" target="_blank" rel="noreferrer" href={quote.url}><ExternalIcon /></a> : null}
                      </div>
                    </div>
                  )) : <div className="muted">No customer comments in this cell.</div>}
                </div>
              </div>
              <div>
                <Briefs list={data.briefs} />
                <div className="sec flush"><h4>Competitor ads here ({data.ads.length})</h4></div>
                {data.ads.length ? (
                  <div className="minis">
                    {data.ads.map((ad) => (
                      <div className="mini" key={ad.id} onClick={() => onOpenAd(ad.id)}>
                        {ad.thumb ? <img loading="lazy" src={ad.thumb.poster || (ad.thumb.kind === "image" ? ad.thumb.url : "")} alt="" /> : <div className="fallback">{ad.body || ""}</div>}
                        <div className="tx"><b>{ad.brand}</b> <Platform id={ad.platform} /><br />{ad.reason || ad.hook || ""}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card pad"><b>No competitor ad says this.</b><div className="desc">This is open ground{cell.brand ? " for the selected competitor" : ""}. Write concepts for it.</div></div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
