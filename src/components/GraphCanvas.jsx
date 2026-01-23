import { useMemo, useRef, useState } from "react";

/**
 * World coordinates = math coordinates (x,y).
 * Screen coordinates = pixels in the SVG.
 *
 * We'll keep ALL data in world coords, then transform for rendering.
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function niceFloorToStep(value, step) {
  return Math.floor(value / step) * step;
}

function niceCeilToStep(value, step) {
  return Math.ceil(value / step) * step;
}

export default function GraphCanvas() {
  // --- Viewport / graph settings (world units) ---
  const [view, setView] = useState({
    // A friendly default for 4-quadrant
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    xTick: 1,
    yTick: 1,
    showGrid: true,
  });

  // --- Screen settings (pixels) ---
  const W = 900;
  const H = 600;
  const margin = { left: 60, right: 20, top: 20, bottom: 60 };

  const inner = useMemo(() => {
    return {
      x: margin.left,
      y: margin.top,
      w: W - margin.left - margin.right,
      h: H - margin.top - margin.bottom,
    };
  }, [W, H]);

  // --- Coordinate transforms ---
  const xScale = inner.w / (view.xMax - view.xMin);
  const yScale = inner.h / (view.yMax - view.yMin);

  function worldToScreen({ x, y }) {
    // screen x increases right; screen y increases down
    const sx = inner.x + (x - view.xMin) * xScale;
    const sy = inner.y + inner.h - (y - view.yMin) * yScale;
    return { x: sx, y: sy };
  }

  function screenToWorld({ x, y }) {
    const wx = view.xMin + (x - inner.x) / xScale;
    const wy = view.yMin + (inner.h - (y - inner.y)) / yScale;
    return { x: wx, y: wy };
  }

  // --- Derived axis positions (screen) ---
  const axisXScreen = worldToScreen({ x: 0, y: 0 }).x; // y-axis line x-position
  const axisYScreen = worldToScreen({ x: 0, y: 0 }).y; // x-axis line y-position

  // Keep axes within plot area (in case 0 is out of range)
  const yAxisX = clamp(axisXScreen, inner.x, inner.x + inner.w);
  const xAxisY = clamp(axisYScreen, inner.y, inner.y + inner.h);

  // --- Grid lines (world ticks to screen) ---
  const gridLines = useMemo(() => {
    if (!view.showGrid) return { v: [], h: [] };

    const v = [];
    const h = [];

    const xStart = niceFloorToStep(view.xMin, view.xTick);
    const xEnd = niceCeilToStep(view.xMax, view.xTick);

    for (let x = xStart; x <= xEnd + 1e-9; x += view.xTick) {
      const p = worldToScreen({ x, y: view.yMin });
      v.push({ xWorld: x, xScreen: p.x });
    }

    const yStart = niceFloorToStep(view.yMin, view.yTick);
    const yEnd = niceCeilToStep(view.yMax, view.yTick);

    for (let y = yStart; y <= yEnd + 1e-9; y += view.yTick) {
      const p = worldToScreen({ x: view.xMin, y });
      h.push({ yWorld: y, yScreen: p.y });
    }

    return { v, h };
  }, [view, inner.x, inner.y, inner.w, inner.h]);

  // --- Click debug: show where you clicked in world coords ---
  const [cursorWorld, setCursorWorld] = useState(null);
  const svgRef = useRef(null);

  function onSvgClick(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wpt = screenToWorld({ x: sx, y: sy });
    setCursorWorld({
      x: Number(wpt.x.toFixed(3)),
      y: Number(wpt.y.toFixed(3)),
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          xMin{" "}
          <input
            type="number"
            value={view.xMin}
            onChange={(e) => setView((v) => ({ ...v, xMin: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
        </label>
        <label>
          xMax{" "}
          <input
            type="number"
            value={view.xMax}
            onChange={(e) => setView((v) => ({ ...v, xMax: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
        </label>
        <label>
          yMin{" "}
          <input
            type="number"
            value={view.yMin}
            onChange={(e) => setView((v) => ({ ...v, yMin: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
        </label>
        <label>
          yMax{" "}
          <input
            type="number"
            value={view.yMax}
            onChange={(e) => setView((v) => ({ ...v, yMax: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
        </label>
        <label>
          xTick{" "}
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={view.xTick}
            onChange={(e) => setView((v) => ({ ...v, xTick: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
        </label>
        <label>
          yTick{" "}
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={view.yTick}
            onChange={(e) => setView((v) => ({ ...v, yTick: Number(e.target.value) }))}
            style={{ width: 90 }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={view.showGrid}
            onChange={(e) => setView((v) => ({ ...v, showGrid: e.target.checked }))}
          />
          grid
        </label>

        <div style={{ marginLeft: "auto", fontSize: 14, opacity: 0.8 }}>
          {cursorWorld ? (
            <span>
              click → world: ({cursorWorld.x}, {cursorWorld.y})
            </span>
          ) : (
            <span>click on the graph to see world coords</span>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        onClick={onSvgClick}
        style={{
          border: "1px solid #ddd",
          background: "white",
          borderRadius: 8,
          cursor: "crosshair",
        }}
      >
        {/* Plot area background */}
        <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="white" />

        {/* Grid */}
        {view.showGrid && (
          <g opacity="0.25">
            {gridLines.v.map((ln) => (
              <line
                key={`v-${ln.xWorld}`}
                x1={ln.xScreen}
                y1={inner.y}
                x2={ln.xScreen}
                y2={inner.y + inner.h}
                stroke="black"
                strokeWidth="1"
              />
            ))}
            {gridLines.h.map((ln) => (
              <line
                key={`h-${ln.yWorld}`}
                x1={inner.x}
                y1={ln.yScreen}
                x2={inner.x + inner.w}
                y2={ln.yScreen}
                stroke="black"
                strokeWidth="1"
              />
            ))}
          </g>
        )}

        {/* Axes */}
        <g>
          {/* x-axis */}
          <line
            x1={inner.x}
            y1={xAxisY}
            x2={inner.x + inner.w}
            y2={xAxisY}
            stroke="black"
            strokeWidth="2"
          />
          {/* y-axis */}
          <line
            x1={yAxisX}
            y1={inner.y}
            x2={yAxisX}
            y2={inner.y + inner.h}
            stroke="black"
            strokeWidth="2"
          />
        </g>

        {/* Border for plot area */}
        <rect
          x={inner.x}
          y={inner.y}
          width={inner.w}
          height={inner.h}
          fill="none"
          stroke="black"
          strokeWidth="2"
        />

        {/* Simple tick labels along axes (MVP) */}
        <g fontSize="12" fontFamily="system-ui, sans-serif">
          {gridLines.v.map((ln) => {
            // label near x-axis if visible, otherwise bottom
            const labelY = clamp(xAxisY + 16, inner.y + 14, inner.y + inner.h - 4);
            return (
              <text key={`xt-${ln.xWorld}`} x={ln.xScreen} y={labelY} textAnchor="middle">
                {Number(ln.xWorld.toFixed(6))}
              </text>
            );
          })}
          {gridLines.h.map((ln) => {
            const labelX = clamp(yAxisX - 8, inner.x + 10, inner.x + inner.w - 10);
            return (
              <text
                key={`yt-${ln.yWorld}`}
                x={labelX}
                y={ln.yScreen + 4}
                textAnchor="end"
              >
                {Number(ln.yWorld.toFixed(6))}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
