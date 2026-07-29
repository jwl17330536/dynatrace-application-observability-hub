import React from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useNavigate, useParams } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useMappingConfig } from "@hooks/useMappingConfig";

interface GenericRow {
  [key: string]: string | number | undefined;
}

function renderField(format: "text" | "badge" | "pill" | undefined, value: string): React.ReactNode {
  if (!value) {
    return "-";
  }

  if (format === "badge") {
    return (
      <code
        style={{
          display: "inline-block",
          padding: "2px 8px",
          backgroundColor: "#f5f5f5",
          border: "1px solid #ddd",
          borderRadius: "3px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.05em",
          color: "#333",
        }}
      >
        {value}
      </code>
    );
  }

  if (format === "pill") {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 600,
          border: "1px solid #d7d7d7",
          backgroundColor: "#f7f7f7",
          color: "#555",
        }}
      >
        {value}
      </span>
    );
  }

  return value;
}

export const Overview: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ sourceId: string }>();
  const { config, isLoading: configLoading, error: configError } = useMappingConfig();

  const source = React.useMemo(() => {
    if (!config) {
      return undefined;
    }
    const requestedId = params.sourceId || config.defaultSourceId;
    return config.sources.find((item) => item.sourceId === requestedId);
  }, [config, params.sourceId]);

  const query = React.useMemo(() => {
    if (!source) {
      return "";
    }

    const fields = source.fields.filter((field) => field.sourceColumn.trim());
    const projections = fields
      .map((field) => `    ${field.id} = this["${field.sourceColumn}"]`)
      .join(",\n");

    const hasAppName = fields.some((field) => field.id === "applicationName");
    const sortKey = hasAppName ? "applicationName" : "uniqueApplicationId";

    return `fetch data from table "${source.lookupTableName}"
| fields
${projections}
| sort by ${sortKey} asc`;
  }, [source]);

  const { data, isLoading: queryLoading, error: queryError } = useDql({ query: query || "" });

  if (configLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Loading Source</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#666" }}>Loading configuration...</Paragraph>
      </div>
    );
  }

  if (configError) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Configuration Error</Heading>
        <Paragraph style={{ color: "#c0392b" }}>{configError}</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="default">Go to Setup</Button>
      </div>
    );
  }

  if (!config || !source) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Unknown Source</Heading>
        <Paragraph>Choose a valid source from the summary page.</Paragraph>
        <Button onClick={() => navigate("/summary")} variant="default">Back to Summary</Button>
      </div>
    );
  }

  if (queryLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>{source.label}</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#666" }}>Loading records...</Paragraph>
      </div>
    );
  }

  if (queryError) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>{source.label}</Heading>
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            backgroundColor: "#fff0f0",
            border: "1px solid #f5c6c6",
            borderRadius: "6px",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#c0392b" }}>Error loading data</p>
          <p style={{ margin: "0", fontSize: "13px", color: "#666" }}>
            {typeof queryError === "string" ? queryError : String(queryError)}
          </p>
        </div>
        <details style={{ marginTop: "12px" }}>
          <summary style={{ fontSize: "13px", color: "#888", cursor: "pointer" }}>Query details</summary>
          <pre
            style={{
              marginTop: "8px",
              padding: "12px",
              backgroundColor: "#f9f9f9",
              borderRadius: "4px",
              fontSize: "12px",
              overflowX: "auto",
            }}
          >
            {query}
          </pre>
        </details>
        <div style={{ marginTop: "16px" }}>
          <Button onClick={() => navigate("/summary")} variant="default">Back to Summary</Button>
        </div>
      </div>
    );
  }

  const rows: GenericRow[] = (data?.records || []) as GenericRow[];

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        {config.sources.map((item) => (
          <Button
            key={item.sourceId}
            onClick={() => navigate(`/overview/${item.sourceId}`)}
            variant={item.sourceId === source.sourceId ? "emphasized" : "default"}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <Heading level={1} style={{ margin: 0 }}>{source.label}</Heading>
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#888" }}>
            {rows.length} record{rows.length !== 1 ? "s" : ""} · source: <code>{source.lookupTableName}</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={() => navigate("/summary")} variant="default">Back to Summary</Button>
          <Button onClick={() => navigate("/setup")} variant="default">Reconfigure</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", backgroundColor: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#555" }}>No records found</p>
          <p style={{ margin: 0, fontSize: "13px", color: "#888" }}>
            The lookup table <code>{source.lookupTableName}</code> returned no records.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e0e0e0", backgroundColor: "#fafafa" }}>
                {source.fields.map((field) => (
                  <th
                    key={field.id}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#666",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {field.label}
                  </th>
                ))}
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
                  {source.fields.map((field) => {
                    const rawValue = row[field.id];
                    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
                    return (
                      <td key={field.id} style={{ padding: "12px 16px", color: "#555", verticalAlign: "middle" }}>
                        {renderField(field.format, value)}
                      </td>
                    );
                  })}
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
