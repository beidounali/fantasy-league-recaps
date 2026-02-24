import { sleeperGet } from "./sleeper";
import { buildFantasyCalcIndex } from "./trades";
import { getRecapLeague } from "./leagueSelect";
import { computeRecordsEnteringWeek } from "./records";
import { getSleeperPlayersMap } from "./players";

type Roster = { roster_id: number; owner_id: string; players?: string[] };
type User = { user_id: string; display_name: string; metadata?: { team_name?: string } };
type MatchupRow = { roster_id: number; matchup_id: number; points: number };

function nameFor(rosters: Roster[], users: User[], rosterId: number) {
  const roster = rosters.find((r) => r.roster_id === rosterId);
  const owner = roster ? users.find((u) => u.user_id === roster.owner_id) : undefined;
  return owner?.metadata?.team_name || owner?.display_name || `Roster ${rosterId}`;
}

async function weekMatchups(leagueId: string, week: number) {
  const rows = await sleeperGet<MatchupRow[]>(`/league/${leagueId}/matchups/${week}`);
  const byMatchup = new Map<number, MatchupRow[]>();
  for (const r of rows) {
    const arr = byMatchup.get(r.matchup_id) ?? [];
    arr.push(r);
    byMatchup.set(r.matchup_id, arr);
  }
  return { rows, byMatchup };
}

function findOpponentAndResult(opts: {
  byMatchup: Map<number, MatchupRow[]>;
  rosterId: number;
}) {
  for (const group of opts.byMatchup.values()) {
    if (group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    if (a.roster_id !== opts.rosterId && b.roster_id !== opts.rosterId) continue;

    const me = a.roster_id === opts.rosterId ? a : b;
    const opp = a.roster_id === opts.rosterId ? b : a;

    const margin = Math.abs(me.points - opp.points);
    const result: "W" | "L" | "T" = me.points === opp.points ? "T" : me.points > opp.points ? "W" : "L";

    return {
      opponentRosterId: opp.roster_id,
      result,
      margin,
      myPoints: me.points,
      oppPoints: opp.points,
    };
  }
  return null;
}

function computeStreak(results: Array<"W" | "L" | "T">) {
  if (results.length === 0) return "";
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === last) n++;
    else break;
  }
  return `${last}${n}`;
}

function sumTop(values: number[], n: number) {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a);
  return sorted.slice(0, n).reduce((s, v) => s + v, 0);
}

function positionalStrength(opts: {
  playerIds: string[];
  posOf: (pid: string) => string | undefined;
  valueOf: (pid: string) => number;
}) {
  const { playerIds, posOf, valueOf } = opts;

  const qb: number[] = [];
  const rb: number[] = [];
  const wr: number[] = [];
  const te: number[] = [];

  for (const pid of playerIds) {
    const pos = posOf(pid);
    const v = valueOf(pid);
    if (!pos || !Number.isFinite(v) || v <= 0) continue;
    if (pos === "QB") qb.push(v);
    else if (pos === "RB") rb.push(v);
    else if (pos === "WR") wr.push(v);
    else if (pos === "TE") te.push(v);
  }

  const qbSum = sumTop(qb, 3);
  const rbSum = sumTop(rb, 4);
  const wrSum = sumTop(wr, 6);
  const teSum = sumTop(te, 2);

  const total = qbSum + rbSum + wrSum + teSum;
  return { total, qbSum, rbSum, wrSum, teSum };
}

function roomNote(qbSum: number, rbSum: number, wrSum: number, teSum: number) {
  const parts = [
    { k: "QB", v: qbSum },
    { k: "RB", v: rbSum },
    { k: "WR", v: wrSum },
    { k: "TE", v: teSum },
  ].sort((a, b) => b.v - a.v);

  const best = parts[0].k;
  const worst = parts[parts.length - 1].k;

  const bestNote =
    best === "QB"
      ? "The QB room is the engine."
      : best === "RB"
      ? "RB depth is a differentiator."
      : best === "WR"
      ? "The WR room stabilizes the weekly floor."
      : "They have a real TE edge.";

  const worstNote =
    worst === "QB"
      ? "QB depth remains the swing factor."
      : worst === "RB"
      ? "RB depth is the soft spot."
      : worst === "WR"
      ? "WR depth is the question mark."
      : "TE production is the likely bottleneck.";

  return `${bestNote} ${worstNote}`;
}

function recentFormNote(last4: Array<"W" | "L" | "T">) {
  if (last4.length === 0) return "";
  const wins = last4.filter((x) => x === "W").length;
  if (wins >= 3) return "Form is trending up.";
  if (wins <= 1) return "Recent form has been uneven.";
  return "Mixed results over the last few.";
}

