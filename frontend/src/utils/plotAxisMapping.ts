/** Plotly plot-area ↔ session time (seconds) mapping for HR graph overlays. */

export interface PlotAxisMapping {
  xMin: number;
  xMax: number;
  plotLeft: number;
  plotWidth: number;
  plotTop: number;
  plotHeight: number;
  timeAxisSeconds: boolean;
}

export function secToPlotX(sec: number, timeAxisSeconds: boolean): number {
  return timeAxisSeconds ? sec : sec / 60;
}

export function plotXToSec(x: number, timeAxisSeconds: boolean): number {
  return timeAxisSeconds ? Math.round(x) : Math.round(x * 60);
}

/** Read axis mapping from a Plotly graph div after layout. */
export function getPlotAxisMapping(
  graphDiv: HTMLElement,
  timeAxisSeconds: boolean,
): PlotAxisMapping | null {
  const layout = (graphDiv as PlotlyGraphDiv)._fullLayout;
  const xa = layout?.xaxis;
  const ya = layout?.yaxis;
  if (!xa || xa._length == null || xa._offset == null) return null;
  const xMin = xa.range?.[0] ?? xa._rl?.[0] ?? 0;
  const xMax = xa.range?.[1] ?? xa._rl?.[1] ?? 1;
  return {
    xMin: Number(xMin),
    xMax: Number(xMax),
    plotLeft: Number(xa._offset),
    plotWidth: Number(xa._length),
    plotTop: Number(ya?._offset ?? 0),
    plotHeight: Number(ya?._length ?? 0),
    timeAxisSeconds,
  };
}

interface PlotlyGraphDiv extends HTMLElement {
  _fullLayout?: {
    xaxis?: {
      range?: [number, number];
      _rl?: [number, number];
      _offset?: number;
      _length?: number;
    };
    yaxis?: {
      _offset?: number;
      _length?: number;
    };
  };
}

export function secToPx(sec: number, mapping: PlotAxisMapping): number {
  const x = secToPlotX(sec, mapping.timeAxisSeconds);
  const span = mapping.xMax - mapping.xMin || 1;
  const ratio = (x - mapping.xMin) / span;
  return mapping.plotLeft + ratio * mapping.plotWidth;
}

export function pxToSec(px: number, mapping: PlotAxisMapping): number {
  const span = mapping.xMax - mapping.xMin || 1;
  const ratio = (px - mapping.plotLeft) / mapping.plotWidth;
  const x = mapping.xMin + ratio * span;
  return plotXToSec(x, mapping.timeAxisSeconds);
}
