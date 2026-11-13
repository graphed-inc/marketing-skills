"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Avatar, Platform } from "./bits";
import { platformName } from "./format";
import { PlusIcon, TargetIcon } from "./icons";
import type { AppState, GapCell, GapData, Market } from "./types";

const STEPS: [string, string][] = [
  ["site", "Read your website"],
  ["collect", "Collect customer conversations"],
  ["matrix", "Build the persona matrix"],
  ["tag_voices", "Tag every conversation"],
  ["tag_ads", "Map competitor ads"],
];

const MODES = {
  gap: { rgb: "255, 119, 0", label: "Darker = more customers raise it and fewer competitor ads say it. Big number = customer comments, small = competitor ads." },
  demand: { rgb: "13, 148, 136", label: "How often customers raise each pain or outcome, by persona." },
  ads: { rgb: "71, 85, 105", label: "How many competitor ads already use each message, by persona." },
};

type Mode = keyof typeof MODES;
type GapFilters = { brand: string; platform: string; active: string };

function Stepper({ market, onRetry }: { market: Market; onRetry: (stage: string) => void }) {
  const at = STEPS.findIndex(([key]) => key === market.stage);
  const progress = market.progress || {};
  const voices = progress.voices ? Object.values(progress.voices).reduce((sum, count) => sum + count, 0) : 0;
  const sub: Record<string, string> = {
    collect: voices ? `${voices} comments` : "",
    tag_voices: progress.voices_total ? `${progress.voices_tagged || 0} / ${progress.voices_total}` : "",
    tag_ads: progress.ads_total ? `${progress.ads_tagged || 0} / ${progress.ads_total}` : "",
  };
  return (
    <div className="card stepper">
      {STEPS.map(([key, label], index) => {
        const done = market.stage === "done" || index < at;
        const now = index === at;
        return (
          <div className={`stp ${done ? "done" : ""} ${now ? "now" : ""}`} key={key}>
            <span className="ic">{now && market.status === "running" ? <span className="spin" /> : null}</span>
            {label}
            <span className="sub">{sub[key] || ""}</span>
          </div>
        );
      })}
      {market.status === "error" ? (
        <>
          <div className="badge badge-destructive step-error">{market.error}</div>
          <div><button className="btn btn-outline btn-sm" type="button" onClick={() => onRetry(market.stage)}>Try again from this step</button></div>
        </>
      ) : null}
    </div>
  );
}

function Onboarding({ onStart, onError }: { onStart: (url: string) => Promise<void>; onError: (message: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <div className="scroll">
      <div className="onb">
        <div className="logo big"><TargetIcon /></div>
        <h2>Find what nobody in your market is saying yet</h2>
        <p>Paste your website. Ad Spy reads it, studies what your buyers say on Reddit, YouTube, LinkedIn, Threads and review sites, and builds a persona matrix. Then it maps every competitor ad onto that matrix. The empty, loud cells are your openings.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim()) return;
          onStart(url.trim()).catch((error: Error) => onError(error.message));
        }}>
          <input value={url} autoFocus placeholder="yourbusiness.com" onChange={(event) => setUrl(event.target.value)} />
          <button className="btn btn-primary" type="submit">Start research</button>
        </form>
        <div className="desc">Takes about 5–10 minutes. About 20–40 credits.</div>
        <div className="how">
          <div><b>1 · Voice of customer</b>Hundreds of real comments about the problem your product solves.</div>
          <div><b>2 · Persona matrix</b>Buyer types × pains and desired outcomes, taken from those comments.</div>
          <div><b>3 · Heat map</b>Where customers are loud and competitor ads are silent.</div>
        </div>
      </div>
    </div>
  );
}

