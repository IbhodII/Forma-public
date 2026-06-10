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
  /** Явный размер (приоритет над compact/tall) */
  size?: PlotChartSize;
  onInitialized?: PlotParams["onInitialized"];
  onUpdate?: PlotParams["onUpdate"];
  onClick?: PlotParams["onClick"];
  onRelayout?: PlotParams["onRelayout"];
};

export type PlotChartSize = "compact" | "default" | "tall" | "cardio";

const PLOT_MIN_HEIGHT: Record<PlotChartSize, { mobile: number; desktop: number }> = {
  compact: { mobile: 190, desktop: 220 },
  default: { mobile: 220, desktop: 280 },
  tall: { mobile: 280, desktop: 360 },
  cardio: { mobile: 300, desktop: 420 },
};

function resolvePlotSize(
  compact?: boolean,
  tall?: boolean,
  size?: PlotChartSize,
): PlotChartSize {
  if (size) return size;
  if (tall) return "tall";
  if (compact) return "compact";
  return "default";
}

const plotMinHeight = (size: PlotChartSize, isMobile: boolean) =>
  PLOT_MIN_HEIGHT[size][isMobile ? "mobile" : "desktop"];

/** Plotly wrapper: библиотека грузится только при первом рендере графика. */
export function PlotChart({
  layout,
  className,
  compact,
  tall,
  size: sizeProp,
  onInitialized,
  onUpdate,
  onClick,
  onRelayout,
  ...rest
}: PlotProps) {
  const { resolvedTheme } = useTheme();
  const [ready, setReady] = useState(() => getPlotlyComponent() != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false,
  );

  useEffect(() => {
    if (getPlotlyComponent()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void loadPlotlyComponent()
      .then(() => {
        if (!cancelled) {
          setLoadError(null);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Не удалось загрузить график. Перезапустите приложение или обновите страницу.");
          setReady(false);
        }
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
  const plotSize = resolvePlotSize(compact, tall, sizeProp);
  const minH = plotMinHeight(plotSize, isMobile);
  const isCompactBar = plotSize === "compact";

  if (loadError) {
    return (
      <div
        className={className ?? "w-full"}
        style={{ width: "100%", minHeight: minH }}
        role="alert"
      >
        <p className="text-xs text-amber-800 dark:text-amber-200 px-2 py-4 text-center">{loadError}</p>
      </div>
    );
  }

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
          displayModeBar: isCompactBar ? "hover" : true,
          displaylogo: false,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
          locale: "ru",
        }}
        layout={{
          ...mergedLayout,
          font: {
            ...mergedLayout.font,
            size: isMobile ? 10 : plotSize === "compact" ? 11 : plotSize === "cardio" ? 12 : 12,
          },
        }}
      />
    </div>
  );
}
