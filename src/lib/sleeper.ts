const BASE = "https://api.sleeper.app/v1";

export function leagueId() {
  const id = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!id) throw new Error("Missing NEXT_PUBLIC_LEAGUE_ID in .env.local");
  return id;
}

export async function sleeperGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sleeper ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
