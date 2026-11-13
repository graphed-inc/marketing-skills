export type Brand = {
  id: number;
  name: string;
  domain: string | null;
  logo: string | null;
  fbPageId: string | null;
  fbPageName: string | null;
  googleDomain: string | null;
  googleAdvertiserId: string | null;
  linkedinCompanyId: string | null;
  linkedinCompany: string | null;
  maxAds: number;
  active: boolean;
  lastPulledAt: string | null;
  ads: number;
  activeAds: number;
  new7: number;
  queued: number;
  pulling: boolean;
};

export type Market = {
  id: number;
  url: string;
  name: string | null;
  status: string;
  stage: string;
  progress: {
    voices?: Record<string, number>;
    voices_tagged?: number;
    voices_total?: number;
    ads_tagged?: number;
    ads_total?: number;
  } | null;
  error: string | null;
  profile: {
    oneLiner?: string;
    category?: string;
    competitors?: { name: string; domain?: string }[];
  } | null;
};

export type AppState = {
  totals: {
    ads: number;
    new7: number;
    queued: number;
    credits: number;
    last_pull: string | null;
  };
  brands: Brand[];
  styles: string[];
  market: Market | null;
};

export type Filters = {
  platform: string;
  format: string;
  status: string;
  style: string;
  sort: string;
  q: string;
};

export type Thumb = { kind: string; url: string; poster: string | null } | null;

export type AdCard = {
  id: number;
  brand: string;
  logo: string | null;
  platform: string;
  format: string | null;
  active: boolean;
  days: number | null;
  headline: string | null;
  body: string | null;
  youtube: string | null;
  analysis: string;
  hook: string | null;
  style: string | null;
  firstSeen: string | null;
  mediaCount: number;
  thumb: Thumb;
};

export type AdDetail = AdCard & {
  url: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cta: string | null;
  link: string | null;
  placements: string[];
  impressions: string | null;
  variants: number | null;
  lastSeen: string | null;
  transcript: string | null;
  onScreenText: string | null;
  visual: string | null;
  angle: string | null;
  offer: string | null;
  audience: string | null;
  emotions: string[];
  pains: string[];
  benefits: string[];
  tags: string[];
  duration: number | null;
  analyzedAt: string | null;
  analysisError: string | null;
  credits: number;
  extra: { speaker?: string } | null;
  poster: string | null;
  regions: string[];
  hookType: string | null;
  summary: string | null;
  media: { kind: string; url: string; poster: string | null; title: string | null }[];
};

export type CountRow = { k: string; n: number };
export type PlatformRow = { k: string; n: number; active: number };

export type BrandStats = {
  byPlatform: PlatformRow[];
  byFormat: CountRow[];
  byStyle: CountRow[];
  byHook: CountRow[];
  weekly: CountRow[];
  pulls: { platform: string; error: string | null }[];
  running: { avg: number | null; max: number | null } | null;
};

export type FindPage = {
  id: string;
  name: string;
  logo?: string;
  likes?: number;
  category?: string;
  ig?: string;
};

export type FindResult = {
  query: string;
  domain: string | null;
  facebook: FindPage[];
  google: {
    domains: string[];
    advertisers: { id: string; name: string; region?: string; ads?: number }[];
  };
  linkedin: { id: string; name: string; logo?: string; ads: number }[];
};

export type GapCell = {
  p: number;
  t: number;
  voices: number;
  ads: number;
  gap: number;
  d: number;
  c: number;
  crowded?: boolean;
};

export type GapTheme = { id: number; kind: string; name: string; description: string };
export type GapPersona = { id: number; name: string; description: string };

export type GapData = {
  personas: GapPersona[];
  themes: GapTheme[];
  cells: GapCell[];
  gaps: (GapCell & { persona: string; theme: string; kind: string; quote?: { quote?: string } | null })[];
  sources: { source: string; n: number }[];
  voicesTagged: number;
  adsMapped: number;
};

export type Concept = {
  title: string;
  format?: string;
  hook: string;
  angle: string;
  script?: string[];
  visual?: string;
  cta?: string;
  why_open?: string;
  customer_words?: string[];
};

export type Brief = {
  id: number;
  status: string;
  error?: string | null;
  content?: { positioning?: string; concepts?: Concept[] } | null;
};

export type CellData = {
  persona: { name: string; description: string };
  theme: { name: string; kind: string; description: string };
  quotes: { quote?: string; text: string; source: string; title?: string; url?: string }[];
  ads: (AdCard & { reason?: string })[];
  briefs: Brief[];
};

export type CellRef = {
  p: number;
  t: number;
  brand: string;
  platform: string;
  active: string;
  voices?: number;
  ads?: number;
};

export type DrawerState =
  | { kind: "ad"; id: number; back?: CellRef }
  | ({ kind: "cell"; brief?: boolean } & CellRef);
