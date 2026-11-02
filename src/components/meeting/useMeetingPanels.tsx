import React, { useEffect, useRef, useState } from 'react';

type Panel = 'list' | 'analysis';
const KEY = 'neo-meeting-panels-v1';
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function useMeetingPanels() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [widths, setWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { list: clamp(Number(saved.list) || 250, 140, 420), analysis: clamp(Number(saved.analysis) || 500, 200, 1400) };
    } catch { return { list: 250, analysis: 500 }; }
  });
  const drag = useRef<{ panel: Panel; pointerId: number; x: number; width: number } | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(widths)); } catch { /* Storage may be disabled. */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [widths]);
  const listMax = Math.max(100, Math.min(420, containerWidth * 0.3, containerWidth - 576));
  const listMin = Math.min(140, listMax);
  const listWidth = clamp(widths.list, listMin, listMax);
  const workspaceWidth = Math.max(0, containerWidth - listWidth - 16);
  const analysisMin = Math.min(220, workspaceWidth * 0.45);
  const analysisMax = Math.max(analysisMin, workspaceWidth - Math.min(280, workspaceWidth * 0.5));
  const analysisWidth = clamp(widths.analysis, analysisMin, analysisMax);
  const bounds = (panel: Panel) => panel === 'list' ? [listMin, listMax] : [analysisMin, analysisMax];
  const currentWidth = (panel: Panel) => panel === 'list' ? listWidth : analysisWidth;
  const resize = (panel: Panel, value: number) => {
    const [min, max] = bounds(panel);
    setWidths(current => ({ ...current, [panel]: Math.round(clamp(value, min, max)) }));
  };
  const separator = (panel: Panel) => (
    <div role="separator" aria-orientation="vertical" aria-label={panel === 'list' ? '调整会议列表宽度' : '调整转写与分析面板宽度'}
      aria-valuenow={Math.round(currentWidth(panel))} aria-valuemin={Math.round(bounds(panel)[0])} aria-valuemax={Math.round(bounds(panel)[1])}
      tabIndex={0} title="拖动调整宽度；双击恢复；方向键微调"
      className="group z-10 flex w-2 shrink-0 cursor-col-resize touch-none select-none items-center justify-center bg-slate-100 hover:bg-blue-100 focus-visible:bg-blue-100 focus:outline-none"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { panel, pointerId: event.pointerId, x: event.clientX, width: currentWidth(panel) };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        resize(active.panel, active.width + (event.clientX - active.x) * (active.panel === 'analysis' ? -1 : 1));
      }}
      onPointerUp={event => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => resize(panel, panel === 'list' ? 250 : 500)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const [min, max] = bounds(panel);
        resize(panel, event.key === 'Home' ? min : event.key === 'End' ? max : currentWidth(panel) + (event.key === 'ArrowRight' ? 20 : -20) * (panel === 'analysis' ? -1 : 1));
      }}>
      <div className="h-10 w-0.5 rounded bg-slate-300 group-hover:bg-blue-500" />
    </div>
  );
  return { containerRef, listWidth, analysisWidth, separator };
}
