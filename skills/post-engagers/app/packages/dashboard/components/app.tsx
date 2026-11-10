"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type Job = {
  id: number;
  postUrl: string;
  status: string;
  stage: string;
  error: string | null;
  engagements: number;
  uniquePeople: number;
  profiles: number;
  emails: number;
  totalReactions: number | null;
  totalComments: number | null;
  maxProfiles: number;
  credits: number;
  createdAt: string;
  source: string;
  newPeople: number;
  verified: number;
};

type Person = {
  urn: string;
  name: string;
  headline: string;
  title: string;
  company: string;
  companyDomain: string;
  industry: string;
  seniority: string;
  location: string;
  country: string;
  followers: number | null;
  connections: number | null;
  openToWork: boolean;
  about: string;
  experience: string;
  education: string;
  skills: string;
  languages: string;
  photo: string;
  email: string;
  emailVerify: string;
  emailSource: string;
  companySize: string;
  enriched: boolean;
  profileUrl: string;
  profiled: boolean;
  reacted: boolean;
  reactionType: string;
  commented: boolean;
  comment: string;
  posts: number;
  firstSeen: string | null;
};

type Stats = {
  posts: number;
  people: number;
  emails: number;
  verified: number;
  new1: number;
  new7: number;
  credits: number;
  rates: { engagement: number; profile: number; verify: number };
  waterfall: string[];
  defaultMaxProfiles: number;
  slug?: string;
  agentPrompt?: string;
};

type Tracked = {
  id: number;
  username: string;
  name: string | null;
  headline: string | null;
  active: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  checking: boolean;
  posts: number;
  people: number;
  new7: number;
  verified: number;
};

type PostRow = {
  url: string;
  postedAt: string | null;
  snippet: string | null;
  reactions: number | null;
  comments: number | null;
  people: number | null;
  newPeople: number | null;
  verified: number | null;
  jobId: number | null;
  status: string | null;
};

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || `HTTP ${r.status}`);
  return body as T;
}

const num = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString());
const shortUrl = (u: string) => String(u || "").replace(/^https?:\/\/(www\.)?linkedin\.com/, "").replace(/\?.*$/, "").replace(/\/$/, "");
const ago = (d: string | null) => {
  if (!d) return "";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
};
// "/posts/jane-doe_no-one-wants-you-activity-75…" → "No one wants you"; anything else → "Post #id"
const postLabel = (j: Pick<Job, "postUrl" | "id">) => {
  const m = String(j.postUrl || "").match(/\/posts\/[^_/]+_(.+?)-(?:activity|ugcpost|share)-\d/i);
  const words = m ? m[1].replace(/-/g, " ").trim() : "";
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : `Post #${j.id}`;
};

// lucide icons
const PATHS: Record<string, string> = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  radar: '<path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkc: '<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>',
  sparkle: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.22-8.56"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
};

function Icon({ n, className = "" }: { n: string; className?: string }) {
  return <svg className={`i ${className}`} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: PATHS[n] || "" }} />;
}

