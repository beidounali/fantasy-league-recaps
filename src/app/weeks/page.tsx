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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Weekly Recaps ({league.season})</h1>
      <p className="mt-2 text-slate-600">
        Weeks 1–{totalWeeks} • Playoffs start Week {playoffStart}
      </p>

      <ul className="mt-6 space-y-2">
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
          <li key={w}>
            <Link className="underline" href={`/weeks/${w}`}>
              Week {w} {w >= playoffStart ? "(Playoffs)" : ""}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

