import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  fetchConfigFromDocumentStore,
  getDefaultApplicationVariables,
  saveConfig,
  validateConfig,
  type ApplicationVariableConfig,
  type LookupSourceConfig,
  type MappingConfig,
  type LookupFieldConfig,
} from "@utils/documentStore";

interface PreviewRequest {
  query: string;
  runId: number;
}

interface SetupState {
  sources: LookupSourceConfig[];
  defaultSourceId: string;
  applicationVariables: ApplicationVariableConfig;
  isInitializing: boolean;
  isSaving: boolean;
  error: string | null;
  previewBySource: Record<string, PreviewRequest>;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  boxSizing: "border-box",
  border: "1px solid #ccc",
  borderRadius: "4px",
  fontSize: "14px",
  fontFamily: "monospace",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginBottom: "6px",
  fontSize: "13px",
  color: "#333",
};

const hintStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#888",
  marginTop: "4px",
  display: "block",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";
}

function sanitizeColumnName(value: string): string {
  return value.replace(/`/g, "").trim();
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

function createDefaultFields(uniqueRequired: boolean): LookupFieldConfig[] {
  return [
    {
      id: "uniqueApplicationId",
      label: "Unique Application ID",
      sourceColumn: "",
      required: uniqueRequired,
      format: "badge",
    },
  ];
}

function createSource(label: string, tableName: string, uniqueRequired: boolean): LookupSourceConfig {
  return {
    sourceId: slugify(label || tableName || "source"),
    label,
    lookupTableName: tableName,
    fields: createDefaultFields(uniqueRequired),
  };
}

function createCustomField(): LookupFieldConfig {
  const id = `custom-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    label: "Custom Field",
    sourceColumn: "",
    format: "text",
  };
}

function buildPreviewQuery(source: LookupSourceConfig, limit = 1): string {
  const lookupPath = toLookupPath(source.lookupTableName);
  return `load "${lookupPath}"\n| limit ${limit}`;
}

const DEFAULT_LOOKUP_TABLE_NAME = "cmdb_businessapp";
const DEFAULT_SOURCE = createSource("Primary Applications", DEFAULT_LOOKUP_TABLE_NAME, true);

