import React from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useNavigate, useParams } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useMappingConfig } from "@hooks/useMappingConfig";
import { type MappingConfig, type LookupSourceConfig, type ApplicationVariableConfig } from "@utils/documentStore";

interface GenericRow {
  [key: string]: unknown;
}

interface InventoryRow {
  app_id?: string;
  app_name?: string;
  owner?: string;
  tier?: string;
  classification?: string;
}

interface MetricRecord {
  total_applications?: number;
  apps_in_dynatrace?: number;
  signal_health_pct?: number;
}

function sanitizeColumnName(value: string): string {
  return value.replace(/`/g, "").trim();
}

function sanitizeExpression(value: string): string {
  return value.replace(/[\n\r]/g, " ").trim();
}

function toLookupPath(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("/lookups/")) {
    return trimmed;
  }
  if (trimmed.startsWith("lookups/")) {
    return `/${trimmed}`;
  }
  return `/lookups/${trimmed}`;
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

function quoteLookupColumn(column: string): string {
  return `\`${sanitizeColumnName(column)}\``;
}

function buildFrontendApplicationsDataset(dynatraceApplicationIdFieldPath: string): string {
  const expression = sanitizeExpression(dynatraceApplicationIdFieldPath);
  return `fetch dt.entity.application
| fieldsAdd dynatrace_app_id = toString(${expression}), dynatrace_app_name = toString(entity.name)
| filter isNotNull(dynatrace_app_id)
| dedup dynatrace_app_id`;
}

function buildCmdbApplicationsDataset(lookupPath: string, variables: ApplicationVariableConfig): string {
  return `load "${lookupPath}"
| fieldsAdd cmdb_app_id = toString(${quoteLookupColumn(variables.cmdbApplicationIdColumn)}), cmdb_app_name = toString(${quoteLookupColumn(variables.cmdbApplicationNameColumn)}), cmdb_owner = toString(${quoteLookupColumn(variables.cmdbOwnerColumn)}), cmdb_tier = toString(${quoteLookupColumn(variables.cmdbTierColumn)})
| filter isNotNull(cmdb_app_id)
| dedup cmdb_app_id`;
}

function buildTotalApplicationsQuery(lookupPath: string, variables: ApplicationVariableConfig): string {
  return `load "${lookupPath}"
| fieldsAdd cmdb_app_id = toString(${quoteLookupColumn(variables.cmdbApplicationIdColumn)})
| filter isNotNull(cmdb_app_id)
| summarize total_applications = countDistinct(cmdb_app_id)`;
}

function buildAppsInDynatraceQuery(lookupPath: string, variables: ApplicationVariableConfig): string {
  return `${buildCmdbApplicationsDataset(lookupPath, variables)}
| lookup [
${buildFrontendApplicationsDataset(variables.dynatraceApplicationIdFieldPath)}
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id}
| fieldsAdd in_dynatrace = if(isNotNull(dynatrace_app_id), then:1, else:0)
| summarize apps_in_dynatrace = sum(in_dynatrace)`;
}

function buildSignalHealthQuery(lookupPath: string, variables: ApplicationVariableConfig): string {
  return `${buildCmdbApplicationsDataset(lookupPath, variables)}
| lookup [
${buildFrontendApplicationsDataset(variables.dynatraceApplicationIdFieldPath)}
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id}
| fieldsAdd in_dynatrace = if(isNotNull(dynatrace_app_id), then:1, else:0)
| summarize total_applications = countDistinct(cmdb_app_id), apps_in_dynatrace = sum(in_dynatrace)
| fieldsAdd signal_health_pct = if(total_applications == 0, then:0, else:round(100.0 * apps_in_dynatrace / total_applications))`;
}

function buildApplicationInventoryQuery(lookupPath: string, variables: ApplicationVariableConfig): string {
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables);
  const frontendDataset = buildFrontendApplicationsDataset(variables.dynatraceApplicationIdFieldPath);

  return `${cmdbDataset}
| lookup [
${frontendDataset}
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id, dynatrace_app_name}
| fieldsAdd app_id = cmdb_app_id, app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:dynatrace_app_name), owner = cmdb_owner, tier = cmdb_tier, classification = if(isNotNull(dynatrace_app_id), then:"In both", else:"CMDB only")
| fields app_id, app_name, owner, tier, classification
| append [
${frontendDataset}
| lookup [
${cmdbDataset}
], sourceField:dynatrace_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_id}
| filter isNull(cmdb_app_id)
| fieldsAdd app_id = dynatrace_app_id, app_name = dynatrace_app_name, owner = "", tier = "", classification = "Dynatrace only"
| fields app_id, app_name, owner, tier, classification
]
| sort classification asc, app_name asc
| limit 500`;
}

function readMetricValue(data: unknown, field: keyof MetricRecord): number {
  const record = (data as { records?: MetricRecord[] } | undefined)?.records?.[0];
  const value = record?.[field];
  return typeof value === "number" ? value : 0;
}

