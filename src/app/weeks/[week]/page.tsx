import Link from "next/link";
import { CbsArticle } from "@/components/CbsArticle";
import { getRecapLeague } from "@/lib/leagueSelect";
import { sleeperGet } from "@/lib/sleeper";
import { getSleeperPlayersMap, formatPlayer } from "@/lib/players";
import { buildFantasyCalcIndex, computeTradeGradeForRoster } from "@/lib/trades";
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

function seedFor(week: number, matchupId: number) {
  return (week * 1000003 + matchupId * 9176) >>> 0;
}
function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length];
}

function headlineForGame(opts: { seed: number; margin: number; combined: number; benchLeft: number; isGotw: boolean }) {
  const { seed, margin, combined, benchLeft, isGotw } = opts;

  if (isGotw) {
    return pick(["Prime Time Chaos", "Main Event", "Heavyweight Bout", "Sunday Night Energy", "The Marquee Matchup"], seed);
  }
  if (benchLeft >= 25) return pick(["Roster Malpractice", "Bench Crime Scene", "Start/Sit Felony", "Coaching Catastrophe"], seed);
  if (margin <= 3) return pick(["Heartbreak Hotel", "One-Score Heartbreaker", "Came Down to the Wire", "Pain, but Close"], seed);
  if (margin >= 40) return pick(["Public Service Announcement", "Statement Win", "No Contest", "Certified Blowout"], seed);
  if (combined >= 320) return pick(["Track Meet", "Points Explosion", "Offensive Fireworks", "Scoreboard Sprints"], seed);

  return pick(["Game Recap", "Weekly Recap", "League Action", "Another Chapter"], seed);
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
  const ptsOfPlayer = (pid: string) => weekPts.get(String(pid)) ?? 0;
  const posOfPlayer = (pid: string) => playersMap.get(String(pid))?.position;

  // Group into games
  const byMatchup = new Map<number, MatchupRow[]>();
  for (const row of matchups) {
    const arr = byMatchup.get(row.matchup_id) ?? [];
    arr.push(row);
    byMatchup.set(row.matchup_id, arr);
  }
  const games = [...byMatchup.values()].filter((rows) => rows.length >= 2).map((rows) => ({ a: rows[0], b: rows[1] }));

  // Game of the Week = highest combined score
  const gotw = [...games].sort((x, y) => (y.a.points + y.b.points) - (x.a.points + x.b.points))[0];

  // Header quick hits
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
        const g = computeTradeGradeForRoster({ trade: t, rosterId: rid, valueOfPlayer, currentSeason: season });
        return { rosterId: rid, g, swing: Math.abs(g.deltaPct) };
      })
    );
    graded.sort((a, b) => b.swing - a.swing);
    return graded[0];
  })();

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
    const seed = seedFor(week, g.a.matchup_id);

    const aName = teamName(rosters, userById, g.a.roster_id);
    const bName = teamName(rosters, userById, g.b.roster_id);

    const aRec = records.recordStr(g.a.roster_id);
    const bRec = records.recordStr(g.b.roster_id);

    const margin = Math.abs(g.a.points - g.b.points);
    const combined = g.a.points + g.b.points;

    const repA = sideReport(g.a);
    const repB = sideReport(g.b);
    const biggest = repA.left >= repB.left ? { rid: g.a.roster_id, rep: repA } : { rid: g.b.roster_id, rep: repB };

    const title = headlineForGame({ seed, margin, combined, benchLeft: biggest.rep.left, isGotw });

    const winnerName =
      g.a.points === g.b.points ? "Tie" : g.a.points > g.b.points ? aName : bName;

    // Star/goat from starters in this game
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
      `${aName} (${aRec}) and ${bName} (${bRec}) showed up with two different plans: one to win, and one to “take notes.”`,
      `${aName} (${aRec}) vs ${bName} (${bRec}) had the kind of tension that turns the matchup page into a refresh button.`,
      `This one had everything: points, panic, and at least one “why is he still in my lineup?” moment.`,
      `${aName} (${aRec}) and ${bName} (${bRec}) delivered a matchup that will be quoted in future trade talks.`,
    ];

    const resultTemplates = [
      `${winnerName} takes it ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. Margin: ${margin.toFixed(2)}. ${margin <= 3 ? "A coin flip with consequences." : margin >= 40 ? "A statement win." : "A controlled result."}`,
      `Final: ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. ${winnerName} gets the W, and the ${margin.toFixed(2)}-point margin tells you how much drama to assign.`,
      `${winnerName} wins ${g.a.points.toFixed(2)}–${g.b.points.toFixed(2)}. ${margin <= 3 ? "One bench decision flips this." : margin >= 40 ? "Never really in doubt." : "Solid work."}`,
    ];

    const starTemplates = star ? [
      `Star of the day: ${teamName(rosters, userById, star.rid)} got a premium performance from ${formatPlayer(playersMap.get(star.pid))} (${star.pts.toFixed(2)}).`,
      `${formatPlayer(playersMap.get(star.pid))} was the headline act (${star.pts.toFixed(2)}), and ${teamName(rosters, userById, star.rid)} cashed the ticket.`,
      `If you’re looking for the edge: ${formatPlayer(playersMap.get(star.pid))} dropped ${star.pts.toFixed(2)} for ${teamName(rosters, userById, star.rid)}.`,
    ] : [`No single superstar takeover — this one was won by committee.`];

    const goatTemplates = goat ? [
      `On the flip side, ${teamName(rosters, userById, goat.rid)} got ${goat.pts.toFixed(2)} from ${formatPlayer(playersMap.get(goat.pid))}. That’s a tough pill.`,
      `Rough line: ${formatPlayer(playersMap.get(goat.pid))} posted ${goat.pts.toFixed(2)} for ${teamName(rosters, userById, goat.rid)}.`,
      `${teamName(rosters, userById, goat.rid)} took a hit from ${formatPlayer(playersMap.get(goat.pid))} (${goat.pts.toFixed(2)}).`,
    ] : [];

    let coachingParagraph = `Coaching corner: no felony lineup calls detected. Minor misdemeanors may still be pending review.`;
    if (biggest.rep.left > 0.5) {
      const who = teamName(rosters, userById, biggest.rid);
      const benchLine = biggest.rep.topBench
        ? `${formatPlayer(playersMap.get(biggest.rep.topBench.pid))} scored ${biggest.rep.topBench.pts.toFixed(2)}… on the bench.`
        : `The bench had points available.`;

      const swapLine = biggest.rep.worstSwap
        ? `Starting ${formatPlayer(playersMap.get(biggest.rep.worstSwap.starterPid))} over ${formatPlayer(playersMap.get(biggest.rep.worstSwap.benchPid))} left ${biggest.rep.worstSwap.gain.toFixed(2)} points out there.`
        : `There were better options, but they stayed unused.`;

      coachingParagraph = pick(
        [
          `Coaching corner: ${who} left ${biggest.rep.left.toFixed(2)} points on the bench. ${benchLine} ${swapLine}`,
          `Lineup notes: ${who} had ${biggest.rep.left.toFixed(2)} points sitting. ${swapLine} ${benchLine}`,
          `Start/sit review: ${who} left ${biggest.rep.left.toFixed(2)} behind. ${benchLine} ${swapLine}`,
        ],
        seed + 9
      );
    }

    const closer = isGotw
      ? pick(
          [
            `Game of the Week earned: the combined score (${combined.toFixed(2)}) was the best track meet of the slate.`,
            `This gets the headline slot because the scoreboard never stopped moving.`,
            `If you only watched one matchup this week, this was the one worth the screen time.`,
          ],
          seed + 11
        )
      : pick(
          [
            `On to next week — ideally with fewer coaching notes.`,
            `Bank it and move on.`,
            `Set the lineup early and live in peace.`,
          ],
          seed + 12
        );

    const paragraphs = [
      pick(hookTemplates, seed),
      pick(resultTemplates, seed + 1),
      pick(starTemplates, seed + 2),
      ...(goatTemplates.length ? [pick(goatTemplates, seed + 3)] : []),
      coachingParagraph,
      closer,
    ];

    return {
      matchupId: g.a.matchup_id,
      isGotw,
      title,
      subtitle: isGotw ? "Game of the Week" : "Weekly Recap",
      caption: `Final: ${aName} ${g.a.points.toFixed(2)} — ${bName} ${g.b.points.toFixed(2)}`,
      paragraphs,
    };
  });

  articles.sort((a, b) => (b.isGotw ? 1 : 0) - (a.isGotw ? 1 : 0));

  return (
    <main className="space-y-6">
      {/* WHITE HEADER CARD */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-extrabold uppercase tracking-wide text-[#0076B6]">Weekly Recap</div>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
          Week {week} • {season} {label ? <span className="text-slate-600">— {label}</span> : null}
        </h1>

        <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-700">
          <Link className="underline" href={`/power-rankings/${week}`}>View Week {week} Power Rankings</Link>
          <span className="text-slate-400">•</span>
          <Link className="underline" href="/weeks">All weeks</Link>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-800">
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
              🤝 <b>Biggest trade swing:</b> {teamName(rosters, userById, tradeSwing.rosterId)} got a {tradeSwing.g.grade} (swing {(tradeSwing.g.deltaPct * 100).toFixed(1)}%)
            </div>
          ) : null}
        </div>
      </div>

      {/* ARTICLES */}
      <div className="grid gap-6">
        {articles.map((a) => (
          <CbsArticle
            key={a.matchupId}
            title={a.title}
            subtitle={a.subtitle}
            imageUrl="/nfl-hero.jpg"
            caption={a.caption}
            paragraphs={a.paragraphs}
          />
        ))}
      </div>
    </main>
  );
}

