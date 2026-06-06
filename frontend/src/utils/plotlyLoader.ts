import type { ComponentType } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import type { PlotParams } from "react-plotly.js";

export type PlotlyReactComponent = ComponentType<PlotParams>;

let plotComponent: PlotlyReactComponent | null = null;
let loadPromise: Promise<PlotlyReactComponent> | null = null;

/** Один раз подгружает plotly.js-dist-min и создаёт react-plotly компонент. */
export function loadPlotlyComponent(): Promise<PlotlyReactComponent> {
  if (plotComponent) {
    return Promise.resolve(plotComponent);
  }
  if (!loadPromise) {
    loadPromise = import("plotly.js-dist-min").then((mod) => {
      const Plotly = mod.default ?? mod;
      plotComponent = createPlotlyComponent(Plotly);
      return plotComponent;
    });
  }
  return loadPromise;
}

export function getPlotlyComponent(): PlotlyReactComponent | null {
  return plotComponent;
}
