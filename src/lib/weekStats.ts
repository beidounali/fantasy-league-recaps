/**
 * Fetch weekly fantasy points by Sleeper player_id.
 * We try api.sleeper.com first (commonly used for stats/projections), then fall back.
 */
export async function getWeekPointsPpr(season: string, week: number, seasonType: "regular" | "post" = "regular") {
  const urls = [
    `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=${seasonType}`,
    `https://api.sleeper.app/stats/nfl/${season}/${week}?season_type=${seasonType}`,
  ];

  let lastErr: any = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Stats HTTP ${res.status}`);
      const data: any = await res.json();

      // Normalize into Map<playerId, points>
      const map = new Map<string, number>();

      // Case A: object keyed by playerId => stats object
      if (data && typeof data === "object" && !Array.isArray(data)) {
        for (const [pid, stats] of Object.entries<any>(data)) {
          const pts =
            Number(stats?.pts_ppr ?? stats?.pts_half_ppr ?? stats?.pts_std ?? stats?.pts ?? stats?.fantasy_points);
          if (Number.isFinite(pts)) map.set(String(pid), pts);
        }
        return map;
      }

      // Case B: array of rows containing player_id and pts fields
      if (Array.isArray(data)) {
        for (const row of data) {
          const pid = String(row?.player_id ?? row?.player?.player_id ?? row?.player?.sleeperId ?? "");
          if (!pid) continue;
          const stats = row?.stats ?? row;
          const pts =
            Number(stats?.pts_ppr ?? stats?.pts_half_ppr ?? stats?.pts_std ?? stats?.pts ?? stats?.fantasy_points);
          if (Number.isFinite(pts)) map.set(pid, pts);
        }
        return map;
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw new Error(`Could not load weekly stats. Last error: ${String(lastErr)}`);
}
