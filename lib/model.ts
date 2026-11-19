// Token Radar — the value model (radar-3).
//
// The board ranks pre-token protocols by an *implied value*: what a token
// might be worth if the protocol's record stayed as it is. Every number
// comes from the sealed snapshot; no protocol name is ever special-cased.
//
//   anchor        median mcap/TVL of the live protocols in the same
//                 category, shrunk toward the whole market's median by
//                 the category's sample count: with n live samples and a
//                 shrinkage weight of k, the anchor is
//                 (n x categoryMedian + k x globalMedian) / (n + k).
//                 A category priced by 3 protocols barely moves off the
//                 market median; one priced by 40 stands on its own.
//                 Categories under 3 samples use the global median.
//                 Clamped to [0.05, 1.00] so one freak ratio cannot
//                 carry a whole category.
//   base          tvl_usd x anchor
//   growthMult    1 + 0.45 x tanh(change_7d / 25)
//                 Weekly TVL changes are noisy and this snapshot holds a
//                 +4,448% week: a saturating curve lets a real trend move
//                 the value (about +10% at +5.6% growth, +34% at +50%)
//                 while a freak week can never add more than +45%, and
//                 a shrinking protocol can never lose more than -45%.
//   maturityMult  0.55 + 0.45 x (1 - exp(-ageDays / 540))
//                 (age unknown: 0.75; a protocol that survived longer
//                 earns more of the multiple, with diminishing returns)
//   chainMult     1 + 0.03 x min(chains - 1, 10)
//   implied       max(1, round(base x growthMult x maturityMult x chainMult))
//
// The board itself is the whole radar, not a top slice: the 40 watchlist
// names plus every rankable pre-token protocol below the floor, however
// small its TVL, so a fast grower with modest TVL is on the board for
// its growth to lift instead of being cut by a TVL-only shortlist
// before scoring starts. Rankable excludes the wrapped, staked and
// bridged products of tokens that already trade (see isProductOfAnother):
// radar-2's board carried 39 of them, tzBTC and a protocol literally
// named "wrapped" among them, ranked as if a launch were still to come.
//
// A protocol is pre-token when its record carries no token at all: no
// market cap, no CoinGecko id, no symbol. Live-token protocols are never
// ranked; the dashboard shows the market's own mcap for them instead.

/** One protocol as the sealed snapshot carries it (exactly ten fields). */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard's Model view. */
export interface ModelConstants {
  anchor_min: number;
  anchor_max: number;
  category_min_samples: number;
  anchor_shrinkage: number;
  growth_weight: number;
  growth_scale_pct: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_halflife_days: number;
  unknown_age_multiplier: number;
  chain_bonus: number;
  chain_bonus_cap: number;
}

export const MODEL: ModelConstants = {
  anchor_min: 0.05,
  anchor_max: 1.0,
  category_min_samples: 3,
  anchor_shrinkage: 6,
  growth_weight: 0.45,
  growth_scale_pct: 25,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_halflife_days: 540,
  unknown_age_multiplier: 0.75,
  chain_bonus: 0.03,
  chain_bonus_cap: 10,
};

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-3';

/** Live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;

/** The median of a sorted ascending array; null when it is empty. */
export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole-day count from `listedAt` to `asOf`; null when either is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol's record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of another asset, never a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whole words in a name that mark a wrapped or staked product of a token that already trades. */
const PRODUCT_WORDS = /\b(wrapped|staked|staking)\b/i;

/** Names that begin with an exchange's name are that exchange's product, not a protocol awaiting a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is a wrapped, staked or bridged product of another
 * protocol, judged only from the fields the snapshot carries (its name
 * and category — the same tests the house's watchlist rule describes,
 * minus the parent-protocol record the snapshot does not carry). WBTC
 * records no token of its own in the snapshot, but it is Bitcoin in a
 * wrapper: ranking it as a token still to come would be wrong however
 * large its TVL is.
 */
export function isProductOfAnother(p: SnapshotProtocol): boolean {
  return (
    (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) ||
    PRODUCT_WORDS.test(p.name) ||
    EXCHANGE_PREFIX.test(p.name)
  );
}

/** Whether a protocol may be ranked: pre-token, not a versioned pool, not a product of another protocol. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !VERSIONED.test(p.name) && !isProductOfAnother(p);
}

/** One category's anchor evidence: its own median, its sample count, and the shrunk anchor it earns. */
export interface AnchorStat {
  median: number;
  samples: number;
  anchor: number;
}

/**
 * The category anchor evidence: for each category, the median mcap/TVL
 * ratio of the live protocols that record both, and how many of them
 * there are. The anchor a category earns shrinks that median toward the
 * market-wide median by sample count — (n x median + k x global) /
 * (n + k) with k = `anchor_shrinkage` — so thin evidence moves the
 * value a little and deep evidence moves it a lot. Categories under
 * `category_min_samples` earn the global median outright. Every anchor
 * is clamped to [anchor_min, anchor_max]. Computed from the snapshot
 * at run time — nothing about any category is baked in.
 */
