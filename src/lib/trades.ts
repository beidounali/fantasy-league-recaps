import { leagueId as currentLeagueIdFn, sleeperGet } from "./sleeper";
import { fetchFantasyCalcValues, FCValueRow } from "./fantasycalc";

function letterGrade(deltaPct: number) {
  if (deltaPct >= 0.25) return "A+";
  if (deltaPct >= 0.15) return "A";
  if (deltaPct >= 0.08) return "B+";
  if (deltaPct >= 0.03) return "B";
  if (deltaPct >= -0.03) return "C";
  if (deltaPct >= -0.08) return "C-";
  if (deltaPct >= -0.15) return "D+";
  if (deltaPct >= -0.25) return "D";
  return "F";
}

type League = { total_rosters: number; previous_league_id?: string | null; season?: string };

export type SleeperTransaction = {
  type: string;
  status: string;
  roster_ids: number[];
  adds?: Record<string, number>;
  draft_picks?: Array<{
    season: string;
    round: number;
    roster_id: number;
    owner_id: number;
    previous_owner_id: number;
  }>;
  created: number;
};

export function gradeFromDeltaPct(deltaPct: number) {
  if (deltaPct >= 0.18) return "A+";
  if (deltaPct >= 0.12) return "A";
  if (deltaPct >= 0.06) return "B";
  if (deltaPct >= 0.02) return "C";
  if (deltaPct > -0.02) return "C-";
  if (deltaPct > -0.06) return "D";
  if (deltaPct > -0.12) return "E";
  return "F";
}

export async function getLeagueWithPrev(leagueId: string) {
  return sleeperGet<League>(`/league/${leagueId}`);
}

function parsePickKey(name: string) {
  const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  const match = normalized.match(/\b(20\d{2})\s*(early|mid|late)?\s*(1st|2nd|3rd|4th)\b/);
  if (!match) return null;

  const season = match[1];
  const tier = match[2] ?? "";
  const roundWord = match[3];
  const round = roundWord === "1st" ? 1 : roundWord === "2nd" ? 2 : roundWord === "3rd" ? 3 : 4;
  const key = `${season}-R${round}`;
  return { key, tier };
}

function extractPickValues(values: FCValueRow[]) {
  const bucket = new Map<string, { sum: number; count: number; mid?: number }>();

  for (const row of values) {
    const name = row.player?.name;
    if (!name) continue;
    const parsed = parsePickKey(name);
    if (!parsed) continue;

    const entry = bucket.get(parsed.key) ?? { sum: 0, count: 0 };
    if (parsed.tier === "mid") {
      entry.mid = row.value;
    } else {
      entry.sum += row.value;
      entry.count += 1;
    }
    bucket.set(parsed.key, entry);
  }

  const map = new Map<string, number>();
  for (const [key, entry] of bucket.entries()) {
    const avg = entry.count ? entry.sum / entry.count : 0;
    map.set(key, entry.mid ?? avg);
  }

  return map;
}

export async function buildFantasyCalcIndex() {
  const id = currentLeagueIdFn();
  const league = await sleeperGet<League>(`/league/${id}`);

  const values = await fetchFantasyCalcValues({
    numTeams: league.total_rosters,
    ppr: "ppr",
    numQbs: 2,
    isDynasty: true,
  });

  const bySleeperId = new Map<string, FCValueRow>();
  for (const row of values) {
    const sid = row.player?.sleeperId;
    if (sid) bySleeperId.set(String(sid), row);
  }

  const pickValueByKey = extractPickValues(values);

  return { bySleeperId, league, pickValueByKey };
}

/**
 * PICK VALUE MODEL (Dynasty SF PPR)
 * - Baseline per round (mid pick)
 * - Discount future years (starting 2028)
 *
 * Tweak these numbers any time to match your league market.
 */
function basePickValueForRound(round: number) {
  if (round === 1) return 5200;
  if (round === 2) return 2000;
  if (round === 3) return 850;
  if (round === 4) return 350;
  return 0;
}

function yearDiscount(yearsOut: number) {
  return Math.pow(0.90, Math.max(0, yearsOut));
}

export function valueOfPick(
  p: { season: string; round: number },
  currentSeason: string,
  pickValueByKey?: Map<string, number>
) {
  const key = `${p.season}-R${p.round}`;
  if (pickValueByKey?.has(key)) return pickValueByKey.get(key) ?? 0;

  const base = basePickValueForRound(p.round);
  if (base === 0) return 0;

  const seasonNum = Number(p.season);
  const currentNum = Number(currentSeason);
  const yearsOut = Number.isFinite(seasonNum) && Number.isFinite(currentNum) ? seasonNum - currentNum : 0;

  if (Number.isFinite(seasonNum) && seasonNum >= 2028) {
    return base * yearDiscount(yearsOut);
  }
  return base;
}

