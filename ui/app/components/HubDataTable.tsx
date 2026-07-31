/**
 * HubDataTable (v0.1.61) — Flow Analyst–inspired dense table for Application Dashboard.
 *
 * Client-side sort / filter / column picker / resize over rows already loaded by the page.
 * Intentionally smaller than Netflow FlowViewerPro; migrate one Overview table per release.
 *
 * Rollback: stop importing this component and restore the previous plain <table> render.
 */
import React, { useCallback, useMemo, useState } from "react";
import { density, theme } from "@utils/themeStyles";

export type HubColumnId = string;

export type HubColumnDef<Row extends object> = {
  id: HubColumnId;
  label: string;
  /** Default true */
  defaultVisible?: boolean;
  align?: "left" | "right" | "center";
  /** Default width in px */
  width?: number;
  minWidth?: number;
  getValue?: (row: Row) => unknown;
  render?: (row: Row) => React.ReactNode;
};

type SortDir = "asc" | "desc";

type HubDataTableProps<Row extends object> = {
  columns: HubColumnDef<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  /** Optional localStorage key for visible columns + widths */
  storageKey?: string;
  emptyMessage?: string;
};

type PersistedPrefs = {
  visible: string[];
  widths: Record<string, number>;
};

function readPrefs(storageKey: string | undefined, columns: HubColumnDef<object>[]): PersistedPrefs {
  const defaults: PersistedPrefs = {
    visible: columns.filter((c) => c.defaultVisible !== false).map((c) => c.id),
    widths: Object.fromEntries(columns.map((c) => [c.id, c.width || 140])),
  };
  if (!storageKey || typeof window === "undefined") {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as PersistedPrefs;
    const known = new Set(columns.map((c) => c.id));
    const visible = (parsed.visible || []).filter((id) => known.has(id));
    return {
      visible: visible.length ? visible : defaults.visible,
      widths: { ...defaults.widths, ...(parsed.widths || {}) },
    };
  } catch {
    return defaults;
  }
}

