export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getRecapLeague } from "@/lib/leagueSelect";

export default async function WeeksIndex() {
  const league = await getRecapLeague();

  const playoffStart = Number(league.settings?.playoff_week_start ?? 15);
  const playoffRounds = Number(league.settings?.playoff_rounds ?? 3);
  const regularSeasonWeeks = playoffStart - 1;
  const totalWeeks = regularSeasonWeeks + playoffRounds;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">Weekly Schedule</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Weekly Recaps ({league.season})</h1>
        <p className="mt-2 text-slate-600">
          Weeks 1–{totalWeeks} • Playoffs start Week {playoffStart}
        </p>
      </div>

      <div className="panel">
        <ul className="space-y-3">
          {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
            <li key={w} className="list-card">
              <Link className="link-lion" href={`/weeks/${w}`}>
                Week {w} {w >= playoffStart ? "(Playoffs)" : ""}
              </Link>
              <span className="text-sm text-slate-500">Recap</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