function hasApplicationVariableConfig(variables: ApplicationVariableConfig | undefined): variables is ApplicationVariableConfig {
  if (!variables) {
    return false;
  }

  return Boolean(
    variables.cmdbVariableSourceId?.trim() &&
    variables.dynatraceApplicationIdFieldPath?.trim() &&
      variables.cmdbApplicationIdColumn?.trim() &&
      variables.cmdbApplicationNameColumn?.trim() &&
      variables.cmdbOwnerColumn?.trim() &&
      variables.cmdbTierColumn?.trim()
  );
}

function WidgetCard({
  title,
  subtitle,
  query,
  isLoading,
  error,
  children,
}: {
  title: string;
  subtitle?: string;
  query: string;
  isLoading: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: "8px", padding: "16px", backgroundColor: "#fff" }}>
      <div style={{ marginBottom: "10px" }}>
        <Heading level={2} style={{ margin: 0, fontSize: "18px" }}>{title}</Heading>
        {subtitle && <Paragraph style={{ marginTop: "6px", color: "#666" }}>{subtitle}</Paragraph>}
      </div>

      {isLoading && <Paragraph style={{ color: "#666" }}>Loading...</Paragraph>}

      {!isLoading && Boolean(error) && (
        <div style={{ backgroundColor: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "6px", padding: "10px" }}>
          <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: "#c0392b" }}>Widget query failed</p>
          <p style={{ margin: 0, fontSize: "12px", color: "#666" }}>{typeof error === "string" ? error : String(error)}</p>
        </div>
      )}

      {!isLoading && !error && children}

      <details style={{ marginTop: "10px" }}>
        <summary style={{ fontSize: "12px", color: "#888", cursor: "pointer" }}>Query details</summary>
        <pre
          style={{
            marginTop: "8px",
            padding: "10px",
            backgroundColor: "#f9f9f9",
            borderRadius: "4px",
            fontSize: "11px",
            overflowX: "auto",
          }}
        >
          {query}
        </pre>
      </details>
    </div>
  );
}

function SourceDetailView({ config, source }: { config: MappingConfig; source: LookupSourceConfig }) {
  const navigate = useNavigate();
  const query = React.useMemo(() => {
    const lookupPath = toLookupPath(source.lookupTableName);
    return `load "${lookupPath}"\n| limit 200`;
  }, [source]);
  const { data, isLoading, error } = useDql({ query });

  if (isLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>{source.label}</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#666" }}>Loading records...</Paragraph>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>{source.label}</Heading>
        <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#c0392b" }}>Error loading data</p>
          <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>{typeof error === "string" ? error : String(error)}</p>
        </div>
        <details style={{ marginTop: "12px" }}>
          <summary style={{ fontSize: "13px", color: "#888", cursor: "pointer" }}>Query details</summary>
          <pre style={{ marginTop: "8px", padding: "12px", backgroundColor: "#f9f9f9", borderRadius: "4px", fontSize: "12px", overflowX: "auto" }}>{query}</pre>
        </details>
      </div>
    );
  }

  const rows: GenericRow[] = ((data?.records || []) as GenericRow[]).slice().sort((left, right) => {
    const uniqueField = source.fields.find((field) => field.id === "uniqueApplicationId");
    const sourceColumn = sanitizeColumnName(uniqueField?.sourceColumn || "");
    if (!sourceColumn) {
      return 0;
    }

    const leftValue = left[sourceColumn] === undefined || left[sourceColumn] === null ? "" : String(left[sourceColumn]);
    const rightValue = right[sourceColumn] === undefined || right[sourceColumn] === null ? "" : String(right[sourceColumn]);
    return leftValue.localeCompare(rightValue);
  });

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
        <Button onClick={() => navigate("/overview")} variant="default">Application Dashboard</Button>
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
                    const columnKey = sanitizeColumnName(field.sourceColumn);
                    const rawValue = columnKey ? row[columnKey] : undefined;
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
}

