import type {DailyFacts} from './contracts';

export type CtlAtlTsbPoint = {
  date: string;
  trimp: number;
  ctl: number;
  atl: number;
  tsb: number;
};

export function computeCtlAtlTsb(facts: DailyFacts[]): CtlAtlTsbPoint[] {
  const sorted = [...facts].sort((a, b) => a.date.localeCompare(b.date));
  const out: CtlAtlTsbPoint[] = [];
  let ctl: number | null = null;
  let atl: number | null = null;
  for (const row of sorted) {
    const load = Number.isFinite(row.trimp) ? Math.max(0, row.trimp) : 0;
    if (ctl == null || atl == null) {
      ctl = load;
      atl = load;
    } else {
      ctl = ctl * (41 / 42) + load / 42;
      atl = atl * (6 / 7) + load / 7;
    }
    out.push({
      date: row.date,
      trimp: round1(load),
      ctl: round1(ctl),
      atl: round1(atl),
      tsb: round1(ctl - atl),
    });
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
