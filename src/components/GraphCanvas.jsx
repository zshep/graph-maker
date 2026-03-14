import { useMemo, useRef, useState, useEffect } from "react";

// ---local storage logic for preset saves
const PRESET_STORAGE_KEY = "graphMaker.presets.v1";

// presets
const BUILTIN_PRESETS = [
  {
    id: "builtin-q1",
    name: "Quadrant I (0→10)",
    view: {
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 10,
      xTick: 1,
      yTick: 1,
      xLabel: "",
      xUnit: "",
      yLabel: "",
      yUnit: "",
      showGrid: true,
      showTicks: true,
      snapToGrid: false,
    },
    showPointLabels: true,
  },
  {
    id: "builtin-4q",
    name: "4-Quadrant (-10→10)",
    view: {
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      xTick: 1,
      yTick: 1,
      xLabel: "",
      xUnit: "",
      yLabel: "",
      yUnit: "",
      showGrid: true,
      showTicks: true,
      snapToGrid: false,
    },
    showPointLabels: true,
  },
  {
    id: "builtin-physics",
    name: "Physics (v vs t)",
    view: {
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 50,
      xTick: 1,
      yTick: 5,
      xLabel: "Time",
      xUnit: "s",
      yLabel: "Velocity",
      yUnit: "m/s",
      showGrid: true,
      showTicks: true,
      snapToGrid: false,
    },
    showPointLabels: true,
  },
];

function loadUserPresets() {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUserPresets(presets) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

//styles
const styles = {
  section: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 10,
    background: "white",
  },
  legend: {
    fontSize: 12,
    opacity: 0.8,
    padding: "0 6px",
  },
  row2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    alignItems: "center",
  },
  row4: {
    display: "grid",
    gridTemplateColumns: "repeat(4, auto)",
    gap: 12,
    alignItems: "center",
    justifyContent: "start",
  },
  toolsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, auto)",
    gap: 16,
    alignItems: "center",
    justifyContent: "start",
  },
  hint: {
    width: 900,
    background: "#f8f9fb",
    border: "1px solid #d6dbe3",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    lineHeight: 1.4,
    color: "#333",
    boxSizing: "border-box",
  },

  hintTitle: {
    margin: "4px 0 4px 0",
    fontWeight: 600,
  },

  hintText: {
    margin: 0,
  },
};

