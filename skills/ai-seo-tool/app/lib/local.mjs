// Local rank grid: where a business ranks in Google Maps for one keyword, at each point of a grid
// around it. Serper maps (Graphed Tools), one search per grid point.
import { call, lanes } from "./tools.mjs";
import { glOf, langOf } from "./seo.mjs";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function localGridReport(input, ctx, progress = () => {}) {
  const business = String(input.business || "").trim(), keyword = String(input.keyword || "").trim();
  if (!business || !keyword) throw new Error("enter the business (name + city) and a keyword");
  const size = [3, 5, 7].includes(Number(input.size)) ? Number(input.size) : 5;
  const km = Math.max(0.3, Math.min(Number(input.spacingKm) || 1.5, 20));
  const gl = glOf(input.loc), hl = langOf(input.lang, input.loc);
  progress("finding the business in Google Maps");
  const found = await call("serper:maps", { q: business, gl, hl }, { ctx, ttlDays: 30 });
  const me = ((found && found.places) || [])[0];
  if (!me || me.latitude == null) throw new Error(`Google Maps has no place for "${business}". Add the city to the name.`);
  // Match the exact place by its Google id. Title match is the fallback only: a chain has many places with one name.
  const same = (p) => (me.cid ? p.cid === me.cid : me.placeId ? p.placeId === me.placeId : norm(p.title) === norm(me.title));
  const dLat = km / 110.574, dLng = km / (111.32 * Math.cos((me.latitude * Math.PI) / 180));
  const half = (size - 1) / 2;
  const points = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) points.push({ r, c, lat: me.latitude + (half - r) * dLat, lng: me.longitude + (c - half) * dLng, rank: null, top: [] });
  const rivals = new Map();
  let done = 0;
  await lanes(points, 5, async (pt) => {
    const res = await call("serper:maps", { q: keyword, ll: `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},14z`, gl, hl }, { ctx, ttlDays: 1 }).catch(() => null);
    const places = (res && res.places) || [];
    const i = places.findIndex(same);
    pt.rank = i >= 0 ? i + 1 : null;
    pt.top = places.slice(0, 3).map((p) => p.title);
    places.slice(0, 10).forEach((p, k) => {
      if (same(p)) return;
      const x = rivals.get(p.title) || { title: p.title, rating: p.rating ?? null, reviews: p.ratingCount ?? null, points: 0, top3: 0, sum: 0, website: p.website || null };
      x.points++; x.sum += k + 1; if (k < 3) x.top3++;
      rivals.set(p.title, x);
    });
    progress(`grid point ${++done} of ${points.length}`);
  });
  const ranked = points.filter((p) => p.rank != null);
  return {
    business: { title: me.title, address: me.address || "", lat: me.latitude, lng: me.longitude, rating: me.rating ?? null, reviews: me.ratingCount ?? null, type: me.type || "", website: me.website || null },
    keyword, size, spacingKm: km,
    avgRank: ranked.length ? Math.round((ranked.reduce((s, p) => s + p.rank, 0) / ranked.length) * 10) / 10 : null,
    found: ranked.length, total: points.length, top3: points.filter((p) => p.rank && p.rank <= 3).length,
    grid: points.map(({ r, c, lat, lng, rank, top }) => ({ r, c, lat, lng, rank, top })),
    competitors: [...rivals.values()].map((x) => ({ title: x.title, rating: x.rating, reviews: x.reviews, points: x.points, top3: x.top3, avgRank: Math.round((x.sum / x.points) * 10) / 10, website: x.website }))
      .sort((a, b) => b.top3 - a.top3 || b.points - a.points).slice(0, 20),
  };
}
