// Copied by the "Ask your agent" button. The user pastes it to their agent.
export function agentPrompt(slug: string): string {
  const project = slug || "<project slug>";
  return [
    "You are setting up my Graphed enrichment table. Do the work yourself. Do not send me into the spreadsheet to click New table, Find leads, or Add enrichment.",
    "",
    "What this app is",
    "It is a private table for people or companies. Rows come from a lead search (GetLeads, Apollo people search, or Google Maps), a CSV, or rows you add. Each column runs once per row, left to right, so a column can read the columns to its left.",
    "Column types: a formula (free), one enrichment per Graphed tool (email, phone, company, LinkedIn, tech, search), a waterfall that tries providers until one finds a value, an AI prompt, an AI web-research agent, an HTTP call, or any Graphed tool id. A cell's full result is JSON, and any field of it can become its own column. Auto-update reruns a paid column when an input changes. There are no vendor keys. Paid cells bill this project's Graphed credits. Tell me the estimate before you queue a paid column.",
    "",
    `This project slug is ${project}. Find the account with \`graphed --format json accounts list\`, then confirm the project with \`graphed --format json projects list --account <account_id>\`. Use the enrichment-tables skill.`,
    "",
    "How to help me",
    "First, in a few sentences, tell me what you can build here and ask what I want. If I already named a list, a CSV, or the columns, build that. If I only want to see it work, ask for my website or who I sell to (titles, country, and any company domains). A website is for you to infer the buyer. Search for those buyers, not for my own employees.",
    "The default demo is one table of 10 people. Find people (GetLeads) costs about 0 credits. Do not add a paid column until I agree.",
    "",
    `Commands, each run with \`graphed exec --project ${project} --account <account_id> --\` in front:`,
    `node cli.mjs find 'new:Demo' getleads_people '{"jobTitles":"<titles>","countries":"<countries>","limit":"10"}'`,
    "Add \"domains\" only when I named companies to search. Poll `node cli.mjs status <table>` until the lead search is done, then `node cli.mjs csv <table>`.",
    `node cli.mjs column <table> enrich "Company" '{"preset":"apollo_company","inputs":{"domain":"{{Domain}}"}}'`,
    "Pass `auto` as the last argument to turn auto-run on. A formula column uses type `formula` and `{\"expr\":\"...\"}`. A CSV import is `node cli.mjs import new:<Name> -` with the file on stdin.",
    "",
    "When you are done, send me the app URL, the row count, what you queued, and the credits you expect to spend.",
  ].join("\n");
}
