import React from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useNavigate } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useMappingConfig } from "@hooks/useMappingConfig";

interface CountRecord {
  count: number;
}

function SourceCount({ table }: { table: string }) {
  const query = `fetch data from table "${table}" | summarize count = count()`;
  const { data, isLoading, error } = useDql({ query });

  if (isLoading) {
    return <span style={{ color: "#666" }}>Loading...</span>;
  }
  if (error) {
    return <span style={{ color: "#c0392b" }}>Error</span>;
  }

  const count = (data?.records?.[0] as CountRecord | undefined)?.count ?? 0;
  return <span style={{ fontWeight: 700 }}>{count}</span>;
}

export const Summary: React.FC = () => {
  const navigate = useNavigate();
  const { config, isLoading, error } = useMappingConfig();

  if (isLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Lookup Summary</Heading>
        <Paragraph style={{ marginTop: "8px", color: "#666" }}>Loading configuration...</Paragraph>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Lookup Summary</Heading>
        <Paragraph style={{ color: "#c0392b" }}>Failed to load configuration: {error}</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="default">Go to Setup</Button>
      </div>
    );
  }

  if (!config || !config.sources.length) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Lookup Summary</Heading>
        <Paragraph>No lookup sources are configured yet.</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="emphasized">Configure Sources</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <Heading level={1} style={{ margin: 0 }}>Lookup Sources</Heading>
        <Paragraph style={{ marginTop: "8px", color: "#555" }}>
          Choose a source to inspect. The default source is marked and used for shared query context.
        </Paragraph>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
        {config.sources.map((source) => {
          const isDefault = source.sourceId === config.defaultSourceId;
          return (
            <div
              key={source.sourceId}
              style={{
                border: `1px solid ${isDefault ? "#b7cffd" : "#e0e0e0"}`,
                borderRadius: "8px",
                padding: "18px",
                backgroundColor: isDefault ? "#f7faff" : "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "18px" }}>{source.label}</h3>
                <span style={{ fontSize: "12px", color: "#777" }}>
                  rows: <SourceCount table={source.lookupTableName} />
                </span>
              </div>
              <p style={{ margin: "0 0 8px 0", color: "#666", fontSize: "14px" }}>
                table: <code>{source.lookupTableName}</code>
              </p>
              <p style={{ margin: "0 0 12px 0", color: "#666", fontSize: "13px" }}>
                fields: {source.fields.length}
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                {source.fields.slice(0, 4).map((field) => (
                  <span
                    key={field.id}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "999px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      backgroundColor: "#fafafa",
                      color: "#555",
                    }}
                  >
                    {field.label}
                  </span>
                ))}
              </div>
              <Button onClick={() => navigate(`/overview/${source.sourceId}`)} variant="emphasized">
                Open {source.label}
              </Button>
              {isDefault && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#3557a2", fontWeight: 600 }}>
                  Default source
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "18px" }}>
        <Button onClick={() => navigate("/setup")} variant="default">Reconfigure Sources</Button>
      </div>
    </div>
  );
};

export default Summary;
