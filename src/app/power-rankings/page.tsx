import Link from "next/link";
import { getRecapLeague } from "@/lib/leagueSelect";

export default async function PowerRankingsIndex() {
  const league = await getRecapLeague();
  const playoffStart = Number(league.settings?.playoff_week_start ?? 15);
  const playoffRounds = Number(league.settings?.playoff_rounds ?? 3);
  const totalWeeks = (playoffStart - 1) + playoffRounds;

  return (
    <main className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-extrabold uppercase tracking-wide text-[#0076B6]">Power Rankings</div>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
          {league.season} Weekly Rankings
        </h1>
        <p className="mt-2 text-slate-700">
          Strength is based on <b>3 QB + 4 RB + 6 WR + 2 TE</b> using current FantasyCalc player values (no picks),
          plus a small momentum bump from that week’s score.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="font-semibold text-slate-900">Pick a week</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
            <Link
              key={w}
              href={`/power-rankings/${w}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Week {w}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
