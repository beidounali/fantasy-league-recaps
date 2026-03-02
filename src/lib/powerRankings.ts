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

function roomNote(qbSum: number, rbSum: number, wrSum: number, teSum: number, rng: () => number) {
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
      ? seededPick(["QB room is carrying the luggage.", "Quarterbacks are doing the heavy lifting.", "QB stack is the weekly engine."], rng)
      : best === "RB"
      ? seededPick(["RB depth is doing the heavy lifting.", "Running backs are the floor and the ceiling.", "RB room is the weekly advantage."], rng)
      : best === "WR"
      ? seededPick(["WR stack is the weekly life raft.", "Receiver depth keeps the wheels on.", "WR group is the stabilizer."], rng)
      : seededPick(["TE room is quietly elite.", "Tight ends are the cheat code.", "TE slot is actually an advantage."], rng);

  const worstNote =
    worst === "QB"
      ? seededPick(["QB depth is the panic button.", "QB room is thin ice.", "One QB injury and things get weird."], rng)
      : worst === "RB"
      ? seededPick(["RB depth is the soft underbelly.", "Running back depth is the weekly anxiety.", "RB room is the leak."], rng)
      : worst === "WR"
      ? seededPick(["WR depth is a weekly question mark.", "Receivers are where it gets shaky.", "WR room needs reinforcements."], rng)
      : seededPick(["TE production is the bottleneck.", "TE is the speed bump.", "Tight end output needs help."], rng);

  return `${bestNote} ${worstNote}`;
}

function recentFormNote(last4: Array<"W" | "L" | "T">, rng: () => number) {
  if (last4.length === 0) return "";
  const wins = last4.filter((x) => x === "W").length;
  if (wins >= 3) return seededPick(["This team has been hot the last month.", "Recent form: cooking.", "They’ve been rolling for weeks."], rng);
  if (wins <= 1) return seededPick(["Recent form is a red flag.", "The last few weeks have been ugly.", "Trend line is heading south."], rng);
  return seededPick(["Mixed results lately — vibes are volatile.", "Hot and cold with no warning.", "Some good, some chaos."], rng);
}

