export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { leagueId, sleeperGet } from "@/lib/sleeper";

type Roster = { roster_id: number; owner_id: string; settings: { wins: number; losses: number; ties: number } };
type User = { user_id: string; display_name: string; metadata?: { team_name?: string } };

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function TeamsIndex() {
  const id = leagueId();
  const [rosters, users] = await Promise.all([
    sleeperGet<Roster[]>(`/league/${id}/rosters`),
    sleeperGet<User[]>(`/league/${id}/users`),
  ]);

  const userById = new Map(users.map((u) => [u.user_id, u]));

  const teams = rosters.map((r) => {
    const u = userById.get(r.owner_id);
    const name = u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`;
    const base = slugify(name);
    const slug = `${base}-r${r.roster_id}`;
    return { roster: r, name, slug };
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Teams</h1>

      <ul className="mt-6 space-y-2">
        {teams.map((t) => (
          <li key={t.roster.roster_id} className="flex items-center justify-between rounded-lg border p-3">
            <Link className="underline" href={`/teams/${t.slug}`}>
              {t.name}
            </Link>
            <span className="text-sm text-slate-600">
              {t.roster.settings.wins}-{t.roster.settings.losses}
              {t.roster.settings.ties ? `-${t.roster.settings.ties}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

