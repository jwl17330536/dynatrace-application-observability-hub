/**
 * HubDataTable v2.1 (v0.1.64) — Flow Analyst–inspired dense table.
 *
 * - Cell ⋮ menu: Copy, Filter by, Exclude, Open in Dynatrace (when resolvable)
 * - Filter chips + Clear (no per-column header dropdowns)
 * - Optional row selection for master/detail widgets
 * - Sort, resize, column picker
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openInDynatrace, resolveDynatraceOpenUrl } from "@utils/entityLinks";
import { density, theme } from "@utils/themeStyles";

export type HubColumnId = string;

export type HubColumnDef<Row extends object> = {
  id: HubColumnId;
  label: string;
  /** Optional group label rendered as a second header row above consecutive columns. */
  group?: string;
  defaultVisible?: boolean;
  align?: "left" | "right" | "center";
  width?: number;
  minWidth?: number;
  getValue?: (row: Row) => unknown;
  render?: (row: Row) => React.ReactNode;
  /**
   * Return a Dynatrace entity id (HOST-… / APPLICATION-…) or problem event.id UUID
   * for the ⋮ “Open in Dynatrace” action. Falls back to cell display value when omitted.
   */
  getOpenInDynatraceId?: (row: Row) => string | null | undefined;
};

type SortDir = "asc" | "desc";
type FilterOp = "eq" | "neq" | "contains";

type ColumnFilter = {
  op: FilterOp;
  value: string;
};