function cellValue<Row extends object>(column: HubColumnDef<Row>, row: Row): unknown {
  if (column.getValue) {
    return column.getValue(row);
  }
  return (row as Record<string, unknown>)[column.id];
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function HubDataTable<Row extends object>({
  columns,
  rows,
  rowKey,
  storageKey,
  emptyMessage = "No rows.",
}: HubDataTableProps<Row>) {
  const initial = useMemo(() => readPrefs(storageKey, columns as HubColumnDef<object>[]), [columns, storageKey]);
  const [visibleIds, setVisibleIds] = useState<string[]>(initial.visible);
  const [widths, setWidths] = useState<Record<string, number>>(initial.widths);
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showPicker, setShowPicker] = useState(false);

  const persist = useCallback(
    (nextVisible: string[], nextWidths: Record<string, number>) => {
      if (!storageKey || typeof window === "undefined") {
        return;
      }
      window.localStorage.setItem(storageKey, JSON.stringify({ visible: nextVisible, widths: nextWidths } satisfies PersistedPrefs));
    },
    [storageKey]
  );

  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleIds.includes(column.id)),
    [columns, visibleIds]
  );

  const filteredSortedRows = useMemo(() => {
    let next = rows;
    const activeFilters = Object.entries(filters).filter(([, value]) => value.trim());
    if (activeFilters.length) {
      next = next.filter((row) =>
        activeFilters.every(([columnId, needle]) => {
          const column = columns.find((c) => c.id === columnId);
          if (!column) {
            return true;
          }
          const hay = String(cellValue(column, row) ?? "").toLowerCase();
          return hay.includes(needle.trim().toLowerCase());
        })
      );
    }
    if (sortId) {
      const column = columns.find((c) => c.id === sortId);
      if (column) {
        const dir = sortDir === "asc" ? 1 : -1;
        next = [...next].sort((a, b) => dir * compareValues(cellValue(column, a), cellValue(column, b)));
      }
    }
    return next;
  }, [rows, filters, sortId, sortDir, columns]);

  const toggleSort = (columnId: string) => {
    if (sortId !== columnId) {
      setSortId(columnId);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortId(null);
  };

  const toggleColumn = (columnId: string) => {
    setVisibleIds((prev) => {
      const exists = prev.includes(columnId);
      const next = exists ? prev.filter((id) => id !== columnId) : [...prev, columnId];
      // Keep at least one column visible.
      const safe = next.length ? next : prev;
      persist(safe, widths);
      return safe;
    });
  };

  const onResizeStart = (columnId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[columnId] || 140;
    const minWidth = columns.find((c) => c.id === columnId)?.minWidth || 72;

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(minWidth, startWidth + (moveEvent.clientX - startX));
      setWidths((prev) => {
        const next = { ...prev, [columnId]: nextWidth };
        persist(visibleIds, next);
        return next;
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (rows.length === 0) {
    return <div style={{ fontSize: density.tableFontSize, color: theme.textMuted }}>{emptyMessage}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setShowPicker((prev) => !prev)}
          style={{
            fontSize: "12px",
            padding: "4px 8px",
            border: `1px solid ${theme.border}`,
            borderRadius: "4px",
            backgroundColor: theme.surfaceSubtle,
            color: theme.text,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Columns
        </button>
        <span style={{ fontSize: "11px", color: theme.textSecondary }}>
          {filteredSortedRows.length} of {rows.length} rows · click header to sort · drag edge to resize
        </span>
        {storageKey && (
          <button
            type="button"
            onClick={() => {
              window.localStorage.removeItem(storageKey);
              const defaults = readPrefs(undefined, columns as HubColumnDef<object>[]);
              setVisibleIds(defaults.visible);
              setWidths(defaults.widths);
              setFilters({});
              setSortId(null);
            }}
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              border: "none",
              background: "transparent",
              color: theme.textSecondary,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Reset table prefs
          </button>
        )}
      </div>

      {showPicker && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 12px",
            marginBottom: "8px",
            padding: "8px",
            border: `1px solid ${theme.border}`,
            borderRadius: "4px",
            backgroundColor: theme.surfaceSubtle,
          }}
        >
          {columns.map((column) => (
            <label key={column.id} style={{ fontSize: "12px", color: theme.text, display: "flex", gap: "6px", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={visibleIds.includes(column.id)}
                onChange={() => toggleColumn(column.id)}
              />
              {column.label}
            </label>
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: density.tableFontSize, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  style={{
                    padding: density.thPadding,
                    textAlign: column.align || "left",
                    fontSize: density.thFontSize,
                    color: theme.textSecondary,
                    position: "relative",
                    width: widths[column.id] || column.width || 140,
                    userSelect: "none",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      fontWeight: 700,
                      color: theme.textSecondary,
                      fontSize: density.thFontSize,
                      textAlign: column.align || "left",
                      width: "100%",
                    }}
                  >
                    {column.label}
                    {sortId === column.id ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                  <input
                    value={filters[column.id] || ""}
                    onChange={(event) => setFilters((prev) => ({ ...prev, [column.id]: event.target.value }))}
                    placeholder="Filter"
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "4px",
                      boxSizing: "border-box",
                      fontSize: "11px",
                      padding: "2px 4px",
                      border: `1px solid ${theme.border}`,
                      borderRadius: "3px",
                      backgroundColor: theme.surface,
                      color: theme.text,
                    }}
                  />
                  <span
                    onMouseDown={(event) => onResizeStart(column.id, event)}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      width: "5px",
                      height: "100%",
                      cursor: "col-resize",
                      backgroundColor: "transparent",
                    }}
                    title="Drag to resize"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSortedRows.map((row, index) => (
              <tr key={rowKey(row, index)} style={{ borderBottom: `1px solid ${theme.border}` }}>
                {visibleColumns.map((column) => (
                  <td
                    key={column.id}
                    style={{
                      padding: density.tdPadding,
                      textAlign: column.align || "left",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {column.render ? column.render(row) : String(cellValue(column, row) ?? "-")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