/**
 * World coordinates = math coordinates (x,y).
 * Screen coordinates = pixels in the SVG.
 *
 *  ALL data kept in world coords, then transform for rendering.
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
  // States for points / ids and segments
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [showPointLabels, setShowPointLabels] = useState(true);
  const [segments, setSegments] = useState([]); // {id, aId, bId}
  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [segmentDrag, setSegmentDrag] = useState(null);
  const [newSegmentStyle, setNewSegmentStyle] = useState("solid"); // solid | dashed
  const [tool, setTool] = useState("point"); // "point" | "segment"
  const [panelOpen, setPanelOpen] = useState(true);
  const [showHint, setShowHint] = useState(true);

  // --- preset states----
  const [userPresets, setUserPresets] = useState(() => loadUserPresets());
  const [selectedPresetId, setSelectedPresetId] = useState(
    BUILTIN_PRESETS[0].id,
  );
  const [newPresetName, setNewPresetName] = useState("");

  // --- Viewport / graph settings (world units) ---
  const [view, setView] = useState({
    // A friendly default for 4-quadrant
    xMin: -10,
    xMax: 10,
    yMin: -10,
    yMax: 10,
    xTick: 1,
    yTick: 1,
    xLabel: "",
    xUnit: "",
    yLabel: "",
    yUnit: "",
    showGrid: true,
    showTicks: true,
    snapToGrid: false,
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

  // --- classic Q1 styling ---
  const xAxisAtBottom = view.yMin >= 0; // x-axis is on/below plot → label x ticks in bottom margin
  const yAxisAtLeft = view.xMin >= 0; // y-axis is on/left of plot → label y ticks in left margin
  const isClassicQ1 = view.xMin === 0 && view.yMin === 0;

  // --- units ---
  const xAxisText =
    view.xLabel.trim() === ""
      ? ""
      : view.xUnit.trim() === ""
        ? view.xLabel.trim()
        : `${view.xLabel.trim()} (${view.xUnit.trim()})`;

  const yAxisText =
    view.yLabel.trim() === ""
      ? ""
      : view.yUnit.trim() === ""
        ? view.yLabel.trim()
        : `${view.yLabel.trim()} (${view.yUnit.trim()})`;

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

  const [points, setPoints] = useState([]); // {id, x, y}
  const [dragId, setDragId] = useState(null);

  //helper to  look up point by id:
  const pointById = useMemo(() => {
    const m = new Map();
    for (const p of points) m.set(p.id, p);
    return m;
  }, [points]);

  function snap(value, step) {
    if (!step || step <= 0) return value;
    return Math.round(value / step) * step;
  }

  function maybeSnapPoint(pt) {
    if (!view.snapToGrid) return pt;
    return {
      x: snap(pt.x, view.xTick),
      y: snap(pt.y, view.yTick),
    };
  }

  function makeId() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now() + Math.random());
  }

  // --- Click debug: show where you clicked in world coords ---
  const [cursorWorld, setCursorWorld] = useState(null);
  const svgRef = useRef(null);

  // --- Plotting Points functions ---
  function getSvgPointFromEvent(e) {
    const el = svgRef.current;
    if (!el) return null;

    const rect = svgRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { sx, sy };
  }

  function isInsidePlotArea(sx, sy) {
    return (
      sx >= inner.x &&
      sx <= inner.x + inner.w &&
      sy >= inner.y &&
      sy <= inner.y + inner.h
    );
  }

  function findNearestPointId(sx, sy, maxPx = 12) {
    let bestId = null;
    let bestD2 = maxPx * maxPx;

    for (const p of points) {
      const ps = worldToScreen({ x: p.x, y: p.y });
      const dx = ps.x - sx;
      const dy = ps.y - sy;
      const d2 = dx * dx + dy * dy;

      if (d2 <= bestD2) {
        bestD2 = d2;
        bestId = p.id;
      }
    }

    return bestId;
  }

  function onSvgPointerDown(e) {
    // Only left-click / primary pointer
    if (e.button !== 0) return;

    const pt = getSvgPointFromEvent(e);
    if (!pt) return;

    const { sx, sy } = getSvgPointFromEvent(e);
    if (!isInsidePlotArea(sx, sy)) return;

    // Convert pixels -> world coords, then optionally snap
    const wptRaw = screenToWorld({ x: sx, y: sy });
    const wpt = maybeSnapPoint(wptRaw);

    // degub readout
    setCursorWorld({
      x: Number(wpt.x.toFixed(3)),
      y: Number(wpt.y.toFixed(3)),
    });

    if (tool === "segment") {
      //clicking empty space cancels pending segment
      setSegmentDrag(null);
      return;
    }

    const id = makeId();
    setPoints((prev) => [...prev, { id, x: wpt.x, y: wpt.y }]);
    setSelectedPointId(id);

    //console.log("added point world:", wpt);
  }

  function onPointPointerDown(e, pointId) {
    e.stopPropagation();
    if (e.button !== 0) return;

    setSelectedPointId(pointId);
    setSelectedSegmentId(null);

    // Segment tool: start drag-preview segment from this point
    if (tool === "segment") {
      const { sx, sy } = getSvgPointFromEvent(e);
      const wpt = screenToWorld({ x: sx, y: sy });

      setSegmentDrag({ startId: pointId, cursorWorld: wpt });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }

    // Point tool: drag the point
    setDragId(pointId);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onSvgPointerMove(e) {
    const pt = getSvgPointFromEvent(e);
    if (!pt) return;

    const { sx, sy } = getSvgPointFromEvent(e);

    //segment preview drag
    if (segmentDrag) {
      if (!isInsidePlotArea(sx, sy)) return;
      const wpt = screenToWorld({ x: sx, y: sy });
      setSegmentDrag((cur) => (cur ? { ...cur, cursorWorld: wpt } : cur));
      return;
    }

    //point drag
    if (!dragId) return;
    if (!isInsidePlotArea(sx, sy)) return;

    const wptRaw = screenToWorld({ x: sx, y: sy });
    const wpt = maybeSnapPoint(wptRaw);

    setPoints((prev) =>
      prev.map((p) => (p.id === dragId ? { ...p, x: wpt.x, y: wpt.y } : p)),
    );
  }

  function onSvgPointerUp(e) {
    const pt = getSvgPointFromEvent(e);
    if (!pt) {
      if (segmentDrag) setSegmentDrag(null);
      if (dragId) setDragId(null);
      return;
    }

    const { sx, sy } =
      e && svgRef.current ? getSvgPointFromEvent(e) : { sx: null, sy: null };

    // Finish segment drag
    if (segmentDrag && sx != null && sy != null) {
      const endId = findNearestPointId(sx, sy, 14); // 14px feels good
      const startId = segmentDrag.startId;

      if (endId && endId !== startId) {
        const exists = segments.some(
          (s) =>
            (s.aId === startId && s.bId === endId) ||
            (s.aId === endId && s.bId === startId),
        );

        if (!exists) {
          const id = makeId();
          setSegments((prev) => [
            ...prev,
            { id, aId: startId, bId: endId, style: newSegmentStyle },
          ]);
          setSelectedSegmentId(id);
        }
      }

      setSegmentDrag(null);

      return;
    }

    // Finish point drag
    if (dragId) setDragId(null);
  }

  //Helper for Toggle Style of Segment
  function toggleSelectedSegmentStyle() {
    if (!selectedSegmentId) return;

    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== selectedSegmentId) return s;
        const next = s.style === "dashed" ? "solid" : "dashed";
        return { ...s, style: next };
      }),
    );
  }

  // show/hide hint function for segment making
  function handleCreateSegment() {
    setShowHint(false);
  }

  //simple right-click delete point
  function onPointContextMenu(e, pointId) {
    e.preventDefault();
    setPoints((prev) => prev.filter((p) => p.id !== pointId));
    setSegments((prev) =>
      prev.filter((s) => s.aId !== pointId && s.bId !== pointId),
    );
    setSelectedPointId((cur) => (cur === pointId ? null : cur));
  }

  //---labeling of points logic---

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      if (selectedPointId) {
        e.preventDefault();
        setPoints((prev) => prev.filter((p) => p.id !== selectedPointId));
        // also remove any segments connected to that point
        setSegments((prev) =>
          prev.filter(
            (s) => s.aId !== selectedPointId && s.bId !== selectedPointId,
          ),
        );
        setSelectedPointId(null);
        return;
      }

      if (selectedSegmentId) {
        e.preventDefault();
        setSegments((prev) => prev.filter((s) => s.id !== selectedSegmentId));
        setSelectedSegmentId(null);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPointId, selectedSegmentId]);

  function indexToLabel(i) {
    // A..Z, then AA..AZ, BA.. etc
    let n = i;
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  }

  //--- Preset logic---
  useEffect(() => {
    saveUserPresets(userPresets);
  }, [userPresets]);

  // final preset lists
  const allPresets = useMemo(() => {
    // user presets should not collide with prebuilt presets
    return [...BUILTIN_PRESETS, ...userPresets];
  }, [userPresets]);

  const selectedPreset = useMemo(
    () => allPresets.find((p) => p.id === selectedPresetId) || allPresets[0],
    [allPresets, selectedPresetId],
  );

  function applyPreset(preset) {
    if (!preset) return;
    setView(preset.view);
    setShowPointLabels(!!preset.showPointLabels);

    // optional: clear selection / cancel drags so it feels clean
    setSelectedPointId(null);
    setSelectedSegmentId(null);
    setDragId(null);
    setSegmentDrag(null);
  }

  function onSavePreset() {
    const name = newPresetName.trim();
    if (!name) return;

    const preset = {
      id: `user-${makeId()}`,
      name,
      view,
      showPointLabels,
    };

    setUserPresets((prev) => [preset, ...prev]);
    setSelectedPresetId(preset.id);
    setNewPresetName("");
  }

  function onDeleteSelectedPreset() {
    // only delete user presets
    if (!selectedPresetId.startsWith("user-")) return;

    setUserPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId(BUILTIN_PRESETS[0].id);
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      {/* Control Panel */}
      <div
        style={{
          width: panelOpen ? 360 : 44,

          border: "1px solid #ddd",
          borderRadius: 8,
          padding: panelOpen ? 12 : 6,
          background: "white",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setPanelOpen((v) => !v)}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #999",
            background: "white",
            cursor: "pointer",
          }}
          title={panelOpen ? "Collapse panel" : "Expand panel"}
        >
          {panelOpen ? "<= Close Panel " : " => "}
        </button>

        {panelOpen && (
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gap: 12,
              height: "calc(100vh - 120px)",
              overflowY: "auto",
            }}
          >
            {/* Controls */}
            <div style={{ display: "grid", gap: 14 }}>
              {/* Presets */}
              <fieldset style={styles.section}>
                <legend style={styles.legend}>Presets</legend>

                <div style={{ display: "grid", gap: 10 }}>
                  <label>
                    Choose Preset
                    <select
                      value={selectedPresetId}
                      onChange={(e) => setSelectedPresetId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: 6,
                      }}
                    >
                      <optgroup label="Built-in">
                        {BUILTIN_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>

                      <optgroup label="Saved">
                        {userPresets.length === 0 ? (
                          <option value="__none" disabled>
                            (none yet)
                          </option>
                        ) : (
                          userPresets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))
                        )}
                      </optgroup>
                    </select>
                  </label>

                  <div
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <button
                      onClick={() => applyPreset(selectedPreset)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #999",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      Load
                    </button>

                    <button
                      onClick={onDeleteSelectedPreset}
                      disabled={!selectedPresetId.startsWith("user-")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #999",
                        background: !selectedPresetId.startsWith("user-")
                          ? "#f3f3f3"
                          : "white",
                        cursor: !selectedPresetId.startsWith("user-")
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                    }}
                  >
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="Save current as…"
                      style={{
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid #bbb",
                      }}
                    />
                    <button
                      onClick={onSavePreset}
                      disabled={newPresetName.trim() === ""}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #999",
                        background:
                          newPresetName.trim() === "" ? "#f3f3f3" : "white",
                        cursor:
                          newPresetName.trim() === ""
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </fieldset>

              {/* Grid Settings */}
              <fieldset style={styles.section}>
                <legend style={styles.legend}>Graph</legend>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={styles.row2}>
                    <label>
                      xMin{" "}
                      <input
                        type="number"
                        value={view.xMin}
                        onChange={(e) =>
                          setView((v) => ({
                            ...v,
                            xMin: Number(e.target.value),
                          }))
                        }
                        style={{ width: 90 }}
                      />
                    </label>

                    <label>
                      xMax{" "}
                      <input
                        type="number"
                        value={view.xMax}
                        onChange={(e) =>
                          setView((v) => ({
                            ...v,
                            xMax: Number(e.target.value),
                          }))
                        }
                        style={{ width: 90 }}
                      />
                    </label>
                  </div>

                  <div style={styles.row2}>
                    <label>
                      yMin{" "}
                      <input
                        type="number"
                        value={view.yMin}
                        onChange={(e) =>
                          setView((v) => ({
                            ...v,
                            yMin: Number(e.target.value),
                          }))
                        }
                        style={{ width: 90 }}
                      />
                    </label>

                    <label>
                      yMax{" "}
                      <input
                        type="number"
                        value={view.yMax}
                        onChange={(e) =>
                          setView((v) => ({
                            ...v,
                            yMax: Number(e.target.value),
                          }))
                        }
                        style={{ width: 90 }}
                      />
                    </label>
                  </div>

                  <div style={styles.row2}>
                    <label>
                      xTick{" "}
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={view.xTick}
                        onChange={(e) =>
                          setView((v) => ({
                            ...v,
                            xTick: Number(e.target.value),
                          }))
                        }
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
                        onChange={(e) =>
                          setView((v) => ({
                            ...v,
                            yTick: Number(e.target.value),
                          }))
                        }
                        style={{ width: 90 }}
                      />
                    </label>
                  </div>
                </div>
              </fieldset>

              {/* Axis Labels /units */}
              <fieldset style={styles.section}>
                <legend style={styles.legend}>Axis labels</legend>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={styles.row2}>
                    <label>
                      x label{" "}
                      <input
                        type="text"
                        value={view.xLabel}
                        onChange={(e) =>
                          setView((v) => ({ ...v, xLabel: e.target.value }))
                        }
                        placeholder="e.g., Time"
                        style={{ width: "100%" }}
                      />
                    </label>

                    <label>
                      x unit{" "}
                      <input
                        type="text"
                        value={view.xUnit}
                        onChange={(e) =>
                          setView((v) => ({ ...v, xUnit: e.target.value }))
                        }
                        placeholder="e.g., s"
                        style={{ width: "100%" }}
                      />
                    </label>
                  </div>

                  <div style={styles.row2}>
                    <label>
                      y label{" "}
                      <input
                        type="text"
                        value={view.yLabel}
                        onChange={(e) =>
                          setView((v) => ({ ...v, yLabel: e.target.value }))
                        }
                        placeholder="e.g., Velocity"
                        style={{ width: "100%" }}
                      />
                    </label>

                    <label>
                      y unit{" "}
                      <input
                        type="text"
                        value={view.yUnit}
                        onChange={(e) =>
                          setView((v) => ({ ...v, yUnit: e.target.value }))
                        }
                        placeholder="e.g., m/s"
                        style={{ width: "100%" }}
                      />
                    </label>
                  </div>
                </div>
              </fieldset>

              {/* checkboxes */}
              <fieldset style={styles.section}>
                <legend style={styles.legend}>Options</legend>

                <div style={styles.row4}>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={view.showGrid}
                      onChange={(e) =>
                        setView((v) => ({ ...v, showGrid: e.target.checked }))
                      }
                    />
                    grid
                  </label>

                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={view.showTicks}
                      onChange={(e) =>
                        setView((v) => ({ ...v, showTicks: e.target.checked }))
                      }
                    />
                    ticks
                  </label>

                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={view.snapToGrid}
                      onChange={(e) =>
                        setView((v) => ({ ...v, snapToGrid: e.target.checked }))
                      }
                    />
                    snap
                  </label>

                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={showPointLabels}
                      onChange={(e) => setShowPointLabels(e.target.checked)}
                    />
                    labels
                  </label>
                </div>
              </fieldset>

              {/* tools (points/segments) */}
              <fieldset style={styles.section}>
                <legend style={styles.legend}>Tools</legend>

                <div style={{ display: "grid", gap: 10 }}>
                  <div style={styles.toolsRow}>
                    <label
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <input
                        type="radio"
                        name="tool"
                        checked={tool === "point"}
                        onChange={() => setTool("point")}
                      />
                      points
                    </label>

                    <label
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <input
                        type="radio"
                        name="tool"
                        checked={tool === "segment"}
                        onChange={() => setTool("segment")}
                      />
                      segments
                    </label>
                  </div>

                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    points: {points.length} (right-click a point to delete)
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                      New segments
                    </div>
                    <div
                      style={{ display: "flex", gap: 14, alignItems: "center" }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <input
                          type="radio"
                          name="segStyle"
                          checked={newSegmentStyle === "solid"}
                          onChange={() => setNewSegmentStyle("solid")}
                        />
                        solid
                      </label>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <input
                          type="radio"
                          name="segStyle"
                          checked={newSegmentStyle === "dashed"}
                          onChange={() => setNewSegmentStyle("dashed")}
                        />
                        dashed
                      </label>
                    </div>
                    {selectedSegmentId && (
                      <button
                        onClick={toggleSelectedSegmentStyle}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid #999",
                          background: "white",
                          cursor: "pointer",
                          justifySelf: "start",
                        }}
                      >
                        Toggle selected segment style
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setPoints([])}
                    disabled={points.length === 0}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #999",
                      background: points.length === 0 ? "#f3f3f3" : "white",
                      cursor: points.length === 0 ? "not-allowed" : "pointer",
                      justifySelf: "start",
                    }}
                  >
                    Delete all points
                  </button>
                </div>
              </fieldset>

              <div style={{ margin: "auto", fontSize: 14, opacity: 0.8 }}>
                {cursorWorld ? (
                  <span>
                    (x,y): ({cursorWorld.x}, {cursorWorld.y})
                  </span>
                ) : (
                  <span>click on the graph to see world coords</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Graph Area */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <svg
          ref={svgRef}
          width={W}
          height={H}
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
          style={{
            border: "1px solid #ddd",
            background: "white",
            borderRadius: 8,
            cursor: dragId ? "grabbing" : "crosshair",
            display: "block",
          }}
        >
          {/* svg Content */}

          {/* Plot area background */}
          <rect
            x={inner.x}
            y={inner.y}
            width={inner.w}
            height={inner.h}
            fill="white"
          />

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

          {/* Segments */}
          <g>
            {segments.map((seg) => {
              const a = pointById.get(seg.aId);
              const b = pointById.get(seg.bId);
              if (!a || !b) return null;

              const A = worldToScreen({ x: a.x, y: a.y });
              const B = worldToScreen({ x: b.x, y: b.y });

              const isSelected = seg.id === selectedSegmentId;

              return (
                <line
                  key={seg.id}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke="black"
                  strokeWidth={isSelected ? 4 : 2}
                  strokeDasharray={seg.style === "dashed" ? "6 6" : undefined}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedSegmentId(seg.id);
                    setSelectedPointId(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSegments((prev) => prev.filter((s) => s.id !== seg.id));
                    setSelectedSegmentId((cur) =>
                      cur === seg.id ? null : cur,
                    );
                  }}
                />
              );
            })}
          </g>

          {/* Segment drag preview */}
          {segmentDrag &&
            (() => {
              const a = pointById.get(segmentDrag.startId);
              if (!a) return null;

              const A = worldToScreen({ x: a.x, y: a.y });
              const B = worldToScreen({
                x: segmentDrag.cursorWorld.x,
                y: segmentDrag.cursorWorld.y,
              });

              return (
                <line
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke="black"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  opacity="0.6"
                  pointerEvents="none"
                />
              );
            })()}

          {/* Points */}
          <g>
            {points.map((p, i) => {
              const s = worldToScreen({ x: p.x, y: p.y });
              const isSelected = p.id === selectedPointId;
              const label = indexToLabel(i);

              return (
                <g key={p.id}>
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={6}
                    fill="black"
                    stroke={isSelected ? "black" : "none"}
                    strokeWidth={isSelected ? 3 : 0}
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => onPointPointerDown(e, p.id)}
                    onContextMenu={(e) => onPointContextMenu(e, p.id)}
                  />

                  {showPointLabels && (
                    <text
                      x={s.x + 10}
                      y={s.y - 10}
                      fontSize="14"
                      fontFamily="system-ui, sans-serif"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Tick labels */}
          <g fontSize="12" fontFamily="system-ui, sans-serif">
            {/* X tick labels */}
            {gridLines.v.map((ln) => {
              // Hide x-axis 0 label only in classic Q1 (we'll draw one shared "0")
              if (isClassicQ1 && Math.abs(ln.xWorld) < 1e-9) return null;

              const labelY = xAxisAtBottom
                ? inner.y + inner.h + 18 // bottom margin
                : clamp(xAxisY + 16, inner.y + 14, inner.y + inner.h - 4);

              return (
                <text
                  key={`xt-${ln.xWorld}`}
                  x={ln.xScreen}
                  y={labelY}
                  textAnchor="middle"
                >
                  {Number(ln.xWorld.toFixed(6))}
                </text>
              );
            })}

            {/* Y tick labels */}
            {gridLines.h.map((ln) => {
              // Hide y-axis 0 label only in classic Q1 (we'll draw one shared "0")
              if (isClassicQ1 && Math.abs(ln.yWorld) < 1e-9) return null;

              const labelX = yAxisAtLeft
                ? inner.x - 8 // left margin
                : clamp(yAxisX - 8, inner.x + 10, inner.x + inner.w - 10);

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

            {/* Single shared 0 label only when both mins are exactly 0 */}
            {isClassicQ1 && (
              <text x={inner.x - 8} y={inner.y + inner.h + 18} textAnchor="end">
                0
              </text>
            )}
          </g>

          {/* Axis labels */}
          <g fontFamily="system-ui, sans-serif" fontSize="14">
            {/* X axis label (centered below plot) */}
            {xAxisText && (
              <text
                x={inner.x + inner.w / 2}
                y={inner.y + inner.h + 44}
                textAnchor="middle"
              >
                {xAxisText}
              </text>
            )}

            {/* Y axis label (rotated, centered left of plot) */}
            {yAxisText && (
              <text
                transform={`translate(${inner.x - 44}, ${inner.y + inner.h / 2}) rotate(-90)`}
                textAnchor="middle"
              >
                {yAxisText}
              </text>
            )}
          </g>

          {/* Axis tick marks (hash marks) */}
          {view.showTicks && (
            <g>
              {/* ticks on x-axis (vertical little lines) */}
              {gridLines.v.map((ln) => (
                <line
                  key={`x-tick-${ln.xWorld}`}
                  x1={ln.xScreen}
                  y1={xAxisY - 6}
                  x2={ln.xScreen}
                  y2={xAxisY + 6}
                  stroke="black"
                  strokeWidth="2"
                />
              ))}

              {/* ticks on y-axis (horizontal little lines) */}
              {gridLines.h.map((ln) => (
                <line
                  key={`y-tick-${ln.yWorld}`}
                  x1={yAxisX - 6}
                  y1={ln.yScreen}
                  x2={yAxisX + 6}
                  y2={ln.yScreen}
                  stroke="black"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
        </svg>

        {/* Segemnt Hint */}
        {showHint && (
          <div style={styles.hint}>
            <p style={styles.hintTitle}>To move a point:</p>
            <p style={styles.hintText}>
              Choose points under Tools, then click and drag
              
            </p>
            <p style={styles.hintTitle}>To create a segment:</p>
            <p style={styles.hintText}>
              Create two points, choose Segment under Tools, then click and drag
              from one point to another.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/*
 




*/
