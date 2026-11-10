// @ts-nocheck
// Pure parsing helpers: Graphed Tools output → engager rows and flat person records.
// No I/O here, so test.mjs can run it against saved tool output.

// LinkedIn post URL → canonical post URL the scrapers accept. Accepts
// linkedin.com/posts/<slug>-activity-<id>-xxxx, feed/update/urn:li:activity:<id>,
// feed/update/urn:li:ugcPost:<id>, urn:li:share:<id>, or a bare 19-digit id.
export function parsePostUrl(input) {
  const s = String(input || "").trim();
  if (/^\d{16,22}$/.test(s)) return { postId: s, url: `https://www.linkedin.com/feed/update/urn:li:activity:${s}/` };
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  let path;
  try { path = decodeURIComponent(u.pathname); } catch { return null; }
  let m = path.match(/urn:li:(activity|ugcPost|share):(\d{16,22})/);
  if (m) return { postId: m[2], url: `https://www.linkedin.com/feed/update/urn:li:${m[1]}:${m[2]}/` };
  m = path.match(/activity-(\d{16,22})/);
  if (m) return { postId: m[1], url: `https://www.linkedin.com${u.pathname}` };
  return null;
}

const clean = (u) => String(u || "").split("?")[0].replace(/\/$/, "");

// Reactions actor rows → [{ urn, name, headline, profileUrl, reactionType }]
export function parseReactions(items) {
  const out = [];
  for (const it of items || []) {
    const r = it && it.reactor;
    if (!r || !r.urn) continue;
    const url = clean(r.profile_url);
    if (!/linkedin\.com\/in\//.test(url)) continue; // company pages react too; skip them
    out.push({ urn: r.urn, name: r.name || "", headline: r.headline || "", profileUrl: url, reactionType: it.reaction_type || "LIKE" });
  }
  return out;
}

export function reactionsTotal(items) {
  for (const it of items || []) if (it && it._metadata && it._metadata.total_reactions != null) return Number(it._metadata.total_reactions);
  return null;
}

// Comments actor rows → [{ urn, name, headline, profileUrl, comment, commentUrl, isReply }]
// Includes nested replies. The last row is a summary object with no author.
export function parseComments(items) {
  const out = [];
  const add = (c, isReply) => {
    const a = c && c.author;
    if (!a || !a.profile_id) return;
    out.push({
      urn: a.profile_id, name: a.name || "", headline: a.headline || "", profileUrl: clean(a.profile_url),
      comment: String(c.text || "").slice(0, 2000), commentUrl: c.comment_url || "", isReply,
    });
  };
  for (const it of items || []) {
    if (!it || !it.author) continue;
    add(it, false);
    for (const r of it.replies || []) add(r, true);
  }
  return out;
}

export function commentsSummary(items) {
  for (const it of items || []) if (it && it.summary) return it.summary;
  return null;
}

// Seniority + function from a job title. Rough rules; good enough to filter on.
export function seniorityOf(title) {
  const t = ` ${String(title || "").toLowerCase()} `;
  if (/\b(founder|co-founder|cofounder|owner|partner|proprietor)\b/.test(t)) return "Owner / Founder";
  if (/\b(ceo|cto|cfo|coo|cmo|cro|cpo|cio|ciso|chief|president)\b/.test(t)) return "C-Suite";
  if (/\b(vp|svp|evp|vice president)\b/.test(t)) return "VP";
  if (/\b(head of|director|gm|general manager)\b/.test(t)) return "Director";
  if (/\b(manager|lead|principal|supervisor)\b/.test(t)) return "Manager";
  if (/\b(intern|student|trainee)\b/.test(t)) return "Entry";
  if (t.trim()) return "Individual contributor";
  return "";
}

export function functionOf(title) {
  const t = String(title || "").toLowerCase();
  const rules = [
    ["Marketing", /market|growth|brand|seo|content|demand|social media|paid|ppc|communications|pr\b/],
    ["Sales", /sales|account exec|business development|bdr|sdr|revenue|partnership|account manager/],
    ["Engineering", /engineer|developer|software|devops|architect|cto|technical|data scien|machine learning|\bai\b/],
    ["Product", /product|ux|ui\b|design/],
    ["Operations", /operations|\bops\b|revops|supply|logistics|coo\b/],
    ["Recruiting / HR", /recruit|talent|people|hr\b|human resources/],
    ["Finance", /finance|accountant|cfo|controller|accounting|investor|venture|vc\b/],
    ["Founder / Executive", /founder|ceo|owner|president|chief/],
    ["Consulting", /consult|advisor|coach|freelanc|agency/],
  ];
  for (const [name, re] of rules) if (re.test(t)) return name;
  return "";
}

const FREE = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|proton|protonmail|gmx|yandex|mail|zoho)\./i;

