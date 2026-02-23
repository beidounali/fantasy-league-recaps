import Link from "next/link";
import { computePowerRankingsWithMovement } from "@/lib/powerRankings";

function moveText(move: number, lw: number) {
  if (move === 0) return `— (${lw})`;
  if (move > 0) return `▲ ${move} (${lw})`;
  return `▼ ${Math.abs(move)} (${lw})`;
}

export default async function PowerRankingsWeekPage(props: { params: Promise<{ week: string }> }) {
  const { week } = await props.params;
  const w = Number(week);

  const data = await computePowerRankingsWithMovement(w);
  const featured = data.rows[0];

  return (
    <main className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-extrabold uppercase tracking-wide text-[#0076B6]">Power Rankings</div>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
          Week {w} • {data.league.season}
        </h1>
        <p className="mt-2 text-slate-700">
          <b>{featured.name}</b> leads the board this week. Strength is based on <b>3 QB + 4 RB + 6 WR + 2 TE</b>{" "}
          (FantasyCalc player values only), with a small weekly scoring momentum bump.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          <Link className="underline" href="/power-rankings">All weeks</Link>
          <span className="mx-2 text-slate-400">•</span>
          <Link className="underline" href="/weeks">Weekly recaps</Link>
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-100 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-slate-600">
          <div className="col-span-1">Rank</div>
          <div className="col-span-4">Team</div>
          <div className="col-span-6">Analysis</div>
          <div className="col-span-1 text-right">Move (LW)</div>
        </div>

        {data.rows.map((r) => (
          <div key={r.rosterId} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-4 py-4">
            <div className="col-span-1 text-lg font-extrabold text-slate-900">{r.rank}</div>

            <div className="col-span-4">
              <div className="font-semibold text-slate-900">{r.name}</div>
              <div className="mt-1 text-xs text-slate-600">
                Strength: <b>{r.strength.toFixed(0)}</b>
                <span className="mx-2 text-slate-300">•</span>
                QB {r.qbSum.toFixed(0)} / RB {r.rbSum.toFixed(0)} / WR {r.wrSum.toFixed(0)} / TE {r.teSum.toFixed(0)}
                <span className="mx-2 text-slate-300">•</span>
                Week pts {r.points.toFixed(2)}
              </div>
            </div>

            <div className="col-span-6 text-sm leading-6 text-slate-800">
              {r.blurb}
            </div>

            <div className="col-span-1 text-right text-sm font-bold text-slate-800">
              {moveText(r.move, r.lw)}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
