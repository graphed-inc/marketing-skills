// @ts-nocheck
// Email waterfall for profiled people: each provider in EMAIL_WATERFALL order (default
// getleads → leadmagic → apollo) runs only for people still without an MV-"ok" email. Every
// email found is checked with Million Verifier: "ok" ends the waterfall for that person,
// "catch_all" is kept as a fallback while later providers try, "invalid" is dropped.
import { createHash } from "node:crypto";
import { coreEnv } from "./config.ts";
import { tryTool, pool as lanes, TOOLS, RATES } from "./tools.ts";

// The whole provider input, so a batch that gains or loses a person cannot
// replay a result that was fetched for a different set.
export function batchKey(payload) {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function emailWaterfall(): string[] {
  return String(coreEnv().EMAIL_WATERFALL || "getleads,leadmagic,apollo")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Link-in-bio and social hosts that show up in a profile's websites but are not the employer.
const NOT_COMPANY = /(^|\.)(linktr\.ee|taap\.it|bit\.ly|calendly\.com|cal\.com|medium\.com|substack\.com|github\.com|youtube\.com|youtu\.be|linkedin\.com|lnkd\.in|x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com|notion\.site|beacons\.ai|stan\.store|carrd\.co|wixsite\.com|wordpress\.com|blogspot\.com|gumroad\.com|hubspot\.com|google\.com|forms\.gle|bento\.me|link\.me|lu\.ma|eventbrite\.com|amazon\.com|apple\.com|spotify\.com)$/i;
const FREE = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|gmx|yandex|mail|zoho)\./i;
const RANK = { ok: 3, catch_all: 2, unknown: 1 };
const norm = (u) => String(u || "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("?")[0].replace(/\/$/, "");
const same = (a, b) => { a = String(a || "").toLowerCase(); b = String(b || "").toLowerCase(); return !!a && !!b && (a.includes(b) || b.includes(a)); };

export function companyDomain(d) {
  const site = String(d.companySite || "").toLowerCase();
  if (site && !NOT_COMPANY.test(site)) return site;
  return "";
}

async function verify(email, key) {
  const r = await tryTool(TOOLS.verify, { email }, key);
  return r ? String(r.result || "unknown") : "unknown";
}

// people: [{ urn, data }] with data = flattenProfile() output. Returns credits spent (estimate).
export async function enrichPeople(people, key, onDone) {
  let credits = 0;
  const st = new Map(people.map((p) => [p.urn, {
    p, d: p.data || {}, best: null, tried: {}, firmo: {},
  }]));
  const open = () => [...st.values()].filter((s) => !s.best || s.best.verify !== "ok");

  // A provider found an email: verify it and keep it if it beats what we have.
  const consider = async (s, email, source) => {
    email = String(email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (s.best && s.best.email === email) return;
    const v = await verify(email, `${key}-mv-${email}`);
    credits += RATES.verify;
    s.tried[source] = { email, verify: v };
    if (v === "invalid" || v === "disposable") return;
    if (!s.best || (RANK[v] || 0) > (RANK[s.best.verify] || 0)) s.best = { email, source, verify: v };
  };

  // Harvest's own email search (profile stage, only when "harvest" is in the waterfall).
  const harvest = async (list) => lanes(list, 5, async (s) => { if (s.d.email) await consider(s, s.d.email, "harvest"); });

  // GetLeads: batch by LinkedIn URL. Nearly free; also gives company size when its company matches.
  const getleads = async (list) => {
    const withUrl = list.filter((s) => /linkedin\.com\/in\/(?!ACoA)/.test(s.d.profileUrl || ""));
    for (let i = 0; i < withUrl.length; i += 25) {
      const batch = withUrl.slice(i, i + 25);
      const items = batch.map((s) => ({ linkedinUrl: s.d.profileUrl }));
      const res = await tryTool(TOOLS.getleads, { items }, `${key}-gl-${batchKey(items)}`);
      credits += batch.length * RATES.getleads;
      const byUrl = new Map(((res && res.results) || []).map((r) => [norm(r.linkedinUrl), r]));
      await lanes(batch, 5, async (s) => {
        const r = byUrl.get(norm(s.d.profileUrl));
        if (!r) return;
        const g = r.data || {};
        if (same(g.current_company_name, s.d.company)) {
          s.firmo = { companySize: g.employee_count_range || "", companyDomainGL: g.org_domain || g.current_company_website || "" };
        }
        s.tried.getleads = { email: r.email || null };
        if (r.email) await consider(s, r.email, "getleads");
      });
    }
  };

  // LeadMagic: one call per person, needs first + last name and the employer's domain.
  const leadmagic = async (list) => lanes(list, 5, async (s) => {
    const domain = companyDomain(s.d) || s.firmo.companyDomainGL || "";
    if (!s.d.firstName || !s.d.lastName || !domain) { s.tried.leadmagic = { skipped: "no domain or name" }; return; }
    const r = await tryTool(TOOLS.leadmagic, { firstName: s.d.firstName, lastName: s.d.lastName, domain, companyName: s.d.company || undefined }, `${key}-lm-${s.p.urn}`);
    if (r && r.email) { credits += RATES.leadmagic; await consider(s, r.email, "leadmagic"); }
    else s.tried.leadmagic = { email: null, status: r && r.status };
  });

  // Apollo: bulk match, 10 people per call, by LinkedIn URL + name + domain.
  const apollo = async (list) => {
    for (let i = 0; i < list.length; i += 10) {
      const batch = list.slice(i, i + 10);
      const details = batch.map((s) => {
        const o = { firstName: s.d.firstName || undefined, lastName: s.d.lastName || undefined, organizationName: s.d.company || undefined };
        if (/linkedin\.com\/in\/(?!ACoA)/.test(s.d.profileUrl || "")) o.linkedinUrl = s.d.profileUrl;
        const dom = companyDomain(s.d) || s.firmo.companyDomainGL;
        if (dom) o.domain = dom;
        return o;
      });
      const r = await tryTool(TOOLS.apollo, { details }, `${key}-ap-${batchKey(details)}`);
      const matches = (r && r.matches) || [];
      credits += matches.filter(Boolean).length * RATES.apollo;
      await lanes(batch, 5, async (s, j) => {
        const m = matches[j] && (!matches[j].linkedin_url || !details[j].linkedinUrl || norm(matches[j].linkedin_url) === norm(details[j].linkedinUrl)) ? matches[j] : null;
        s.tried.apollo = { email: (m && m.email) || null, status: m && m.email_status };
        if (m && m.email && !FREE.test(m.email)) await consider(s, m.email, "apollo");
      });
    }
  };

  const steps = { harvest, getleads, leadmagic, apollo };
  // Harvest always goes first: it only verifies an email the profile scrape already returned
  // (email mode, or people profiled before the waterfall existed), so it costs no lookup.
  for (const name of ["harvest", ...emailWaterfall().filter((w: string) => w !== "harvest")]) {
    if (!steps[name]) continue;
    const list = open();
    if (!list.length) break;
    await steps[name](list);
  }

  for (const s of st.values()) {
    await onDone(s.p.urn, {
      email: s.best ? s.best.email : "",
      source: s.best ? s.best.source : null,
      verify: s.best ? s.best.verify : null,
      firmo: s.firmo.companySize ? { companySize: s.firmo.companySize } : {},
      tried: s.tried,
    });
  }
  return credits;
}
