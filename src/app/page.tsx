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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">{league.name}</h1>
      <p className="mt-2 text-slate-600">
        Season: <span className="font-semibold">{league.season}</span> • Teams:{" "}
        <span className="font-semibold">{league.total_rosters}</span>
      </p>
      <p className="mt-2 text-slate-600">
        Weeks covered: <span className="font-semibold">{totalWeeks}</span> (regular{" "}
        {regularSeasonWeeks} + playoffs {playoffRounds})
      </p>

      <div className="mt-6 flex gap-4">
        <Link className="rounded-md bg-black px-4 py-2 text-white" href="/weeks">
          Weekly Recaps
        </Link>
        <Link className="rounded-md border px-4 py-2" href="/teams">
          Teams
        </Link>
      </div>

      <p className="mt-8 text-sm text-slate-500">League ID: {id}</p>
    </main>
  );
}