function DashboardView({ config }: { config: MappingConfig }) {
  const navigate = useNavigate();
  const defaultSource = config.sources.find((source) => source.sourceId === config.defaultSourceId) || config.sources[0];
  const variables = config.applicationVariables;
  const cmdbVariableSource =
    variables?.cmdbVariableSourceId
      ? config.sources.find((source) => source.sourceId === variables.cmdbVariableSourceId)
      : undefined;
  const activeCmdbSource = cmdbVariableSource || defaultSource;

  const hasSource = Boolean(activeCmdbSource);
  const hasVariables = hasApplicationVariableConfig(variables);
  const lookupPath = hasSource ? toLookupPath(activeCmdbSource.lookupTableName) : "";

  const totalApplicationsQuery = hasSource && hasVariables ? buildTotalApplicationsQuery(lookupPath, variables) : "";
  const appsInDynatraceQuery = hasSource && hasVariables ? buildAppsInDynatraceQuery(lookupPath, variables) : "";
  const signalHealthQuery = hasSource && hasVariables ? buildSignalHealthQuery(lookupPath, variables) : "";
  const inventoryQuery = hasSource && hasVariables ? buildApplicationInventoryQuery(lookupPath, variables) : "";

  const totalApplicationsResult = useDql({ query: totalApplicationsQuery });
  const appsInDynatraceResult = useDql({ query: appsInDynatraceQuery });
  const signalHealthResult = useDql({ query: signalHealthQuery });
  const inventoryResult = useDql({ query: inventoryQuery });

  const totalApplications = readMetricValue(totalApplicationsResult.data, "total_applications");
  const appsInDynatrace = readMetricValue(appsInDynatraceResult.data, "apps_in_dynatrace");
  const signalHealth = readMetricValue(signalHealthResult.data, "signal_health_pct");
  const inventoryRows = (inventoryResult.data?.records || []) as InventoryRow[];

  if (!hasSource) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Application Dashboard</Heading>
        <Paragraph>No source is configured yet.</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="emphasized">Configure Sources</Button>
      </div>
    );
  }

  if (!hasVariables) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Application Dashboard</Heading>
        <Paragraph style={{ color: "#c0392b" }}>
          Application join variables are incomplete. Set the Dynatrace Application ID field path and CMDB columns in setup.
        </Paragraph>
        <div style={{ marginTop: "10px" }}>
          <Button onClick={() => navigate("/setup")} variant="emphasized">Open Setup</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1260px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <div>
          <Heading level={1} style={{ margin: 0 }}>Application Dashboard</Heading>
          <Paragraph style={{ marginTop: "8px", color: "#555" }}>
            Variable-driven DQL view joining Dynatrace application telemetry to CMDB context from lookup mappings.
          </Paragraph>
          <Paragraph style={{ marginTop: "4px", color: "#777" }}>
            CMDB variable source: <code>{activeCmdbSource.lookupTableName}</code>
          </Paragraph>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={() => navigate("/summary")} variant="default">Back to Summary</Button>
          <Button onClick={() => navigate("/setup")} variant="default">Reconfigure</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>
        <WidgetCard
          title="Total Applications"
          subtitle="CMDB applications from lookup"
          query={totalApplicationsQuery}
          isLoading={totalApplicationsResult.isLoading}
          error={totalApplicationsResult.error}
        >
          <div style={{ fontSize: "38px", fontWeight: 700, color: "#2e3a63" }}>{totalApplications}</div>
        </WidgetCard>

        <WidgetCard
          title="Apps in Dynatrace"
          subtitle="Matched via configured Application ID field"
          query={appsInDynatraceQuery}
          isLoading={appsInDynatraceResult.isLoading}
          error={appsInDynatraceResult.error}
        >
          <div style={{ fontSize: "38px", fontWeight: 700, color: "#2e3a63" }}>{appsInDynatrace}</div>
        </WidgetCard>

        <WidgetCard
          title="Signal Health"
          subtitle="Coverage % = Apps in Dynatrace / Total Applications"
          query={signalHealthQuery}
          isLoading={signalHealthResult.isLoading}
          error={signalHealthResult.error}
        >
          <div style={{ fontSize: "38px", fontWeight: 700, color: signalHealth >= 90 ? "#1f7a1f" : signalHealth >= 60 ? "#9a6a00" : "#c0392b" }}>
            {signalHealth}%
          </div>
        </WidgetCard>
      </div>

      <WidgetCard
        title="Application Inventory"
        subtitle="CMDB and Dynatrace union with classification"
        query={inventoryQuery}
        isLoading={inventoryResult.isLoading}
        error={inventoryResult.error}
      >
        {inventoryRows.length === 0 ? (
          <Paragraph style={{ color: "#777" }}>No inventory rows returned by current mappings.</Paragraph>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e0e0e0", backgroundColor: "#fafafa" }}>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: "#666" }}>Application ID</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: "#666" }}>Application Name</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: "#666" }}>Owner</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: "#666" }}>Tier</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: "#666" }}>Classification</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((row, index) => (
                  <tr key={`${row.app_id || "row"}-${index}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px" }}>{row.app_id || "-"}</td>
                    <td style={{ padding: "10px" }}>{row.app_name || "-"}</td>
                    <td style={{ padding: "10px" }}>{row.owner || "-"}</td>
                    <td style={{ padding: "10px" }}>{row.tier || "-"}</td>
                    <td style={{ padding: "10px" }}>
                      {renderField("pill", row.classification || "-")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}

export const Overview: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ sourceId: string }>();
  const { config, isLoading: configLoading, error: configError } = useMappingConfig();

  if (configLoading) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Loading Dashboard</Heading>
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

  if (!config) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Dashboard Unavailable</Heading>
        <Paragraph>Configure the app first.</Paragraph>
        <Button onClick={() => navigate("/setup")} variant="emphasized">Go to Setup</Button>
      </div>
    );
  }

  if (params.sourceId) {
    const source = config.sources.find((item) => item.sourceId === params.sourceId);
    if (!source) {
      return (
        <div style={{ padding: "32px" }}>
          <Heading level={1}>Unknown Source</Heading>
          <Paragraph>Choose a valid source from the summary page.</Paragraph>
          <Button onClick={() => navigate("/summary")} variant="default">Back to Summary</Button>
        </div>
      );
    }

    return <SourceDetailView config={config} source={source} />;
  }

  return <DashboardView config={config} />;
};

export default Overview;