type HubDataTableProps<Row extends object> = {
  columns: HubColumnDef<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  storageKey?: string;
  emptyMessage?: string;
  selectable?: boolean;
  selectedRowKey?: string | null;
  onSelectRow?: (row: Row | null, key: string | null) => void;
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

function displayCell<Row extends object>(column: HubColumnDef<Row>, row: Row): string {
  const raw = cellValue(column, row);
  if (raw === null || raw === undefined || raw === "") {
    return "-";
  }
  return String(raw);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function matchesFilter(hay: string, filter: ColumnFilter): boolean {
  const needle = filter.value;
  if (filter.op === "eq") {
    return hay === needle;
  }
  if (filter.op === "neq") {
    return hay !== needle;
  }
  return hay.toLowerCase().includes(needle.toLowerCase());
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "transparent",
  padding: "8px 12px",
  cursor: "pointer",
  color: "inherit",
  fontSize: "13px",
};

export function HubDataTable<Row extends object>({
  columns,
  rows,
  rowKey,
  storageKey,
  emptyMessage = "No rows.",
  selectable = false,
  selectedRowKey = null,
  onSelectRow,
}: HubDataTableProps<Row>) {
  const initial = useMemo(() => readPrefs(storageKey, columns as HubColumnDef<object>[]), [columns, storageKey]);
  const [visibleIds, setVisibleIds] = useState<string[]>(initial.visible);
  const [widths, setWidths] = useState<Record<string, number>>(initial.widths);
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [openMenu, setOpenMenu] = useState<{
    key: string;
    columnId: string;
    label: string;
    value: string;
    openId: string | null;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const onDoc = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

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
    const active = Object.entries(filters).filter(([, filter]) => filter.value.trim() !== "");
    let next = rows;
    if (active.length) {
      next = rows.filter((row) =>
        active.every(([columnId, filter]) => {
          const column = columns.find((c) => c.id === columnId);
          if (!column) {
            return true;
          }
          return matchesFilter(displayCell(column, row), filter);
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

  const setColumnFilter = (columnId: string, filter: ColumnFilter | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (!filter || filter.value === "") {
        delete next[columnId];
      } else {
        next[columnId] = filter;
      }
      return next;
    });
  };

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
    const minWidth = columns.find((c) => c.id === columnId)?.minWidth || 96;

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

  const filterChips = Object.entries(filters).filter(([, f]) => f.value.trim() !== "");
  const openUrl = openMenu?.openId ? resolveDynatraceOpenUrl(openMenu.openId) : null;

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
          {filteredSortedRows.length} of {rows.length} rows · ⋮ to filter · click header to sort · drag edge to resize
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
        {selectable && selectedRowKey && (
          <button
            type="button"
            onClick={() => onSelectRow?.(null, null)}
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              border: "none",
              background: "transparent",
              color: theme.primaryText,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear row selection
          </button>
        )}
      </div>

      {filterChips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
          {filterChips.map(([columnId, filter]) => {
            const label = columns.find((c) => c.id === columnId)?.label || columnId;
            const opLabel = filter.op === "eq" ? "=" : filter.op === "neq" ? "≠" : "~";
            return (
              <button
                key={columnId}
                type="button"
                onClick={() => setColumnFilter(columnId, null)}
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.primarySubtle,
                  color: theme.primaryText,
                  cursor: "pointer",
                }}
                title="Clear filter"
              >
                {label} {opLabel} {filter.value} ×
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setFilters({})}
            style={{ fontSize: "11px", border: "none", background: "transparent", color: theme.textSecondary, cursor: "pointer", textDecoration: "underline" }}
          >
            Clear filters
          </button>
        </div>
      )}

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
              <input type="checkbox" checked={visibleIds.includes(column.id)} onChange={() => toggleColumn(column.id)} />
              {column.label}
            </label>
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: Math.max(
              visibleColumns.reduce((sum, column) => sum + (widths[column.id] || column.width || 140), 0),
              640
            ),
            minWidth: "100%",
            borderCollapse: "collapse",
            fontSize: density.tableFontSize,
            tableLayout: "fixed",
          }}
        >
          <thead>
            {(() => {
              const hasGroups = visibleColumns.some((column) => Boolean(column.group));
              if (!hasGroups) {
                return null;
              }
              const spans: { label: string; span: number }[] = [];
              for (const column of visibleColumns) {
                const label = column.group || "";
                const last = spans[spans.length - 1];
                if (last && last.label === label) {
                  last.span += 1;
                } else {
                  spans.push({ label, span: 1 });
                }
              }
              return (
                <tr style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                  {spans.map((span, index) => (
                    <th
                      key={`group-${index}-${span.label || "ungrouped"}`}
                      colSpan={span.span}
                      style={{
                        padding: "4px 8px",
                        textAlign: "center",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: theme.text,
                        borderRight: index < spans.length - 1 ? `1px solid ${theme.border}` : undefined,
                      }}
                    >
                      {span.label || "\u00a0"}
                    </th>
                  ))}
                </tr>
              );
            })()}
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
                  <span
                    onMouseDown={(event) => onResizeStart(column.id, event)}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: -2,
                      width: "10px",
                      height: "100%",
                      cursor: "col-resize",
                      backgroundColor: "transparent",
                      zIndex: 2,
                    }}
                    title="Drag to resize"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSortedRows.map((row, index) => {
              const key = rowKey(row, index);
              const selected = selectable && selectedRowKey === key;
              return (
                <tr
                  key={key}
                  onClick={() => {
                    if (!selectable) {
                      return;
                    }
                    if (selected) {
                      onSelectRow?.(null, null);
                    } else {
                      onSelectRow?.(row, key);
                    }
                  }}
                  style={{
                    borderBottom: `1px solid ${theme.border}`,
                    backgroundColor: selected ? theme.primarySubtle : undefined,
                    cursor: selectable ? "pointer" : undefined,
                  }}
                >
                  {visibleColumns.map((column) => {
                    const value = displayCell(column, row);
                    const menuKey = `${key}:${column.id}`;
                    const fromHelper = column.getOpenInDynatraceId?.(row);
                    const openId = (fromHelper && String(fromHelper).trim()) || (resolveDynatraceOpenUrl(value) ? value : null);
                    return (
                      <td
                        key={column.id}
                        style={{
                          padding: density.tdPadding,
                          textAlign: column.align || "left",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          position: "relative",
                        }}
                      >
                        <span style={{ marginRight: "18px" }}>
                          {(() => {
                            const content = column.render ? column.render(row) : value;
                            const href = openId ? resolveDynatraceOpenUrl(openId) : null;
                            if (href) {
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                  style={{ color: theme.primaryText, textDecoration: "underline" }}
                                  title="Open in Dynatrace"
                                >
                                  {content}
                                </a>
                              );
                            }
                            return content;
                          })()}
                        </span>
                        <button
                          type="button"
                          aria-label={`Actions for ${column.label}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setOpenMenu({
                              key: menuKey,
                              columnId: column.id,
                              label: column.label,
                              value,
                              openId,
                              x: Math.min(rect.left, window.innerWidth - 280),
                              y: rect.bottom + 4,
                            });
                          }}
                          style={{
                            position: "absolute",
                            right: "2px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            border: "none",
                            background: "transparent",
                            color: theme.textSecondary,
                            cursor: "pointer",
                            fontSize: "14px",
                            lineHeight: 1,
                            padding: "2px 4px",
                          }}
                        >
                          ⋮
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: openMenu.y,
            left: openMenu.x,
            zIndex: 1000,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            padding: "4px 0",
            minWidth: "260px",
            fontSize: "13px",
          }}
        >
          <button
            type="button"
            style={menuItemStyle}
            onClick={() => {
              void navigator.clipboard?.writeText(openMenu.value);
              setOpenMenu(null);
            }}
          >
            Copy
          </button>
          {openUrl && (
            <button
              type="button"
              style={menuItemStyle}
              onClick={() => {
                openInDynatrace(openMenu.openId);
                setOpenMenu(null);
              }}
            >
              Open in Dynatrace
            </button>
          )}
          <div style={{ padding: "6px 12px 2px", fontSize: "11px", fontWeight: 700, color: theme.textSecondary }}>FILTER</div>
          <button
            type="button"
            style={menuItemStyle}
            onClick={() => {
              setColumnFilter(openMenu.columnId, { op: "eq", value: openMenu.value });
              setOpenMenu(null);
            }}
          >
            Filter by: <span style={{ color: theme.primaryText }}>{openMenu.label} = {openMenu.value}</span>
          </button>
          <button
            type="button"
            style={menuItemStyle}
            onClick={() => {
              setColumnFilter(openMenu.columnId, { op: "neq", value: openMenu.value });
              setOpenMenu(null);
            }}
          >
            Exclude: <span style={{ color: theme.primaryText }}>{openMenu.label} ≠ {openMenu.value}</span>
          </button>
        </div>
      )}
    </div>
  );
}
