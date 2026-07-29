import React from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useMappingConfig } from "@hooks/useMappingConfig";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { buildQueriesForDataSource } from "@utils/queryBuilder";

interface AppRow {
  appTag?: string;
  appName?: string;
  tier?: string;
  owner?: string;
  [key: string]: string | number | undefined;
}

const BIA_STYLES: Record<string, React.CSSProperties> = {
  "Business Critical":      { backgroundColor: "#fde8e8", color: "#c0392b", borderColor: "#f5c6c6" },
  "Business Essential":     { backgroundColor: "#fef3e2", color: "#d35400", borderColor: "#fad7a0" },
  "Business Important":     { backgroundColor: "#eaf4fb", color: "#2471a3", borderColor: "#aed6f1" },
  "Non-Business Essential": { backgroundColor: "#f2f3f4", color: "#717d7e", borderColor: "#d5d8dc" },
};

const BiaPill: React.FC<{ value?: string }> = ({ value }) => {
  const label = value || "Unknown";
  const styles = BIA_STYLES[label] ?? { backgroundColor: "#f9f9f9", color: "#888", borderColor: "#ddd" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: 600,
      border: "1px solid",
      ...styles,
    }}>
      {label}
    </span>
  );
};

const CentralIdBadge: React.FC<{ value?: string }> = ({ value }) => (
  <code style={{
    display: "inline-block",
    padding: "2px 8px",
    backgroundColor: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "3px",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "#333",
  }}>
    {value || "—"}
  </code>
);

export const Overview: React.FC = () => {
  const { config, isLoading: configLoading, error: configError } = useMappingConfig();

  const query = React.useMemo(() => {
    if (!config) return null;
    try {
      return buildQueriesForDataSource(config).overview;
    } catch {
      return null;
    }
  }, [config]);

  const { data, isLoading: queryLoading, error: queryError } = useDql({ query: query || "" });

  const isLoading = configLoading || queryLoading;
  const error = configError || queryError;

  if (isLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Application Inventory</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#666" }}>Loading application records...</Paragraph>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Application Inventory</Heading>
        <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#c0392b" }}>Error loading data</p>
          <p style={{ margin: "0", fontSize: "13px", color: "#666" }}>{typeof error === "string" ? error : String(error)}</p>
        </div>
        <details style={{ marginTop: "12px" }}>
          <summary style={{ fontSize: "13px", color: "#888", cursor: "pointer" }}>Query details</summary>
          <pre style={{ marginTop: "8px", padding: "12px", backgroundColor: "#f9f9f9", borderRadius: "4px", fontSize: "12px", overflowX: "auto" }}>
            {`Table: ${config?.lookupTableName ?? "not configured"}\nCentralID: ${config?.fieldMappings?.appTag ?? "—"}\nAppName:   ${config?.fieldMappings?.appName ?? "—"}\nBIA:       ${config?.fieldMappings?.tier ?? "—"}\nUnitCIO:   ${config?.fieldMappings?.owner ?? "—"}\n\n${query ?? ""}`}
          </pre>
        </details>
        <div style={{ marginTop: "16px" }}>
          <Button variant="default" onClick={() => { window.location.href = "/setup"; }}>← Back to Setup</Button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Application Inventory</Heading>
        <Paragraph style={{ marginTop: "12px" }}>No configuration found.</Paragraph>
        <div style={{ marginTop: "16px" }}>
          <Button variant="emphasized" onClick={() => { window.location.href = "/setup"; }}>Configure →</Button>
        </div>
      </div>
    );
  }

  const rows: AppRow[] = (data?.records || []) as AppRow[];
  const { lookupTableName, fieldMappings } = config;

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <Heading level={1} style={{ margin: 0 }}>Application Inventory</Heading>
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#888" }}>
            {rows.length} application{rows.length !== 1 ? "s" : ""} · source: <code>{lookupTableName}</code>
          </p>
        </div>
        <Button variant="default" onClick={() => { window.location.href = "/setup"; }}>⚙ Reconfigure</Button>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", backgroundColor: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#555" }}>No applications found</p>
          <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>
            The lookup table <code>{lookupTableName}</code> returned no records. Verify the CMDB sync workflow has run.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e0e0e0", backgroundColor: "#fafafa" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#666", whiteSpace: "nowrap" }}>
                  {fieldMappings.appTag}
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#666" }}>
                  Application Name
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#666", whiteSpace: "nowrap" }}>
                  BIA
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#666", whiteSpace: "nowrap" }}>
                  Unit CIO
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa",
                  }}
                >
                  <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                    <CentralIdBadge value={row.appTag as string} />
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 500, verticalAlign: "middle" }}>
                    {row.appName || "—"}
                  </td>
                  <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                    <BiaPill value={row.tier as string} />
                  </td>
                  <td style={{ padding: "12px 16px", color: "#555", verticalAlign: "middle" }}>
                    {row.owner || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Overview;
