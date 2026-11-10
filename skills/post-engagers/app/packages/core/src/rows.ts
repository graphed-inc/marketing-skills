// @ts-nocheck
// Shared by server.mjs and cli.mjs: DB row → table/CSV row, and the CSV column list.
// One row for the UI and CSV: profile fields from people.data, engagement fields from job_people.
export function personRow(r) {
  const d = r.data || {};
  return {
    urn: r.urn,
    name: d.name || r.name || "",
    firstName: d.firstName || "", lastName: d.lastName || "",
    headline: d.headline || r.headline || "",
    title: d.title || "", company: d.company || "", companyDomain: d.companyDomain || "",
    companyLinkedin: d.companyLinkedin || "", industry: d.industry || "",
    seniority: d.seniority || "", jobFunction: d.jobFunction || "",
    location: d.location || "", city: d.city || "", state: d.state || "", country: d.country || "",
    followers: d.followers ?? null, connections: d.connections ?? null, openToWork: !!d.openToWork,
    about: d.about || "", experience: d.experience || "", education: d.education || "",
    skills: d.skills || "", languages: d.languages || "", photo: d.photo || "",
    email: r.email || "",
    emailVerify: r.email_verify || "",          // Million Verifier: ok | catch_all | unknown
    emailSource: r.email_source || "",          // harvest | getleads | leadmagic | apollo
    companySize: d.companySize || "",
    enriched: !!r.enriched_at,
    profileUrl: d.profileUrl || r.profile_url || "",
    profiled: !!r.profiled_at,
    reacted: !!r.reacted, reactionType: r.reaction_type || "",
    commented: !!r.commented, comment: r.comment || "",
    posts: r.posts || 1, firstSeen: r.created_at || r.first_seen, postUrls: r.post_urls || "",
  };
}

export const COLUMNS = [
  ["Name", (r) => r.name], ["First name", (r) => r.firstName], ["Last name", (r) => r.lastName],
  ["Email", (r) => r.email], ["Email verified (Million Verifier)", (r) => r.emailVerify], ["Email source", (r) => r.emailSource],
  ["Job title", (r) => r.title], ["Company", (r) => r.company], ["Company domain", (r) => r.companyDomain],
  ["Company LinkedIn", (r) => r.companyLinkedin], ["Company size", (r) => r.companySize], ["Industry", (r) => r.industry],
  ["Seniority", (r) => r.seniority], ["Job function", (r) => r.jobFunction], ["Headline", (r) => r.headline],
  ["Location", (r) => r.location], ["City", (r) => r.city], ["State", (r) => r.state], ["Country", (r) => r.country],
  ["Followers", (r) => r.followers], ["Connections", (r) => r.connections], ["Open to work", (r) => (r.openToWork ? "yes" : "")],
  ["Reacted", (r) => (r.reacted ? "yes" : "")], ["Reaction", (r) => r.reactionType],
  ["Commented", (r) => (r.commented ? "yes" : "")], ["Comment", (r) => r.comment],
  ["Experience", (r) => r.experience], ["Education", (r) => r.education], ["Skills", (r) => r.skills],
  ["Languages", (r) => r.languages], ["About", (r) => r.about], ["LinkedIn URL", (r) => r.profileUrl],
  ["Posts engaged", (r) => r.posts], ["First seen", (r) => (r.firstSeen ? new Date(r.firstSeen).toISOString().slice(0, 10) : "")],
  ["Post URLs", (r) => r.postUrls],
];