// harvestapi~linkedin-profile-scraper row → flat person record (what the table and CSV show).
export function flattenProfile(x) {
  const cur = (x.currentPosition && x.currentPosition[0]) || (x.experience && x.experience[0]) || {};
  const loc = x.location || {};
  const parsed = loc.parsed || {};
  const emails = Array.isArray(x.emails) ? x.emails : [];
  const best = emails.find((e) => e.status === "valid") || emails[0] || null;
  const email = best ? String(best.email || "").toLowerCase() : "";
  const site = (x.companyWebsites || []).map((w) => w.domain).find(Boolean) || "";
  const domain = email && !FREE.test(email) ? email.split("@")[1] : site;
  const title = cur.position || "";
  const span = (e) => [e.startDate && e.startDate.text, e.endDate && e.endDate.text].filter(Boolean).join(" – ");
  return {
    urn: x.id,
    publicId: x.publicIdentifier || "",
    profileUrl: x.linkedinUrl || (x.publicIdentifier ? `https://www.linkedin.com/in/${x.publicIdentifier}` : ""),
    name: `${x.firstName || ""} ${x.lastName || ""}`.replace(/\s+/g, " ").trim(),
    firstName: String(x.firstName || "").trim(),
    lastName: String(x.lastName || "").trim(),
    headline: x.headline || "",
    title,
    company: cur.companyName || "",
    companyLinkedin: cur.companyLinkedinUrl || "",
    companyDomain: domain || "",
    companySite: site,
    industry: (x.industry && (x.industry.name || x.industry)) || "",
    seniority: seniorityOf(title),
    jobFunction: functionOf(title || x.headline),
    location: loc.linkedinText || parsed.text || "",
    city: parsed.city || "",
    state: parsed.state || "",
    country: parsed.country || "",
    countryCode: loc.countryCode || parsed.countryCode || "",
    followers: x.followerCount ?? null,
    connections: x.connectionsCount ?? null,
    openToWork: !!x.openToWork,
    hiring: !!x.hiring,
    premium: !!x.premium,
    about: String(x.about || "").slice(0, 2000),
    experience: (x.experience || []).slice(0, 5).map((e) => `${e.position || ""} @ ${e.companyName || ""}${span(e) ? ` (${span(e)})` : ""}`).join("; "),
    education: (x.education || []).slice(0, 3).map((e) => [[e.degree, e.fieldOfStudy].filter(Boolean).join(", "), e.schoolName].filter(Boolean).join(" @ ")).join("; "),
    skills: (x.skills || []).slice(0, 15).map((s) => s.name).filter(Boolean).join(", "),
    languages: (x.languages || []).map((l) => String(l.name || "").trim()).filter(Boolean).join(", "),
    photo: x.photo || (x.profilePicture && x.profilePicture.url) || "",
    email,
    emailStatus: best ? best.status || "" : "",
    emailQuality: best && best.qualityScore != null ? best.qualityScore : null,
    emailCatchAll: best ? !!best.catchAllDomain : false,
  };
}

// CSV, spreadsheet-safe: quotes every field, neutralises leading = + - @ (formula injection).
export function toCsv(rows, columns) {
  const esc = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [columns.map((c) => esc(c[0])).join(","), ...rows.map((r) => columns.map((c) => esc(c[1](r))).join(","))].join("\r\n") + "\r\n";
}