function SourcePreview({ request, source }: { request: PreviewRequest; source: LookupSourceConfig }) {
  const { data, isLoading, error } = useDql({ query: request.query });
  const firstRecord = (data?.records?.[0] || {}) as Record<string, unknown>;
  const availableColumns = Object.keys(firstRecord);
  const configuredColumns = source.fields
    .map((field) => sanitizeColumnName(field.sourceColumn))
    .filter((name): name is string => Boolean(name));
  const missingColumns = configuredColumns.filter((name) => !availableColumns.includes(name));

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px",
        backgroundColor: "#fafafa",
        border: "1px solid #e5e5e5",
        borderRadius: "6px",
      }}
    >
      <div style={{ fontSize: "12px", color: "#555", marginBottom: "8px", fontWeight: 600 }}>
        Preview Query (limit 1)
      </div>
      <pre
        style={{
          margin: "0 0 10px 0",
          padding: "10px",
          backgroundColor: "#fff",
          border: "1px solid #eee",
          borderRadius: "4px",
          fontSize: "12px",
          overflowX: "auto",
        }}
      >
        {request.query}
      </pre>

      {isLoading && <div style={{ fontSize: "13px", color: "#666" }}>Loading preview...</div>}

      {error && (
        <div style={{ fontSize: "13px", color: "#c0392b" }}>
          Preview error: {typeof error === "string" ? error : String(error)}
        </div>
      )}

      {!isLoading && !error && (
        <div>
          {configuredColumns.length > 0 && (
            <div style={{ marginBottom: "10px", fontSize: "12px" }}>
              {missingColumns.length === 0 ? (
                <span style={{ color: "#1f7a1f" }}>All configured columns were found in the preview row.</span>
              ) : (
                <span style={{ color: "#c0392b" }}>
                  Missing columns in preview row: {missingColumns.join(", ")}
                </span>
              )}
            </div>
          )}

          <pre
            style={{
              margin: 0,
              padding: "10px",
              backgroundColor: "#fff",
              border: "1px solid #eee",
              borderRadius: "4px",
              fontSize: "12px",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(firstRecord, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [previewRunCounter, setPreviewRunCounter] = useState(0);
  const [state, setState] = useState<SetupState>({
    sources: [DEFAULT_SOURCE],
    defaultSourceId: DEFAULT_SOURCE.sourceId,
    applicationVariables: getDefaultApplicationVariables(),
    isInitializing: true,
    isSaving: false,
    error: null,
    previewBySource: {},
  });

  useEffect(() => {
    let alive = true;

    const loadSavedConfig = async () => {
      try {
        const existing = await fetchConfigFromDocumentStore();
        if (!alive) {
          return;
        }

        if (existing) {
          setState((prev) => ({
            ...prev,
            sources: Array.isArray(existing.sources) && existing.sources.length > 0 ? existing.sources : [DEFAULT_SOURCE],
            defaultSourceId: existing.defaultSourceId || DEFAULT_SOURCE.sourceId,
            applicationVariables: {
              ...getDefaultApplicationVariables(),
              ...(existing.applicationVariables || {}),
            },
            isInitializing: false,
            error: null,
          }));
          return;
        }

        setState((prev) => ({ ...prev, isInitializing: false }));
      } catch (err) {
        if (!alive) {
          return;
        }
        setState((prev) => ({
          ...prev,
          isInitializing: false,
          error: `Failed to load existing configuration: ${err}`,
        }));
      }
    };

    loadSavedConfig();

    return () => {
      alive = false;
    };
  }, []);

  const setSource = (sourceId: string, updater: (source: LookupSourceConfig) => LookupSourceConfig) => {
    setState((prev) => ({
      ...prev,
      error: null,
      sources: prev.sources.map((source) => (source.sourceId === sourceId ? updater(source) : source)),
    }));
  };

  const setField = (sourceId: string, fieldId: string, patch: Partial<LookupFieldConfig>) => {
    setSource(sourceId, (source) => ({
      ...source,
      fields: source.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }));
  };

  const setApplicationVariable = (key: keyof ApplicationVariableConfig, value: string) => {
    setState((prev) => ({
      ...prev,
      error: null,
      applicationVariables: {
        ...prev.applicationVariables,
        [key]: value,
      },
    }));
  };

  const addSource = () => {
    const index = state.sources.length + 1;
    const source = createSource(`Source ${index}`, `lookup_table_${index}`, false);
    setState((prev) => ({
      ...prev,
      error: null,
      sources: [...prev.sources, source],
    }));
  };

  const removeSource = (sourceId: string) => {
    setState((prev) => {
      if (prev.sources.length === 1) {
        return { ...prev, error: "At least one source is required." };
      }

      const nextSources = prev.sources.filter((source) => source.sourceId !== sourceId);
      const nextDefault = prev.defaultSourceId === sourceId ? nextSources[0].sourceId : prev.defaultSourceId;
      const nextPreviewBySource = { ...prev.previewBySource };
      delete nextPreviewBySource[sourceId];

      return {
        ...prev,
        error: null,
        sources: nextSources,
        defaultSourceId: nextDefault,
        previewBySource: nextPreviewBySource,
      };
    });
  };

  const addField = (sourceId: string) => {
    setSource(sourceId, (source) => ({
      ...source,
      fields: [...source.fields, createCustomField()],
    }));
  };

  const removeField = (sourceId: string, fieldId: string) => {
    setSource(sourceId, (source) => {
      const field = source.fields.find((item) => item.id === fieldId);
      if (field?.required) {
        return source;
      }
      return {
        ...source,
        fields: source.fields.filter((item) => item.id !== fieldId),
      };
    });
  };

  const updateSourceIdentity = (sourceId: string, nextLabel: string, nextTable: string) => {
    setState((prev) => ({
      ...prev,
      error: null,
      sources: prev.sources.map((source) =>
        source.sourceId === sourceId
          ? {
              ...source,
              label: nextLabel,
              lookupTableName: nextTable,
            }
          : source
      ),
    }));
  };

  const runPreview = (source: LookupSourceConfig) => {
    const query = buildPreviewQuery(source, 1);
    setPreviewRunCounter((prev) => prev + 1);
    setState((prev) => ({
      ...prev,
      previewBySource: {
        ...prev.previewBySource,
        [source.sourceId]: {
          query,
          runId: previewRunCounter + 1,
        },
      },
    }));
  };

  const handleSave = async () => {
    setState((prev) => ({ ...prev, isSaving: true, error: null }));

    try {
      const config: MappingConfig = {
        mode: "lookup",
        defaultSourceId: state.defaultSourceId,
        sources: state.sources,
        applicationVariables: state.applicationVariables,
      };

      const validation = validateConfig(config);
      if (!validation.valid) {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          error: validation.errors?.join(" ") || "Invalid configuration",
        }));
        return;
      }

      await saveConfig(config);
      navigate("/summary");
    } catch (err) {
      setState((prev) => ({ ...prev, isSaving: false, error: `Failed to save: ${err}` }));
    }
  };

  const resetDefaults = () => {
    // Keep the existing default table name for backward compatibility.
    const source = createSource("Primary Applications", DEFAULT_LOOKUP_TABLE_NAME, true);
    setState((prev) => ({
      ...prev,
      sources: [source],
      defaultSourceId: source.sourceId,
      applicationVariables: getDefaultApplicationVariables(),
      isSaving: false,
      error: null,
      previewBySource: {},
    }));
  };

  if (state.isInitializing) {
    return (
      <div style={{ maxWidth: "540px", margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <Heading level={1}>Loading Configuration</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#555" }}>Restoring your last saved lookup setup...</Paragraph>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "40px 24px" }}>
      <Heading level={1}>Application Observability Hub</Heading>
      <Paragraph style={{ marginTop: "8px", color: "#555" }}>
        Configure one or more Dynatrace lookup tables. The Unique Application ID mapping is required only once across all sources.
        Add custom fields as needed, then run Load Preview to verify columns before saving. You can use any lookup table name;
        the default is cmdb_businessapp for compatibility with existing deployments.
      </Paragraph>

      <div style={{ marginTop: "20px", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "18px" }}>
        <Heading level={2} style={{ marginTop: 0, marginBottom: "8px" }}>Application Join Variables</Heading>
        <Paragraph style={{ margin: "0 0 14px 0", color: "#666" }}>
          These variables drive DQL joins between Dynatrace data and your CMDB lookup rows. Set them to customer-specific field names.
        </Paragraph>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Dynatrace Application ID Field Path</label>
            <input
              style={inputStyle}
              value={state.applicationVariables.dynatraceApplicationIdFieldPath}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("dynatraceApplicationIdFieldPath", event.target.value)}
              placeholder="example: dt.cost.product"
            />
            <span style={hintStyle}>User-defined DQL field path used to read Application ID from Dynatrace entities.</span>
          </div>
          <div>
            <label style={labelStyle}>CMDB Application ID Column</label>
            <input
              style={inputStyle}
              value={state.applicationVariables.cmdbApplicationIdColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbApplicationIdColumn", event.target.value)}
              placeholder="example: cmdb_ci_key"
            />
          </div>
          <div>
            <label style={labelStyle}>CMDB Application Name Column</label>
            <input
              style={inputStyle}
              value={state.applicationVariables.cmdbApplicationNameColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbApplicationNameColumn", event.target.value)}
              placeholder="example: name"
            />
          </div>
          <div>
            <label style={labelStyle}>CMDB Owner Column</label>
            <input
              style={inputStyle}
              value={state.applicationVariables.cmdbOwnerColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbOwnerColumn", event.target.value)}
              placeholder="example: owned_by"
            />
          </div>
          <div>
            <label style={labelStyle}>CMDB Tier Column</label>
            <input
              style={inputStyle}
              value={state.applicationVariables.cmdbTierColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbTierColumn", event.target.value)}
              placeholder="example: business_criticality"
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
        <Button variant="emphasized" onClick={addSource} disabled={state.isSaving}>
          Add Another Source
        </Button>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gap: "18px" }}>
        {state.sources.map((source, index) => (
          <div key={source.sourceId} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <Heading level={2} style={{ margin: 0 }}>Source {index + 1}</Heading>
              <Button
                variant="default"
                disabled={state.isSaving || state.sources.length === 1}
                onClick={() => removeSource(source.sourceId)}
              >
                Remove Source
              </Button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Source Label</label>
                <input
                  style={inputStyle}
                  value={source.label}
                  disabled={state.isSaving}
                  onChange={(event) => updateSourceIdentity(source.sourceId, event.target.value, source.lookupTableName)}
                />
              </div>
              <div>
                <label style={labelStyle}>Lookup Table Name</label>
                <input
                  style={inputStyle}
                  value={source.lookupTableName}
                  disabled={state.isSaving}
                  onChange={(event) => updateSourceIdentity(source.sourceId, source.label, event.target.value)}
                />
                <span style={hintStyle}>Use any lookup table name (for example: cmdb_businessapp or app_inventory).</span>
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="radio"
                  checked={state.defaultSourceId === source.sourceId}
                  onChange={() => setState((prev) => ({ ...prev, defaultSourceId: source.sourceId, error: null }))}
                  disabled={state.isSaving}
                />
                Use as default source
              </label>
            </div>

            <div style={{ marginTop: "16px" }}>
              <Heading level={3} style={{ marginTop: 0, marginBottom: "10px" }}>Field Mappings</Heading>
              <div style={{ display: "grid", gap: "10px" }}>
                {source.fields.map((field) => (
                  <div key={field.id} style={{ border: "1px solid #eee", borderRadius: "6px", padding: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: "10px", alignItems: "end" }}>
                      <div>
                        <label style={labelStyle}>Field Label</label>
                        <input
                          style={inputStyle}
                          value={field.label}
                          disabled={state.isSaving || field.required}
                          onChange={(event) => setField(source.sourceId, field.id, { label: event.target.value })}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Source Column</label>
                        <input
                          style={inputStyle}
                          value={field.sourceColumn}
                          disabled={state.isSaving}
                          onChange={(event) => setField(source.sourceId, field.id, { sourceColumn: event.target.value })}
                          placeholder="column_name"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Format</label>
                        <select
                          style={{ ...inputStyle, fontFamily: "inherit" }}
                          value={field.format || "text"}
                          disabled={state.isSaving}
                          onChange={(event) =>
                            setField(source.sourceId, field.id, {
                              format: event.target.value as "text" | "badge" | "pill",
                            })
                          }
                        >
                          <option value="text">text</option>
                          <option value="badge">badge</option>
                          <option value="pill">pill</option>
                        </select>
                      </div>
                      <div>
                        <Button
                          variant="default"
                          disabled={state.isSaving || field.required}
                          onClick={() => removeField(source.sourceId, field.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    {field.id === "uniqueApplicationId" && field.required && (
                      <span style={hintStyle}>Required: map Unique Application ID in at least one source.</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                <Button variant="default" disabled={state.isSaving} onClick={() => addField(source.sourceId)}>
                  Add Custom Field
                </Button>
                <Button variant="default" disabled={state.isSaving} onClick={() => runPreview(source)}>
                  Load Preview
                </Button>
              </div>

              {state.previewBySource[source.sourceId] && (
                <SourcePreview
                  key={`${source.sourceId}-${state.previewBySource[source.sourceId].runId}`}
                  request={state.previewBySource[source.sourceId]}
                  source={source}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {state.error && (
        <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "4px" }}>
          <span style={{ color: "#c0392b", fontSize: "14px" }}>{state.error}</span>
        </div>
      )}

      <div style={{ marginTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Button variant="default" onClick={resetDefaults} disabled={state.isSaving}>
          Reset to Defaults
        </Button>
        <Button variant="emphasized" onClick={handleSave} disabled={state.isSaving}>
          {state.isSaving ? "Saving..." : "Connect & Continue ->"}
        </Button>
      </div>
    </div>
  );
};

export default Setup;
