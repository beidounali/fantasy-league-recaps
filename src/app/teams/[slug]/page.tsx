import { notFound } from "next/navigation";
import { leagueId, sleeperGet } from "@/lib/sleeper";
import { getSleeperPlayersMap, formatPlayer } from "@/lib/players";
import { buildFantasyCalcIndex, computeTradeGradeForRoster, loadTradesCurrentAndPrevious, valueOfPick } from "@/lib/trades";

type Roster = {
  roster_id: number;
  owner_id: string;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
  };
};

type User = { user_id: string; display_name: string; metadata?: { team_name?: string } };

function parseRosterIdFromSlug(slug: string) {
  const m = slug.match(/-r(\d+)$/);
  return m ? Number(m[1]) : null;
}

function pickLabel(p: { season: string; round: number }) {
  return `${p.season} R${p.round}`;
}

export default async function TeamPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const rosterId = parseRosterIdFromSlug(slug);
  if (!rosterId) return notFound();

  const id = leagueId();

  const [rosters, users] = await Promise.all([
    sleeperGet<Roster[]>(`/league/${id}/rosters`),
    sleeperGet<User[]>(`/league/${id}/users`),
  ]);

  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return notFound();

  const userById = new Map(users.map((u) => [u.user_id, u]));
  const owner = userById.get(roster.owner_id);
  const name = owner?.metadata?.team_name || owner?.display_name || `Roster ${rosterId}`;

  const pf = roster.settings.fpts + roster.settings.fpts_decimal / 100;
  const pa = roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100;

  const [playersMap, fc, allTrades] = await Promise.all([
    getSleeperPlayersMap(),
    buildFantasyCalcIndex(),
    loadTradesCurrentAndPrevious({ startRound: 1, maxRound: 50, stopAfterEmptyRounds: 6 }),
  ]);

  const currentSeason = String(fc.league?.season ?? "2025");
  const valueOfPlayer = (playerId: string) => fc.bySleeperId.get(String(playerId))?.value ?? 0;

  const teamTrades = allTrades.filter((t) => t.roster_ids?.includes(rosterId));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">{name}</h1>

      <div className="mt-4 rounded-lg border p-4">
        <div>
          <span className="font-semibold">Record:</span>{" "}
          {roster.settings.wins}-{roster.settings.losses}
          {roster.settings.ties ? `-${roster.settings.ties}` : ""}
        </div>
        <div className="mt-1 text-slate-600">PF: {pf.toFixed(2)} • PA: {pa.toFixed(2)}</div>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Trades + Grades (FantasyCalc + Pick Model)</h2>

      {teamTrades.length === 0 ? (
        <p className="mt-2 text-slate-600">No completed trades found (2025 + 2026/offseason).</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {teamTrades.map((t: any, idx: number) => {
            const g = computeTradeGradeForRoster({
              trade: t,
              rosterId,
              valueOfPlayer,
              currentSeason,
            });

            return (
              <div key={`${t.created}-${idx}`} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-lg font-semibold">Grade: {g.grade}</div>
                  <div className="text-sm text-slate-600">
                    {t.__leagueLabel} • {new Date(t.created).toLocaleDateString()}
                  </div>
                </div>

                <div className="mt-2 text-sm text-slate-700">
                  <span className="font-semibold">Value received:</span> {g.receivedValue.toFixed(0)} •{" "}
                  <span className="font-semibold">Value sent:</span> {g.sentValue.toFixed(0)}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="font-semibold">Got</div>
                    <ul className="list-inside list-disc text-sm text-slate-700">
                      {g.playersReceived.map((pid) => (
                        <li key={`got-${pid}`}>
                          {formatPlayer(playersMap.get(pid))} — {valueOfPlayer(pid).toFixed(0)}
                        </li>
                      ))}
                      {g.picksReceived.map((p, i) => (
                        <li key={`got-p-${i}`}>
                          Pick {pickLabel(p)} — {valueOfPick(p, currentSeason).toFixed(0)}
                        </li>
                      ))}
                      {g.playersReceived.length === 0 && g.picksReceived.length === 0 && <li>(none)</li>}
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold">Gave</div>
                    <ul className="list-inside list-disc text-sm text-slate-700">
                      {g.playersSent.map((pid) => (
                        <li key={`sent-${pid}`}>
                          {formatPlayer(playersMap.get(pid))} — {valueOfPlayer(pid).toFixed(0)}
                        </li>
                      ))}
                      {g.picksSent.map((p, i) => (
                        <li key={`sent-p-${i}`}>
                          Pick {pickLabel(p)} — {valueOfPick(p, currentSeason).toFixed(0)}
                        </li>
                      ))}
                      {g.playersSent.length === 0 && g.picksSent.length === 0 && <li>(none)</li>}
                    </ul>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Pick values use a configurable model (mid-pick baseline + future discount). We can tune it to your league.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
