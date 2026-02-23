import { sleeperGet } from "./sleeper";

export type SleeperTransaction = {
  type: string; // trade, waiver, free_agent, commissioner, etc.
  status: string; // complete
  roster_ids?: number[];
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: Array<{
    season: string;
    round: number;
    roster_id: number;
    owner_id: number;
    previous_owner_id: number;
  }>;
  created: number;
};

export async function loadTransactionsForRound(leagueId: string, round: number) {
  return sleeperGet<SleeperTransaction[]>(`/league/${leagueId}/transactions/${round}`);
}