function useHash(): string {
  const [hash, setHash] = useState("#/");
  useEffect(() => {
    const read = () => setHash(location.hash || "#/");
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return hash;
}

// Loads fn when deps change, then polls every `ms` while `again(result)` is true.
function usePoll<T>(fn: () => Promise<T>, deps: unknown[], again: (r: T) => boolean, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fn();
        if (stop) return;
        setData(r);
        setError("");
        if (again(r)) timer = setTimeout(load, ms);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function StatusBadge({ status, stage }: { status: string | null; stage: string }) {
  if (status === "done") return <span className="badge badge-ok"><Icon n="check" className="sm" />Done</span>;
  if (status === "failed") return <span className="badge badge-destructive"><Icon n="alert" className="sm" />Failed</span>;
  if (status === "running") return <span className="badge badge-brand"><span className="pulse" />{stage}</span>;
  return <span className="badge badge-secondary"><Icon n="clock" className="sm" />Queued</span>;
}

function AskAgent() {
  const [label, setLabel] = useState("Ask your agent");
  const [prompt, setPrompt] = useState("");
  return (
    <span className="agent-wrap">
      <button className="btn btn-outline btn-sm" type="button" id="agentbtn" title="Copy a prompt that explains this app to your agent" onClick={async () => {
        try {
          const stats = await api<Stats>("/api/stats");
          if (!stats.agentPrompt) throw new Error("missing prompt");
          try {
            await navigator.clipboard.writeText(stats.agentPrompt);
            setPrompt("");
            setLabel("Copied");
            window.setTimeout(() => setLabel("Ask your agent"), 2000);
          } catch {
            setPrompt(stats.agentPrompt);
            setLabel("Ask your agent");
          }
        } catch {
          setLabel("Could not copy");
          window.setTimeout(() => setLabel("Ask your agent"), 2000);
        }
      }}><Icon n="copy" /><span className="lbl">{label}</span></button>
      {prompt ? (
        <div className="prompt-pop" role="dialog" aria-label="Prompt for your agent">
          <p>Clipboard is blocked. Copy this and paste it to your agent.</p>
          <textarea readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} ref={(node) => node?.focus()} />
          <button className="btn btn-outline btn-sm" type="button" onClick={() => setPrompt("")}>Close</button>
        </div>
      ) : null}
    </span>
  );
}

function Topbar({ crumb, title, children }: { crumb: string; title?: string; children?: ReactNode }) {
  return (
    <div className="topbar">
      <div className="topbar-scroll">
        <span className="crumb">{crumb}</span>
        {title ? <><span className="sep" /><span className="title">{title}</span></> : null}
        <span className="grow" />
        {children}
      </div>
      <AskAgent />
    </div>
  );
}

function Stat({ value, label, icon, sub, live }: { value: number | null; label: string; icon: string; sub?: string; live?: boolean }) {
  return (
    <div className={`card stat ${live ? "live" : ""}`}>
      <div className="k">{label}<Icon n={icon} /></div>
      <b>{num(value)}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function SinceTabs({ since, onChange }: { since: number; onChange: (days: number) => void }) {
  const options: Array<[number, string]> = [[0, "Everyone"], [1, "New today"], [7, "New this week"], [30, "New this month"]];
  return (
    <div className="tabs">
      {options.map(([d, label]) => (
        <button key={d} className={`tab ${since === d ? "on" : ""}`} type="button" onClick={() => onChange(d)}>{label}</button>
      ))}
    </div>
  );
}

function Avatar({ name, photo }: { name: string; photo: string }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  if (!photo || broken) return <span className="av">{initials}</span>;
  return <img className="av" src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty"><div className="ico"><Icon n={icon} /></div><b>{title}</b><p>{text}</p></div>;
}

function PeopleTable({ rows, toast }: { rows: Person[]; toast: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [seniority, setSeniority] = useState("");
  const [country, setCountry] = useState("");
  const [eng, setEng] = useState("");
  const [sort, setSort] = useState("");
  const [dir, setDir] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);

  const seniorities = useMemo(() => [...new Set(rows.map((r) => r.seniority).filter(Boolean))].sort(), [rows]);
  const countries = useMemo(() => [...new Set(rows.map((r) => r.country).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    let out = rows.filter((r) => {
      if (verifiedOnly && r.emailVerify !== "ok") return false;
      if (seniority && r.seniority !== seniority) return false;
      if (country && r.country !== country) return false;
      if (eng === "commented" && !r.commented) return false;
      if (eng === "reacted" && !r.reacted) return false;
      if (query && !`${r.name} ${r.headline} ${r.title} ${r.company} ${r.location} ${r.email} ${r.industry}`.toLowerCase().includes(query)) return false;
      return true;
    });
    if (sort) {
      const k = sort as keyof Person;
      out = out.slice().sort((a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? "")) * dir);
    }
    return out;
  }, [rows, q, verifiedOnly, seniority, country, eng, sort, dir]);

  const shown = filtered.slice(0, limit);
  const sortMark = (k: string) => (sort === k ? (dir > 0 ? " ↑" : " ↓") : "");
  const onSort = (k: string) => { setDir(sort === k ? -dir : 1); setSort(k); };

  return (
    <div>
      <div className="toolbar">
        <div className="search"><Icon n="search" className="sm" /><input placeholder="Search name, title, company, email…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(200); }} /></div>
        <select value={seniority} onChange={(e) => setSeniority(e.target.value)}>
          <option value="">Seniority</option>
          {seniorities.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Country</option>
          {countries.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={eng} onChange={(e) => setEng(e.target.value)}>
          <option value="">Reacted or commented</option>
          <option value="commented">Commented</option>
          <option value="reacted">Reacted</option>
        </select>
        <label className="chk"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />Verified email</label>
        <span className="count">{num(filtered.length)} of {num(rows.length)}</span>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th data-sort onClick={() => onSort("name")}>Person{sortMark("name")}</th>
              <th data-sort onClick={() => onSort("title")}>Role{sortMark("title")}</th>
              <th data-sort className="hide-sm" onClick={() => onSort("location")}>Location{sortMark("location")}</th>
              <th className="hide-sm">Engaged</th>
              <th data-sort onClick={() => onSort("email")}>Email{sortMark("email")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length ? shown.map((r) => {
              const v = r.emailVerify === "ok" ? "ok" : r.emailVerify === "catch_all" ? "catch" : "";
              const vlabel = ({ ok: "verified", catch_all: "catch-all", unknown: "unverified" } as Record<string, string>)[r.emailVerify] || "unverified";
              const isOpen = open === r.urn;
              return (
                <Fragment key={r.urn}>
                  <tr className={`p ${isOpen ? "open" : ""}`} onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("a")) return;
                    const copy = target.closest("[data-copy]") as HTMLElement | null;
                    if (copy?.dataset.copy) {
                      navigator.clipboard.writeText(copy.dataset.copy);
                      toast(`Copied ${copy.dataset.copy}`);
                      return;
                    }
                    setOpen(isOpen ? null : r.urn);
                  }}>
                    <td>
                      <div className="person">
                        <Avatar name={r.name} photo={r.photo} />
                        <div style={{ minWidth: 0 }}>
                          <a href={r.profileUrl} target="_blank" rel="noopener"><b>{r.name}</b></a>
                          <span className="hl">{r.headline}</span>
                        </div>
                      </div>
                    </td>
                    <td className="role">{r.title ? <b>{r.title}</b> : null}<div>{r.company}</div></td>
                    <td className="hide-sm">{r.location}<div className="muted" style={{ fontSize: 12.5 }}>{r.seniority}</div></td>
                    <td className="hide-sm">
                      <div className="eng">
                        {r.reacted ? <span className="badge badge-secondary"><Icon n="heart" className="sm" />{(r.reactionType || "like").toLowerCase()}</span> : null}
                        {r.commented ? <span className="badge badge-brand"><Icon n="message" className="sm" />commented</span> : null}
                      </div>
                    </td>
                    <td>
                      {r.email ? (
                        <>
                          <button className={`email ${v}`} data-copy={r.email} title={`MillionVerifier: ${r.emailVerify || "not checked"} · click to copy`} type="button"><span className="vd" />{r.email}</button>
                          <span className="src">{vlabel}{r.emailSource ? ` · ${r.emailSource}` : ""}</span>
                        </>
                      ) : (
                        <span className="muted" style={{ fontSize: 13 }}>
                          {!r.profiled ? "Pending" : r.enriched ? "Not found" : <><Icon n="loader" className="sm spin" /> Searching</>}
                        </span>
                      )}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="detail">
                      <td colSpan={5}>
                        <div className="dgrid">
                          {r.comment ? <div style={{ gridColumn: "1 / -1" }}><h4>Comment</h4><p>{r.comment}</p></div> : null}
                          {r.about ? <div style={{ gridColumn: "1 / -1" }}><h4>About</h4><p>{r.about}</p></div> : null}
                          <div><h4>Experience</h4><p>{r.experience.split("; ").join("\n") || "—"}</p></div>
                          <div><h4>Education</h4><p>{r.education.split("; ").join("\n") || "—"}</p></div>
                          <div><h4>Company</h4><p>{[r.company, r.companyDomain, r.industry, r.companySize ? `${r.companySize} employees` : ""].filter(Boolean).join(" · ") || "—"}</p></div>
                          <div><h4>Reach</h4><p>{num(r.followers)} followers · {num(r.connections)} connections{r.openToWork ? " · open to work" : ""}</p></div>
                          <div><h4>Skills</h4><p>{r.skills || "—"}</p></div>
                          <div><h4>First seen</h4><p>{r.firstSeen ? new Date(r.firstSeen).toLocaleDateString() : "—"} · engaged with {r.posts} scraped post{r.posts === 1 ? "" : "s"}</p></div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            }) : <tr><td colSpan={5}><Empty icon="users" title="No one here yet" text="People appear as the scrape runs. Ask your agent, in the top right, can queue the first post." /></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="more">{filtered.length > limit ? <button className="btn btn-outline btn-sm" type="button" onClick={() => setLimit(limit + 200)}>Show {Math.min(200, filtered.length - limit)} more</button> : null}</div>
    </div>
  );
}

function Sidebar({ hash, tick }: { hash: string; tick: number }) {
  const { data } = usePoll(
    () => Promise.all([api<Stats>("/api/stats"), api<Job[]>("/api/jobs"), api<Tracked[]>("/api/tracked")]),
    [tick, hash], () => true, 10_000,
  );
  const stats = data ? data[0] : null;
  const jobs = data ? data[1] : [];
  const tracked = data ? data[2] : [];
  const section = hash.startsWith("#/people") ? "people" : hash.startsWith("#/tracking") || hash.startsWith("#/tracked") ? "tracking" : hash.startsWith("#/posts") || hash.startsWith("#/job") ? "posts" : "home";
  return (
    <aside>
      <div className="sb-head"><div className="ws-ico"><Icon n="radar" /></div><div style={{ flex: 1 }}><b>Post Engagers</b><span>LinkedIn lead lists</span></div></div>
      <div className="sb-group">
        <a className={`nav ${section === "home" ? "on" : ""}`} href="#/"><Icon n="plus" /><span className="nm">New scrape</span></a>
        <a className={`nav ${section === "tracking" ? "on" : ""}`} href="#/tracking"><Icon n="activity" /><span className="nm">Tracking</span><span className="ct">{tracked.length ? num(tracked.length) : ""}</span></a>
        <a className={`nav ${section === "people" ? "on" : ""}`} href="#/people"><Icon n="users" /><span className="nm">Everyone</span><span className="ct">{stats ? num(stats.people) : ""}</span></a>
        <div className="sb-label"><span>Tracked profiles</span></div>
        {tracked.length ? tracked.map((t) => (
          <a key={t.id} className={`nav ${hash.startsWith(`#/tracked/${t.id}`) ? "on" : ""}`} href={`#/tracked/${t.id}`}>
            <Icon n="user" /><span className="nm">{t.name || t.username}</span><span className="ct">{t.new7 ? `+${num(t.new7)}` : ""}</span>
          </a>
        )) : <a className="nav" href="#/tracking"><span className="nm muted" style={{ fontSize: 13 }}>Track a profile…</span></a>}
        <div className="sb-label"><span>Recent posts</span></div>
        {jobs.length ? jobs.slice(0, 12).map((j) => (
          <a key={j.id} className={`nav ${hash === `#/job/${j.id}` ? "on" : ""}`} href={`#/job/${j.id}`}>
            <span className={`dot ${j.status}`} /><span className="nm">{postLabel(j)}</span><span className="ct">{num(j.uniquePeople)}</span>
          </a>
        )) : <div className="desc" style={{ padding: "4px 8px" }}>No posts yet.</div>}
        <a className={`nav ${section === "posts" ? "on" : ""}`} href="#/posts"><Icon n="file" /><span className="nm">All posts</span>{jobs.length > 12 ? <span className="ct">+{num(jobs.length - 12)}</span> : null}</a>
      </div>
      <div className="sb-foot">Runs on your Graphed credits. Free to start.<br />{stats ? `≈ ${num(Math.round(stats.credits))} credits used` : ""}</div>
    </aside>
  );
}

function Home() {
  const { data: stats, error: loadError } = usePoll(() => api<Stats>("/api/stats"), [], () => false, 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!stats) return <><Topbar crumb="Post Engagers" title="New scrape" /><div id="view"><div className="page"><p className="lead">{loadError || "Loading…"}</p></div></div></>;
  const per = stats.rates.engagement + stats.rates.profile + stats.rates.verify;
  return (
    <>
      <Topbar crumb="Post Engagers" title="New scrape" />
      <div id="view"><div className="page">
        <h1>Everyone who engaged with a post, with a verified email.</h1>
        <p className="lead">Paste a public LinkedIn post. We pull every person who reacted or commented, open their profile, find a work email ({stats.waterfall.join(" → ")}) and verify it with MillionVerifier. No LinkedIn login. Ask your agent, in the top right, can queue the first post or tracked profile for you.</p>
        <div className="card card-pad">
          <form onSubmit={async (ev) => {
            ev.preventDefault();
            setBusy(true);
            setError("");
            const data = new FormData(ev.currentTarget);
            try {
              const j = await api<Job>("/api/jobs", { method: "POST", body: JSON.stringify({ url: data.get("url"), maxProfiles: Number(data.get("cap")) }) });
              location.hash = `#/job/${j.id}`;
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}>
            <div className="scrape">
              <input type="url" name="url" placeholder="https://www.linkedin.com/posts/…  or  /feed/update/urn:li:activity:…" required autoComplete="off" />
              <button className="btn btn-primary" type="submit" disabled={busy}><Icon n="sparkle" />Scrape engagers</button>
            </div>
            <div className="opts">
              <label>Profile cap <input type="number" name="cap" min={0} max={10000} defaultValue={stats.defaultMaxProfiles} /></label>
              <span className="badge badge-secondary"><Icon n="coins" className="sm" />≈ {per.toFixed(1)}¢ per person + email lookups</span>
              <span>Free to start. Billed to this project&apos;s Graphed credits.</span>
            </div>
          </form>
          {error ? <div className="err"><Icon n="alert" className="sm" />{error}</div> : null}
        </div>
        <h2>Overview</h2>
        <div className="stats">
          <Stat value={stats.posts} label="Posts scraped" icon="file" />
          <Stat value={stats.people} label="Unique people" icon="users" />
          <Stat value={stats.verified} label="Verified emails" icon="mail" sub={`${num(stats.emails)} found`} />
          <Stat value={stats.new7} label="New this week" icon="sparkle" sub={`${num(stats.new1)} today`} />
        </div>
        <h2>How it works</h2>
        <div className="how">
          <div className="card"><div className="n"><Icon n="link" /></div><b>Paste the post URL</b><p>Any post you can open logged out. Or track a profile and every new post is picked up each morning.</p></div>
          <div className="card"><div className="n"><Icon n="users" /></div><b>Collect, profile, enrich</b><p>Reactions, comments and replies, one row per person. Full profile, then emails through the waterfall, each one verified.</p></div>
          <div className="card"><div className="n"><Icon n="download" /></div><b>Search or export</b><p>Filter by title, company, seniority or country. Copy an email, or export a clean CSV for your CRM or sequencer.</p></div>
        </div>
      </div></div>
    </>
  );
}

function JobView({ id, toast, bump }: { id: string; toast: (msg: string) => void; bump: () => void }) {
  const [tick, setTick] = useState(0);
  const { data, error } = usePoll(
    () => Promise.all([api<Job>(`/api/jobs/${id}`), api<Person[]>(`/api/jobs/${id}/people`)]),
    [id, tick], ([j]) => j.status === "running" || j.status === "queued", 4000,
  );
  if (!data) return <><Topbar crumb="Posts" title={`Post #${id}`} /><div id="view"><div className="page">{error ? <div className="alert"><Icon n="alert" className="sm" />{error}</div> : <p className="lead">Loading…</p>}</div></div></>;
  const [job, rows] = data;
  const live = job.status === "running" || job.status === "queued";
  const order = ["reactions", "comments", "profiles", "emails", "done"] as const;
  const label: Record<string, string> = { reactions: "Reactions", comments: "Comments", profiles: "Profiles", emails: "Emails + verify", done: "Done" };
  const at = order.indexOf(job.stage as typeof order[number]);
  const totals = [job.totalReactions != null ? `${num(job.totalReactions)} reactions` : "", job.totalComments != null ? `${num(job.totalComments)} comments` : ""].filter(Boolean).join(" · ");
  const again = job.status === "failed" ? "Retry" : job.status === "done" ? "Refresh contacts" : "";
  return (
    <>
      <Topbar crumb={job.source === "tracker" ? "Tracking" : "Posts"} title={postLabel(job)}>
        <StatusBadge status={job.status} stage={job.stage} />
        <span className="badge" title="1 credit = 1¢"><Icon n="coins" className="sm" />≈ {job.credits.toFixed(0)} credits</span>
        {again ? <button className="btn btn-outline btn-sm" type="button" onClick={async () => { await api(`/api/jobs/${job.id}/retry`, { method: "POST" }); toast(again === "Retry" ? "Retrying" : "Refreshing contacts"); setTick((n) => n + 1); bump(); }}><Icon n="refresh" />{again}</button> : null}
        <a className="btn btn-outline btn-sm" href={job.postUrl} target="_blank" rel="noopener"><Icon n="ext" />Open post</a>
        <a className="btn btn-primary btn-sm" href={`/api/jobs/${job.id}/export.csv`}><Icon n="download" />Export CSV</a>
      </Topbar>
      <div id="view"><div className="page">
        <h1>{live ? "Scraping engagers…" : job.status === "failed" ? "Scrape stopped" : "Lead list ready"}</h1>
        <div className="desc"><code>{shortUrl(job.postUrl)}</code> · {totals ? `${totals} on LinkedIn · ` : ""}profile cap {num(job.maxProfiles)}{live ? " · small posts take a minute or two, 1,000 engagers about 10–15 minutes" : ""}</div>
        <div className="steps">
          {order.map((s, i) => {
            const ok = i < at || job.stage === "done";
            const on = i === at && live;
            return <span key={s} className={`step ${ok ? "ok" : on ? "on" : ""}`}>{ok ? <Icon n="check" className="sm" /> : on ? <Icon n="loader" className="sm spin" /> : null}{label[s]}</span>;
          })}
        </div>
        {job.error ? <div className="alert"><Icon n="alert" className="sm" />{job.error}</div> : null}
        <div className="stats">
          <Stat value={job.engagements} label="Engagements" icon="heart" live={live} />
          <Stat value={job.uniquePeople} label="Unique people" icon="users" sub={`${num(job.newPeople)} new`} live={live} />
          <Stat value={job.profiles} label="Profiles" icon="user" live={live} />
          <Stat value={job.verified} label="Verified emails" icon="mail" sub={`${num(job.emails)} found`} live={live} />
        </div>
        <PeopleTable key={id} rows={rows} toast={toast} />
      </div></div>
    </>
  );
}

function PeopleView({ toast }: { toast: (msg: string) => void }) {
  const [since, setSince] = useState(0);
  const { data: rows, error } = usePoll(() => api<Person[]>(`/api/people${since ? `?since=${since}` : ""}`), [since], () => false, 0);
  const q = since ? `?since=${since}` : "";
  return (
    <>
      <Topbar crumb="Post Engagers" title="Everyone">
        <a className="btn btn-primary btn-sm" href={`/api/people/export.csv${q}`}><Icon n="download" />Export CSV</a>
      </Topbar>
      <div id="view"><div className="page">
        <h1>Everyone you&apos;ve pulled</h1>
        <p className="lead">Every person across every post, one row each. &quot;New&quot; means first seen in that window: your net-new engagers.</p>
        <SinceTabs since={since} onChange={setSince} />
        {error ? <div className="alert"><Icon n="alert" className="sm" />{error}</div> : null}
        {rows ? <PeopleTable rows={rows} toast={toast} /> : null}
      </div></div>
    </>
  );
}

function Tracking({ toast, bump }: { toast: (msg: string) => void; bump: () => void }) {
  const [tick, setTick] = useState(0);
  const { data: list, error: loadError } = usePoll(() => api<Tracked[]>("/api/tracked"), [tick], (rows) => rows.some((t) => t.checking), 5000);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => { setTick((n) => n + 1); bump(); };
  return (
    <>
      <Topbar crumb="Post Engagers" title="Tracking" />
      <div id="view"><div className="page">
        <h1>Watch a profile. Get every new engager, daily.</h1>
        <p className="lead">Each morning (7am MT) we pull each tracked profile&apos;s new posts, scrape everyone who reacted or commented, find emails and verify them. Each post is scraped once, about a day after it goes up.</p>
        <div className="card card-pad">
          <form onSubmit={async (ev) => {
            ev.preventDefault();
            setBusy(true);
            setError("");
            const form = ev.currentTarget;
            const data = new FormData(form);
            try {
              const t = await api<Tracked>("/api/tracked", { method: "POST", body: JSON.stringify({ url: data.get("url"), backfillDays: Number(data.get("backfill")), maxProfiles: Number(data.get("cap")) }) });
              toast(`Tracking /in/${t.username}. Checking posts now.`);
              form.reset();
              refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
            setBusy(false);
          }}>
            <div className="scrape">
              <input type="url" name="url" placeholder="https://www.linkedin.com/in/username" required autoComplete="off" />
              <button className="btn btn-primary" type="submit" disabled={busy}><Icon n="activity" />Start tracking</button>
            </div>
            <div className="opts">
              <label>Backfill days <input type="number" name="backfill" min={0} max={90} defaultValue={7} /></label>
              <label>Profile cap per post <input type="number" name="cap" min={0} max={10000} defaultValue={1000} /></label>
              <span>The first check queues posts from the last backfill days.</span>
            </div>
          </form>
          {error || loadError ? <div className="err"><Icon n="alert" className="sm" />{error || loadError}</div> : null}
        </div>
        <h2>Tracked profiles</h2>
        <div className="tw">
          <table>
            <thead><tr><th>Profile</th><th className="hide-sm">Last check</th><th>Posts</th><th>People</th><th>New 7d</th><th>Verified</th><th /></tr></thead>
            <tbody>
              {list && list.length ? list.map((t) => (
                <tr className="lnk" key={t.id} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) location.hash = `#/tracked/${t.id}`; }}>
                  <td>
                    <div className="person"><span className="av"><Icon n="user" className="sm" /></span><div><b>{t.name || t.username}</b><span className="hl">/in/{t.username}</span></div></div>
                    {t.lastError ? <div className="alert"><Icon n="alert" className="sm" />{t.lastError}</div> : null}
                  </td>
                  <td className="hide-sm">
                    {t.checking ? <span className="badge badge-brand"><span className="pulse" />Checking</span>
                      : t.active ? <span className="muted">{t.lastCheckedAt ? ago(t.lastCheckedAt) : "Not yet"}</span>
                      : <span className="badge badge-secondary"><Icon n="pause" className="sm" />Paused</span>}
                  </td>
                  <td className="num">{num(t.posts)}</td>
                  <td className="num">{num(t.people)}</td>
                  <td>{t.new7 ? <span className="badge badge-brand">+{num(t.new7)}</span> : <span className="num">0</span>}</td>
                  <td className="num">{num(t.verified)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn btn-outline btn-xs" type="button" onClick={async () => { await api(`/api/tracked/${t.id}/check`, { method: "POST" }); toast("Checking for new posts"); refresh(); }}><Icon n="refresh" className="sm" />Check now</button>{" "}
                    <button className="btn btn-ghost btn-xs" type="button" onClick={async () => { await api(`/api/tracked/${t.id}/toggle`, { method: "POST" }); refresh(); }}><Icon n={t.active ? "pause" : "play"} className="sm" />{t.active ? "Pause" : "Resume"}</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={7}>{list ? <Empty icon="activity" title="No tracked profiles yet" text="Add a LinkedIn profile above, or use Ask your agent in the top right." /> : <div className="empty"><p>Loading…</p></div>}</td></tr>}
            </tbody>
          </table>
        </div>
      </div></div>
    </>
  );
}

function TrackedView({ id, toast }: { id: string; toast: (msg: string) => void }) {
  const [days, setDays] = useState(7);
  const [tick, setTick] = useState(0);
  const { data, error } = usePoll(
    () => Promise.all([
      api<Tracked[]>("/api/tracked"),
      api<PostRow[]>(`/api/tracked/${id}/posts`),
      api<Person[]>(`/api/people?tracked=${id}${days ? `&since=${days}` : ""}`),
    ]),
    [id, days, tick],
    ([tracked, posts]) => !!tracked.find((x) => String(x.id) === String(id))?.checking || posts.some((p) => p.status === "running" || p.status === "queued"),
    6000,
  );
  if (error) return <><Topbar crumb="Tracking" title="Error" /><div id="view"><div className="page"><div className="alert"><Icon n="alert" className="sm" />{error}</div></div></div></>;
  const t = data ? data[0].find((x) => String(x.id) === String(id)) : undefined;
  if (!data || !t) return <><Topbar crumb="Tracking" /><div id="view"><div className="page"><p className="lead">{data ? "No such tracked profile" : "Loading…"}</p></div></div></>;
  const posts = data[1];
  const rows = data[2];
  const q = `?tracked=${id}${days ? `&since=${days}` : ""}`;
  return (
    <>
      <Topbar crumb="Tracking" title={t.name || t.username}>
        {t.checking ? <span className="badge badge-brand"><span className="pulse" />Checking</span>
          : t.active ? <span className="badge badge-secondary"><Icon n="clock" className="sm" />Daily 7am MT</span>
          : <span className="badge badge-secondary"><Icon n="pause" className="sm" />Paused</span>}
        <button className="btn btn-outline btn-sm" type="button" onClick={async () => { await api(`/api/tracked/${id}/check`, { method: "POST" }); toast("Checking for new posts"); setTick((n) => n + 1); }}><Icon n="refresh" />Check now</button>
        <a className="btn btn-primary btn-sm" href={`/api/people/export.csv${q}`}><Icon n="download" />Export CSV</a>
      </Topbar>
      <div id="view"><div className="page">
        <h1>{t.name || t.username}</h1>
        <p className="lead">{t.headline || `/in/${t.username}`}<br /><span style={{ fontSize: 13 }}>{t.lastCheckedAt ? `Checked ${ago(t.lastCheckedAt)}` : "Not checked yet"}</span></p>
        <div className="stats">
          <Stat value={t.posts} label="Posts tracked" icon="file" />
          <Stat value={t.people} label="Unique people" icon="users" />
          <Stat value={t.new7} label="New this week" icon="sparkle" />
          <Stat value={t.verified} label="Verified emails" icon="mail" />
        </div>
        <h2>Posts</h2>
        <div className="tw">
          <table>
            <thead><tr><th>Posted</th><th>Post</th><th className="hide-sm">On LinkedIn</th><th>People</th><th>New</th><th>Verified</th><th>Status</th></tr></thead>
            <tbody>
              {posts.length ? posts.map((p) => (
                <tr className="lnk" key={p.url} onClick={() => { if (p.jobId) location.hash = `#/job/${p.jobId}`; }}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{p.postedAt ? new Date(p.postedAt).toLocaleDateString() : ""}</td>
                  <td><div className="hl" style={{ maxWidth: 420, color: "var(--foreground)" }}>{p.snippet || p.url}</div></td>
                  <td className="hide-sm num" style={{ whiteSpace: "nowrap" }}>{num(p.reactions)} reactions · {num(p.comments)} comments</td>
                  <td className="num">{num(p.people)}</td>
                  <td>{p.newPeople ? <span className="badge badge-brand">+{num(p.newPeople)}</span> : <span className="num">—</span>}</td>
                  <td className="num">{num(p.verified)}</td>
                  <td>{p.jobId ? <StatusBadge status={p.status} stage="running" /> : <span className="badge badge-secondary"><Icon n="clock" className="sm" />Waits ~1 day</span>}</td>
                </tr>
              )) : <tr><td colSpan={7}><Empty icon="file" title="No posts found yet" text="The first check runs right after you add a profile." /></td></tr>}
            </tbody>
          </table>
        </div>
        <h2>Engagers</h2>
        <SinceTabs since={days} onChange={setDays} />
        <PeopleTable rows={rows} toast={toast} />
      </div></div>
    </>
  );
}

function PostsView() {
  const { data, error } = usePoll(
    () => api<Job[]>("/api/jobs"),
    [],
    (rows) => rows.some((j) => j.status === "running" || j.status === "queued"),
    6000,
  );
  const jobs = data || [];
  return (
    <>
      <Topbar crumb="Post Engagers" title="All posts" />
      <div id="view"><div className="page">
        <h1>Every scrape.</h1>
        <p className="lead">The sidebar keeps the latest few. Everything scraped is here, including older posts you still need to retry, refresh, or export.</p>
        {error ? <div className="alert"><Icon n="alert" className="sm" />{error}</div> : null}
        <div className="tw">
          <table>
            <thead><tr><th>Post</th><th>When</th><th>People</th><th className="hide-sm">Verified</th><th>Status</th></tr></thead>
            <tbody>
              {jobs.length ? jobs.map((j) => (
                <tr className="lnk" key={j.id} onClick={() => { location.hash = `#/job/${j.id}`; }}>
                  <td><b>{postLabel(j)}</b><div className="hl">{shortUrl(j.postUrl)}</div></td>
                  <td className="num">{ago(j.createdAt)}</td>
                  <td className="num">{num(j.uniquePeople)}</td>
                  <td className="num hide-sm">{num(j.verified)}</td>
                  <td><StatusBadge status={j.status} stage={j.stage} /></td>
                </tr>
              )) : <tr><td colSpan={5}>{data ? <Empty icon="file" title="No posts yet" text="Paste a LinkedIn post on New scrape, or use Ask your agent in the top right." /> : <div className="empty"><p>Loading…</p></div>}</td></tr>}
            </tbody>
          </table>
        </div>
      </div></div>
    </>
  );
}

export function App() {
  const hash = useHash();
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string }>>([]);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => { setNavOpen(false); }, [hash]);
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  const job = hash.match(/^#\/job\/(\d+)/);
  const tracked = hash.match(/^#\/tracked\/(\d+)/);
  return (
    <>
      <button className="nav-btn" type="button" aria-label={navOpen ? "Close menu" : "Open menu"} aria-expanded={navOpen} onClick={() => setNavOpen((open) => !open)}><Icon n="menu" /></button>
      {navOpen ? <button className="nav-backdrop" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}
      <div id="shell" className={navOpen ? "nav-open" : ""}>
        <Sidebar hash={hash} tick={tick} />
        <main>
          {job ? <JobView key={job[1]} id={job[1]} toast={toast} bump={bump} />
            : tracked ? <TrackedView key={tracked[1]} id={tracked[1]} toast={toast} />
            : hash.startsWith("#/tracking") ? <Tracking toast={toast} bump={bump} />
            : hash.startsWith("#/people") ? <PeopleView toast={toast} />
            : hash.startsWith("#/posts") ? <PostsView />
            : <Home />}
        </main>
      </div>
      <div id="toasts">{toasts.map((t) => <div className="toast" key={t.id}><Icon n="checkc" /><span>{t.msg}</span></div>)}</div>
    </>
  );
}
