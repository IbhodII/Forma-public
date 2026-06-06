import type { PlotParams } from "react-plotly.js";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { mergePlotLayout } from "../utils/plotTheme";
import { getPlotlyComponent, loadPlotlyComponent } from "../utils/plotlyLoader";
import { Loader } from "./Loader";

type PlotProps = Omit<PlotParams, "layout"> & {
  layout?: Partial<PlotParams["layout"]>;
  className?: string;
  /** Меньше отступы и панель Plotly только при наведении */
  compact?: boolean;
  /** Крупный график для hero-секций аналитики */
  tall?: boolean;
  onInitialized?: PlotParams["onInitialized"];
  onUpdate?: PlotParams["onUpdate"];
  onClick?: PlotParams["onClick"];
  onRelayout?: PlotParams["onRelayout"];
};

const plotMinHeight = (compact?: boolean, tall?: boolean) =>
  tall ? 360 : compact ? 220 : 280;

/** Plotly wrapper: библиотека грузится только при первом рендере графика. */
export function PlotChart({
  layout,
  className,
  compact,
  tall,
  onInitialized,
  onUpdate,
  onClick,
  onRelayout,
  ...rest
}: PlotProps) {
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(() => getPlotlyComponent() != null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false,
  );

  useEffect(() => {
    if (getPlotlyComponent()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void loadPlotlyComponent().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const mergedLayout = useMemo(
    () => mergePlotLayout(resolvedTheme, layout, compact),
    [resolvedTheme, layout, compact],
  );

  const Plot = getPlotlyComponent();
  const minH = isMobile
    ? tall
      ? 280
      : compact
        ? 190
        : 220
    : plotMinHeight(compact, tall);

  if (!ready || !Plot) {
    return (
      <div
        className={className ?? "w-full"}
        style={{ width: "100%", minHeight: minH }}
        aria-busy="true"
      >
        <Loader label="Загрузка графика…" />
      </div>
    );
  }

  return (
    <div className={className ?? "w-full overflow-hidden"}>
      <Plot
        {...rest}
        onInitialized={onInitialized}
        onUpdate={onUpdate}
        onClick={onClick}
        onRelayout={onRelayout}
        useResizeHandler
        style={{ width: "100%", minHeight: minH }}
        config={{
          responsive: true,
          displayModeBar: compact ? "hover" : true,
          displaylogo: false,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
          locale: "ru",
        }}
        layout={{
          ...mergedLayout,
          font: {
            ...mergedLayout.font,
            size: isMobile ? 10 : compact ? 11 : 12,
          },
        }}
      />
    </div>
  );
}