function signatureLine(opts: { rank: number; move: number; tag: "HIGH" | "LOW" | "NONE"; last4Wins: number }) {
  const { rank, move, tag, last4Wins } = opts;

  if (rank <= 3 && (tag === "HIGH" || last4Wins >= 3)) return "Built to win in January.";
  if (rank <= 6 && move > 0) return "Looks like a contender, not a pretender.";
  if (rank <= 10 && last4Wins >= 3) return "The arrow is pointing up.";
  if (tag === "LOW") return "Needs cleaner weekly execution.";
  if (last4Wins <= 1) return "One more slip and the slide becomes a trend.";
  if (move < 0) return "Still dangerous — but the margin for error is shrinking.";
  return "The blueprint is there; consistency is the next step.";
}

function stableSeed(week: number, rosterId: number) {
  // deterministic “random” so blurbs don’t shuffle on refresh
  return (week * 1000003 + rosterId * 9176) >>> 0;
}

function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length];
}

function movePhrase(move: number, rank: number, streak: string) {
  const streakPart = streak ? ` (${streak})` : "";
  if (move > 0) return `moves up ${move} to #${rank}${streakPart}.`;
  if (move < 0) return `slides ${Math.abs(move)} to #${rank}${streakPart}.`;
  return `holds at #${rank}${streakPart}.`;
}

function highLowTag(tag: "HIGH" | "LOW" | "NONE") {
  if (tag === "HIGH") return "Posted the top score last week.";
  if (tag === "LOW") return "Had the low score last week.";
  return "";
}

function buildVariedAnalystBlurb(opts: {
  week: number;
  rosterId: number;
  recordEntering: string;
  move: number;
  rank: number;
  streak: string;
  resultLine?: string;
  formLine: string;
  roomLine: string;
  tagLine: string;
  sig: string;
}) {
  const seed = stableSeed(opts.week, opts.rosterId);

  const openers = [
    `${opts.recordEntering} entering the week; ${movePhrase(opts.move, opts.rank, opts.streak)}`,
    `${movePhrase(opts.move, opts.rank, opts.streak)} ${opts.recordEntering} entering the week.`,
    `${opts.recordEntering} entering the week. ${movePhrase(opts.move, opts.rank, opts.streak)}`,
  ];

  const bodies = [
    // Template A: result → tag → room → form → signature
    () =>
      `${pick(openers, seed)} ${opts.resultLine ? opts.resultLine + " " : ""}${opts.tagLine ? opts.tagLine + " " : ""}${opts.roomLine} ${opts.formLine} ${opts.sig}`,
    // Template B: room → result → form → signature (tag optional)
    () =>
      `${pick(openers, seed)} ${opts.roomLine} ${opts.resultLine ? opts.resultLine + " " : ""}${opts.formLine} ${opts.tagLine ? opts.tagLine + " " : ""}${opts.sig}`,
    // Template C: tag → result → room → signature
    () =>
      `${pick(openers, seed)} ${opts.tagLine ? opts.tagLine + " " : ""}${opts.resultLine ? opts.resultLine + " " : ""}${opts.roomLine} ${opts.sig}`,
    // Template D: form → room → result → signature
    () =>
      `${pick(openers, seed)} ${opts.formLine} ${opts.roomLine} ${opts.resultLine ? opts.resultLine + " " : ""}${opts.sig}`,
    // Template E: concise (still analyst tone)
    () =>
      `${pick(openers, seed)} ${opts.resultLine ? opts.resultLine + " " : ""}${opts.roomLine} ${opts.sig}`,
    // Template F: “what it means” first
    () =>
      `${pick(openers, seed)} ${opts.sig} ${opts.roomLine} ${opts.resultLine ? opts.resultLine + " " : ""}${opts.formLine}`,
  ];

  return pick(bodies, seed + 13)();
}

