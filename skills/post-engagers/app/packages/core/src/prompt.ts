// Copied by the "Ask your agent" button. The user pastes it to their agent.
export function agentPrompt(slug: string): string {
  const project = slug || "<project slug>";
  return [
    "You are setting up my Graphed Post Engagers app. Do the work yourself. Do not send me into the app to paste a URL and click Scrape engagers or Start tracking.",
    "",
    "What this app is",
    "It turns LinkedIn engagement into a verified lead list. A post URL pulls everyone who reacted or commented, one row per person, opens the profile, and finds a work email with GetLeads, then LeadMagic, then Apollo. MillionVerifier checks each email. A LinkedIn profile can be watched daily: each morning the app pulls that profile's new posts through the same pipeline. The list is searchable and exports to CSV. There is no LinkedIn login and no vendor keys. Scrapes bill this project's Graphed credits. One credit is one cent.",
    "",
    `This project slug is ${project}. Find the account with \`graphed --format json accounts list\`, then confirm the project with \`graphed --format json projects list --account <account_id>\`. Use the post-engagers skill.`,
    "",
    "How to help me",
    "First, in a few sentences, tell me what you can build here and ask what I want. If I already gave a LinkedIn post URL or a profile URL, queue that. Otherwise ask one question: a post to scrape once, or a profile to watch every morning.",
    "The first scrape uses a profile cap of 25 unless I name a different cap. Tell me the cost before you queue it. Plan on about 1 to 1.5 credits per engager before email lookups, then about 0.9 to 3.5 more for each person who reaches Apollo or LeadMagic. Do not raise the cap, scrape a post with more than about 2,000 engagements, or track more than one profile until I agree.",
    "",
    `Commands, each run with \`graphed exec --project ${project} --account <account_id> --\` in front:`,
    `node cli.mjs add "<post url>" --cap 25`,
    "node cli.mjs track add https://www.linkedin.com/in/<user> --backfill 7 --cap 25",
    "node cli.mjs status [job-id]",
    "node cli.mjs track list",
    "Poll `node cli.mjs status` until the job is done or failed. Adding a tracked profile starts its first check immediately.",
    "",
    "When you are done, send me the app URL, what you queued, the job counters (people, emails, verified), and the credits you expect to spend.",
  ].join("\n");
}
