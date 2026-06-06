import { useCallback, useEffect, useRef, useState } from "react";
import type { PlotParams } from "react-plotly.js";
import type { HeartRatePoint } from "../../../types";
import type { StrengthHrEditableBlock, StrengthHrEditorAction } from "../../../types/strengthHrEditor";
import { HeartRateChart } from "../../HeartRateChart";
import type { HrChartAxis } from "../../../utils/hrChart";
import {
  clampBoundarySec,
  findBlockAtSec,
  getBlockNeighbors,
  MIN_BLOCK_DURATION_SEC,
} from "../../../utils/strengthHrBlockMetrics";
import { getPlotAxisMapping, pxToSec, secToPx, type PlotAxisMapping } from "../../../utils/plotAxisMapping";
import { snapBoundarySec, snapSplitSec } from "../../../utils/strengthHrBlockSnap";
import { cn } from "../../../lib/utils";

interface EditableHeartRateChartProps {
  points: HeartRatePoint[];
  axis: HrChartAxis;
  timeAxisSeconds: boolean;
  polarImport: boolean;
  blocks: StrengthHrEditableBlock[];
  selectedBlockId: number | null;
  splitMode: boolean;
  onSelectBlock: (blockId: number) => void;
  onClearSelection: () => void;
  onMoveBoundary: (action: Extract<StrengthHrEditorAction, { type: "moveBoundary" }>) => void;
  onSplitAt: (blockId: number, atSec: number) => void;
}

type DragState = {
  blockId: number;
  edge: "start" | "end";
};