/**
 * Scan transactions rounds for a specific league_id.
 */
export async function loadTradesForLeague(opts: {
  leagueId: string;
  startRound?: number;
  maxRound?: number;
  stopAfterEmptyRounds?: number;
}) {
  const startRound = opts.startRound ?? 1;
  const maxRound = opts.maxRound ?? 50;
  const stopAfterEmptyRounds = opts.stopAfterEmptyRounds ?? 6;

  const all: SleeperTransaction[] = [];
  let emptyStreak = 0;

  for (let r = startRound; r <= maxRound; r++) {
    const txns = await sleeperGet<SleeperTransaction[]>(`/league/${opts.leagueId}/transactions/${r}`);
    const trades = txns.filter((t) => t.type === "trade" && t.status === "complete");

    if (trades.length === 0) emptyStreak++;
    else emptyStreak = 0;

    all.push(...trades);

    if (emptyStreak >= stopAfterEmptyRounds) break;
  }

  return all;
}

/**
 * Load trades from current league AND previous league if it exists.
 */
export async function loadTradesCurrentAndPrevious(opts?: {
  startRound?: number;
  maxRound?: number;
  stopAfterEmptyRounds?: number;
}) {
  const currentId = currentLeagueIdFn();
  const currentLeague = await getLeagueWithPrev(currentId);

  const leagueIds: Array<{ id: string; label: string }> = [
    { id: currentId, label: currentLeague.season ? `${currentLeague.season}` : "current" },
  ];

  if (currentLeague.previous_league_id) {
    const prevLeague = await getLeagueWithPrev(currentLeague.previous_league_id);
    leagueIds.push({
      id: currentLeague.previous_league_id,
      label: prevLeague.season ? `${prevLeague.season}` : "previous",
    });
  }

  const batches = await Promise.all(
    leagueIds.map(async (x) => {
      const trades = await loadTradesForLeague({
        leagueId: x.id,
        startRound: opts?.startRound ?? 1,
        maxRound: opts?.maxRound ?? 50,
        stopAfterEmptyRounds: opts?.stopAfterEmptyRounds ?? 6,
      });
      return trades.map((t) => ({ ...t, __leagueLabel: x.label, __leagueId: x.id }));
    })
  );

  const all = batches.flat();
  all.sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0));
  return all as Array<SleeperTransaction & { __leagueLabel: string; __leagueId: string }>;
}

export function splitPlayersForRoster(trade: SleeperTransaction, rosterId: number) {
  const received: string[] = [];
  const sent: string[] = [];

  if (!trade.adds) return { received, sent };

  for (const [playerId, toRoster] of Object.entries(trade.adds)) {
    if (toRoster === rosterId) received.push(playerId);
    else if (trade.roster_ids.includes(toRoster)) sent.push(playerId);
  }

  return { received, sent };
}

export function splitPicksForRoster(trade: SleeperTransaction, rosterId: number) {
  const picks = trade.draft_picks ?? [];
  const picksReceived = picks.filter((p) => p.owner_id === rosterId && p.previous_owner_id !== rosterId);
  const picksSent = picks.filter((p) => p.previous_owner_id === rosterId && p.owner_id !== rosterId);
  return { picksReceived, picksSent };
}

export function computeTradeGradeForRoster(opts: {
  trade: SleeperTransaction;
  rosterId: number;
  valueOfPlayer: (playerId: string) => number;
  currentSeason: string;
  pickValueByKey?: Map<string, number>;
}) {
  const { trade, rosterId, valueOfPlayer, currentSeason, pickValueByKey } = opts;

  const { received: playersReceived, sent: playersSent } = splitPlayersForRoster(trade, rosterId);
  const { picksReceived, picksSent } = splitPicksForRoster(trade, rosterId);

  const receivedPlayersValue = playersReceived.reduce((sum, pid) => sum + valueOfPlayer(pid), 0);
  const sentPlayersValue = playersSent.reduce((sum, pid) => sum + valueOfPlayer(pid), 0);

  const receivedPicksValue = picksReceived.reduce((sum, p) => sum + valueOfPick(p, currentSeason, pickValueByKey), 0);
  const sentPicksValue = picksSent.reduce((sum, p) => sum + valueOfPick(p, currentSeason, pickValueByKey), 0);

  const receivedValue = receivedPlayersValue + receivedPicksValue;
  const sentValue = sentPlayersValue + sentPicksValue;

  const total = receivedValue + sentValue;
  const deltaPct = total === 0 ? 0 : (receivedValue - sentValue) / total;
  const grade = letterGrade(deltaPct);

  return {
    playersReceived,
    playersSent,
    picksReceived,
    picksSent,
    receivedPlayersValue,
    sentPlayersValue,
    receivedPicksValue,
    sentPicksValue,
    receivedValue,
    sentValue,
    deltaPct,
    grade,
  };
}