export function categoryAnchorStats(snapshot: Snapshot, model: ModelConstants): Map<string, AnchorStat> {
  const liveRatios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    liveRatios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = median(liveRatios.sort((a, b) => a - b)) ?? 0.2;
  const clamp = (v: number): number => Math.min(model.anchor_max, Math.max(model.anchor_min, v));
  const stats = new Map<string, AnchorStat>();
  for (const [cat, ratios] of byCategory) {
    const catMedian = median(ratios.sort((a, b) => a - b))!;
    const n = ratios.length;
    const shrunk = n >= model.category_min_samples
      ? (n * catMedian + model.anchor_shrinkage * global) / (n + model.anchor_shrinkage)
      : global;
    stats.set(cat, { median: catMedian, samples: n, anchor: clamp(shrunk) });
  }
  stats.set('__global__', { median: global, samples: liveRatios.length, anchor: clamp(global) });
  return stats;
}

/** The category anchors alone, for callers that only need the multiple. */
export function categoryAnchors(snapshot: Snapshot, model: ModelConstants): Map<string, number> {
  const anchors = new Map<string, number>();
  for (const [cat, stat] of categoryAnchorStats(snapshot, model)) anchors.set(cat, stat.anchor);
  return anchors;
}

/** The anchor evidence one protocol's category carries; the global evidence when it has none. */
export function anchorStatFor(p: SnapshotProtocol, stats: Map<string, AnchorStat>): AnchorStat {
  return stats.get(p.category ?? 'Uncategorized') ?? stats.get('__global__')!;
}

/** The anchor one protocol gets: its category's, or the global median's. */
export function anchorFor(p: SnapshotProtocol, anchors: Map<string, number>): number {
  return anchors.get(p.category ?? 'Uncategorized') ?? anchors.get('__global__')!;
}

/**
 * The growth multiplier from a protocol's 7-day TVL change: a saturating
 * tanh curve, 1 + weight x tanh(pct / scale). Ordinary weeks move the
 * value in proportion (about +0.9 points of multiplier per point of
 * growth near zero), extreme weeks run into the curve's ceiling of
 * +/-weight instead of a hard clamp, and an unreported change counts
 * as a flat week. The raw percentage is kept for display.
 */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; multiplier: number } {
  const raw = typeof change7d === 'number' && Number.isFinite(change7d) ? change7d : 0;
  return { pct: raw, multiplier: 1 + model.growth_weight * Math.tanh(raw / model.growth_scale_pct) };
}

/** The maturity multiplier from a protocol's age in days. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return model.unknown_age_multiplier;
  return model.maturity_floor + model.maturity_range * (1 - Math.exp(-age / model.maturity_halflife_days));
}

/** The chain-diversification multiplier from how many chains carry the TVL. */
export function chainMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.min(Math.max(chains.length - 1, 0), model.chain_bonus_cap);
  return 1 + model.chain_bonus * extra;
}

/** The full breakdown of one protocol's implied value. */
export interface Valuation {
  anchor: number;
  anchorMedian: number;
  anchorSamples: number;
  base: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
  implied: number;
}

/** `impliedValue` scores one protocol under the model. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  stats: Map<string, AnchorStat>,
  model: ModelConstants,
): Valuation {
  const stat = anchorStatFor(p, stats);
  const anchor = stat.anchor;
  const base = p.tvl_usd * anchor;
  const { pct, multiplier: growthMult } = growthMultiplier(p.change_7d, model);
  const age = ageDays(asOf, p.listed_at);
  const maturityMult = maturityMultiplier(age, model);
  const chainMult = chainMultiplier(p.chains, model);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return {
    anchor,
    anchorMedian: stat.median,
    anchorSamples: stat.samples,
    base,
    growthPct: pct,
    growthMult,
    maturityMult,
    chainMult,
    age,
    implied,
  };
}

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    anchor: number;
    anchor_median: number;
    anchor_samples: number;
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
  };
  farm_steps: string[];
}

/** A live-token protocol, shown at the market's own value, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_per_tvl: number | null;
}

/** One row as data.js carries it for the dashboard. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  anchor: number;
  anchor_median: number;
  anchor_samples: number;
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_anchor: number;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

// ---------------------------------------------------------------- farm plans

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 175;
  if (p.tvl_usd >= 100_000_000) return 125;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/**
 * The weekly cadence a protocol's own 7-day trend earns: a growing
 * protocol is farmed twice a week while the trend lasts, a flat one
 * weekly, and a shrinking one gets no new capital until its TVL turns —
 * the plan reacts to the same figure the value model scores.
 */
function cadenceFor(change7d: number | null): { text: string; cost: string; time: string } {
  if (change7d !== null && change7d >= 2) {
    return {
      text: `Its TVL grew ${change7d.toFixed(1)}% in the last 7 days, so farm it twice a week while that trend lasts — repeat one on-chain action (a deposit, a swap, a borrow or a vote) every 3 to 4 days.`,
      cost: 'about $2–$8 of gas per week',
      time: '10 minutes, twice a week',
    };
  }
  if (change7d !== null && change7d <= -10) {
    return {
      text: `Its TVL fell ${Math.abs(change7d).toFixed(1)}% in the last 7 days, so add no new capital this week: keep the existing position, repeat one small on-chain action weekly, and only top up after a week where its TVL rises again.`,
      cost: 'about $1–$4 of gas per week, and no new capital',
      time: '10 minutes a week',
    };
  }
  return {
    text: `Its TVL was roughly flat over the last 7 days, so farm it once a week — repeat one on-chain action (a deposit, a swap, a borrow or a vote) on the same day each week so the wallet shows steady activity.`,
    cost: 'about $1–$4 of gas per week',
    time: '10 minutes a week',
  };
}

