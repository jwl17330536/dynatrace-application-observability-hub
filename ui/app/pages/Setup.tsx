/**
 * Setup Page — CMDB Lookup Table Configuration
 * 
 * Users select which CMDB-enriched data to display:
 * - Business Applications (cmdb_businessapp lookup table)
 * - Infrastructure Servers (cmdb_server lookup table)
 * - App→Frontend RUM Mappings (cmdb_app_frontend_mapping lookup table)
 * 
 * Data flows from CMDB simulator → Dynatrace workflows → lookup tables.
 * No manual tagging required. Config saved to Document Store.
 */

import React, { useState } from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { saveConfig, MappingConfig } from "@utils/documentStore";

interface SetupForm {
  lookupTableName: string;
  centralIdColumn: string;
  appNameColumn: string;
  biaColumn: string;
  unitCioColumn: string;
}

interface SetupState {
  form: SetupForm;
  isLoading: boolean;
  error: string | null;
  success: boolean;
}

const DEFAULTS: SetupForm = {
  lookupTableName: "cmdb_businessapp",
  centralIdColumn: "CentralID",
  appNameColumn: "AppName",
  biaColumn: "BIA",
  unitCioColumn: "UnitCIO",
};

const fieldStyle: React.CSSProperties = {
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

export const Setup: React.FC = () => {
  const [state, setState] = useState<SetupState>({
    form: { ...DEFAULTS },
    isLoading: false,
    error: null,
    success: false,
  });

  const setField = (field: keyof SetupForm, value: string) => {
    setState((prev) => ({
      ...prev,
      form: { ...prev.form, [field]: value },
      error: null,
    }));
  };

  const handleSave = async () => {
    const { lookupTableName, centralIdColumn, appNameColumn, biaColumn, unitCioColumn } = state.form;

    if (!lookupTableName.trim()) {
      setState((prev) => ({ ...prev, error: "Lookup table name is required." }));
      return;
    }
    if (!centralIdColumn.trim() || !appNameColumn.trim() || !biaColumn.trim() || !unitCioColumn.trim()) {
      setState((prev) => ({ ...prev, error: "All four column mappings are required." }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const config: MappingConfig = {
        dataSourceType: "lookup",
        lookupTableName: lookupTableName.trim(),
        fieldMappings: {
          appTag: centralIdColumn.trim(),
          appName: appNameColumn.trim(),
          tier: biaColumn.trim(),
          owner: unitCioColumn.trim(),
        },
      };

      await saveConfig(config);

      setState((prev) => ({ ...prev, isLoading: false, success: true }));
      setTimeout(() => { window.location.href = "/overview"; }, 800);
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false, error: `Failed to save: ${err}` }));
    }
  };

  if (state.success) {
    return (
      <div style={{ maxWidth: "540px", margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <Heading level={1}>✓ Configuration Saved</Heading>
        <Paragraph style={{ marginTop: "12px", color: "#555" }}>Loading your application inventory...</Paragraph>
      </div>
    );
  }

  const { form } = state;

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "40px 24px" }}>
      <Heading level={1}>Application Observability Hub</Heading>
      <Paragraph style={{ marginTop: "8px", color: "#555" }}>
        Connect to a Dynatrace lookup table that contains your application inventory. Enter the
        lookup table name and map each column to the appropriate field.
      </Paragraph>

      <div style={{ marginTop: "32px", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "24px" }}>
        <Heading level={2} style={{ marginTop: 0, marginBottom: "20px" }}>Lookup Table</Heading>

        <label style={labelStyle}>Lookup Table Name</label>
        <input
          style={fieldStyle}
          value={form.lookupTableName}
          onChange={(e) => setField("lookupTableName", e.target.value)}
          placeholder="cmdb_businessapp"
          disabled={state.isLoading}
        />
        <span style={hintStyle}>The Dynatrace lookup table that contains your application records</span>
      </div>

      <div style={{ marginTop: "24px", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "24px" }}>
        <Heading level={2} style={{ marginTop: 0, marginBottom: "4px" }}>Column Mappings</Heading>
        <Paragraph style={{ fontSize: "13px", color: "#666", marginBottom: "20px" }}>
          Enter the column name from your lookup table that corresponds to each field.
        </Paragraph>

        <div style={{ display: "grid", gap: "18px" }}>
          <div>
            <label style={labelStyle}>CentralID Column</label>
            <input
              style={fieldStyle}
              value={form.centralIdColumn}
              onChange={(e) => setField("centralIdColumn", e.target.value)}
              placeholder="CentralID"
              disabled={state.isLoading}
            />
            <span style={hintStyle}>Unique application identifier — e.g. <code>CentralID</code>, <code>app_id</code>, <code>cmdb_ci_key</code></span>
          </div>

          <div>
            <label style={labelStyle}>Application Name Column</label>
            <input
              style={fieldStyle}
              value={form.appNameColumn}
              onChange={(e) => setField("appNameColumn", e.target.value)}
              placeholder="AppName"
              disabled={state.isLoading}
            />
            <span style={hintStyle}>Human-readable display name — e.g. <code>AppName</code>, <code>name</code>, <code>application_name</code></span>
          </div>

          <div>
            <label style={labelStyle}>BIA Column</label>
            <input
              style={fieldStyle}
              value={form.biaColumn}
              onChange={(e) => setField("biaColumn", e.target.value)}
              placeholder="BIA"
              disabled={state.isLoading}
            />
            <span style={hintStyle}>Business Impact Assessment / criticality tier — e.g. <code>BIA</code>, <code>business_criticality</code>, <code>tier</code></span>
          </div>

          <div>
            <label style={labelStyle}>Unit CIO Column</label>
            <input
              style={fieldStyle}
              value={form.unitCioColumn}
              onChange={(e) => setField("unitCioColumn", e.target.value)}
              placeholder="UnitCIO"
              disabled={state.isLoading}
            />
            <span style={hintStyle}>Responsible team or CIO unit — e.g. <code>UnitCIO</code>, <code>owned_by</code>, <code>owner</code></span>
          </div>
        </div>
      </div>

      {state.error && (
        <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "4px" }}>
          <span style={{ color: "#c0392b", fontSize: "14px" }}>⚠ {state.error}</span>
        </div>
      )}

      <div style={{ marginTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Button
          variant="default"
          onClick={() => setState((prev) => ({ ...prev, form: { ...DEFAULTS }, error: null }))}
          disabled={state.isLoading}
        >
          Reset to Defaults
        </Button>
        <Button
          variant="emphasized"
          onClick={handleSave}
          disabled={state.isLoading}
        >
          {state.isLoading ? "Saving..." : "Connect & Continue →"}
        </Button>
      </div>
    </div>
  );
};

export default Setup;
