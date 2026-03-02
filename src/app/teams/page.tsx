export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { leagueId, sleeperGet } from "@/lib/sleeper";
import { buildFantasyCalcIndex, computeTradeGradeForRoster, loadTradesCurrentAndPrevious } from "@/lib/trades";

type Roster = { roster_id: number; owner_id: string; settings: { wins: number; losses: number; ties: number } };
type User = { user_id: string; display_name: string; metadata?: { team_name?: string } };

type TradeTotals = {
  rosterId: number;
  received: number;
  sent: number;
  delta: number;
};

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
  const [rosters, users, fc, trades] = await Promise.all([
    sleeperGet<Roster[]>(`/league/${id}/rosters`),
    sleeperGet<User[]>(`/league/${id}/users`),
    buildFantasyCalcIndex(),
    loadTradesCurrentAndPrevious({ startRound: 1, maxRound: 50, stopAfterEmptyRounds: 6 }),
  ]);

  const userById = new Map(users.map((u) => [u.user_id, u]));

  const teams = rosters.map((r) => {
    const u = userById.get(r.owner_id);
    const name = u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`;
    const base = slugify(name);
    const slug = `${base}-r${r.roster_id}`;
    return { roster: r, name, slug };
  });

  const currentSeason = String(fc.league?.season ?? "2025");
  const valueOfPlayer = (pid: string) => fc.bySleeperId.get(String(pid))?.value ?? 0;
  const pickValueByKey = fc.pickValueByKey;

  const totalsByRoster = new Map<number, TradeTotals>();
  for (const r of rosters) {
    totalsByRoster.set(r.roster_id, { rosterId: r.roster_id, received: 0, sent: 0, delta: 0 });
  }

  const completedTrades = trades.filter((t) => t.type === "trade" && t.status === "complete");
  for (const t of completedTrades) {
    for (const rid of t.roster_ids ?? []) {
      const g = computeTradeGradeForRoster({ trade: t, rosterId: rid, valueOfPlayer, currentSeason, pickValueByKey });
      const bucket = totalsByRoster.get(rid);
      if (!bucket) continue;
      bucket.received += g.receivedValue;
      bucket.sent += g.sentValue;
      bucket.delta = bucket.received - bucket.sent;
    }
  }

  const tradeTable = [...totalsByRoster.values()]
    .map((row) => {
      const team = teams.find((t) => t.roster.roster_id === row.rosterId);
      return {
        ...row,
        name: team?.name ?? `Roster ${row.rosterId}`,
      };
    })
    .sort((a, b) => b.delta - a.delta);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">Trade Value Ledger</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Teams</h1>
        <p className="mt-2 text-slate-600">Aggregate value gained vs sent across all completed trades.</p>
      </div>

      <div className="panel p-0">
        <div className="grid grid-cols-12 gap-0 rounded-t-2xl bg-slate-100/80 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-600">
          <div className="col-span-5">Team</div>
          <div className="col-span-2 text-right">Received</div>
          <div className="col-span-2 text-right">Sent</div>
          <div className="col-span-3 text-right">Delta</div>
        </div>

        {tradeTable.map((row, idx) => (
          <div key={row.rosterId} className={`grid grid-cols-12 gap-0 px-4 py-4 ${idx === 0 ? "" : "border-t border-slate-200/70"}`}>
            <div className="col-span-5 font-semibold text-slate-900">{row.name}</div>
            <div className="col-span-2 text-right text-sm text-slate-700">{row.received.toFixed(0)}</div>
            <div className="col-span-2 text-right text-sm text-slate-700">{row.sent.toFixed(0)}</div>
            <div className={`col-span-3 text-right text-sm font-bold ${row.delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {row.delta >= 0 ? "+" : ""}{row.delta.toFixed(0)}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">League Directory</div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Team Pages</h2>

        <ul className="mt-4 space-y-3">
          {teams.map((t) => (
            <li key={t.roster.roster_id} className="list-card">
              <Link className="link-lion" href={`/teams/${t.slug}`}>
                {t.name}
              </Link>
              <span className="text-sm text-slate-500">
                {t.roster.settings.wins}-{t.roster.settings.losses}
                {t.roster.settings.ties ? `-${t.roster.settings.ties}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
