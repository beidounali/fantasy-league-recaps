export type FCValueRow = {
  player: {
    sleeperId?: string;
    name: string;
    position?: string;
    maybeTeam?: string;
  };
  value: number;
};

function pprToNumber(ppr: "standard" | "half" | "ppr"): string {
  if (ppr === "ppr") return "1";
  if (ppr === "half") return "0.5";
  return "0";
}

export async function fetchFantasyCalcValues(params: {
  numTeams: number;
  ppr: "standard" | "half" | "ppr";
  numQbs: 1 | 2;
  isDynasty: boolean;
}) {
  const qs = new URLSearchParams({
    isDynasty: String(params.isDynasty),
    numQbs: String(params.numQbs),
    numTeams: String(params.numTeams),
    ppr: pprToNumber(params.ppr),
  });

  const url = `https://api.fantasycalc.com/values/current?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FantasyCalc values failed: ${res.status}`);

  return (await res.json()) as FCValueRow[];
}