/** The second chain a protocol names, for the rotation step; null when it runs on one chain. */
function secondChain(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 45;
}

/** The core farming action for a protocol's category, in words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Lend $${capital} of USDC into ${name} on ${chain} and leave the deposit earning interest.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('liquidity manager') || c.includes('leveraged farm') || c.includes('farm')) {
    return `Add $${capital} of liquidity to ${name}'s largest pool on ${chain} and hold the LP position.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC into ${chain} with ${name}, then put the bridged funds to work in its app.`;
  }
  if (c.includes('stak') || c.includes('restak')) {
    return `Stake $${capital} of the native asset through ${name} on ${chain} and keep the receipt token it issues.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position on ${chain}.`;
  }
  if (c.includes('prediction')) {
    return `Fund your account with $${capital} and take one position in an active market on ${name}.`;
  }
  if (c.includes('rwa')) {
    return `Mint or buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('aggregator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares it issues.`;
  }
  if (c.includes('stable')) {
    return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it or lend it out.`;
  }
  if (c.includes('launchpad')) {
    return `Stake or deposit $${capital} through ${name} on ${chain} to qualify for its next launch allocation.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  }
  if (c.includes('payment') || c.includes('card')) {
    return `Top up $${capital} through ${name} on ${chain} and use it for a real payment.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} to the ${name} chain and use its native apps for a full week.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. Every step is derived from the protocol's own record (category,
 * chains, TVL, age and 7-day trend) — never from a hand-written list of
 * names. The cadence step follows the trend, and a protocol on several
 * chains gets a named rotation step instead of a generic aside.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const half = Math.round(hold / 2);
  const second = secondChain(p);
  const rotation: FarmStep = second !== null
    ? {
        text: `${p.name} also runs on ${second}: in week two, open a second position of about half the size there ($${Math.round(capital / 2)}) and alternate your weekly actions between ${chain} and ${second} after that.`,
        cost: `about $${Math.round(capital / 2)} more capital and $2–$6 of gas`,
        time: '15 minutes in week two',
      }
    : {
        text: `${p.name} runs only on ${chain}, so build depth instead of breadth: split the $${capital} into two deposits a week apart, which reads as a returning user rather than a one-off airdrop wallet.`,
        cost: `the same $${capital}, split in two, and about $2–$4 of extra gas`,
        time: '10 minutes in week two',
      };
  return [
    {
      text: `Set up a fresh wallet on ${chain} that holds only your farming funds, store its seed phrase offline on paper, and reach ${p.name} only through the protocol's own published links — check the contract address it shows against its documentation before approving anything.`,
      cost: 'about $1–$3 of gas for the first transaction',
      time: '10 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    cadenceFor(p.change_7d),
    rotation,
    {
      text: `Keep the position open for at least ${hold} days so it appears in more than one snapshot of activity, and at day ${half} re-check the position: if the protocol's TVL has fallen for two straight weeks, halve the position instead of adding to it.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days, with a 10-minute check at day ${half}`,
    },
    {
      text: `Check ${p.name}'s own points or rewards page every week and claim only through links the protocol itself publishes; never pay a fee to unlock a claim.`,
      cost: 'free to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: `Record the wallet address, the dates and every transaction hash in a farm log, and plan your exit before any token exists: once one trades, withdraw in three or four small steps over a week rather than in one transaction.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; anchors: Map<string, number> } {
  const stats = categoryAnchorStats(snapshot, model);
  const anchors = new Map<string, number>();
  for (const [cat, stat] of stats) anchors.set(cat, stat.anchor);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, whatever its TVL.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar is the whole field below the floor, not a TVL
  // shortlist: every rankable pre-token protocol under the floor is
  // scored, so a small protocol with a strong week is ranked by the
  // model instead of being cut before the model ever sees it. Above
  // the floor the board takes the watchlist only: a large protocol the
  // watchlist leaves out is left out for a reason its record here
  // cannot fully show (a parent protocol the snapshot does not carry),
  // and the radar does not overrule that on size alone.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, stats, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      anchor: round4(s.v.anchor),
      anchor_median: round4(s.v.anchorMedian),
      anchor_samples: s.v.anchorSamples,
      base_usd: Math.round(s.v.base),
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      chain_multiplier: round4(s.v.chainMult),
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
  return { board, anchors };
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_per_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    anchor: row.model.anchor,
    anchor_median: row.model.anchor_median,
    anchor_samples: row.model.anchor_samples,
    base_usd: row.model.base_usd,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, anchors } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_anchor: round4(anchors.get('__global__')!),
    watchlist: [...snapshot.watchlist].sort(),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