export function EditableHeartRateChart({
  points,
  axis,
  timeAxisSeconds,
  polarImport,
  blocks,
  selectedBlockId,
  splitMode,
  onSelectBlock,
  onClearSelection,
  onMoveBoundary,
  onSplitAt,
}: EditableHeartRateChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphDivRef = useRef<HTMLElement | null>(null);
  const [axisMapping, setAxisMapping] = useState<PlotAxisMapping | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [splitPreviewSec, setSplitPreviewSec] = useState<number | null>(null);

  const refreshMapping = useCallback(() => {
    if (!graphDivRef.current) return;
    const mapping = getPlotAxisMapping(graphDivRef.current, timeAxisSeconds);
    if (mapping) setAxisMapping(mapping);
  }, [timeAxisSeconds]);

  const handlePlotReady: PlotParams["onInitialized"] = useCallback(
    (_figure: unknown, graphDiv: unknown) => {
      graphDivRef.current = graphDiv as HTMLElement;
      refreshMapping();
    },
    [refreshMapping],
  );

  const handlePlotUpdate: PlotParams["onUpdate"] = useCallback(
    (_figure: unknown, graphDiv: unknown) => {
      graphDivRef.current = graphDiv as HTMLElement;
      refreshMapping();
    },
    [refreshMapping],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => refreshMapping());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [refreshMapping]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClearSelection]);

  const clientXToSec = useCallback(
    (clientX: number): number | null => {
      if (!axisMapping || !containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = clientX - rect.left;
      return pxToSec(localX, axisMapping);
    },
    [axisMapping],
  );

  const applyBoundaryMove = useCallback(
    (blockId: number, edge: "start" | "end", rawSec: number) => {
      const block = blocks.find((b) => b.block_id === blockId);
      if (!block) return;
      const clamped = clampBoundarySec(rawSec, edge, block, blocks);
      const neighbors = getBlockNeighbors(blocks, blockId);
      const snapped = snapBoundarySec(clamped, edge, block, neighbors, points);
      const finalSec = clampBoundarySec(snapped, edge, block, blocks);
      if (edge === "start" && finalSec >= block.end_sec - MIN_BLOCK_DURATION_SEC) return;
      if (edge === "end" && finalSec <= block.start_sec + MIN_BLOCK_DURATION_SEC) return;
      onMoveBoundary({ type: "moveBoundary", blockId, edge, sec: finalSec });
    },
    [blocks, onMoveBoundary, points],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const sec = clientXToSec(e.clientX);
      if (sec == null) return;
      applyBoundaryMove(drag.blockId, drag.edge, sec);
    };
    const onUp = () => setDrag(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, clientXToSec, applyBoundaryMove]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!axisMapping) return;
    const sec = clientXToSec(e.clientX);
    if (sec == null) return;

    if (splitMode && selectedBlockId != null) {
      const block = blocks.find((b) => b.block_id === selectedBlockId);
      if (block && sec > block.start_sec + MIN_BLOCK_DURATION_SEC && sec < block.end_sec - MIN_BLOCK_DURATION_SEC) {
        onSplitAt(block.block_id, snapSplitSec(sec, block, points));
      }
      return;
    }

    const hit = findBlockAtSec(blocks, sec);
    if (hit) onSelectBlock(hit.block_id);
    else onClearSelection();
  };

  const handleOverlayMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!splitMode || selectedBlockId == null) {
      setSplitPreviewSec(null);
      return;
    }
    const sec = clientXToSec(e.clientX);
    const block = blocks.find((b) => b.block_id === selectedBlockId);
    if (sec == null || !block) {
      setSplitPreviewSec(null);
      return;
    }
    if (sec > block.start_sec + MIN_BLOCK_DURATION_SEC && sec < block.end_sec - MIN_BLOCK_DURATION_SEC) {
      setSplitPreviewSec(snapSplitSec(sec, block, points));
    } else {
      setSplitPreviewSec(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <HeartRateChart
        points={points}
        axis={axis}
        smoothWindow={polarImport ? 5 : 0}
        timeAxisSeconds={timeAxisSeconds}
        detectedBlocks={blocks}
        showSetMapping
        editMode
        selectedBlockId={selectedBlockId}
        tall
        onPlotInitialized={handlePlotReady}
        onPlotUpdate={handlePlotUpdate}
        plotClassName="hr-chart-plot w-full pointer-events-none"
      />

      {axisMapping ? (
        <div
          className="absolute inset-0 z-10"
          style={{ pointerEvents: drag ? "none" : "auto" }}
          onClick={handleOverlayClick}
          onMouseMove={handleOverlayMove}
          onMouseLeave={() => setSplitPreviewSec(null)}
          role="presentation"
        >
          {blocks.map((b) => {
            const left = secToPx(b.start_sec, axisMapping);
            const right = secToPx(b.end_sec, axisMapping);
            const width = Math.max(0, right - left);
            const isSelected = b.block_id === selectedBlockId;
            return (
              <div key={b.block_id}>
                <div
                  className={cn(
                    "absolute cursor-pointer",
                    isSelected ? "bg-[rgb(var(--app-accent)/0.06)]" : "bg-transparent hover:bg-black/5",
                  )}
                  style={{
                    left,
                    width,
                    top: axisMapping.plotTop,
                    height: axisMapping.plotHeight,
                  }}
                  aria-hidden
                />
                <BoundaryHandle
                  left={left}
                  top={axisMapping.plotTop}
                  height={axisMapping.plotHeight}
                  active={isSelected}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectBlock(b.block_id);
                    setDrag({ blockId: b.block_id, edge: "start" });
                  }}
                />
                <BoundaryHandle
                  left={right}
                  top={axisMapping.plotTop}
                  height={axisMapping.plotHeight}
                  active={isSelected}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectBlock(b.block_id);
                    setDrag({ blockId: b.block_id, edge: "end" });
                  }}
                />
              </div>
            );
          })}

          {splitMode && splitPreviewSec != null ? (
            <div
              className="absolute w-0.5 bg-[rgb(var(--app-accent))] pointer-events-none"
              style={{
                left: secToPx(splitPreviewSec, axisMapping),
                top: axisMapping.plotTop,
                height: axisMapping.plotHeight,
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BoundaryHandle({
  left,
  top,
  height,
  active,
  onMouseDown,
}: {
  left: number;
  top: number;
  height: number;
  active: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={cn(
        "absolute z-20 w-1.5 -translate-x-1/2 cursor-col-resize rounded-full",
        active ? "bg-[rgb(var(--app-accent))]" : "bg-slate-400/70 hover:bg-[rgb(var(--app-accent)/0.8)]",
      )}
      style={{ left, top, height }}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
    />
  );
}
