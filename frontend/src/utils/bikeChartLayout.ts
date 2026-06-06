import { formatElapsed } from "./bikeTrack";

const TICK_STEP_SEC = 600;

/** Ось времени: подписи каждые 10 минут. */
export function timeAxisTicks(elapsedSec: number[]) {
  if (!elapsedSec.length) {
    return { tickvals: [] as number[], ticktext: [] as string[] };
  }
  const maxSec = elapsedSec[elapsedSec.length - 1] ?? 0;
  const tickvals: number[] = [];
  const ticktext: string[] = [];
  for (let t = 0; t <= maxSec; t += TICK_STEP_SEC) {
    tickvals.push(t);
    ticktext.push(formatElapsed(t));
  }
  if (tickvals[tickvals.length - 1] !== maxSec) {
    tickvals.push(maxSec);
    ticktext.push(formatElapsed(maxSec));
  }
  return { tickvals, ticktext };
}

export function timeChartXAxis(elapsedSec: number[]) {
  const { tickvals, ticktext } = timeAxisTicks(elapsedSec);
  return {
    title: { text: "Время от старта" },
    tickmode: "array" as const,
    tickvals,
    ticktext,
  };
}

export function timeHoverLabels(elapsedSec: number[]) {
  return elapsedSec.map((s) => formatElapsed(s));
}