export async function computePowerRankingsWithMovement(week: number) {
  const league = await getRecapLeague();
  const leagueId = league.league_id;

  const w = Math.max(1, week);
  const wPrev = Math.max(1, week - 1);

  const [rosters, users, fc, playersMap, curMatchups, prevMatchups, recordsEntering] = await Promise.all([
    sleeperGet<Roster[]>(`/league/${leagueId}/rosters`),
    sleeperGet<User[]>(`/league/${leagueId}/users`),
    buildFantasyCalcIndex(),
    getSleeperPlayersMap(),
    weekMatchups(leagueId, w),
    weekMatchups(leagueId, wPrev),
    computeRecordsEnteringWeek({ leagueId, week: w }),
  ]);

  const valueOf = (pid: string) => fc.bySleeperId.get(String(pid))?.value ?? 0;
  const posOf = (pid: string) => playersMap.get(String(pid))?.position;

  // High/low tags from LAST week (w-1)
  let highRoster: number | null = null;
  let lowRoster: number | null = null;
  if (prevMatchups.rows.length) {
    const sorted = [...prevMatchups.rows].sort((a, b) => b.points - a.points);
    highRoster = sorted[0]?.roster_id ?? null;
    lowRoster = sorted[sorted.length - 1]?.roster_id ?? null;
  }

  // Recent form: last 4 results before current week (weeks w-4..w-1)
  const last4ByRoster = new Map<number, Array<"W" | "L" | "T">>();
  for (let wk = Math.max(1, w - 4); wk <= wPrev; wk++) {
    const m = await weekMatchups(leagueId, wk);
    for (const r of rosters) {
      const res = findOpponentAndResult({ byMatchup: m.byMatchup, rosterId: r.roster_id });
      if (!res) continue;
      const arr = last4ByRoster.get(r.roster_id) ?? [];
      arr.push(res.result);
      last4ByRoster.set(r.roster_id, arr);
    }
  }

  const base = rosters.map((r) => {
    const name = nameFor(rosters, users, r.roster_id);
    const recordEntering = recordsEntering.recordStr(r.roster_id);

    const players = r.players ?? [];
    const s = positionalStrength({ playerIds: players, posOf, valueOf });

    const curPts = curMatchups.rows.find((x) => x.roster_id === r.roster_id)?.points ?? 0;
    const prevPts = prevMatchups.rows.find((x) => x.roster_id === r.roster_id)?.points ?? 0;

    return {
      rosterId: r.roster_id,
      name,
      recordEntering,
      strength: s.total,
      qbSum: s.qbSum,
      rbSum: s.rbSum,
      wrSum: s.wrSum,
      teSum: s.teSum,
      curPts,
      prevPts,
    };
  });

  // Score = strength + small momentum (current week)
  const maxPts = Math.max(...base.map((x) => x.curPts), 1);
  const maxStr = Math.max(...base.map((x) => x.strength), 1);

  const scored = base
    .map((x) => {
      const strengthNorm = x.strength / maxStr;
      const momentumNorm = x.curPts / maxPts;
      const score = 0.88 * strengthNorm + 0.12 * momentumNorm;
      return { ...x, score };
    })
    .sort((a, b) => b.score - a.score);

  // Previous week for movement
  const prevScored = base
    .map((x) => {
      const strengthNorm = x.strength / maxStr;
      const momentumNorm = x.prevPts / Math.max(1, Math.max(...base.map((z) => z.prevPts), 1));
      const score = 0.88 * strengthNorm + 0.12 * momentumNorm;
      return { ...x, score };
    })
    .sort((a, b) => b.score - a.score);

  const prevRank = new Map<number, number>();
  prevScored.forEach((r, i) => prevRank.set(r.rosterId, i + 1));

  const rows = scored.map((r, i) => {
    const rank = i + 1;
    const lw = prevRank.get(r.rosterId) ?? rank;
    const move = lw - rank;

    const last = findOpponentAndResult({ byMatchup: prevMatchups.byMatchup, rosterId: r.rosterId });
    const oppName = last ? nameFor(rosters, users, last.opponentRosterId) : null;
    const resultLine =
      last && oppName
        ? `${last.result === "W" ? "Beat" : last.result === "L" ? "Lost to" : "Tied"} ${oppName} ${last.myPoints.toFixed(
            2
          )}–${last.oppPoints.toFixed(2)} (Δ ${last.margin.toFixed(2)}).`
        : undefined;

    const last4 = last4ByRoster.get(r.rosterId) ?? [];
    const last4Wins = last4.filter((x) => x === "W").length;
    const streak = computeStreak(last4);

    const tag: "HIGH" | "LOW" | "NONE" =
      r.rosterId === highRoster ? "HIGH" : r.rosterId === lowRoster ? "LOW" : "NONE";

    const roomLine = roomNote(r.qbSum, r.rbSum, r.wrSum, r.teSum);
    const formLine = recentFormNote(last4);
    const tagLine = highLowTag(tag);
    const sig = signatureLine({ rank, move, tag, last4Wins });

    const blurb = buildVariedAnalystBlurb({
      week: w,
      rosterId: r.rosterId,
      recordEntering: r.recordEntering,
      move,
      rank,
      streak,
      resultLine,
      formLine,
      roomLine,
      tagLine,
      sig,
    });

    return {
      rosterId: r.rosterId,
      name: r.name,
      rank,
      lw,
      move,
      strength: r.strength,
      qbSum: r.qbSum,
      rbSum: r.rbSum,
      wrSum: r.wrSum,
      teSum: r.teSum,
      points: r.curPts,
      lastWeekPoints: r.prevPts,
      blurb,
    };
  });

  return { league, week: w, rows };
}

