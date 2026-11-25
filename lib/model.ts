// The token launch radar's model: what a pre-token protocol's launch would be
// worth if its record stayed as the sealed snapshot has it, and what a reader
// should do to farm it. Everything derives from the snapshot's own figures —
// no hardcoded names, no outside data.
//
// The valuation in one paragraph. Protocols whose token already trades reveal
// what the market pays for a dollar of TVL in their category: the ratio of
// market cap to TVL. The model takes the median of that ratio per category
// (only categories with at least three traded peers speak for themselves;
// the rest borrow the all-category median) and applies it to a pre-token
// protocol's TVL. A category's median is shrunk toward the all-category
// median in proportion to how few peers back it, so a ratio drawn from three
// traded protocols never speaks as loudly as one drawn from thirty.
// Three adjustments follow, each from the protocol's own record: momentum
// (its 7-day TVL change), longevity (how many years it has run with no
// token — a protocol that survived years tokenless has a product people use
// for its own sake), and breadth (how many chains its TVL spans).
// The board ranks by the result.

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!raw || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: expected an object with protocols and watchlist arrays');
  }
  return raw;
}

// ------------------------------------------------------------ the exclusions

// A wrapped, staked or bridged product of a token that already trades is not
// waiting on a launch of its own, so it never belongs on the board — the same
// reasoning the house's watchlist uses, applied at every TVL, not just the
// floor. Versioned names (a "V2" of something) are set aside for the same
// reason: the original is the launch candidate, not its sequel.
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isProductOfTraded(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  return false;
}

export const recordsNoToken = (p: Protocol): boolean => p.gecko_id === null && p.symbol === null;

// ------------------------------------------------------------ the multiples

export interface Multiple {
  /** The group's raw median market-cap-to-TVL ratio. */
  median: number;
  /** The multiple the board applies: the median shrunk toward the
   *  all-category median by peer count (for the global group, the median
   *  itself — there is nothing wider to shrink toward). */
  applied: number;
  peers: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

// Shrinkage weight, in phantom peers: a category's applied multiple is the
// peer-count-weighted blend of its own median and the all-category median,
//   applied = (n × category median + SHRINKAGE × global median) / (n + SHRINKAGE).
// With SHRINKAGE = 4, a category backed by 3 traded peers leans most of the
// way toward the global figure, while one backed by 30 barely moves. The
// blend is still computed only from the snapshot's own ratios.
const SHRINKAGE = 4;

/** What the market pays per TVL dollar, per category, from traded protocols. */
export function categoryMultiples(snapshot: Snapshot): { byCategory: Map<string, Multiple>; global: Multiple } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratios.get(key) ?? [];
    list.push(ratio);
    ratios.set(key, list);
  }
  const globalMedian = median(all);
  const byCategory = new Map<string, Multiple>();
  for (const [key, list] of ratios) {
    if (list.length < 3) continue;
    const med = median(list);
    byCategory.set(key, {
      median: med,
      applied: (list.length * med + SHRINKAGE * globalMedian) / (list.length + SHRINKAGE),
      peers: list.length,
    });
  }
  return { byCategory, global: { median: globalMedian, applied: globalMedian, peers: all.length } };
}

// ------------------------------------------------------------ the valuation

