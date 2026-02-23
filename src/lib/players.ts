type SleeperPlayer = {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
};

let cached: Map<string, SleeperPlayer> | null = null;

export async function getSleeperPlayersMap(): Promise<Map<string, SleeperPlayer>> {
  if (cached) return cached;

  const res = await fetch("https://api.sleeper.app/v1/players/nfl", {
    // Cache on the Next.js server side; first fetch can take a bit.
    next: { revalidate: 60 * 60 * 24 }, // 24 hours
  });

  if (!res.ok) throw new Error(`Sleeper players failed: ${res.status}`);
  const data = (await res.json()) as Record<string, SleeperPlayer>;

  const map = new Map<string, SleeperPlayer>();
  for (const [id, p] of Object.entries(data)) {
    map.set(id, { player_id: id, ...p });
  }

  cached = map;
  return map;
}

export function formatPlayer(p?: SleeperPlayer) {
  if (!p) return "Unknown player";
  const name =
    p.full_name ||
    [p.first_name, p.last_name].filter(Boolean).join(" ") ||
    p.player_id;

  const suffix = [p.position, p.team].filter(Boolean).join(" • ");
  return suffix ? `${name} (${suffix})` : name;
}
