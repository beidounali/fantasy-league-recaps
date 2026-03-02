export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { leagueId, sleeperGet } from "@/lib/sleeper";

type SleeperLeague = {
  name: string;
  season: string;
  total_rosters: number;
  settings: Record<string, any>;
};

export default async function Home() {
  const id = leagueId();
  const league = await sleeperGet<SleeperLeague>(`/league/${id}`);

  const playoffStart = Number(league.settings?.playoff_week_start ?? 15);
  const playoffRounds = Number(league.settings?.playoff_rounds ?? 3);
  const regularSeasonWeeks = playoffStart - 1;
  const totalWeeks = regularSeasonWeeks + playoffRounds;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">Dynasty Hub</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">{league.name}</h1>
        <p className="mt-3 text-slate-600">
          Season: <span className="font-semibold text-slate-900">{league.season}</span> • Teams:{" "}
          <span className="font-semibold text-slate-900">{league.total_rosters}</span>
        </p>
        <p className="mt-2 text-slate-600">
          Weeks covered: <span className="font-semibold text-slate-900">{totalWeeks}</span> (regular{" "}
          {regularSeasonWeeks} + playoffs {playoffRounds})
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/weeks">
            Weekly Recaps
          </Link>
          <Link className="btn-ghost" href="/teams">
            Teams
          </Link>
        </div>
      </div>

      <div className="panel">
        <h2 className="text-2xl font-semibold text-slate-900">Quick Links</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn-ghost" href="/power-rankings">
            Power Rankings
          </Link>
          <Link className="btn-ghost" href="/weeks">
            Weekly Recaps
          </Link>
          <Link className="btn-ghost" href="/teams">
            Team Pages
          </Link>
        </div>
      </div>

      <p className="text-sm text-slate-500">League ID: {id}</p>
    </main>
  );
}
