// Enrichment library: the Clay "Add enrichment" menu, each entry one Graphed Tool.
//
//   inputs  form fields; `match` guesses which table column to map in by name
//   body    turns the rendered inputs into the tool's request body
//   pick    path(s) to the main value shown in the cell (first non-empty wins)
//   outputs suggested "add as column" fields (path inside the cell's JSON)
//   kind    email | phone | domain | linkedin: which waterfalls the preset can join
//   rate    credits per call (1 credit = 1¢), from `graphed tools catalog`
//
// Anything not listed works through the "Custom tool" preset (any tool id + JSON body),
// including every Apify actor (apify:<owner~actor>).

const FIRST = /^(first|first ?name|given)/i;
const LAST = /^(last|last ?name|surname|family)/i;
const FULL = /^(name|full ?name|person|contact)$/i;
const DOMAIN = [/domain$/i, /(website|site|url)$/i]; // a "domain" column beats a "website" column
const COMPANY = /^(company|company ?name|organization|org|account|employer)$/i;
const LINKEDIN = /linkedin/i;
const EMAIL = /e-?mail/i;

export const PRESETS = [
  // ---------- People: find emails ----------
  {
    id: "column_value", name: "Use a value already in the table", category: "People", kind: "email",
    tool: "", rate: 0,
    desc: "Free waterfall step: take an email (or phone) a lead source already gave you, then verify it.",
    inputs: [{ key: "value", label: "Column", match: EMAIL, required: true }],
    pick: ["value"],
    outputs: [],
    local: true,
  },
  {
    id: "getleads_email", name: "Find work email (GetLeads)", category: "People", kind: "email",
    tool: "getleads:enrich.from-person", rate: 0.000115,
    desc: "Name + company domain → work email. Almost free; run it first in a waterfall.",
    inputs: [
      { key: "firstName", label: "First name", match: FIRST, required: true },
      { key: "lastName", label: "Last name", match: LAST, required: true },
      { key: "emailDomain", label: "Company domain", match: DOMAIN, required: true },
      { key: "companyName", label: "Company name", match: COMPANY },
    ],
    pick: ["results.0.email"],
    outputs: [
      { name: "Email", path: "results.0.email" },
      { name: "Title", path: "results.0.data.current_title" },
      { name: "Seniority", path: "results.0.data.current_seniority" },
      { name: "Employees", path: "results.0.data.employee_count_range" },
      { name: "Company phone", path: "results.0.data.company_phone" },
    ],
  },
  {
    id: "getleads_linkedin_email", name: "Find email from LinkedIn URL (GetLeads)", category: "People", kind: "email",
    tool: "getleads:enrich.from-linkedin", rate: 0.000115,
    desc: "LinkedIn profile URL → work email + title. Almost free.",
    inputs: [{ key: "linkedinUrl", label: "LinkedIn profile URL", match: LINKEDIN, required: true }],
    body: (i: Record<string, string>) => ({ items: [{ linkedinUrl: i.linkedinUrl }] }),
    pick: ["results.0.email"],
    outputs: [
      { name: "Email", path: "results.0.email" },
      { name: "Title", path: "results.0.data.current_title" },
      { name: "Company", path: "results.0.data.current_company_name" },
      { name: "Company domain", path: "results.0.data.org_domain" },
    ],
  },
  {
    id: "leadmagic_email", name: "Find work email (LeadMagic)", category: "People", kind: "email",
    tool: "leadmagic:people.email-finder", rate: 3.45,
    desc: "Name + company domain → work email. Billed only when an email is found.",
    inputs: [
      { key: "firstName", label: "First name", match: FIRST, required: true },
      { key: "lastName", label: "Last name", match: LAST, required: true },
      { key: "domain", label: "Company domain", match: DOMAIN, required: true },
      { key: "companyName", label: "Company name", match: COMPANY },
    ],
    pick: ["email"],
    outputs: [{ name: "Email", path: "email" }, { name: "Email status", path: "status" }],
  },
  {
    id: "apollo_email", name: "Find email (Apollo)", category: "People", kind: "email",
    tool: "apollo:people.match", rate: 0.92,
    desc: "Match a person by name + domain, LinkedIn URL, or Apollo id. Returns email, title, location.",
    inputs: [
      { key: "firstName", label: "First name", match: FIRST },
      { key: "lastName", label: "Last name", match: LAST },
      { key: "domain", label: "Company domain", match: DOMAIN },
      { key: "organizationName", label: "Company name", match: COMPANY },
      { key: "linkedinUrl", label: "LinkedIn URL", match: LINKEDIN },
      { key: "id", label: "Apollo person id", match: /apollo ?id/i },
    ],
    pick: ["person.email"],
    outputs: [
      { name: "Email", path: "person.email" },
      { name: "Email status", path: "person.email_status" },
      { name: "Full name", path: "person.name" },
      { name: "Last name", path: "person.last_name" },
      { name: "Title", path: "person.title" },
      { name: "Seniority", path: "person.seniority" },
      { name: "LinkedIn", path: "person.linkedin_url" },
      { name: "City", path: "person.city" },
      { name: "Company domain", path: "person.organization.primary_domain" },
    ],
  },
  {
    id: "verify_email", name: "Verify email (Million Verifier)", category: "People", kind: "verify",
    tool: "million-verifier:validate", rate: 0.046,
    desc: "ok / catch_all / invalid / unknown. Use before you send.",
    inputs: [{ key: "email", label: "Email", match: EMAIL, required: true }],
    pick: ["result"],
    outputs: [{ name: "Email result", path: "result" }, { name: "Email quality", path: "quality" }],
  },
  // ---------- People: phones + profiles ----------
  {
    id: "apollo_phone", name: "Find mobile phone (Apollo)", category: "People", kind: "phone",
    tool: "apollo:people.phone", rate: 0.92,
    desc: "Personal mobile from name + domain, email, or LinkedIn URL.",
    inputs: [
      { key: "firstName", label: "First name", match: FIRST },
      { key: "lastName", label: "Last name", match: LAST },
      { key: "domain", label: "Company domain", match: DOMAIN },
      { key: "email", label: "Email", match: EMAIL },
      { key: "linkedinUrl", label: "LinkedIn URL", match: LINKEDIN },
    ],
    pick: ["phone", "phone_number", "sanitized_number", "person.phone_numbers.0.sanitized_number", "phone_numbers.0.sanitized_number", "mobile_phone"],
    outputs: [],
  },
  {
    id: "leadmagic_mobile", name: "Find mobile phone (LeadMagic)", category: "People", kind: "phone",
    tool: "leadmagic:people.mobile-finder", rate: 3.45,
    desc: "Mobile number from a LinkedIn URL or work email. Billed only when found.",
    inputs: [
      { key: "profileUrl", label: "LinkedIn URL", match: LINKEDIN },
      { key: "workEmail", label: "Work email", match: EMAIL },
    ],
    pick: ["mobile_number", "mobileNumber", "phone", "mobile"],
    outputs: [],
  },
  {
    id: "linkedin_profile", name: "LinkedIn profile (ScrapeCreators)", category: "People", kind: "linkedin",
    tool: "scrapecreators:v1/linkedin/profile", rate: 0.2162,
    desc: "Public LinkedIn profile: headline, about, experience, education.",
    inputs: [{ key: "url", label: "LinkedIn profile URL", match: LINKEDIN, required: true }],
    pick: ["name", "headline"],
    outputs: [
      { name: "Headline", path: "headline" }, { name: "About", path: "about" },
      { name: "Location", path: "location" }, { name: "Followers", path: "followers" },
    ],
  },
  {
    id: "leadmagic_profile", name: "LinkedIn profile (LeadMagic)", category: "People", kind: "linkedin",
    tool: "leadmagic:people.profile-search", rate: 3.45,
    desc: "Full B2B profile from a LinkedIn URL.",
    inputs: [{ key: "profileUrl", label: "LinkedIn profile URL", match: LINKEDIN, required: true }],
    pick: ["full_name", "professional_title", "headline"],
    outputs: [],
  },
  {
    id: "role_finder", name: "Find person by role (LeadMagic)", category: "People",
    tool: "leadmagic:people.role-finder", rate: 3.45,
    desc: "Company + job title → the person in that seat (e.g. Head of Marketing at acme.com).",
    inputs: [
      { key: "jobTitle", label: "Job title", default: "Head of Marketing", required: true },
      { key: "companyDomain", label: "Company domain", match: DOMAIN },
      { key: "companyName", label: "Company name", match: COMPANY },
    ],
    pick: ["name", "full_name"],
    outputs: [],
  },
  // ---------- Companies ----------
  {
    id: "apollo_company", name: "Enrich company (Apollo)", category: "Companies",
    tool: "apollo:organizations.enrich", rate: 0.92,
    desc: "Domain → name, industry, headcount, revenue, location, LinkedIn, funding.",
    inputs: [{ key: "domain", label: "Company domain", match: DOMAIN, required: true }],
    pick: ["organization.name"],
    outputs: [
      { name: "Company name", path: "organization.name" },
      { name: "Industry", path: "organization.industry" },
      { name: "Employees", path: "organization.estimated_num_employees" },
      { name: "Revenue", path: "organization.annual_revenue_printed" },
      { name: "Founded", path: "organization.founded_year" },
      { name: "Company LinkedIn", path: "organization.linkedin_url" },
      { name: "HQ city", path: "organization.city" },
      { name: "HQ country", path: "organization.country" },
      { name: "Total funding", path: "organization.total_funding_printed" },
      { name: "Description", path: "organization.short_description" },
      { name: "Apollo org id", path: "organization.id" },
    ],
  },
  {
    id: "leadmagic_company", name: "Enrich company (LeadMagic)", category: "Companies",
    tool: "leadmagic:companies.company-search", rate: 3.45,
    desc: "Domain, name, or LinkedIn company URL → firmographics.",
    inputs: [
      { key: "companyDomain", label: "Company domain", match: DOMAIN },
      { key: "companyName", label: "Company name", match: COMPANY },
      { key: "profileUrl", label: "LinkedIn company URL", match: LINKEDIN },
    ],
    pick: ["companyName", "company_name", "name"],
    outputs: [],
  },
  {
    id: "linkedin_company", name: "LinkedIn company page (ScrapeCreators)", category: "Companies",
    tool: "scrapecreators:v1/linkedin/company", rate: 0.2162,
    desc: "Public LinkedIn company page: size, followers, industry, about.",
    inputs: [{ key: "url", label: "LinkedIn company URL", match: LINKEDIN, required: true }],
    pick: ["name"],
    outputs: [],
  },
  {
    id: "tech_stack", name: "Tech stack (DataForSEO)", category: "Companies",
    tool: "dataforseo:technologies.domain_technologies.live", rate: 1.38,
    desc: "Technologies a site runs (CMS, analytics, ads pixels, ecommerce).",
    inputs: [{ key: "target", label: "Domain", match: DOMAIN, required: true }],
    pick: [],
    outputs: [],
  },
  {
    id: "funding", name: "Company funding (LeadMagic)", category: "Companies",
    tool: "leadmagic:companies.company-funding", rate: 3.45,
    desc: "Funding rounds and total raised.",
    inputs: [
      { key: "companyDomain", label: "Company domain", match: DOMAIN },
      { key: "companyName", label: "Company name", match: COMPANY },
    ],
    pick: [],
    outputs: [],
  },
  {
    id: "seo_overview", name: "SEO traffic overview (DataForSEO)", category: "Companies",
    tool: "dataforseo:labs.domain_rank_overview.live", rate: 1.3938,
    desc: "Organic keywords, estimated traffic and paid keywords for a domain.",
    inputs: [{ key: "target", label: "Domain", match: DOMAIN, required: true }],
    pick: [],
    outputs: [],
  },
  // ---------- Web ----------
  {
    id: "google_search", name: "Google search (Serper)", category: "Web",
    tool: "serper:search", rate: 0.115,
    desc: "Top Google results for a query. Use {{Columns}} inside the query.",
    inputs: [
      { key: "q", label: "Query", default: "{{Company}} linkedin", required: true },
      { key: "num", label: "Results", default: "10" },
    ],
    body: (i: Record<string, string>) => ({ q: i.q, num: Number(i.num) || 10 }),
    pick: ["organic.0.link"],
    outputs: [
      { name: "Top result URL", path: "organic.0.link" },
      { name: "Top result title", path: "organic.0.title" },
      { name: "Top result snippet", path: "organic.0.snippet" },
    ],
  },
  {
    id: "google_news", name: "Google News (Serper)", category: "Web",
    tool: "serper:news", rate: 0.115,
    desc: "Recent news for a company or person.",
    inputs: [{ key: "q", label: "Query", default: "{{Company}}", required: true }],
    pick: ["news.0.title"],
    outputs: [{ name: "Latest headline", path: "news.0.title" }, { name: "Latest link", path: "news.0.link" }, { name: "Latest date", path: "news.0.date" }],
  },
  {
    id: "scrape_page", name: "Scrape website text (Serper)", category: "Web",
    tool: "serper:scrape", rate: 0.115,
    desc: "Page text of a URL. Feed it to an AI column.",
    inputs: [{ key: "url", label: "URL", match: DOMAIN, required: true }],
    body: (i: Record<string, string>) => ({ url: /^https?:\/\//.test(i.url) ? i.url : `https://${i.url}` }),
    pick: ["text"],
    outputs: [{ name: "Page title", path: "metadata.title" }],
  },
  {
    id: "exa_answer", name: "Answer a question from the web (Exa)", category: "Web",
    tool: "exa:answer", rate: 0.575,
    desc: "One-line answer with citations, e.g. \"Who is the CEO of {{Company}}?\"",
    inputs: [{ key: "query", label: "Question", default: "What does {{Company}} sell?", required: true }],
    pick: ["answer"],
    outputs: [{ name: "Answer", path: "answer" }],
  },
  // ---------- Custom ----------
  {
    id: "custom", name: "Custom tool", category: "Custom",
    tool: "", rate: 0,
    desc: "Any tool id from the catalog, or any apify:<owner~actor>, with a JSON body. Use {{Column}} in values.",
    inputs: [],
    pick: [],
    outputs: [],
  },
];

export const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

// Lead sources: the Clay "Find people / Find companies" import. Each returns rows for the table.
export const SOURCES = [
  {
    id: "getleads_people", name: "Find people (GetLeads)", rate: 0.000115, rateUnit: "person",
    tool: "getleads:contacts.search",
    desc: "People by company domains + job titles. Names, titles, work emails (unverified), company data.",
    inputs: [
      { key: "domains", label: "Company domains (comma separated)", default: "" },
      { key: "jobTitles", label: "Job titles (comma separated)", default: "head of marketing, vp marketing, cmo" },
      { key: "countries", label: "Countries (comma separated, optional)", default: "" },
      { key: "limit", label: "Max people", default: "100" },
      { key: "maxPerCompany", label: "Max per company (optional)", default: "" },
    ],
    body: (i: Record<string, string>) => {
      const list = (s: unknown) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
      const b: Record<string, unknown> = { limit: Math.min(Number(i.limit) || 100, 1000) };
      if (list(i.domains).length) b.filters = { domains: list(i.domains) };
      if (list(i.jobTitles).length) b.jobTitles = list(i.jobTitles);
      if (list(i.countries).length) b.countries = list(i.countries);
      if (Number(i.maxPerCompany)) b.maxPerCompany = Number(i.maxPerCompany);
      return b;
    },
    items: (r: { contacts?: unknown[] }) => r.contacts || [],
    columns: {
      "First name": "first_name", "Last name": "last_name", "Title": "current_title",
      "Company": "company_name", "Domain": "company_domain", "Email (unverified)": "work_email",
      "Email status": "email_status", "LinkedIn": "linkedin_url", "Seniority": "seniority_level",
      "Employees": "employee_count_range", "Industry": "company_industry", "Country": "contact_country",
    },
  },
  {
    id: "apollo_people", name: "Find people (Apollo search)", rate: 0, rateUnit: "search",
    tool: "apollo:people.search",
    desc: "Apollo people search (free). Last names are hidden; add \"Find email (Apollo)\" with the Apollo id to reveal.",
    inputs: [
      { key: "titles", label: "Job titles (comma separated)", default: "head of marketing" },
      { key: "organizationDomains", label: "Company domains (comma separated, optional)", default: "" },
      { key: "personLocations", label: "Locations (comma separated, optional)", default: "United States" },
      { key: "employeeRanges", label: "Employee ranges (e.g. 11,50 ; 51,200)", default: "" },
      { key: "perPage", label: "Max people (≤100)", default: "25" },
    ],
    body: (i: Record<string, string>) => {
      const list = (s: unknown, sep = ",") => String(s || "").split(sep).map((x) => x.trim()).filter(Boolean);
      const b: Record<string, unknown> = { perPage: Math.min(Number(i.perPage) || 25, 100), page: 1 };
      if (list(i.titles).length) b.titles = list(i.titles);
      if (list(i.organizationDomains).length) b.organizationDomains = list(i.organizationDomains);
      if (list(i.personLocations).length) b.personLocations = list(i.personLocations);
      if (list(i.employeeRanges, ";").length) b.employeeRanges = list(i.employeeRanges, ";").map((x) => x.replace(/\s/g, ""));
      return b;
    },
    items: (r: { people?: unknown[] }) => r.people || [],
    columns: {
      "Apollo id": "id", "First name": "first_name", "Last name (hidden)": "last_name_obfuscated",
      "Title": "title", "Company": "organization.name",
    },
  },
  {
    id: "google_maps", name: "Find local businesses (Google Maps)", rate: 0.23, rateUnit: "place",
    tool: "apify:compass~crawler-google-places",
    desc: "Google Maps places for a search + location: name, website, phone, address, rating.",
    inputs: [
      { key: "search", label: "Search (comma separated)", default: "dentist" },
      { key: "locationQuery", label: "Location", default: "Austin, Texas" },
      { key: "max", label: "Max places per search", default: "50" },
    ],
    body: (i: Record<string, string>) => ({
      searchStringsArray: String(i.search || "").split(",").map((x) => x.trim()).filter(Boolean),
      locationQuery: i.locationQuery,
      maxCrawledPlacesPerSearch: Math.min(Number(i.max) || 50, 500),
      language: "en", skipClosedPlaces: true,
    }),
    items: (r: { items?: unknown[] } | unknown[]) => (Array.isArray(r) ? r : r.items || []),
    columns: {
      "Name": "title", "Category": "categoryName", "Website": "website", "Phone": "phone",
      "Address": "address", "City": "city", "State": "state", "Rating": "totalScore",
      "Reviews": "reviewsCount", "Maps URL": "url",
    },
  },
];

export const sourceById = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// Best default template for each preset input, given the table's column names.
export function guessInputs(preset: { inputs: { key: string; match?: RegExp | RegExp[]; default?: string }[] }, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const inp of preset.inputs) {
    const pats: RegExp[] = !inp.match ? [] : Array.isArray(inp.match) ? inp.match : [inp.match];
    let hit: string | undefined;
    for (const re of pats) { hit = names.find((n) => re.test(n.trim())); if (hit) break; }
    out[inp.key] = hit ? `{{${hit}}}` : (inp.default || "");
  }
  return out;
}

// Presets as JSON for the UI (regexes and functions stripped).
export function publicPresets() {
  return PRESETS.map(({ body, inputs, ...p }) => ({
    ...p, inputs: inputs.map(({ match, ...i }: { match?: RegExp | RegExp[] }) => ({ ...i, match: match ? ([] as RegExp[]).concat(match).map((r) => r.source) : [] })),
  }));
}
export function publicSources() {
  return SOURCES.map(({ body, items, ...s }) => s);
}
