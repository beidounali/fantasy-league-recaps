export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getRecapLeague } from "@/lib/leagueSelect";

export default async function PowerRankingsIndex() {
  const league = await getRecapLeague();
  const playoffStart = Number(league.settings?.playoff_week_start ?? 15);
  const playoffRounds = Number(league.settings?.playoff_rounds ?? 3);
  const totalWeeks = (playoffStart - 1) + playoffRounds;

  return (
    <main className="space-y-6">
      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">Power Rankings</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          {league.season} Weekly Rankings
        </h1>
        <p className="mt-3 text-slate-600">
          Strength is based on <b>3 QB + 4 RB + 6 WR + 2 TE</b> using current FantasyCalc player values (no picks),
          plus a small momentum bump from that week’s score.
        </p>
      </div>

      <div className="panel">
        <div className="font-semibold text-slate-900">Pick a week</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
            <Link
              key={w}
              href={`/power-rankings/${w}`}
              className="btn-ghost"
            >
              Week {w}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
