import type { PlotParams } from "react-plotly.js";
type ResolvedPlotTheme = "light" | "dark";

type Layout = NonNullable<PlotParams["layout"]>;
type Axis = NonNullable<Layout["xaxis"]>;
type HoverLabel = NonNullable<Layout["hoverlabel"]>;

/** Контрастные подсказки при наведении (пульс, вело-графики, аналитика). */
export function plotHoverLabelTheme(theme: ResolvedPlotTheme): HoverLabel {
  if (theme === "dark") {
    return {
      bgcolor: "#0f172a",
      bordercolor: "#e2e8f0",
      font: { family: "system-ui, sans-serif", size: 13, color: "#f8fafc" },
      align: "left",
      namelength: -1,
    };
  }
  return {
    bgcolor: "#ffffff",
    bordercolor: "#1e293b",
    font: { family: "system-ui, sans-serif", size: 13, color: "#0f172a" },
    align: "left",
    namelength: -1,
  };
}

/** Базовый layout Plotly под светлую / тёмную тему. */
export function plotThemeLayout(theme: ResolvedPlotTheme): Partial<Layout> {
  const hoverlabel = plotHoverLabelTheme(theme);
  if (theme === "dark") {
    return {
      paper_bgcolor: "transparent",
      plot_bgcolor: "#1e293b",
      font: { family: "system-ui, sans-serif", color: "#f1f5f9", size: 12 },
      colorway: ["#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#fb7185"],
      xaxis: axisTheme("#f1f5f9", "#cbd5e1", "#475569", "#64748b"),
      yaxis: axisTheme("#f1f5f9", "#cbd5e1", "#475569", "#64748b"),
      legend: { font: { color: "#f1f5f9", size: 11 } },
      title: { font: { color: "#f8fafc", size: 13 } },
      hoverlabel,
      hovermode: "x unified",
    };
  }

  return {
    paper_bgcolor: "transparent",
    plot_bgcolor: "#f1f5f9",
    font: { family: "system-ui, sans-serif", color: "#0f172a", size: 12 },
    colorway: ["#059669", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#db2777"],
    xaxis: axisTheme("#0f172a", "#334155", "#e2e8f0", "#94a3b8"),
    yaxis: axisTheme("#0f172a", "#334155", "#e2e8f0", "#94a3b8"),
    legend: { font: { color: "#0f172a", size: 11 } },
    title: { font: { color: "#020617", size: 13 } },
    hoverlabel,
    hovermode: "x unified",
  };
}

function axisTheme(
  titleColor: string,
  tickColor: string,
  gridColor: string,
  lineColor: string,
): Axis {
  return {
    gridcolor: gridColor,
    linecolor: lineColor,
    tickfont: { color: tickColor, size: 11 },
    title: { font: { color: titleColor, size: 12 } },
    zerolinecolor: gridColor,
  };
}

function mergeAxis(base?: Axis, user?: Partial<Axis>): Axis | undefined {
  if (!user) return base;
  const b = base ?? {};
  const title =
    user.title === undefined
      ? b.title
      : typeof user.title === "string"
        ? { ...(typeof b.title === "object" ? b.title : {}), text: user.title }
        : {
            ...(typeof b.title === "object" ? b.title : {}),
            ...user.title,
            font: {
              ...(typeof b.title === "object" && b.title && "font" in b.title
                ? (b.title.font as object)
                : {}),
              ...(user.title && typeof user.title === "object" && user.title.font
                ? user.title.font
                : {}),
            },
          };

  return {
    ...b,
    ...user,
    title,
    tickfont: { ...b.tickfont, ...user.tickfont },
  };
}

/** Слияние layout: пользовательский поверх темы (оси дополняются). */
export function mergePlotLayout(
  theme: ResolvedPlotTheme,
  userLayout?: Partial<Layout>,
  compact?: boolean,
): Partial<Layout> {
  const base = plotThemeLayout(theme);
  const margin = compact
    ? { l: 40, r: 16, t: 28, b: 36 }
    : { l: 52, r: 24, t: 40, b: 52 };

  const merged: Partial<Layout> = {
    autosize: true,
    margin,
    ...base,
    ...userLayout,
    font: { ...base.font, ...userLayout?.font },
    hoverlabel: {
      ...base.hoverlabel,
      ...userLayout?.hoverlabel,
      font: {
        ...(base.hoverlabel as HoverLabel)?.font,
        ...(userLayout?.hoverlabel as HoverLabel | undefined)?.font,
      },
    },
    hovermode: userLayout?.hovermode ?? base.hovermode,
    xaxis: mergeAxis(base.xaxis as Axis, userLayout?.xaxis as Partial<Axis>),
    yaxis: mergeAxis(base.yaxis as Axis, userLayout?.yaxis as Partial<Axis>),
    legend: { ...base.legend, ...userLayout?.legend },
    title:
      userLayout?.title != null
        ? typeof userLayout.title === "string"
          ? { ...(base.title as object), text: userLayout.title }
          : {
              ...(base.title as object),
              ...(userLayout.title as object),
              font: {
                ...(base.title as { font?: object })?.font,
                ...(userLayout.title as { font?: object })?.font,
              },
            }
        : base.title,
  };

  if (userLayout?.yaxis2) {
    merged.yaxis2 = mergeAxis(base.yaxis as Axis, userLayout.yaxis2 as Partial<Axis>);
    if (merged.yaxis2) {
      merged.yaxis2.overlaying = userLayout.yaxis2.overlaying ?? "y";
      merged.yaxis2.side = userLayout.yaxis2.side ?? "right";
    }
  }

  return merged;
}
