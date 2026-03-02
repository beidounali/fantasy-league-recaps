import Link from "next/link";
import { CbsArticle } from "@/components/CbsArticle";
import { getRecapLeague } from "@/lib/leagueSelect";
import { sleeperGet } from "@/lib/sleeper";
import { getSleeperPlayersMap, formatPlayer } from "@/lib/players";
import { buildFantasyCalcIndex, computeTradeGradeForRoster, valueOfPick } from "@/lib/trades";
import { loadTransactionsForRound } from "@/lib/transactions";
import { getWeekPointsPpr } from "@/lib/weekStats";
import { computeRecordsEnteringWeek } from "@/lib/records";

type MatchupRow = {
  roster_id: number;
  matchup_id: number;
  points: number;
  starters?: string[];
  players?: string[];
};

type Roster = { roster_id: number; owner_id: string };
type User = { user_id: string; display_name: string; metadata?: { team_name?: string } };
type Txn = Awaited<ReturnType<typeof loadTransactionsForRound>>[number];

type TradeSummary = {
  tradeId: string;
  teams: Array<{
    rosterId: number;
    teamName: string;
    receivedPlayers: string[];
    sentPlayers: string[];
    receivedPicks: string[];
    sentPicks: string[];
    receivedValue: number;
    sentValue: number;
  }>;
};

function teamName(rosters: Array<{ roster_id: number; owner_id: string }>, userById: Map<string, User>, rosterId: number) {
  const r = rosters.find((x) => x.roster_id === rosterId);
  const u = r ? userById.get(r.owner_id) : undefined;
  return u?.metadata?.team_name || u?.display_name || `Roster ${rosterId}`;
}

function playoffLabel(week: number, playoffStart: number, playoffRounds: number) {
  if (week < playoffStart) return null;
  const round = week - playoffStart + 1;
  if (playoffRounds === 3) {
    if (round === 1) return "Playoffs — Round 1";
    if (round === 2) return "Playoffs — Semifinals";
    if (round === 3) return "Playoffs — Championship";
  }
  return `Playoffs — Round ${round}`;
}

function getStartSlots(rosterPositions: string[]) {
  const ignore = new Set(["BN", "IR", "TAXI", "RES", "COVID", "PUP"]);
  return rosterPositions.filter((p) => !ignore.has(p));
}

function eligiblePositionsForSlot(slot: string) {
  if (slot === "QB") return new Set(["QB"]);
  if (slot === "RB") return new Set(["RB"]);
  if (slot === "WR") return new Set(["WR"]);
  if (slot === "TE") return new Set(["TE"]);
  if (slot === "K") return new Set(["K"]);
  if (slot === "DEF") return new Set(["DEF"]);
  if (slot === "FLEX") return new Set(["RB", "WR", "TE"]);
  if (slot === "REC_FLEX") return new Set(["WR", "TE"]);
  if (slot === "WRRB_FLEX") return new Set(["WR", "RB"]);
  if (slot === "SUPER_FLEX") return new Set(["QB", "RB", "WR", "TE"]);
  return new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);
}

