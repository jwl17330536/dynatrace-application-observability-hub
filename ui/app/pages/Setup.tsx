import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  fetchConfigFromDocumentStore,
  getDefaultFeaturePacks,
  getDefaultApplicationVariables,
  IGNORE_COLUMN_VALUE,
  mergeFeaturePacks,
  saveConfig,
  validateConfig,
  type ApplicationVariableConfig,
  type FeaturePackConfig,
  type FeaturePacksConfig,
  type LookupSourceConfig,
  type MappingConfig,
  type LookupFieldConfig,
} from "@utils/documentStore";
import { theme } from "@utils/themeStyles";

interface PreviewRequest {
  query: string;
  runId: number;
}

interface LookupUploadState {
  file: File | null;
  headers: string[];
  lookupField: string;
  uploadTargetName: string;
  overwrite: boolean;
  isUploading: boolean;
  message: string | null;
  error: string | null;
}

type SourceSetupPath = "upload" | "existing";

interface SetupState {
  sources: LookupSourceConfig[];
  defaultSourceId: string;
  applicationVariables: ApplicationVariableConfig;
  featurePacks: FeaturePacksConfig;
  autoFilledUniqueColumnBySource: Record<string, string>;
  detectedColumnsBySource: Record<string, string[]>;
  uploadBySource: Record<string, LookupUploadState>;
  setupPathBySource: Record<string, SourceSetupPath>;
  isInitializing: boolean;
  isSaving: boolean;
  error: string | null;
  previewBySource: Record<string, PreviewRequest>;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  boxSizing: "border-box",
  border: `1px solid ${theme.border}`,
  borderRadius: "4px",
  fontSize: "14px",
  fontFamily: "monospace",
  backgroundColor: theme.surface,
  color: theme.text,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginBottom: "6px",
  fontSize: "13px",
  color: theme.text,
};

const hintStyle: React.CSSProperties = {
  fontSize: "12px",
  color: theme.textSecondary,
  marginTop: "4px",
  display: "block",
  lineHeight: 1.45,
};

/** Dynatrace-style segmented toggle: connected halves, primary fill when selected. */
function pathSegmentStyle(active: boolean, side: "left" | "right"): React.CSSProperties {
  return {
    flex: 1,
    minWidth: "0",
    padding: "12px 16px",
    border: "none",
    borderRight: side === "left" ? `1px solid ${theme.border}` : "none",
    borderRadius: 0,
    backgroundColor: active ? theme.primarySubtle : theme.surface,
    color: active ? theme.primaryText : theme.text,
    fontWeight: active ? 700 : 600,
    fontSize: "13px",
    lineHeight: 1.35,
    cursor: "pointer",
    textAlign: "left" as const,
    boxShadow: active ? `inset 0 -3px 0 ${theme.primary}` : "none",
  };
}

function pathEyebrowOpacity(active: boolean): number {
  return active ? 1 : 0.8;
}

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

function buildColumnOptions(detectedColumns: string[], currentValue: string): string[] {
  const dedup = new Set(detectedColumns);
  const trimmedCurrent = currentValue.trim();
  if (trimmedCurrent) {
    dedup.add(trimmedCurrent);
  }
  return Array.from(dedup).sort((left, right) => left.localeCompare(right));
}

function getUniqueApplicationIdColumn(source: LookupSourceConfig | undefined): string {
  if (!source) {
    return "";
  }
  const uniqueField = source.fields.find((field) => field.id === "uniqueApplicationId");
  return uniqueField?.sourceColumn.trim() || "";
}

function normalizeOptionalColumnSelection(value: string | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : IGNORE_COLUMN_VALUE;
}

function createDefaultUploadState(): LookupUploadState {
  return {
    file: null,
    headers: [],
    lookupField: "",
    uploadTargetName: "",
    overwrite: true,
    isUploading: false,
    message: null,
    error: null,
  };
}

function parseCsvHeaderLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result.map((value) => value.replace(/^"|"$/g, "").trim()).filter((value) => value.length > 0);
}

function isValidDplFieldName(field: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(field);
}

function buildCsvParsePattern(headers: string[]): string {
  return headers
    .map((header, index) => (index < headers.length - 1 ? `LD:${header} ','` : `LD:${header}`))
    .join(" ");
}

const DEFAULT_LOOKUP_TABLE_NAME = "cmdb_businessapp";
const DEFAULT_SOURCE = createSource("Primary Applications", DEFAULT_LOOKUP_TABLE_NAME, true);

type FeaturePackId = keyof FeaturePacksConfig;