export interface Valuation {
  implied_value_usd: number;
  /** The multiple applied to TVL (the category median after shrinkage). */
  multiple: number;
  /** The raw median behind it, before shrinkage toward the global median. */
  multiple_median: number;
  multiple_peers: number;
  multiple_category: string;
  momentum_factor: number;
  longevity_factor: number;
  breadth_factor: number;
  years_tokenless: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function valueProtocol(
  p: Protocol,
  multiples: { byCategory: Map<string, Multiple>; global: Multiple },
  asOf: string,
): Valuation {
  const key = p.category ?? 'Uncategorised';
  const own = multiples.byCategory.get(key);
  const chosen = own ?? multiples.global;
  // Momentum: a week of growth is evidence of demand; a slide discounts it.
  const momentum = 1 + clamp(p.change_7d ?? 0, -30, 50) / 200;
  // Longevity: whole years run with no token, capped so age alone never
  // carries a board — it only separates the proven from the new.
  let years: number | null = null;
  if (p.listed_at !== null) {
    const days = (Date.parse(asOf) - Date.parse(p.listed_at)) / 86_400_000;
    if (Number.isFinite(days) && days >= 0) years = Math.floor(days / 365.25);
  }
  const longevity = 1 + Math.min(years ?? 0, 6) * 0.04;
  // Breadth: TVL spread over more chains is harder to fake and likelier to
  // be valued as infrastructure.
  const breadth = 1 + Math.min(Math.max(p.chains.length - 1, 0), 7) * 0.015;
  const raw = p.tvl_usd * chosen.applied * momentum * longevity * breadth;
  return {
    implied_value_usd: Math.max(1, Math.round(raw)),
    multiple: chosen.applied,
    multiple_median: chosen.median,
    multiple_peers: chosen.peers,
    multiple_category: own ? key : 'all categories',
    momentum_factor: momentum,
    longevity_factor: longevity,
    breadth_factor: breadth,
    years_tokenless: years,
  };
}

// ------------------------------------------------------------ the farm plans

// Every plan is a playbook for the protocol's kind of product, written with
// the protocol's own name, main chain and size band in it. Each step says
// what to do, what it costs and how long it takes — a slogan is not a step.

function sizeBand(tvl: number): string {
  if (tvl >= 1_000_000_000) return 'a $5,000-$25,000 position is still a small share of its TVL';
  if (tvl >= 100_000_000) return 'a $1,000-$10,000 position is a meaningful but safe share';
  if (tvl >= 10_000_000) return 'a $250-$2,500 position is proportionate to its size';
  return 'a $50-$500 position — size it like an early ticket, not a core holding';
}

function planFor(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const size = sizeBand(p.tvl_usd);
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (cat.includes('dex') || cat.includes('perp') || cat.includes('derivative')) {
    return [
      `Trade on ${name} itself, not an aggregator: swap $200-$1,000 a week on ${chain} so your volume is native. Cost: swap fees plus gas, roughly $5-$25 a week; 15 minutes a week.`,
      `Provide liquidity to a core pair on ${name} — ${size}. Leave it at least 8 weeks; short hops in and out read as farming and earn little. Cost: gas to enter and exit, plus impermanent loss risk.`,
      `Use the advanced surface too: one limit order, one range adjustment or one perp trade a week, so your history is a user's, not a bot's. Cost: minutes; fees as traded.`,
      `Hold the position through a full quarter and vote in any governance or feedback round ${name} opens. Launches reward duration and breadth of use more than raw size.`,
      `Check in monthly: note your volume tier and any points or season announcement ${name} makes, and keep your own record of fees paid. Cost: 10 minutes a month — a launch snapshots the history you already hold, not a last-week rush.`,
    ];
  }
  if (cat.includes('lending') || cat.includes('cdp') || cat.includes('money')) {
    return [
      `Supply a blue-chip asset (ETH or a major stablecoin) to ${name} on ${chain} — ${size}. Cost: one deposit's gas, $2-$15; ten minutes to set up.`,
      `Borrow a small amount against it — 20-30% of the supplied value — hold it a week, then repay in full. A completed borrow-and-repay cycle is the usage signal lenders record. Cost: the interest spread for the week.`,
      `Keep the supply in place for 8-12 weeks and keep the health factor above 2 at all times; a liquidation wipes the position and the history with it. Check it weekly, five minutes.`,
      `Repeat the borrow cycle monthly and use any second market ${name} runs on ${chain}. Steady, boring, long-lived accounts are what lending launches have rewarded.`,
      `Review the position monthly: top up collateral if markets moved, and read any points or loyalty announcement ${name} publishes. Cost: 10 minutes a month. When a launch comes it snapshots long-lived suppliers, not last-minute deposits.`,
    ];
  }
  if (cat.includes('curator') || cat.includes('allocator') || cat.includes('risk')) {
    return [
      `Deposit a stablecoin or ETH into one of ${name}'s curated vaults on ${chain} — ${size}. Cost: approval plus deposit gas, $3-$20; fifteen minutes to choose and enter.`,
      `Stay in the vault at least 8-12 weeks. Curators can snapshot vault share over time, and steady depositors are the audience a curator token would be dropped to.`,
      `Spread a second, smaller deposit across a different vault or chain ${name} curates, so your history covers more than its flagship. Cost: one more round of gas.`,
      `Withdraw nothing in the first quarter unless a vault's risk profile changes materially; churn in and out is visible and reads as mercenary farming.`,
      `Re-read the curator's own reports monthly — allocation notes, risk updates, any points programme ${name} announces. Cost: 15 minutes a month. A curator launch rewards depositors who stayed informed, not just early.`,
    ];
  }
  if (cat.includes('yield') || cat.includes('aggregat') || cat.includes('farm')) {
    return [
      `Deposit into ${name}'s flagship vault on ${chain} — ${size}. Cost: approval plus deposit gas, $3-$20; fifteen minutes.`,
      `Stay deposited at least 8 weeks and let rewards compound or claim them monthly; vault share over time is the metric yield protocols can snapshot.`,
      `Split a second, smaller deposit into a different vault or strategy ${name} offers, so your history covers more than the default option. Cost: one more round of gas.`,
      `Withdraw nothing before a full quarter passes unless the vault's strategy changes materially. Churn is visible on-chain and counts against you.`,
      `Track your vault share monthly and read any points or season announcement ${name} makes. Cost: 10 minutes a month. Yield launches snapshot share held over time, so the record you build now is the eligibility list later.`,
    ];
  }
  if (cat.includes('rwa') || cat.includes('real world')) {
    return [
      `Complete ${name}'s onboarding or KYC if it asks for it — for real-world-asset protocols the verified account is often the eligibility list. Cost: 20-40 minutes, no capital.`,
      `Hold its core tokenised asset (a treasury or credit product) on ${chain} — ${size}. Cost: purchase spread plus gas; hold at least a quarter.`,
      `Use the secondary features: redeem a small amount once, re-subscribe, and read the monthly reports, so the account shows a full lifecycle. Cost: an hour across the quarter.`,
      `Join the holder or governance channel and answer any holder survey; RWA launches have favoured verified, long-held accounts over large new ones.`,
      `Keep the verified account active: log in monthly, read the monthly report, and note any holder programme ${name} announces. Cost: 15 minutes a month. Eligibility lists for RWA launches are usually drawn from accounts still active at the snapshot.`,
    ];
  }
  if (cat.includes('launchpad') || cat.includes('ido') || cat.includes('pad')) {
    return [
      `Register on ${name} and complete its participation requirements early — tiers and allowlists are usually set weeks before a sale. Cost: 30 minutes, no capital yet.`,
      `Take part in one small sale or staking round at the minimum sensible size — ${size} — rather than watching from outside. Cost: the ticket plus gas.`,
      `Repeat across two or three sales over a quarter; launchpads reward repeat participants when they issue their own token. Time: an hour a month.`,
      `Claim and hold whatever the sales distribute instead of flipping on day one; held allocations are the history a launch snapshot can see.`,
      `Check the tier table monthly: tiers are recalculated as new sales open, and a small top-up participation can hold your tier. Cost: 10 minutes a month plus any ticket you choose. A launchpad's own token usually drops first to the tiers it already keeps.`,
    ];
  }
  if (cat.includes('nft')) {
    return [
      `Use ${name} as your marketplace or NFT venue on ${chain}: list two or three items you own and buy one small piece, so both sides of the book carry your address. Cost: listing and purchase fees, $10-$50.`,
      `Use its lending, rental or rewards surface if it has one, once a month for a quarter. Cost: gas per use; an hour a month in total.`,
      `Keep a modest balance or listed inventory live rather than sweeping through once — duration is the cheapest signal to give. ${size.charAt(0).toUpperCase() + size.slice(1)} if you buy in.`,
      `Join the creator or trader programme ${name} runs, if any, and complete its first tier; programme tiers are ready-made eligibility lists.`,
      `Keep the programme tier warm: one listing or trade a month holds most tiers, and note any rewards season ${name} announces. Cost: an hour a month at most. Marketplace launches have dropped to programme members before the wider user base.`,
    ];
  }
  if (cat.includes('gaming') || cat.includes('game')) {
    return [
      `Play ${name}'s flagship game or world for real: reach the first progression milestone a normal player hits in week one. Cost: 3-5 hours of play, no capital.`,
      `Hold a small in-game asset or currency balance — ${size} — and use the marketplace once, buying or selling a single item. Cost: the item plus marketplace fees.`,
      `Play weekly for a season (8-12 weeks) rather than in one binge; retention across weeks is the metric game launches snapshot. 30 minutes a week.`,
      `Enter one community event, tournament or quest ${name} runs and finish it; event completion lists are commonly reused as airdrop lists.`,
      `Log your season record monthly — level, items held, events finished — and watch for a points or season announcement from ${name}. Cost: 10 minutes a month. Game launches snapshot season history, and a kept record proves yours if a claim is ever disputed.`,
    ];
  }
  if (cat.includes('oracle') || cat.includes('infrastructure') || cat.includes('service') || cat.includes('index')) {
    return [
      `Use ${name}'s product the way its customers do — integrate its feed, data or service into one small live project or workflow on ${chain}. Cost: a weekend of setup; usage fees as billed.`,
      `If it runs staking, delegation or a node programme, join at the minimum tier — ${size}. Cost: the stake, locked for the programme's term.`,
      `Stay active a full quarter and keep the integration live; infrastructure launches reward accounts with continuous, not bursty, usage.`,
      `Take part in its developer or operator community: one useful bug report, answer or piece of feedback outweighs months of passive holding. Cost: an hour or two.`,
      `Keep a monthly usage log — uptime of your integration or node, requests served, fees paid — and read any operator programme ${name} announces. Cost: 20 minutes a month. Infrastructure launches allocate to operators who can show continuous service, and the log is the proof.`,
    ];
  }
  return [
    `Use ${name}'s core product on ${chain} once a week for a quarter — the smallest real action it offers, done steadily. Cost: gas per use, $1-$10; ten minutes a week.`,
    `Hold a working position sized to the protocol — ${size} — and leave it in place at least 8 weeks. Duration, not size, is what a snapshot can verify.`,
    `Cover the second feature too: if it offers staking, governance, a vault or a pro mode, use each once so your history spans the product. Cost: an extra hour, plus gas.`,
    `Join its community and governance channels and vote or comment once; when a launch comes, engaged long-term users are the list every team starts from.`,
    `Set a monthly reminder to re-check ${name}: one real use, a glance at its announcements, and a note of any points programme it opens. Cost: 15 minutes a month. Launches snapshot steady users; the habit is the whole strategy.`,
  ];
}

// ------------------------------------------------------------ the board

export interface BoardRow extends Valuation {
  slug: string;
  name: string;
  rank: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  farm_steps: string[];
}

export interface CategoryMultiple {
  category: string;
  peers: number;
  median: number;
  applied: number;
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  rows: BoardRow[];
  watchlist_size: number;
  traded_set_aside: number;
  products_set_aside: number;
  global_multiple: Multiple;
  /** Every category with at least three traded peers, most peers first:
   *  the evidence table behind the multiples the board applies. */
  multiples: CategoryMultiple[];
}

export function buildRadar(snapshot: Snapshot): Radar {
  const multiples = categoryMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);
  const rows: BoardRow[] = [];
  let traded = 0;
  let products = 0;
  for (const p of snapshot.protocols) {
    if (!recordsNoToken(p)) {
      traded++;
      continue;
    }
    if (isProductOfTraded(p)) {
      products++;
      continue;
    }
    const v = valueProtocol(p, multiples, snapshot.as_of);
    rows.push({
      ...v,
      slug: p.slug,
      name: p.name,
      rank: 0,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      on_watchlist: watch.has(p.slug),
      farm_steps: planFor(p),
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    rows,
    watchlist_size: snapshot.watchlist.length,
    traded_set_aside: traded,
    products_set_aside: products,
    global_multiple: multiples.global,
    multiples: [...multiples.byCategory.entries()]
      .map(([category, m]) => ({ category, peers: m.peers, median: m.median, applied: m.applied }))
      .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1)),
  };
}

/** A self-check mirroring the gate's board rules; null means the board is fit. */
export function boardIssue(rows: BoardRow[], snapshot: Snapshot): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, outside 100..4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!slugs.has(row.slug)) return `row names a protocol the snapshot does not: ${row.slug}`;
    if (seen.has(row.slug)) return `slug appears twice: ${row.slug}`;
    seen.add(row.slug);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `bad implied value on ${row.slug}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `farm_steps count off on ${row.slug}`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `a farm step on ${row.slug} is ${len} characters, outside 20..600`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol missing from the board: ${slug}`;
  }
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return 'ranks are not exactly 1..N';
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return 'implied value rises as rank ascends';
  }
  if (rows.length > 1 && rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) return 'every implied value is the same';
  return null;
}

/** The dashboard's data file: the whole radar as one script assignment. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
