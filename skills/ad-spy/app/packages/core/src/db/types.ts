// Row types for the tables in migrations/0001_ad_spy.ts and 0002_ad_tags.ts.
// Queries go through db/sql.ts. These types are what new Kysely queries check against.

export interface BrandRow {
  id: number;
  name: string;
  domain: string | null;
  logo_key: string | null;
  fb_page_id: string | null;
  fb_page_name: string | null;
  google_domain: string | null;
  google_advertiser_id: string | null;
  linkedin_company_id: string | null;
  linkedin_company: string | null;
  active: boolean;
  max_ads: number;
  last_pulled_at: Date | null;
  created_at: Date;
}

export interface AdRow {
  id: number;
  brand_id: number;
  platform: string;
  external_id: string;
  url: string | null;
  format: string | null;
  is_active: boolean;
  started_at: Date | null;
  ended_at: Date | null;
  days_running: number | null;
  headline: string | null;
  body: string | null;
  cta: string | null;
  link_url: string | null;
  landing_domain: string | null;
  placements: string[] | null;
  impressions: string | null;
  variants: number | null;
  media: unknown;
  youtube_url: string | null;
  raw: unknown;
  analysis_status: string;
  analysis_error: string | null;
  analysis: unknown;
  transcript: string | null;
  on_screen_text: string | null;
  visual_description: string | null;
  summary: string | null;
  hook: string | null;
  hook_type: string | null;
  angle: string | null;
  offer: string | null;
  creative_style: string | null;
  target_audience: string | null;
  emotions: string[] | null;
  pain_points: string[] | null;
  benefits: string[] | null;
  tags: string[] | null;
  language: string | null;
  duration_seconds: number | null;
  analyzed_at: Date | null;
  credits: number;
  heartbeat_at: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
}

export interface PullRow {
  id: number;
  brand_id: number;
  platform: string;
  status: string;
  seen: number;
  new_ads: number;
  credits: number;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
}

export interface MarketRow {
  id: number;
  url: string;
  name: string | null;
  profile: unknown;
  status: string;
  stage: string;
  progress: unknown;
  error: string | null;
  credits: number;
  heartbeat_at: Date | null;
  created_at: Date;
  finished_at: Date | null;
}

export interface VoiceRow {
  id: number;
  market_id: number;
  source: string;
  url: string | null;
  title: string | null;
  text: string;
  author: string | null;
  score: number | null;
  query: string | null;
  tagged: boolean;
  hash: string;
  created_at: Date;
}

export interface PersonaRow {
  id: number;
  market_id: number;
  name: string;
  description: string | null;
  position: number;
}

export interface ThemeRow {
  id: number;
  market_id: number;
  kind: string;
  name: string;
  description: string | null;
  position: number;
}

export interface VoiceTagRow {
  voice_id: number;
  persona_id: number;
  theme_id: number;
  intensity: number;
  quote: string | null;
}

export interface AdTagRow {
  market_id: number;
  ad_id: number;
  persona_id: number | null;
  theme_id: number | null;
  strength: number;
  reason: string | null;
}

export interface AdMappedRow {
  market_id: number;
  ad_id: number;
  mapped_at: Date;
  pending: boolean;
}

export interface BriefRow {
  id: number;
  market_id: number;
  persona_id: number | null;
  theme_id: number | null;
  status: string;
  content: unknown;
  error: string | null;
  credits: number;
  created_at: Date;
}

export interface Database {
  brands: BrandRow;
  ads: AdRow;
  pulls: PullRow;
  markets: MarketRow;
  voices: VoiceRow;
  personas: PersonaRow;
  themes: ThemeRow;
  voice_tags: VoiceTagRow;
  ad_tags: AdTagRow;
  ad_mapped: AdMappedRow;
  briefs: BriefRow;
}