const FEATURE_PACK_META: Record<FeaturePackId, { title: string; summary: string }> = {
  observabilityEvidence: {
    title: "Standard Pack 1: Observability Evidence",
    summary: "Signal evidence and quality views using Dynatrace-native telemetry data.",
  },
  problemsAndAlerts: {
    title: "Standard Pack 2: Problems & Alerts",
    summary: "Active and historical problem rollups from Dynatrace problem and event datasets.",
  },
  vulnerabilities: {
    title: "Standard Pack 3: Vulnerabilities",
    summary: "Security rollups (critical/high/total) from Dynatrace vulnerability entities.",
  },
  infrastructureCoverage: {
    title: "Feature Pack 1: Infrastructure Coverage",
    summary: "Expected vs observed host coverage for OneAgent rollout gap analysis.",
  },
};

function SourcePreview({
  request,
  source,
  onColumnsDetected,
}: {
  request: PreviewRequest;
  source: LookupSourceConfig;
  onColumnsDetected: (sourceId: string, columns: string[]) => void;
}) {
  const { data, isLoading, error } = useDql({ query: request.query });
  const firstRecord = (data?.records?.[0] || {}) as Record<string, unknown>;
  const availableColumns = Object.keys(firstRecord);
  const configuredColumns = source.fields
    .map((field) => sanitizeColumnName(field.sourceColumn))
    .filter((name): name is string => Boolean(name));
  const missingColumns = configuredColumns.filter((name) => !availableColumns.includes(name));

  useEffect(() => {
    if (!isLoading && !error) {
      onColumnsDetected(source.sourceId, availableColumns);
    }
  }, [availableColumns, error, isLoading, onColumnsDetected, source.sourceId]);

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px",
        backgroundColor: theme.surfaceSubtle,
        border: `1px solid ${theme.border}`,
        borderRadius: "6px",
      }}
    >
      <div style={{ fontSize: "12px", color: theme.textSecondary, marginBottom: "8px", fontWeight: 600 }}>
        Preview Query (limit 1)
      </div>
      <pre
        style={{
          margin: "0 0 10px 0",
          padding: "10px",
          backgroundColor: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: "4px",
          fontSize: "12px",
          overflowX: "auto",
          color: theme.text,
        }}
      >
        {request.query}
      </pre>

      {isLoading && <div style={{ fontSize: "13px", color: theme.textSecondary }}>Loading preview...</div>}

      {error && (
        <div style={{ fontSize: "13px", color: theme.criticalText }}>
          Preview error: {typeof error === "string" ? error : String(error)}
        </div>
      )}

      {!isLoading && !error && (
        <div>
          {configuredColumns.length > 0 && (
            <div style={{ marginBottom: "10px", fontSize: "12px" }}>
              {missingColumns.length === 0 ? (
                <span style={{ color: theme.successText }}>All configured columns were found in the preview row.</span>
              ) : (
                <span style={{ color: theme.criticalText }}>
                  Missing columns in preview row: {missingColumns.join(", ")}
                </span>
              )}
            </div>
          )}

          <pre
            style={{
              margin: 0,
              padding: "10px",
              backgroundColor: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: "4px",
              fontSize: "12px",
              overflowX: "auto",
              color: theme.text,
            }}
          >
            {JSON.stringify(firstRecord, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function getFeaturePackReadiness(packId: FeaturePackId, pack: FeaturePackConfig): string {
  if (!pack.enabled) {
    return "Disabled";
  }
  if (pack.mode === "native") {
    if (packId === "infrastructureCoverage") {
      return "Infrastructure coverage uses expected inventory. Switch to enriched mode and select lookup source.";
    }
    return "Available now (Dynatrace-native mode)";
  }
  if (!pack.lookupSourceId?.trim()) {
    return "Requires optional lookup source selection";
  }
  return "Ready with CMDB enrichment";
}

export const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [previewRunCounter, setPreviewRunCounter] = useState(0);
  const [state, setState] = useState<SetupState>({
    sources: [DEFAULT_SOURCE],
    defaultSourceId: DEFAULT_SOURCE.sourceId,
    applicationVariables: {
      ...getDefaultApplicationVariables(),
      cmdbVariableSourceId: DEFAULT_SOURCE.sourceId,
    },
    featurePacks: getDefaultFeaturePacks(),
    autoFilledUniqueColumnBySource: {},
    detectedColumnsBySource: {},
    uploadBySource: {},
    setupPathBySource: { [DEFAULT_SOURCE.sourceId]: "existing" },
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
          const existingSources = Array.isArray(existing.sources) && existing.sources.length > 0 ? existing.sources : [DEFAULT_SOURCE];
          const existingDefaultSource = existing.defaultSourceId || existingSources[0].sourceId;
          const mergedVariables = {
            ...getDefaultApplicationVariables(),
            ...(existing.applicationVariables || {}),
          };

          const setupPathBySource = Object.fromEntries(
            existingSources.map((source) => [source.sourceId, "existing" as SourceSetupPath])
          );
          setState((prev) => ({
            ...prev,
            sources: existingSources,
            defaultSourceId: existingDefaultSource,
            featurePacks: mergeFeaturePacks(existing.featurePacks),
            autoFilledUniqueColumnBySource: {},
            applicationVariables: {
              ...mergedVariables,
              cmdbVariableSourceId: mergedVariables.cmdbVariableSourceId || existingDefaultSource,
              cmdbOwnerColumn: normalizeOptionalColumnSelection(mergedVariables.cmdbOwnerColumn),
              cmdbTierColumn: normalizeOptionalColumnSelection(mergedVariables.cmdbTierColumn),
              cmdbApplicationNameColumn: normalizeOptionalColumnSelection(mergedVariables.cmdbApplicationNameColumn),
              cmdbApplicationIdColumn:
                getUniqueApplicationIdColumn(
                  existingSources.find((source) => source.sourceId === (mergedVariables.cmdbVariableSourceId || existingDefaultSource)) ||
                    existingSources[0]
                ) || mergedVariables.cmdbApplicationIdColumn,
            },
            uploadBySource: {},
            setupPathBySource,
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
    setState((prev) => {
      const nextSources = prev.sources.map((source) =>
        source.sourceId === sourceId
          ? {
              ...source,
              fields: source.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
            }
          : source
      );
      const selectedSource = nextSources.find((source) => source.sourceId === prev.applicationVariables.cmdbVariableSourceId) || nextSources[0];
      const nextAutoFilledUniqueColumnBySource = { ...prev.autoFilledUniqueColumnBySource };

      if (fieldId === "uniqueApplicationId" && typeof patch.sourceColumn === "string") {
        const priorAutoFilled = prev.autoFilledUniqueColumnBySource[sourceId] || "";
        const nextValue = patch.sourceColumn.trim();
        if (nextValue !== priorAutoFilled) {
          delete nextAutoFilledUniqueColumnBySource[sourceId];
        }
      }

      return {
        ...prev,
        error: null,
        sources: nextSources,
        autoFilledUniqueColumnBySource: nextAutoFilledUniqueColumnBySource,
        applicationVariables: {
          ...prev.applicationVariables,
          cmdbApplicationIdColumn: getUniqueApplicationIdColumn(selectedSource),
        },
      };
    });
  };

  const setApplicationVariable = (key: keyof ApplicationVariableConfig, value: string) => {
    if (key === "cmdbVariableSourceId") {
      setState((prev) => {
        const selectedSource = prev.sources.find((source) => source.sourceId === value) || prev.sources[0];
        return {
          ...prev,
          error: null,
          applicationVariables: {
            ...prev.applicationVariables,
            cmdbVariableSourceId: value,
            cmdbApplicationIdColumn: getUniqueApplicationIdColumn(selectedSource),
          },
        };
      });
      return;
    }

    setState((prev) => ({
      ...prev,
      error: null,
      applicationVariables: {
        ...prev.applicationVariables,
        [key]: value,
      },
    }));
  };

  const setFeaturePack = (packId: FeaturePackId, patch: Partial<FeaturePackConfig>) => {
    setState((prev) => ({
      ...prev,
      featurePacks: {
        ...prev.featurePacks,
        [packId]: {
          ...prev.featurePacks[packId],
          ...patch,
        },
      },
    }));
  };

  const setDetectedColumns = (sourceId: string, columns: string[]) => {
    setState((prev) => ({
      ...prev,
      detectedColumnsBySource: {
        ...prev.detectedColumnsBySource,
        [sourceId]: columns,
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
      setupPathBySource: {
        ...prev.setupPathBySource,
        [source.sourceId]: "existing",
      },
    }));
  };

  const setSetupPath = (sourceId: string, path: SourceSetupPath) => {
    setState((prev) => ({
      ...prev,
      error: null,
      setupPathBySource: {
        ...prev.setupPathBySource,
        [sourceId]: path,
      },
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
      const nextDetectedColumnsBySource = { ...prev.detectedColumnsBySource };
      delete nextDetectedColumnsBySource[sourceId];
      const nextAutoFilledUniqueColumnBySource = { ...prev.autoFilledUniqueColumnBySource };
      delete nextAutoFilledUniqueColumnBySource[sourceId];

      const nextVariables = {
        ...prev.applicationVariables,
        cmdbVariableSourceId:
          prev.applicationVariables.cmdbVariableSourceId === sourceId ? nextSources[0].sourceId : prev.applicationVariables.cmdbVariableSourceId,
        cmdbApplicationIdColumn: getUniqueApplicationIdColumn(
          nextSources.find(
            (source) =>
              source.sourceId ===
              (prev.applicationVariables.cmdbVariableSourceId === sourceId ? nextSources[0].sourceId : prev.applicationVariables.cmdbVariableSourceId)
          ) || nextSources[0]
        ),
      };

      const nextSetupPathBySource = { ...prev.setupPathBySource };
      delete nextSetupPathBySource[sourceId];

      return {
        ...prev,
        error: null,
        sources: nextSources,
        defaultSourceId: nextDefault,
        applicationVariables: nextVariables,
        autoFilledUniqueColumnBySource: nextAutoFilledUniqueColumnBySource,
        detectedColumnsBySource: nextDetectedColumnsBySource,
        uploadBySource: Object.fromEntries(Object.entries(prev.uploadBySource).filter(([key]) => key !== sourceId)),
        setupPathBySource: nextSetupPathBySource,
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
      const derivedIdColumn = getUniqueApplicationIdColumn(selectedCmdbSource);
      const config: MappingConfig = {
        mode: "lookup",
        defaultSourceId: state.defaultSourceId,
        sources: state.sources,
        featurePacks: state.featurePacks,
        applicationVariables: {
          ...state.applicationVariables,
          cmdbApplicationIdColumn: derivedIdColumn,
        },
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
      applicationVariables: {
        ...getDefaultApplicationVariables(),
        cmdbVariableSourceId: source.sourceId,
        cmdbApplicationIdColumn: getUniqueApplicationIdColumn(source),
      },
      featurePacks: getDefaultFeaturePacks(),
      autoFilledUniqueColumnBySource: {},
      detectedColumnsBySource: {},
      uploadBySource: {},
      setupPathBySource: { [source.sourceId]: "existing" },
      isSaving: false,
      error: null,
      previewBySource: {},
    }));
  };

  const setUploadState = (sourceId: string, patch: Partial<LookupUploadState>) => {
    setState((prev) => ({
      ...prev,
      uploadBySource: {
        ...prev.uploadBySource,
        [sourceId]: {
          ...createDefaultUploadState(),
          ...(prev.uploadBySource[sourceId] || {}),
          ...patch,
        },
      },
    }));
  };

  const maybeAutofillUniqueApplicationColumn = (sourceId: string, candidateColumn: string) => {
    const trimmedCandidate = candidateColumn.trim();
    if (!trimmedCandidate) {
      return;
    }

    setState((prev) => {
      const nextSources = prev.sources.map((source) => {
        if (source.sourceId !== sourceId) {
          return source;
        }

        const priorAutoFilled = prev.autoFilledUniqueColumnBySource[sourceId] || "";

        return {
          ...source,
          fields: source.fields.map((field) => {
            if (field.id !== "uniqueApplicationId") {
              return field;
            }
            const currentValue = field.sourceColumn.trim();
            const canAutoFill = !currentValue || currentValue === priorAutoFilled;
            if (!canAutoFill) {
              return field;
            }
            return {
              ...field,
              sourceColumn: trimmedCandidate,
            };
          }),
        };
      });

      const selectedSource =
        nextSources.find((source) => source.sourceId === prev.applicationVariables.cmdbVariableSourceId) || nextSources[0];

      return {
        ...prev,
        sources: nextSources,
        autoFilledUniqueColumnBySource: {
          ...prev.autoFilledUniqueColumnBySource,
          [sourceId]: trimmedCandidate,
        },
        applicationVariables: {
          ...prev.applicationVariables,
          cmdbApplicationIdColumn: getUniqueApplicationIdColumn(selectedSource),
        },
      };
    });
  };

  const handleLookupFileSelect = async (source: LookupSourceConfig, file: File | null) => {
    if (!file) {
      setUploadState(source.sourceId, {
        ...createDefaultUploadState(),
        uploadTargetName: source.lookupTableName,
      });
      return;
    }

    try {
      const text = await file.text();
      const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
      const headers = parseCsvHeaderLine(firstLine);

      if (!headers.length) {
        setUploadState(source.sourceId, {
          file,
          headers: [],
          lookupField: "",
          uploadTargetName: source.lookupTableName,
          error: "Could not detect CSV header row. Ensure the first row contains column names.",
          message: null,
        });
        return;
      }

      const invalidHeaders = headers.filter((header) => !isValidDplFieldName(header));
      if (invalidHeaders.length > 0) {
        setUploadState(source.sourceId, {
          file,
          headers,
          lookupField: "",
          uploadTargetName: source.lookupTableName,
          error: `Invalid header names for lookup parsing: ${invalidHeaders.join(", ")}. Use letters, numbers, and underscores only.`,
          message: null,
        });
        return;
      }

      const defaultLookupKey = headers[0];
      setUploadState(source.sourceId, {
        file,
        headers,
        lookupField: defaultLookupKey,
        uploadTargetName: source.lookupTableName,
        error: null,
        message: null,
      });
      maybeAutofillUniqueApplicationColumn(source.sourceId, defaultLookupKey);
    } catch (err) {
      setUploadState(source.sourceId, {
        file,
        headers: [],
        lookupField: "",
        uploadTargetName: source.lookupTableName,
        error: `Failed to read file: ${err}`,
        message: null,
      });
    }
  };

  const uploadLookupFile = async (source: LookupSourceConfig) => {
    const upload = state.uploadBySource[source.sourceId] || createDefaultUploadState();
    if (!upload.file) {
      setUploadState(source.sourceId, { error: "Choose a CSV file first.", message: null });
      return;
    }
    if (!upload.lookupField.trim()) {
      setUploadState(source.sourceId, { error: "Select a lookup key column.", message: null });
      return;
    }
    if (!upload.headers.length) {
      setUploadState(source.sourceId, { error: "No CSV headers detected.", message: null });
      return;
    }

    setUploadState(source.sourceId, { isUploading: true, error: null, message: null });

    try {
      const targetLookupName = upload.uploadTargetName.trim() || source.lookupTableName;
      const requestPayload = {
        filePath: toLookupPath(targetLookupName),
        displayName: source.label || targetLookupName,
        description: "Uploaded from Application Observability Hub",
        lookupField: upload.lookupField,
        parsePattern: buildCsvParsePattern(upload.headers),
        skippedRecords: 1,
        autoFlatten: true,
        timezone: "UTC",
        locale: "en_US",
        overwrite: upload.overwrite,
      };

      const form = new FormData();
      form.append("request", new Blob([JSON.stringify(requestPayload)], { type: "application/json" }));
  form.append("content", upload.file, targetLookupName);

      const response = await fetch("/platform/storage/resource-store/v1/files/tabular/lookup:upload", {
        method: "POST",
        body: form,
      });

      const responseText = await response.text();
      let responseJson: Record<string, unknown> | null = null;
      if (responseText) {
        try {
          responseJson = JSON.parse(responseText) as Record<string, unknown>;
        } catch {
          responseJson = null;
        }
      }

      if (!response.ok) {
        const messageFromJson =
          responseJson && typeof responseJson.message === "string" ? responseJson.message : null;
        const details = messageFromJson || responseText || response.statusText;
        throw new Error(details);
      }

      const inserted = typeof responseJson?.records === "number" ? responseJson.records : "unknown";
      setUploadState(source.sourceId, {
        isUploading: false,
        message: `Upload complete. Inserted records: ${inserted}.`,
        error: null,
      });

      setSource(source.sourceId, (current) => ({
        ...current,
        lookupTableName: targetLookupName,
      }));

      runPreview({
        ...source,
        lookupTableName: targetLookupName,
      });
    } catch (err) {
      setUploadState(source.sourceId, {
        isUploading: false,
        message: null,
        error: `Upload failed: ${err}`,
      });
    }
  };

  const selectedCmdbSource =
    state.sources.find((source) => source.sourceId === state.applicationVariables.cmdbVariableSourceId) || state.sources[0];
  const derivedCmdbIdColumn = getUniqueApplicationIdColumn(selectedCmdbSource);
  const selectedColumns = selectedCmdbSource ? state.detectedColumnsBySource[selectedCmdbSource.sourceId] || [] : [];
  const cmdbNameOptions = buildColumnOptions(
    selectedColumns,
    state.applicationVariables.cmdbApplicationNameColumn === IGNORE_COLUMN_VALUE
      ? ""
      : state.applicationVariables.cmdbApplicationNameColumn
  );
  const cmdbOwnerCurrent = state.applicationVariables.cmdbOwnerColumn === IGNORE_COLUMN_VALUE ? "" : state.applicationVariables.cmdbOwnerColumn;
  const cmdbTierCurrent = state.applicationVariables.cmdbTierColumn === IGNORE_COLUMN_VALUE ? "" : state.applicationVariables.cmdbTierColumn;
  const cmdbOwnerOptions = buildColumnOptions(selectedColumns, cmdbOwnerCurrent);
  const cmdbTierOptions = buildColumnOptions(selectedColumns, cmdbTierCurrent);

  if (state.isInitializing) {
    return (
      <div style={{ maxWidth: "540px", margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <Heading level={1}>Loading Configuration</Heading>
        <Paragraph style={{ marginTop: "12px", color: theme.textSecondary }}>Restoring your last saved lookup setup...</Paragraph>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 24px" }}>
      <Heading level={1}>Application Observability Hub</Heading>

      <div
        style={{
          marginTop: "14px",
          padding: "14px 16px",
          border: `1px solid ${theme.border}`,
          borderRadius: "8px",
          backgroundColor: theme.surfaceSubtle,
        }}
      >
        <div style={{ fontWeight: 700, color: theme.text, marginBottom: "8px" }}>Prerequisites</div>
        <Paragraph style={{ margin: "0 0 6px 0", color: theme.textSecondary, fontSize: "13px" }}>
          <strong>Required join keys:</strong> (1) a unique Application ID column in your lookup, and (2) a Dynatrace
          Application ID expression on entities (for example <code>dt.cost.product</code>).
        </Paragraph>
        <Paragraph style={{ margin: "0 0 6px 0", color: theme.textSecondary, fontSize: "13px" }}>
          <strong>Optional enrichment:</strong> application name, owner, and tier (can be ignored).
        </Paragraph>
        <Paragraph style={{ margin: 0, color: theme.textSecondary, fontSize: "13px" }}>
          Flow: connect lookup (upload <strong>or</strong> existing) → Load Preview → map Unique Application ID → set join variables.
        </Paragraph>
      </div>

      <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
        <Button variant="emphasized" onClick={addSource} disabled={state.isSaving}>
          Add Another Source
        </Button>
      </div>

      <div style={{ marginTop: "24px", display: "grid", gap: "18px" }}>
        {state.sources.map((source, index) => {
          const upload = state.uploadBySource[source.sourceId] || createDefaultUploadState();
          const setupPath = state.setupPathBySource[source.sourceId] || "existing";
          const uploadActive = setupPath === "upload";
          const existingActive = setupPath === "existing";
          const panelBase: React.CSSProperties = {
            border: `1px solid ${theme.border}`,
            borderRadius: "6px",
            padding: "12px",
            backgroundColor: theme.surface,
          };

          return (
          <div key={source.sourceId} style={{ border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "20px" }}>
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

            <div style={{ marginTop: "8px" }}>
              <Heading level={3} style={{ marginTop: 0, marginBottom: "8px" }}>Step 1: Connect Lookup (choose A or B)</Heading>
              <Paragraph style={{ margin: "0 0 12px 0", color: theme.textSecondary, fontSize: "13px" }}>
                Complete <strong>one</strong> path — upload a CSV <strong>or</strong> point at an existing lookup — then Load Preview.
              </Paragraph>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={labelStyle}>Source Label</label>
                  <input
                    style={inputStyle}
                    value={source.label}
                    disabled={state.isSaving}
                    onChange={(event) => updateSourceIdentity(source.sourceId, event.target.value, source.lookupTableName)}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "2px" }}>
                  <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px", marginBottom: 0 }}>
                    <input
                      type="radio"
                      checked={state.defaultSourceId === source.sourceId}
                      onChange={() => setState((prev) => ({ ...prev, defaultSourceId: source.sourceId, error: null }))}
                      disabled={state.isSaving}
                    />
                    Use as default source
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: theme.text, marginBottom: "8px" }}>
                  Connection path
                </div>
                <div
                  role="group"
                  aria-label="Lookup connection path"
                  style={{
                    display: "flex",
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: "6px",
                    overflow: "hidden",
                    backgroundColor: theme.surface,
                  }}
                >
                  <button
                    type="button"
                    style={pathSegmentStyle(uploadActive, "left")}
                    disabled={state.isSaving}
                    onClick={() => setSetupPath(source.sourceId, "upload")}
                    aria-pressed={uploadActive}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "2px", opacity: pathEyebrowOpacity(uploadActive) }}>
                      1A
                    </div>
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    style={pathSegmentStyle(existingActive, "right")}
                    disabled={state.isSaving}
                    onClick={() => setSetupPath(source.sourceId, "existing")}
                    aria-pressed={existingActive}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", marginBottom: "2px", opacity: pathEyebrowOpacity(existingActive) }}>
                      1B
                    </div>
                    Use existing lookup
                  </button>
                </div>
              </div>

              {uploadActive ? (
                <div
                  style={{
                    ...panelBase,
                    borderColor: theme.primary,
                    boxShadow: `inset 3px 0 0 ${theme.primary}`,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "8px", color: theme.text }}>1A — Upload Lookup CSV</div>
                  <Paragraph style={{ margin: "0 0 10px 0", color: theme.textSecondary, fontSize: "13px" }}>
                    Use when the lookup table is not already populated by workflows or automation.
                  </Paragraph>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", alignItems: "end" }}>
                    <div>
                      <label style={labelStyle}>CSV File</label>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        disabled={state.isSaving || upload.isUploading}
                        onChange={(event) => handleLookupFileSelect(source, event.target.files?.[0] || null)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Lookup Key Column</label>
                      <select
                        style={{ ...inputStyle, fontFamily: "inherit" }}
                        value={upload.lookupField}
                        disabled={state.isSaving || upload.isUploading || upload.headers.length === 0}
                        onChange={(event) => {
                          const lookupField = event.target.value;
                          setUploadState(source.sourceId, { lookupField });
                          maybeAutofillUniqueApplicationColumn(source.sourceId, lookupField);
                        }}
                      >
                        <option value="">Select key column...</option>
                        {upload.headers.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: "8px" }}>
                    <label style={labelStyle}>Upload Target Lookup Name</label>
                    <input
                      style={inputStyle}
                      value={upload.uploadTargetName || source.lookupTableName}
                      disabled={state.isSaving || upload.isUploading}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setUploadState(source.sourceId, { uploadTargetName: nextValue });
                      }}
                      placeholder="cmdb_businessapp"
                    />
                    <span style={hintStyle}>This lookup target is used for CSV upload and saved as the source table name.</span>
                  </div>

                  <div style={{ marginTop: "8px" }}>
                    <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px", marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={upload.overwrite}
                        disabled={state.isSaving || upload.isUploading}
                        onChange={(event) => setUploadState(source.sourceId, { overwrite: event.target.checked })}
                      />
                      Overwrite existing lookup table data
                    </label>
                  </div>

                  <div style={{ marginTop: "8px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <Button
                      variant="emphasized"
                      disabled={state.isSaving || upload.isUploading || !upload.file || !upload.lookupField}
                      onClick={() => uploadLookupFile(source)}
                    >
                      {upload.isUploading ? "Uploading..." : "Upload to Lookup"}
                    </Button>
                    <span style={{ fontSize: "12px", color: theme.textSecondary }}>
                      Target: {toLookupPath((upload.uploadTargetName || source.lookupTableName).trim() || source.lookupTableName)}
                    </span>
                  </div>

                  {upload.error && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: theme.criticalText }}>{upload.error}</div>
                  )}
                  {upload.message && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: theme.successText }}>{upload.message}</div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    ...panelBase,
                    borderColor: theme.primary,
                    boxShadow: `inset 3px 0 0 ${theme.primary}`,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "8px", color: theme.text }}>1B — Use Existing Lookup</div>
                  <Paragraph style={{ margin: "0 0 10px 0", color: theme.textSecondary, fontSize: "13px" }}>
                    Point at a lookup already populated (for example by Loop B / CMDB sync).
                  </Paragraph>
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
              )}

              <div style={{ marginTop: "12px", display: "flex", gap: "10px", alignItems: "center" }}>
                <Button
                  variant="emphasized"
                  disabled={state.isSaving || !source.lookupTableName.trim()}
                  onClick={() => runPreview(source)}
                >
                  Load Preview
                </Button>
                <span style={{ fontSize: "12px", color: theme.textSecondary }}>
                  Loads a sample row from {toLookupPath(source.lookupTableName || "…")} to detect columns.
                </span>
              </div>

              {state.previewBySource[source.sourceId] && (
                <SourcePreview
                  key={`${source.sourceId}-${state.previewBySource[source.sourceId].runId}`}
                  request={state.previewBySource[source.sourceId]}
                  source={source}
                  onColumnsDetected={setDetectedColumns}
                />
              )}
            </div>

            <div style={{ marginTop: "16px" }}>
              <Heading level={3} style={{ marginTop: 0, marginBottom: "10px" }}>Step 2: Field Mappings</Heading>
              <div style={{ display: "grid", gap: "10px" }}>
                {source.fields.map((field) => (
                  <div key={field.id} style={{ border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "12px" }}>
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
                          title="Lookup column that uniquely identifies each application (join key)."
                        />
                        {field.id === "uniqueApplicationId" && (
                          <span style={hintStyle}>Lookup column that uniquely identifies each application (join key).</span>
                        )}
                      </div>
                      <div>
                        <label style={labelStyle}>Format</label>
                        <select
                          style={{ ...inputStyle, fontFamily: "inherit" }}
                          value={field.format || "text"}
                          disabled={state.isSaving}
                          title="How this value is displayed in tables. Does not affect joins."
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
                        <span style={hintStyle}>Display only (text / badge / pill). Does not affect joins.</span>
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
              </div>
            </div>
          </div>
          );
        })}
      </div>

      <div style={{ marginTop: "20px", border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "18px" }}>
        <Heading level={2} style={{ marginTop: 0, marginBottom: "8px" }}>Step 3: Application Join Variables</Heading>
        <Paragraph style={{ margin: "0 0 14px 0", color: theme.textSecondary, fontSize: "13px" }}>
          Wire the Dynatrace-side Application ID expression to your lookup Unique Application ID. Name, owner, and tier are optional.
        </Paragraph>
        <div style={{ fontSize: "12px", fontWeight: 700, color: theme.text, marginBottom: "8px" }}>Required</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          <div>
            <label style={labelStyle}>CMDB Variable Source</label>
            <select
              style={{ ...inputStyle, fontFamily: "inherit" }}
              value={state.applicationVariables.cmdbVariableSourceId}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbVariableSourceId", event.target.value)}
            >
              {state.sources.map((source) => (
                <option key={source.sourceId} value={source.sourceId}>
                  {source.label} ({source.lookupTableName})
                </option>
              ))}
            </select>
            <span style={hintStyle}>Which lookup source supplies Application ID and optional enrichment columns.</span>
          </div>

          <div>
            <label style={labelStyle}>Dynatrace Application ID Expression</label>
            <input
              style={inputStyle}
              value={state.applicationVariables.dynatraceApplicationIdFieldPath}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("dynatraceApplicationIdFieldPath", event.target.value)}
              placeholder="example: dt.cost.product or another DQL expression"
            />
            <span style={hintStyle}>Required. How each Dynatrace entity exposes the same Application ID (join key).</span>
          </div>

          <div>
            <label style={labelStyle}>CMDB Application ID Column (from Step 2)</label>
            <input
              style={inputStyle}
              value={derivedCmdbIdColumn}
              disabled
              placeholder="Map Unique Application ID in Step 2"
            />
            <span style={hintStyle}>Auto-filled from Unique Application ID Source Column in Step 2.</span>
          </div>
        </div>

        <div style={{ fontSize: "12px", fontWeight: 700, color: theme.text, marginBottom: "8px" }}>Optional enrichment</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={labelStyle}>CMDB Application Name Column</label>
            <select
              style={{ ...inputStyle, fontFamily: "inherit" }}
              value={state.applicationVariables.cmdbApplicationNameColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbApplicationNameColumn", event.target.value)}
            >
              <option value={IGNORE_COLUMN_VALUE}>Ignore</option>
              {cmdbNameOptions.map((column) => (
                <option key={column} value={column}>{column}</option>
              ))}
            </select>
            <span style={hintStyle}>Optional. When ignored, the dashboard uses Application ID as the display name.</span>
          </div>

          <div>
            <label style={labelStyle}>CMDB Owner Column</label>
            <select
              style={{ ...inputStyle, fontFamily: "inherit" }}
              value={state.applicationVariables.cmdbOwnerColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbOwnerColumn", event.target.value)}
            >
              <option value={IGNORE_COLUMN_VALUE}>Ignore</option>
              {cmdbOwnerOptions.map((column) => (
                <option key={column} value={column}>{column}</option>
              ))}
            </select>
            <span style={hintStyle}>Optional enrichment. Ignored columns are hidden on the dashboard.</span>
          </div>

          <div>
            <label style={labelStyle}>CMDB Tier Column</label>
            <select
              style={{ ...inputStyle, fontFamily: "inherit" }}
              value={state.applicationVariables.cmdbTierColumn}
              disabled={state.isSaving}
              onChange={(event) => setApplicationVariable("cmdbTierColumn", event.target.value)}
            >
              <option value={IGNORE_COLUMN_VALUE}>Ignore</option>
              {cmdbTierOptions.map((column) => (
                <option key={column} value={column}>{column}</option>
              ))}
            </select>
            <span style={hintStyle}>Optional enrichment for labels and risk context.</span>
          </div>
        </div>
        {selectedColumns.length === 0 && (
          <Paragraph style={{ marginTop: "10px", color: theme.warningEmphasized, fontSize: "13px" }}>
            No detected columns yet for the selected CMDB source. Run Load Preview on that source to pre-fill dropdown options.
          </Paragraph>
        )}
      </div>

      <div style={{ marginTop: "20px", border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "18px" }}>
        <Heading level={2} style={{ marginTop: 0, marginBottom: "8px" }}>Step 4: Telemetry Selection</Heading>
        <Paragraph style={{ margin: "0 0 14px 0", color: theme.textSecondary }}>
          Enable packs independently. Standard packs are Dynatrace-native. Feature packs add CMDB-backed context.
        </Paragraph>
        <div style={{ display: "grid", gap: "12px" }}>
          {(Object.keys(FEATURE_PACK_META) as FeaturePackId[]).map((packId) => {
            const pack = state.featurePacks[packId];
            const meta = FEATURE_PACK_META[packId];
            const readiness = getFeaturePackReadiness(packId, pack);
            return (
              <div key={packId} style={{ border: `1px solid ${theme.border}`, borderRadius: "6px", padding: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: theme.text }}>{meta.title}</div>
                    <div style={{ fontSize: "12px", color: theme.textSecondary, marginTop: "4px" }}>{meta.summary}</div>
                  </div>
                  <label style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={pack.enabled}
                      disabled={state.isSaving}
                      onChange={(event) => setFeaturePack(packId, { enabled: event.target.checked })}
                    />
                    Enable
                  </label>
                </div>

                <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={labelStyle}>Mode</label>
                    <select
                      style={{ ...inputStyle, fontFamily: "inherit" }}
                      value={pack.mode}
                      disabled={state.isSaving || packId === "infrastructureCoverage"}
                      onChange={(event) => setFeaturePack(packId, { mode: event.target.value as "native" | "enriched" })}
                    >
                      <option value="native">Dynatrace-native</option>
                      <option value="enriched">CMDB-enriched</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Optional Lookup Source</label>
                    <select
                      style={{ ...inputStyle, fontFamily: "inherit" }}
                      value={pack.lookupSourceId || ""}
                      disabled={state.isSaving || !pack.enabled || pack.mode !== "enriched"}
                      onChange={(event) => setFeaturePack(packId, { lookupSourceId: event.target.value })}
                    >
                      <option value="">None selected</option>
                      {state.sources.map((source) => (
                        <option key={source.sourceId} value={source.sourceId}>
                          {source.label} ({source.lookupTableName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: "8px", fontSize: "12px", color: theme.textSecondary }}>Readiness: {readiness}</div>
              </div>
            );
          })}
        </div>
      </div>

      {state.error && (
        <div style={{ marginTop: "16px", padding: "12px", backgroundColor: theme.criticalBg, border: `1px solid ${theme.criticalBorder}`, borderRadius: "4px" }}>
          <span style={{ color: theme.criticalText, fontSize: "14px" }}>{state.error}</span>
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
