import { leagueId, sleeperGet } from "./sleeper";

type SleeperLeague = {
  league_id: string;
  season: string;
  previous_league_id?: string | null;
  settings: Record<string, any>;
};

export async function getCurrentLeague() {
  const id = leagueId();
  return sleeperGet<SleeperLeague>(`/league/${id}`);
}

export async function getPreviousLeague() {
  const cur = await getCurrentLeague();
  if (!cur.previous_league_id) return null;
  return sleeperGet<SleeperLeague>(`/league/${cur.previous_league_id}`);
}

/** Default: use previous league (2025 season) if available */
export async function getRecapLeague() {
  const prev = await getPreviousLeague();
  return prev ?? (await getCurrentLeague());
}
