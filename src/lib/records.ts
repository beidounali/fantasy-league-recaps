import { sleeperGet } from "./sleeper";

type MatchupRow = { roster_id: number; matchup_id: number; points: number };

export async function computeRecordsEnteringWeek(opts: { leagueId: string; week: number }) {
  const { leagueId, week } = opts;

  // records entering week N = results of weeks 1..N-1
  const wins = new Map<number, number>();
  const losses = new Map<number, number>();
  const ties = new Map<number, number>();

  const addWin = (r: number) => wins.set(r, (wins.get(r) ?? 0) + 1);
  const addLoss = (r: number) => losses.set(r, (losses.get(r) ?? 0) + 1);
  const addTie = (r: number) => ties.set(r, (ties.get(r) ?? 0) + 1);

  for (let w = 1; w <= Math.max(0, week - 1); w++) {
    const rows = await sleeperGet<MatchupRow[]>(`/league/${leagueId}/matchups/${w}`);

    const byMatchup = new Map<number, MatchupRow[]>();
    for (const r of rows) {
      const arr = byMatchup.get(r.matchup_id) ?? [];
      arr.push(r);
      byMatchup.set(r.matchup_id, arr);
    }

    for (const group of byMatchup.values()) {
      if (group.length < 2) continue;
      const [a, b] = group;

      if (a.points === b.points) {
        addTie(a.roster_id);
        addTie(b.roster_id);
      } else if (a.points > b.points) {
        addWin(a.roster_id);
        addLoss(b.roster_id);
      } else {
        addWin(b.roster_id);
        addLoss(a.roster_id);
      }
    }
  }

  const recordStr = (r: number) => {
    const w = wins.get(r) ?? 0;
    const l = losses.get(r) ?? 0;
    const t = ties.get(r) ?? 0;
    return t ? `${w}-${l}-${t}` : `${w}-${l}`;
  };

  return { wins, losses, ties, recordStr };
}