function signatureLine(opts: { rank: number; move: number; streak: string; rng: () => number }) {
  const { rank, move, streak, rng } = opts;
  const streakPart = streak ? ` (${streak})` : "";

  const lines = [
    `At #${rank}${streakPart}, the résumé is loud; the execution needs to stay that way.`,
    `#${rank}${streakPart}: looks strong, but one more wobble turns into a slide.`,
    `#${rank}${streakPart}: built to win, but don’t let the foot off the gas.`,
    `#${rank}${streakPart}: the ceiling is high, the floor is still a risk.`,
    `#${rank}${streakPart}: this is a contender if the coaching stays sane.`,
  ];

  if (move > 0) return `Climbing the ladder. ${seededPick(lines, rng)}`;
  if (move < 0) return `Fell a couple rungs. ${seededPick(lines, rng)}`;
  return seededPick(lines, rng);
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick<T>(arr: T[], rng: () => number) {
  return arr[Math.floor(rng() * arr.length)];
}

function movePhrase(move: number, rank: number, streak: string, rng: () => number) {
  const streakPart = streak ? ` (${streak})` : "";
  if (move > 0) return seededPick([`moves up ${move} to #${rank}${streakPart}.`, `climbs ${move} spots to #${rank}${streakPart}.`], rng);
  if (move < 0) return seededPick([`slides ${Math.abs(move)} to #${rank}${streakPart}.`, `drops ${Math.abs(move)} to #${rank}${streakPart}.`], rng);
  return seededPick([`holds at #${rank}${streakPart}.`, `stays parked at #${rank}${streakPart}.`], rng);
}

function highLowTag(tag: "HIGH" | "LOW" | "NONE", rng: () => number) {
  if (tag === "HIGH") return seededPick(["Dropped the top score last week.", "Was the weekly high scorer.", "Put up the week’s best total."], rng);
  if (tag === "LOW") return seededPick(["Put up the week’s low score. Ouch.", "Lowest score on the slate.", "Had the week’s basement score."], rng);
  return "";
}

function buildRoastBlurb(opts: {
  rng: () => number;
  name: string;
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
  const openers = [
    `${opts.recordEntering} entering the week; ${movePhrase(opts.move, opts.rank, opts.streak, opts.rng)}`,
    `${movePhrase(opts.move, opts.rank, opts.streak, opts.rng)} ${opts.recordEntering} entering the week.`,
    `${opts.recordEntering} entering the week. ${movePhrase(opts.move, opts.rank, opts.streak, opts.rng)}`,
    `${opts.name}: ${movePhrase(opts.move, opts.rank, opts.streak, opts.rng)} ${opts.recordEntering} on the year.`,
    `${opts.name} checked in at ${opts.recordEntering} and ${movePhrase(opts.move, opts.rank, opts.streak, opts.rng)}`,
  ];

  const resultBits = [
    opts.resultLine,
    opts.resultLine ? `${opts.resultLine} Don’t check the bench.` : undefined,
    opts.resultLine ? `${opts.resultLine} The group chat noticed.` : undefined,
    opts.resultLine ? `${opts.resultLine} That one hurt.` : undefined,
  ].filter(Boolean) as string[];

  const buttons = [
    "This team can beat anyone, including itself.",
    "Variance is undefeated.",
    "If there’s a lane, they’ll drive in it. If there’s a ditch, they’ll find that too.",
    "The ceiling is high; the floor is a trap door.",
  ];

  const structures: Array<() => string> = [
    () => `${seededPick(openers, opts.rng)} ${opts.tagLine ? opts.tagLine + " " : ""}${seededPick(resultBits, opts.rng) ?? ""} ${opts.roomLine} ${opts.formLine} ${opts.sig}`.trim(),
    () => `${seededPick(openers, opts.rng)} ${opts.roomLine} ${seededPick(resultBits, opts.rng) ?? ""} ${opts.formLine} ${seededPick(buttons, opts.rng)} ${opts.sig}`.trim(),
    () => `${seededPick(openers, opts.rng)} ${opts.formLine} ${opts.roomLine} ${opts.tagLine ? opts.tagLine + " " : ""}${opts.sig}`.trim(),
    () => `${seededPick(openers, opts.rng)} ${seededPick(resultBits, opts.rng) ?? ""} ${opts.roomLine} ${seededPick(buttons, opts.rng)} ${opts.sig}`.trim(),
    () => `${seededPick(openers, opts.rng)} ${opts.tagLine ? opts.tagLine + " " : ""}${opts.formLine} ${seededPick(buttons, opts.rng)} ${opts.sig}`.trim(),
    () => `${seededPick(openers, opts.rng)} ${seededPick(buttons, opts.rng)} ${opts.roomLine} ${opts.sig}`.trim(),
  ];

  return seededPick(structures, opts.rng)();
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

  let highRoster: number | null = null;
  let lowRoster: number | null = null;
  if (prevMatchups.rows.length) {
    const sorted = [...prevMatchups.rows].sort((a, b) => b.points - a.points);
    highRoster = sorted[0]?.roster_id ?? null;
    lowRoster = sorted[sorted.length - 1]?.roster_id ?? null;
  }

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
    const streak = computeStreak(last4);

    const tag: "HIGH" | "LOW" | "NONE" =
      r.rosterId === highRoster ? "HIGH" : r.rosterId === lowRoster ? "LOW" : "NONE";

    const seed = (w * 1000003 + r.rosterId * 9176) >>> 0;
    const rng = mulberry32(seed);

    const roomLine = roomNote(r.qbSum, r.rbSum, r.wrSum, r.teSum, rng);
    const formLine = recentFormNote(last4, rng);
    const tagLine = highLowTag(tag, rng);
    const sig = signatureLine({ rank, move, streak, rng });

    const blurb = buildRoastBlurb({
      rng,
      name: r.name,
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
