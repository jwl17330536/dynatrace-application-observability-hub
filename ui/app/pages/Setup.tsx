import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import {
  saveConfig,
  validateConfig,
  type LookupSourceConfig,
  type MappingConfig,
  type LookupFieldConfig,
} from "@utils/documentStore";

interface SetupState {
  sources: LookupSourceConfig[];
  defaultSourceId: string;
  isLoading: boolean;
  error: string | null;
  success: boolean;
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

function createDefaultFields(): LookupFieldConfig[] {
  return [
    {
      id: "uniqueApplicationId",
      label: "Unique Application ID",
      sourceColumn: "app_id",
      required: true,
      format: "badge",
    },
    {
      id: "applicationName",
      label: "Application Name",
      sourceColumn: "app_name",
      format: "text",
    },
    {
      id: "applicationTier",
      label: "Application Tier",
      sourceColumn: "tier",
      format: "pill",
    },
    {
      id: "applicationOwner",
      label: "Application Owner",
      sourceColumn: "owner",
      format: "text",
    },
  ];
}

function createSource(label: string, tableName: string): LookupSourceConfig {
  const sourceId = slugify(label || tableName || "source");
  return {
    sourceId,
    label,
    lookupTableName: tableName,
    fields: createDefaultFields(),
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

const DEFAULT_SOURCE = createSource("Applications", "cmdb_businessapp");

export const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<SetupState>({
    sources: [DEFAULT_SOURCE],
    defaultSourceId: DEFAULT_SOURCE.sourceId,
    isLoading: false,
    error: null,
    success: false,
  });

  const setSource = (sourceId: string, updater: (source: LookupSourceConfig) => LookupSourceConfig) => {
    setState((prev) => ({
      ...prev,
      error: null,
      sources: prev.sources.map((source) => (source.sourceId === sourceId ? updater(source) : source)),
    }));
  };

  const setField = (
    sourceId: string,
    fieldId: string,
    patch: Partial<LookupFieldConfig>
  ) => {
    setSource(sourceId, (source) => ({
      ...source,
      fields: source.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }));
  };

  const addSource = () => {
    const index = state.sources.length + 1;
    const source = createSource(`Source ${index}`, `lookup_table_${index}`);
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
      return {
        ...prev,
        error: null,
        sources: nextSources,
        defaultSourceId: nextDefault,
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
      if (field?.required || fieldId === "uniqueApplicationId") {
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

  const handleSave = async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const config: MappingConfig = {
        mode: "lookup",
        defaultSourceId: state.defaultSourceId,
        sources: state.sources,
      };

      const validation = validateConfig(config);
      if (!validation.valid) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: validation.errors?.join(" ") || "Invalid configuration",
        }));
        return;
      }

      await saveConfig(config);
      setState((prev) => ({ ...prev, isLoading: false, success: true }));
      navigate("/summary");
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false, error: `Failed to save: ${err}` }));
    }
  };

  const resetDefaults = () => {
    const source = createSource("Applications", "cmdb_businessapp");
    setState({
      sources: [source],
      defaultSourceId: source.sourceId,
      isLoading: false,
      error: null,
      success: false,
    });
  };

  if (state.success) {
    return (
      <div style={{ maxWidth: "540px", margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <Heading level={1}>Configuration Saved</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#555" }}>
          Loading your configured lookup sources...
        </Paragraph>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "40px 24px" }}>
      <Heading level={1}>Application Observability Hub</Heading>
      <Paragraph style={{ marginTop: "8px", color: "#555" }}>
        Configure one or more Dynatrace lookup tables. Only the Unique Application ID mapping is mandatory.
        You can remove optional starter fields and add as many custom fields as needed.
      </Paragraph>

      <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
        <Button variant="emphasized" onClick={addSource} disabled={state.isLoading}>
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
                disabled={state.isLoading || state.sources.length === 1}
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
                  disabled={state.isLoading}
                  onChange={(event) => updateSourceIdentity(source.sourceId, event.target.value, source.lookupTableName)}
                />
              </div>
              <div>
                <label style={labelStyle}>Lookup Table Name</label>
                <input
                  style={inputStyle}
                  value={source.lookupTableName}
                  disabled={state.isLoading}
                  onChange={(event) => updateSourceIdentity(source.sourceId, source.label, event.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="radio"
                  checked={state.defaultSourceId === source.sourceId}
                  onChange={() => setState((prev) => ({ ...prev, defaultSourceId: source.sourceId, error: null }))}
                  disabled={state.isLoading}
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
                          disabled={state.isLoading || field.required}
                          onChange={(event) => setField(source.sourceId, field.id, { label: event.target.value })}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Source Column</label>
                        <input
                          style={inputStyle}
                          value={field.sourceColumn}
                          disabled={state.isLoading}
                          onChange={(event) => setField(source.sourceId, field.id, { sourceColumn: event.target.value })}
                          placeholder="column_name"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Format</label>
                        <select
                          style={{ ...inputStyle, fontFamily: "inherit" }}
                          value={field.format || "text"}
                          disabled={state.isLoading}
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
                          disabled={state.isLoading || field.required || field.id === "uniqueApplicationId"}
                          onClick={() => removeField(source.sourceId, field.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    {field.id === "uniqueApplicationId" && (
                      <span style={hintStyle}>Required: Unique Application ID is mandatory for each source.</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "10px" }}>
                <Button variant="default" disabled={state.isLoading} onClick={() => addField(source.sourceId)}>
                  Add Custom Field
                </Button>
              </div>
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
        <Button variant="default" onClick={resetDefaults} disabled={state.isLoading}>
          Reset to Defaults
        </Button>
        <Button variant="emphasized" onClick={handleSave} disabled={state.isLoading}>
          {state.isLoading ? "Saving..." : "Connect & Continue ->"}
        </Button>
      </div>
    </div>
  );
};

export default Setup;
