import { projectSlug } from "./config";

// "Ask your agent" in the top bar copies this. The app has no chat: the user's coding agent
// (Claude Code, Cursor) queries the project Postgres with `graphed exec`.
export function agentPrompt(slug = projectSlug() || "ad-spy"): string {
  return `I have an Ad Spy app deployed on Graphed (project "${slug}"). Query its Postgres to answer my questions about competitor ads and positioning gaps.

Run read-only SQL with:
graphed exec --project ${slug} -- node cli.mjs sql "select hook, angle, days_running from ads order by days_running desc nulls last limit 10"

If the exec log prints nothing, add --key out/result.json and fetch it with:
graphed storage download out/result.json . --project ${slug}

Tables:
- brands(id, name, domain, fb_page_id, google_domain, linkedin_company_id, last_pulled_at)
- ads(id, brand_id, platform facebook|google|linkedin, url, format video|image|carousel|text, is_active, started_at, ended_at, days_running, headline, body, cta, link_url, placements[], impressions, variants, transcript, on_screen_text, visual_description, summary, hook, hook_type, angle, offer, creative_style, target_audience, emotions[], pain_points[], benefits[], tags[], first_seen_at)
- markets(id, url, name, profile jsonb) — my business
- voices(id, market_id, source reddit|youtube|linkedin|threads|web, url, title, text, score) — customer comments
- personas(id, market_id, name, description), themes(id, market_id, kind pain|outcome, name, description)
- voice_tags(voice_id, persona_id, theme_id, intensity 1-3, quote) — customer demand per persona x theme
- ad_tags(market_id, ad_id, persona_id, theme_id, strength 1-3, reason) — competitor coverage per persona x theme
- briefs(id, market_id, persona_id, theme_id, content jsonb) — ad concepts

Long-running active ads are the likely winners. A gap is a persona x theme cell with many voice_tags and few ad_tags. Cite ad ids and quote customers verbatim.`;
}