function computeOptimalPoints(opts: {
  slots: string[];
  players: string[];
  playerPos: (pid: string) => string | undefined;
  pts: (pid: string) => number;
}) {
  const { slots, players, playerPos, pts } = opts;

  const pool = players
    .map((pid) => ({ pid, pos: playerPos(pid), pts: pts(pid) }))
    .filter((x) => Number.isFinite(x.pts) && x.pts >= 0 && x.pos);

  const used = new Set<string>();
  let total = 0;

  const fixedOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const flexish = slots.filter((s) => !fixedOrder.includes(s));
  const orderedSlots = [
    ...slots.filter((s) => fixedOrder.includes(s)).sort((a, b) => fixedOrder.indexOf(a) - fixedOrder.indexOf(b)),
    ...flexish.filter((s) => s !== "SUPER_FLEX"),
    ...flexish.filter((s) => s === "SUPER_FLEX"),
  ];

  for (const slot of orderedSlots) {
    const elig = eligiblePositionsForSlot(slot);
    let best: null | { pid: string; pts: number } = null;

    for (const p of pool) {
      if (used.has(p.pid)) continue;
      if (!p.pos || !elig.has(p.pos)) continue;
      if (!best || p.pts > best.pts) best = { pid: p.pid, pts: p.pts };
    }

    if (best) {
      used.add(best.pid);
      total += best.pts;
    }
  }

  return total;
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

function headlineForGame(opts: { rng: () => number; margin: number; combined: number; benchLeft: number; isGotw: boolean; aName: string; bName: string }) {
  const { rng, margin, combined, benchLeft, isGotw, aName, bName } = opts;

  const base = [
    `${aName} vs ${bName}: ${seededPick(["Main Event", "The Grudge", "Sunday Night Energy", "The Main Card", "The Hype Piece"], rng)}`,
    seededPick(["Scoreboard Sprints", "Track Meet", "Points Palooza", "Offensive Fireworks", "Points Parade"], rng),
    seededPick(["Bench Crimes", "Start/Sit Disaster", "Coaching Malpractice", "Lineup Horror Story", "Manager Mayhem"], rng),
    seededPick(["Coin Flip Chaos", "One-Score Heartbreak", "Heartbreaker", "By a Nose"], rng),
    seededPick(["Statement Win", "No Contest", "Public Service Announcement", "Certified Blowout"], rng),
    seededPick(["Weekly Recap", "Game Recap", "Another Chapter", "Scoreboard Session"], rng),
  ];

  if (isGotw) {
    return seededPick([`Game of the Week: ${aName} vs ${bName}`, "Game of the Week", seededPick(base, rng)], rng);
  }
  if (benchLeft >= 25) return seededPick([base[2], `Bench Crimes: ${aName} vs ${bName}`], rng);
  if (margin <= 3) return seededPick([base[3], `${aName}–${bName}: ${base[3]}`], rng);
  if (margin >= 40) return seededPick([base[4], `${aName}–${bName}: ${base[4]}`], rng);
  if (combined >= 320) return seededPick([base[1], `${aName}–${bName}: ${base[1]}`], rng);

  return seededPick(base, rng);
}

function describeTrade(opts: {
  trade: Txn;
  rosters: Roster[];
  users: User[];
  playersMap: Map<string, any>;
  currentSeason: string;
  valueOfPlayer: (pid: string) => number;
  pickValueByKey?: Map<string, number>;
}) {
  const { trade, rosters, users, playersMap, currentSeason, valueOfPlayer, pickValueByKey } = opts;
  const rosterIds = trade.roster_ids ?? [];
  if (rosterIds.length === 0) return null;

  const userById = new Map(users.map((u) => [u.user_id, u]));

  const rosterIdByOwnerId = new Map(rosters.map((r) => [String(r.owner_id), r.roster_id]));

  const adds = trade.adds ?? {};
  const drops = trade.drops ?? {};
  const picks = trade.draft_picks ?? [];

  const teams = rosterIds.map((rid) => {
    const receivedPlayerIds = Object.entries(adds)
      .filter(([, toRid]) => toRid === rid)
      .map(([pid]) => pid);

    const sentPlayerIds = Object.entries(drops)
      .filter(([, fromRid]) => fromRid === rid)
      .map(([pid]) => pid);

    const receivedPlayers = receivedPlayerIds.map((pid) => formatPlayer(playersMap.get(pid)));
    const sentPlayers = sentPlayerIds.map((pid) => formatPlayer(playersMap.get(pid)));

    const receivedPicks = picks
      .filter((p) => p.roster_id === rid)
      .map((p) => `Pick ${p.season} R${p.round} (${valueOfPick(p, currentSeason, pickValueByKey).toFixed(0)})`);

    const sentPicks = picks
      .filter((p) => rosterIdByOwnerId.get(String(p.previous_owner_id)) === rid)
      .map((p) => `Pick ${p.season} R${p.round} (${valueOfPick(p, currentSeason, pickValueByKey).toFixed(0)})`);

    const receivedPlayersValue = receivedPlayerIds.reduce((sum, pid) => sum + valueOfPlayer(pid), 0);
    const sentPlayersValue = sentPlayerIds.reduce((sum, pid) => sum + valueOfPlayer(pid), 0);
    const receivedPicksValue = picks.filter((p) => p.roster_id === rid).reduce((sum, p) => sum + valueOfPick(p, currentSeason, pickValueByKey), 0);
    const sentPicksValue = picks.filter((p) => rosterIdByOwnerId.get(String(p.previous_owner_id)) === rid).reduce((sum, p) => sum + valueOfPick(p, currentSeason, pickValueByKey), 0);

    return {
      rosterId: rid,
      teamName: teamName(rosters, userById, rid),
      receivedPlayers,
      sentPlayers,
      receivedPicks,
      sentPicks,
      receivedValue: receivedPlayersValue + receivedPicksValue,
      sentValue: sentPlayersValue + sentPicksValue,
    };
  });

  return {
    tradeId: `${trade.created}-${rosterIds.join("-")}`,
    teams,
  } as TradeSummary;
}

function formatTradeSummary(summary: TradeSummary) {
  const parts = summary.teams.map((t) => {
    const received = [...t.receivedPlayers, ...t.receivedPicks].filter(Boolean).join(", ") || "(nothing)";
    const sent = [...t.sentPlayers, ...t.sentPicks].filter(Boolean).join(", ") || "(nothing)";
    return `${t.teamName} received ${received} (value ${t.receivedValue.toFixed(0)}); sent ${sent} (value ${t.sentValue.toFixed(0)})`;
  });

  return parts.join(" | ");
}
export default async function WeekPage(props: { params: Promise<{ week: string }> }) {
  const { week: weekStr } = await props.params;
  const week = Number(weekStr);

  const league = await getRecapLeague();
  const leagueId = league.league_id;
  const season = String(league.season);

  const playoffStart = Number(league.settings?.playoff_week_start ?? 15);
  const playoffRounds = Number(league.settings?.playoff_rounds ?? 3);
  const label = playoffLabel(week, playoffStart, playoffRounds);

  const [matchups, rosters, users, playersMap, fc, txns, weekPts, records] = await Promise.all([
    sleeperGet<MatchupRow[]>(`/league/${leagueId}/matchups/${week}`),
    sleeperGet<Roster[]>(`/league/${leagueId}/rosters`),
    sleeperGet<User[]>(`/league/${leagueId}/users`),
    getSleeperPlayersMap(),
    buildFantasyCalcIndex(),
    loadTransactionsForRound(leagueId, week),
    getWeekPointsPpr(season, week, "regular"),
    computeRecordsEnteringWeek({ leagueId, week }),
  ]);

  const userById = new Map(users.map((u) => [u.user_id, u]));
  const slots = getStartSlots(league.roster_positions ?? []);

  const valueOfPlayer = (pid: string) => fc.bySleeperId.get(String(pid))?.value ?? 0;
  const pickValueByKey = fc.pickValueByKey;
  const ptsOfPlayer = (pid: string) => weekPts.get(String(pid)) ?? 0;
  const posOfPlayer = (pid: string) => playersMap.get(String(pid))?.position;

  const byMatchup = new Map<number, MatchupRow[]>();
  for (const row of matchups) {
    const arr = byMatchup.get(row.matchup_id) ?? [];
    arr.push(row);
    byMatchup.set(row.matchup_id, arr);
  }
  const games = [...byMatchup.values()].filter((rows) => rows.length >= 2).map((rows) => ({ a: rows[0], b: rows[1] }));

  const gotw = [...games].sort((x, y) => (y.a.points + y.b.points) - (x.a.points + x.b.points))[0];

  const addsDrops = txns.filter((t: Txn) => (t.type === "waiver" || t.type === "free_agent") && t.status === "complete");
  const trades = txns.filter((t: Txn) => t.type === "trade" && t.status === "complete");

  const bestAdd = (() => {
    const adds: Array<{ pid: string; toRoster: number; value: number }> = [];
    for (const t of addsDrops) {
      if (!t.adds) continue;
      for (const [pid, toRoster] of Object.entries(t.adds)) adds.push({ pid, toRoster, value: valueOfPlayer(pid) });
    }
    adds.sort((a, b) => b.value - a.value);
    return adds[0];
  })();

  const worstDrop = (() => {
    const drops: Array<{ pid: string; fromRoster: number; value: number }> = [];
    for (const t of addsDrops) {
      if (!t.drops) continue;
      for (const [pid, fromRoster] of Object.entries(t.drops)) drops.push({ pid, fromRoster, value: valueOfPlayer(pid) });
    }
    drops.sort((a, b) => b.value - a.value);
    return drops[0];
  })();

  const tradeSwing = (() => {
    const graded = trades.flatMap((t: any) =>
      (t.roster_ids ?? []).map((rid: number) => {
        const g = computeTradeGradeForRoster({ trade: t, rosterId: rid, valueOfPlayer, currentSeason: season, pickValueByKey });
        return { rosterId: rid, g, swing: Math.abs(g.deltaPct) };
      })
    );
    graded.sort((a, b) => b.swing - a.swing);
    return graded[0];
  })();

  const swingTrade = tradeSwing?.g ? trades.find((t: any) => (t.roster_ids ?? []).includes(tradeSwing.rosterId)) : null;
  const swingSummary = swingTrade
    ? describeTrade({ trade: swingTrade, rosters, users, playersMap, currentSeason: season, valueOfPlayer, pickValueByKey })
    : null;
  const swingLine = swingSummary ? formatTradeSummary(swingSummary) : "";

  const sideReport = (row: MatchupRow) => {
    const starters = row.starters ?? [];
    const players = row.players ?? [];
    const bench = players.filter((p) => !starters.includes(p));

    const starterTotal = starters.reduce((s, pid) => s + ptsOfPlayer(pid), 0);
    const optimal = computeOptimalPoints({ slots, players, playerPos: posOfPlayer, pts: ptsOfPlayer });
    const left = Math.max(0, optimal - starterTotal);

    const benchSorted = [...bench].map((pid) => ({ pid, pts: ptsOfPlayer(pid), pos: posOfPlayer(pid) }))
      .filter((x) => x.pos).sort((a, b) => b.pts - a.pts);

    const starterSorted = [...starters].map((pid) => ({ pid, pts: ptsOfPlayer(pid), pos: posOfPlayer(pid) }))
      .filter((x) => x.pos).sort((a, b) => a.pts - b.pts);

    let worstSwap: null | { benchPid: string; starterPid: string; gain: number } = null;
    for (const b of benchSorted.slice(0, 8)) {
      for (const s of starterSorted.slice(0, 8)) {
        const ok =
          (b.pos && s.pos && b.pos === s.pos) ||
          (b.pos && s.pos && new Set(["RB", "WR", "TE"]).has(b.pos) && new Set(["RB", "WR", "TE"]).has(s.pos)) ||
          (b.pos && s.pos && new Set(["QB", "RB", "WR", "TE"]).has(b.pos) && new Set(["QB", "RB", "WR", "TE"]).has(s.pos));
        if (!ok) continue;
        const gain = b.pts - s.pts;
        if (gain > 0 && (!worstSwap || gain > worstSwap.gain)) worstSwap = { benchPid: b.pid, starterPid: s.pid, gain };
      }
    }

    return { left, worstSwap, topBench: benchSorted[0] };
  };

  const articles = games.map((g) => {
    const isGotw = g.a.matchup_id === gotw.a.matchup_id;

    const aName = teamName(rosters, userById, g.a.roster_id);
    const bName = teamName(rosters, userById, g.b.roster_id);

    const aRec = records.recordStr(g.a.roster_id);
    const bRec = records.recordStr(g.b.roster_id);

    const margin = Math.abs(g.a.points - g.b.points);
    const combined = g.a.points + g.b.points;

    const repA = sideReport(g.a);
    const repB = sideReport(g.b);
    const biggest = repA.left >= repB.left ? { rid: g.a.roster_id, rep: repA } : { rid: g.b.roster_id, rep: repB };

    const seed = week * 1000003 + g.a.matchup_id * 9176;
    const rng = mulberry32(seed >>> 0);

    const title = headlineForGame({ rng, margin, combined, benchLeft: biggest.rep.left, isGotw, aName, bName });

    const winnerName = g.a.points === g.b.points ? "Tie" : g.a.points > g.b.points ? aName : bName;

    const startersA = g.a.starters ?? [];
    const startersB = g.b.starters ?? [];
    const starterPool = [
      ...startersA.map((pid) => ({ rid: g.a.roster_id, pid, pts: ptsOfPlayer(pid) })),
      ...startersB.map((pid) => ({ rid: g.b.roster_id, pid, pts: ptsOfPlayer(pid) })),
    ].filter((x) => Number.isFinite(x.pts));

    starterPool.sort((x, y) => y.pts - x.pts);
    const star = starterPool[0];
    const goat = [...starterPool].sort((x, y) => x.pts - y.pts)[0];

    const hookTemplates = [
      `${aName} (${aRec}) and ${bName} (${bRec}) showed up like it was primetime. One looked prepared; the other looked surprised by kickoff.`,
      `This matchup had everything: points, panic, and at least one player who should be on the bench.`,
      `${aName} vs ${bName} felt like a rivalry, even if only one team remembered to bring snacks.`,
      `${aName} (${aRec}) and ${bName} (${bRec}) walked in with two different plans: win the week or learn a lesson.`,
      `If you like chaos, ${aName} vs ${bName} delivered. If you like clean coaching, keep scrolling.`,
      `Two records walked in, one left with receipts. ${aName} vs ${bName} did not disappoint.`,
      `${aName} vs ${bName} had the energy of a rivalry game, even if only one side got the memo.`,
    ];

    const resultTemplates = [
      `${winnerName} takes it ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. Margin: ${margin.toFixed(2)}. ${margin <= 3 ? "Coin flip with consequences." : margin >= 40 ? "Absolute demolition." : "Solid work."}`,
      `Final: ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. ${winnerName} cashes the W; the rest is therapy.`,
      `${winnerName} wins ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. ${margin <= 3 ? "One lineup tweak flips this." : margin >= 40 ? "Never really in doubt." : "Businesslike."}`,
      `${winnerName} survives ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. ${margin <= 6 ? "Barely." : "Comfortably."}`,
      `${winnerName} gets it done, and the margin (${margin.toFixed(2)}) says this was ${margin <= 5 ? "dangerously close" : "never really in doubt"}.`,
      `${winnerName} walks away with the W after ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. No refunds.`,
    ];

    const starTemplates = star ? [
      `Star of the day: ${teamName(rosters, userById, star.rid)} got a premium performance from ${formatPlayer(playersMap.get(star.pid))} (${star.pts.toFixed(2)}).`,
      `${formatPlayer(playersMap.get(star.pid))} went nuclear (${star.pts.toFixed(2)}), and ${teamName(rosters, userById, star.rid)} rode it home.`,
      `If you needed a carry, ${formatPlayer(playersMap.get(star.pid))} delivered ${star.pts.toFixed(2)} for ${teamName(rosters, userById, star.rid)}.`,
      `${teamName(rosters, userById, star.rid)} got bailed out by ${formatPlayer(playersMap.get(star.pid))} (${star.pts.toFixed(2)}).`,
    ] : [`No single superstar takeover — this one was won by committee.`];

    const goatTemplates = goat ? [
      `On the flip side, ${teamName(rosters, userById, goat.rid)} got ${goat.pts.toFixed(2)} from ${formatPlayer(playersMap.get(goat.pid))}. That’s the kind of stat line you delete from memory.`,
      `Rough line: ${formatPlayer(playersMap.get(goat.pid))} posted ${goat.pts.toFixed(2)} for ${teamName(rosters, userById, goat.rid)}. Oof.`,
      `${teamName(rosters, userById, goat.rid)} took a hit from ${formatPlayer(playersMap.get(goat.pid))} (${goat.pts.toFixed(2)}). That one stung.`,
    ] : [];

    const coachingTemplates = [
      `Coaching corner: ${teamName(rosters, userById, biggest.rid)} left ${biggest.rep.left.toFixed(2)} points on the bench. ${biggest.rep.topBench ? `${formatPlayer(playersMap.get(biggest.rep.topBench.pid))} scored ${biggest.rep.topBench.pts.toFixed(2)}… on the bench.` : "The bench had points available."} ${biggest.rep.worstSwap ? `Starting ${formatPlayer(playersMap.get(biggest.rep.worstSwap.starterPid))} over ${formatPlayer(playersMap.get(biggest.rep.worstSwap.benchPid))} left ${biggest.rep.worstSwap.gain.toFixed(2)} points out there.` : "There were better options, but they stayed unused."}`,
      `Lineup crimes: ${teamName(rosters, userById, biggest.rid)} left ${biggest.rep.left.toFixed(2)} points behind. ${biggest.rep.worstSwap ? `Swap ${formatPlayer(playersMap.get(biggest.rep.worstSwap.benchPid))} for ${formatPlayer(playersMap.get(biggest.rep.worstSwap.starterPid))} and you get ${biggest.rep.worstSwap.gain.toFixed(2)} back.` : "The bench was pleading for help."}`,
      `Start/sit review: ${teamName(rosters, userById, biggest.rid)} burned ${biggest.rep.left.toFixed(2)} points. ${biggest.rep.topBench ? `${formatPlayer(playersMap.get(biggest.rep.topBench.pid))} taunted from the bench with ${biggest.rep.topBench.pts.toFixed(2)}.` : "The bench had options."}`,
      `If there’s a coaching certificate in this league, ${teamName(rosters, userById, biggest.rid)} left it in the glovebox: ${biggest.rep.left.toFixed(2)} bench points.`,
    ];

    const vibeTemplates = [
      `${aName} felt like a team with a plan. ${bName} felt like a team with a group chat.`,
      `The vibes were immaculate for one side and cursed for the other.`,
      `Somebody showed up with a game plan; somebody else showed up with vibes and a prayer.`,
      `Momentum swung, coaches panicked, and somehow the scoreboard kept climbing.`,
      `One side looked polished. The other side looked like they started a rebuild at kickoff.`,
    ];

    const closerTemplates = isGotw
      ? [
          `Game of the Week earned: the combined score (${combined.toFixed(2)}) was the best track meet of the slate.`,
          `This got the headline slot because the scoreboard never stopped moving.`,
          `If you only watched one matchup this week, this was the one worth the screen time.`,
        ]
      : [
          `On to next week — ideally with fewer coaching notes.`,
          `Bank it and move on.`,
          `Set the lineup early and live in peace.`,
          `Delete the tape and pretend it was bye week.`,
        ];

    const hook = seededPick(hookTemplates, rng);
    const result = seededPick(resultTemplates, rng);
    const starLine = seededPick(starTemplates, rng);
    const goatLine = goatTemplates.length ? seededPick(goatTemplates, rng) : null;
    const coachLine = biggest.rep.left > 0.5 ? seededPick(coachingTemplates, rng) : null;
    const vibeLine = seededPick(vibeTemplates, rng);
    const closer = seededPick(closerTemplates, rng);

    const extraLines = seededPick(
      [
        [`${winnerName} will take the win; everyone else will take a long look at their lineup decisions.`],
        [`Somewhere in the standings, this one will sting for weeks.`],
        [`This was the kind of game that makes the trade block start buzzing.`],
      ],
      rng
    );

    const structures: Array<Array<string | null>> = [
      [hook, result, starLine, goatLine, coachLine, vibeLine, ...extraLines, closer],
      [hook, result, vibeLine, starLine, coachLine, ...extraLines, closer],
      [result, hook, starLine, vibeLine, coachLine, ...extraLines, closer],
      [hook, starLine, result, coachLine, vibeLine, ...extraLines, closer],
      [hook, result, coachLine, vibeLine, starLine, ...extraLines, closer],
    ];

    const paragraphs = seededPick(structures, rng).filter(Boolean) as string[];

    return {
      matchupId: g.a.matchup_id,
      isGotw,
      title,
      subtitle: isGotw ? "Game of the Week" : seededPick(["Weekly Recap", "Matchup Recap", "Scoreboard", "Film Room", "Tape Review"], rng),
      caption: `Final: ${aName} ${g.a.points.toFixed(2)} — ${bName} ${g.b.points.toFixed(2)}`,
      paragraphs,
    };
  });

  articles.sort((a, b) => (b.isGotw ? 1 : 0) - (a.isGotw ? 1 : 0));

  return (
    <main className="space-y-6">
      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">Weekly Recap</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Week {week} • {season} {label ? <span className="text-slate-600">— {label}</span> : null}
        </h1>

        <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
          <Link className="link-lion" href={`/power-rankings/${week}`}>
            View Week {week} Power Rankings
          </Link>
          <span className="text-slate-300">•</span>
          <Link className="link-lion" href="/weeks">All weeks</Link>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-700">
          {bestAdd ? (
            <div>
              🛒 <b>Best add:</b> {teamName(rosters, userById, bestAdd.toRoster)} added {formatPlayer(playersMap.get(bestAdd.pid))} (value ~{bestAdd.value.toFixed(0)})
            </div>
          ) : null}
          {worstDrop ? (
            <div>
              🗑️ <b>Worst drop:</b> {teamName(rosters, userById, worstDrop.fromRoster)} dropped {formatPlayer(playersMap.get(worstDrop.pid))} (value ~{worstDrop.value.toFixed(0)})
            </div>
          ) : null}
          {tradeSwing?.g ? (
            <div>
              🤝 <b>Trade spotlight:</b> {swingLine || "Trade details unavailable."}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6">
        {articles.map((a) => (
          <CbsArticle
            key={a.matchupId}
            title={a.title}
            subtitle={a.subtitle}
            caption={a.caption}
            paragraphs={a.paragraphs}
          />
        ))}
      </div>
    </main>
  );
}



