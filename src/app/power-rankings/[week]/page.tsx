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
      <div className="panel">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-slate-500">Power Rankings</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Week {w} • {data.league.season}
        </h1>
        <p className="mt-2 text-slate-700">
          <b>{featured.name}</b> leads the board this week. Strength is based on <b>3 QB + 4 RB + 6 WR + 2 TE</b>{" "}
          (FantasyCalc player values only), with a small weekly scoring momentum bump.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          <Link className="link-lion" href="/power-rankings">All weeks</Link>
          <span className="mx-2 text-slate-300">•</span>
          <Link className="link-lion" href="/weeks">Weekly recaps</Link>
        </p>
      </div>

      <div className="panel p-0">
        <div className="grid grid-cols-12 gap-0 rounded-t-2xl bg-slate-100/80 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-600">
          <div className="col-span-1">Rank</div>
          <div className="col-span-4">Team</div>
          <div className="col-span-6">Analysis</div>
          <div className="col-span-1 text-right">Move (LW)</div>
        </div>

        {data.rows.map((r, idx) => (
          <div key={r.rosterId} className={`grid grid-cols-12 gap-0 px-4 py-4 ${idx === 0 ? "" : "border-t border-slate-200/70"}`}>
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

            <div className="col-span-6 text-sm leading-6 text-slate-700">
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