export function Gaps({
  state,
  replaceSite,
  reloadKey,
  onStarted,
  onReplace,
  onTrack,
  onOpenCell,
  onToast,
}: {
  state: AppState;
  replaceSite: boolean;
  reloadKey: number;
  onStarted: () => void;
  onReplace: () => void;
  onTrack: (prefill: string) => void;
  onOpenCell: (cell: { p: number; t: number; voices?: number; ads?: number; brand: string; platform: string; active: string }, brief: boolean) => void;
  onToast: (message: string) => void;
}) {
  const market = state.market;
  const [filters, setFilters] = useState<GapFilters>({ brand: "", platform: "", active: "" });
  const [mode, setMode] = useState<Mode>("gap");
  const [data, setData] = useState<GapData | null>(null);

  const ready = !!market && (market.stage === "done" || market.stage === "tag_voices" || market.stage === "tag_ads");

  useEffect(() => {
    if (!market || replaceSite || !ready) { setData(null); return; }
    const params = new URLSearchParams();
    if (filters.brand) params.set("brand", filters.brand);
    if (filters.platform) params.set("platform", filters.platform);
    if (filters.active) params.set("active", "1");
    let live = true;
    api<GapData>(`/api/gaps?${params}`).then((next) => { if (live) setData(next); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [market, replaceSite, ready, filters, reloadKey]);

  async function rerun(from: string) {
    await api("/api/market/rerun", { method: "POST", body: { from } });
    onToast("Running…");
    onStarted();
  }

  if (!market || replaceSite) {
    return (
      <Onboarding
        onError={onToast}
        onStart={async (url) => {
          await api("/api/market", { method: "POST", body: { url } });
          onStarted();
        }}
      />
    );
  }

  const tracked = state.brands.map((brand) => `${brand.name} ${brand.domain || ""} ${brand.googleDomain || ""}`.toLowerCase());
  const suggestions = (market.profile?.competitors || []).filter((competitor) => !tracked.some((text) => text.includes(competitor.name.toLowerCase()) || (competitor.domain && text.includes(competitor.domain.toLowerCase()))));

  return (
    <>
      <div className="topbar">
        <h1>Positioning gaps</h1>
        <div className="grow" />
        {ready ? (
          <>
            <select className="top-select" value={filters.brand} onChange={(event) => setFilters({ ...filters, brand: event.target.value })}>
              <option value="">All competitors</option>
              {state.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            <select className="top-select" value={filters.platform} onChange={(event) => setFilters({ ...filters, platform: event.target.value })}>
              <option value="">All platforms</option>
              {["facebook", "google", "linkedin"].map((id) => <option key={id} value={id}>{platformName(id)}</option>)}
            </select>
            <select className="top-select" value={filters.active} onChange={(event) => setFilters({ ...filters, active: event.target.value })}>
              <option value="">Active + inactive ads</option>
              <option value="1">Active ads only</option>
            </select>
          </>
        ) : null}
        <select className="top-select" value="" onChange={(event) => {
          const value = event.target.value;
          event.target.value = "";
          if (value === "new") {
            if (confirm("Start over with a different website? The current matrix stays saved but is replaced in this view.")) onReplace();
            return;
          }
          const prompts: Record<string, string> = {
            collect: "Collect fresh conversations and rebuild everything (about 20-40 credits)?",
            matrix: "Rebuild personas and themes from the same conversations, then re-tag (about 10 credits)?",
            tag_ads: "Re-map every competitor ad into the matrix?",
          };
          if (value && confirm(prompts[value])) rerun(value).catch((error: Error) => onToast(error.message));
        }}>
          <option value="">Re-run…</option>
          <option value="collect">Collect new conversations</option>
          <option value="matrix">Rebuild the matrix</option>
          <option value="tag_ads">Re-map all ads</option>
          <option value="new">Use a different website</option>
        </select>
      </div>
      <div className="scroll">
        <div className="wrap">
          <div className="co">
            <Avatar name={market.name || market.url} size="lg" />
            <div>
              <h2>{market.name || market.url}</h2>
              <div className="sub">{market.profile?.oneLiner || market.url}{market.profile?.category ? ` · ${market.profile.category}` : ""}</div>
            </div>
          </div>
          {market.status !== "done" ? <div className="narrow"><Stepper market={market} onRetry={(stage) => rerun(stage).catch((error: Error) => onToast(error.message))} /></div> : null}
          {suggestions.length ? (
            <div className="card suggest">
              <div className="sh tight"><h3>Competitors to track</h3><span className="muted hint">Their ads fill in the map. Found on your site&apos;s category.</span></div>
              <div className="chips">
                {suggestions.map((competitor) => (
                  <button className="btn btn-outline btn-xs" type="button" key={`${competitor.name}-${competitor.domain || ""}`} onClick={() => onTrack(competitor.domain || competitor.name)}>
                    <PlusIcon />{competitor.name}{competitor.domain ? <span className="muted">{competitor.domain}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {data?.personas.length ? (
            <Matrix
              data={data}
              mode={mode}
              onMode={setMode}
              onOpen={(cell, brief) => onOpenCell({ ...cell, brand: filters.brand, platform: filters.platform, active: filters.active }, brief)}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}

function Matrix({
  data,
  mode,
  onMode,
  onOpen,
}: {
  data: GapData;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onOpen: (cell: { p: number; t: number; voices: number; ads: number }, brief: boolean) => void;
}) {
  const pains = data.themes.filter((theme) => theme.kind === "pain");
  const outcomes = data.themes.filter((theme) => theme.kind === "outcome");
  const columns = [...pains, ...outcomes];
  const cellOf = (persona: number, theme: number) => data.cells.find((cell) => cell.p === persona && cell.t === theme);
  const top = new Set(data.gaps.slice(0, 3).map((gap) => `${gap.p}:${gap.t}`));
  const tone = MODES[mode];
  const total = data.sources.reduce((sum, source) => sum + source.n, 0);
  const value = (cell: GapCell) => mode === "gap" ? cell.gap : mode === "demand" ? cell.d : cell.c;

  return (
    <>
      <div className="sh"><h3>Biggest openings</h3><span className="muted hint">Loud with customers, quiet in competitor ads</span></div>
      <div className="opens">
        {data.gaps.map((gap, index) => (
          <div className="card open" key={`${gap.p}:${gap.t}`} onClick={(event) => onOpen({ p: gap.p, t: gap.t, voices: gap.voices, ads: gap.ads }, !!(event.target as HTMLElement).closest("[data-brief]"))}>
            <div className="rk">#{index + 1} opening · {gap.kind === "pain" ? "Pain" : "Desired outcome"}</div>
            <div className="th">{gap.theme}</div>
            <div className="ps">for {gap.persona}</div>
            <div className="nums"><span><b>{gap.voices}</b>customers say it</span><span><b>{gap.ads}</b>competitor ad{gap.ads === 1 ? "" : "s"}</span></div>
            {gap.quote?.quote ? <div className="q">“{gap.quote.quote}”</div> : null}
            <div className="actions">
              <button className="btn btn-primary btn-xs" type="button" data-brief="1">Write ad concepts</button>
              <button className="btn btn-outline btn-xs" type="button">Evidence</button>
            </div>
          </div>
        ))}
        {data.gaps.length ? null : <div className="muted">Not enough tagged conversations yet.</div>}
      </div>
      <div className="card matrix">
        <div className="sh flush">
          <h3>Persona matrix</h3>
          <div className="seg">
            {(Object.keys(MODES) as Mode[]).map((key) => (
              <button key={key} type="button" className={mode === key ? "on" : ""} onClick={() => onMode(key)}>
                {key === "gap" ? "Gaps" : key === "demand" ? "Customer demand" : "Competitor ads"}
              </button>
            ))}
          </div>
          <div className="grow" />
          <div className={`legend ${mode}`}>low<i />high</div>
        </div>
        <div className="desc tight">
          {tone.label} {total} customer comments ({data.sources.map((source) => `${source.source} ${source.n}`).join(" · ")}) · {data.voicesTagged} tagged · {data.adsMapped} competitor ads mapped.
        </div>
        <div className="hm-wrap">
          <table className="hm">
            <thead>
              <tr>
                <th />
                {pains.length ? <th className="grp" colSpan={pains.length}>Pains</th> : null}
                {outcomes.length ? <th className="grp out" colSpan={outcomes.length}>Desired outcomes</th> : null}
              </tr>
              <tr>
                <th />
                {columns.map((theme) => <th className="col" key={theme.id} title={theme.description}>{theme.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.personas.map((persona) => (
                <tr key={persona.id}>
                  <td className="rh">{persona.name}<span>{persona.description}</span></td>
                  {columns.map((theme) => {
                    const cell = cellOf(persona.id, theme.id);
                    if (!cell) return <td key={theme.id} />;
                    const amount = 0.06 + value(cell) * 0.88;
                    const shade = Math.max(0, Math.min(10, Math.round(value(cell) * 10)));
                    const dark = amount > 0.55;
                    const main = mode === "ads" ? cell.ads : cell.voices;
                    const tag = mode === "gap" && top.has(`${cell.p}:${cell.t}`)
                      ? <span className={`tag ${dark ? "on-dark" : "on-deep"}`}>GAP</span>
                      : mode === "gap" && cell.crowded ? <span className="tag on-mute">CROWDED</span> : null;
                    return (
                      <td
                        key={theme.id}
                        className={`c ${mode} a${shade} ${dark ? "dark" : ""}`}
                        title={`${cell.voices} customer comments · ${cell.ads} competitor ads`}
                        onClick={() => onOpen({ p: cell.p, t: cell.t, voices: cell.voices, ads: cell.ads }, false)}
                      >
                        {tag}<b>{main}</b><small>{mode === "ads" ? `${cell.voices} ppl` : `${cell.ads} ad${cell.ads === 1 ? "" : "s"}`}</small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="desc">Click any cell to read what customers say there and see the competitor ads that sit in it.</div>
      </div>
    </>
  );
}
