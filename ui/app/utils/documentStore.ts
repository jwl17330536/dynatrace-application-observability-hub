/**
 * Document Store API helper
 * Reads/writes configuration to Dynatrace Document Store
 * Falls back to localStorage if unavailable
 */

export interface MappingConfig {
  mode: "lookup";
  defaultSourceId: string;
  sources: LookupSourceConfig[];
  applicationVariables: ApplicationVariableConfig;
}

export interface ApplicationVariableConfig {
  cmdbVariableSourceId: string;
  dynatraceApplicationIdFieldPath: string;
  cmdbApplicationIdColumn: string;
  cmdbApplicationNameColumn: string;
  cmdbOwnerColumn: string;
  cmdbTierColumn: string;
}

export type FieldDisplayFormat = "text" | "badge" | "pill";

export interface LookupFieldConfig {
  id: string;
  label: string;
  sourceColumn: string;
  required?: boolean;
  format?: FieldDisplayFormat;
}

export interface LookupSourceConfig {
  sourceId: string;
  label: string;
  lookupTableName: string;
  fields: LookupFieldConfig[];
}

const DOCUMENT_STORE_KEY = "observability-hub-app-config-v1";
const USE_LOCAL_STORAGE = !sessionStorage.getItem("DOCUMENT_STORE_AVAILABLE");

export async function validateDocumentStoreAccess(): Promise<boolean> {
  try {
    const response = await fetch("/platform/storage/resource-store/v1/files/test-key", {
      method: "GET",
    });

    if (response.status === 404 || response.status === 200) {
      sessionStorage.setItem("DOCUMENT_STORE_AVAILABLE", "true");
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Document Store unavailable, using localStorage fallback:", error);
    return false;
  }
}

export async function fetchConfigFromDocumentStore(): Promise<MappingConfig | null> {
  if (USE_LOCAL_STORAGE) {
    const cached = localStorage.getItem(DOCUMENT_STORE_KEY);
    return cached ? JSON.parse(cached) : null;
  }

  try {
    const response = await fetch(`/platform/storage/resource-store/v1/files/${DOCUMENT_STORE_KEY}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn("Error fetching from Document Store, falling back to localStorage:", error);
    const cached = localStorage.getItem(DOCUMENT_STORE_KEY);
    return cached ? JSON.parse(cached) : null;
  }
}

export async function saveConfig(config: MappingConfig): Promise<void> {
  // Always save to localStorage as fallback
  localStorage.setItem(DOCUMENT_STORE_KEY, JSON.stringify(config));

  if (USE_LOCAL_STORAGE) {
    return;
  }

  try {
    const response = await fetch(`/platform/storage/resource-store/v1/files/${DOCUMENT_STORE_KEY}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`Failed to save config: ${response.statusText}`);
    }
  } catch (error) {
    console.warn("Error saving to Document Store, config saved to localStorage only:", error);
    throw error;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function getDefaultApplicationVariables(): ApplicationVariableConfig {
  return {
    cmdbVariableSourceId: "",
    dynatraceApplicationIdFieldPath: "",
    cmdbApplicationIdColumn: "",
    cmdbApplicationNameColumn: "",
    cmdbOwnerColumn: "",
    cmdbTierColumn: "",
  };
}

export function validateConfig(config: MappingConfig): ValidationResult {
  const errors: string[] = [];
  let hasAnyUniqueApplicationIdMapping = false;

  if (config.mode !== "lookup") {
    errors.push("Mode must be 'lookup'");
  }

  if (!config.defaultSourceId || !config.defaultSourceId.trim()) {
    errors.push("Default source is required");
  }

  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    errors.push("At least one lookup source is required");
    return {
      valid: false,
      errors,
    };
  }

  const sourceIds = new Set<string>();
  for (const source of config.sources) {
    if (!source.sourceId || !source.sourceId.trim()) {
      errors.push("Each source must have a source ID");
      continue;
    }
    if (sourceIds.has(source.sourceId)) {
      errors.push(`Duplicate source ID: ${source.sourceId}`);
    }
    sourceIds.add(source.sourceId);

    if (!source.label || !source.label.trim()) {
      errors.push(`Source '${source.sourceId}' requires a label`);
    }
    if (!source.lookupTableName || !source.lookupTableName.trim()) {
      errors.push(`Source '${source.sourceId}' requires a lookup table name`);
    }
    if (!Array.isArray(source.fields) || source.fields.length === 0) {
      errors.push(`Source '${source.sourceId}' requires at least one field`);
      continue;
    }

    const uniqueField = source.fields.find((field) => field.id === "uniqueApplicationId");
    if (uniqueField && uniqueField.sourceColumn.trim()) {
      hasAnyUniqueApplicationIdMapping = true;
    }

    const fieldIds = new Set<string>();
    for (const field of source.fields) {
      if (!field.id || !field.id.trim()) {
        errors.push(`Source '${source.sourceId}' contains a field without an ID`);
        continue;
      }
      if (fieldIds.has(field.id)) {
        errors.push(`Source '${source.sourceId}' has duplicate field ID '${field.id}'`);
      }
      fieldIds.add(field.id);

      if (!field.label || !field.label.trim()) {
        errors.push(`Field '${field.id}' in source '${source.sourceId}' requires a label`);
      }
      if (!field.sourceColumn || !field.sourceColumn.trim()) {
        errors.push(`Field '${field.id}' in source '${source.sourceId}' requires a source column`);
      }
    }
  }

  if (!sourceIds.has(config.defaultSourceId)) {
    errors.push(`Default source '${config.defaultSourceId}' is not defined`);
  }

  const vars = config.applicationVariables;
  if (!vars) {
    errors.push("Application variables are required");
  } else {
    if (!vars.cmdbVariableSourceId || !vars.cmdbVariableSourceId.trim()) {
      errors.push("CMDB variable source is required");
    } else if (!sourceIds.has(vars.cmdbVariableSourceId)) {
      errors.push(`CMDB variable source '${vars.cmdbVariableSourceId}' is not defined`);
    }
    if (!vars.dynatraceApplicationIdFieldPath || !vars.dynatraceApplicationIdFieldPath.trim()) {
      errors.push("Dynatrace Application ID field path is required");
    }
    if (!vars.cmdbApplicationIdColumn || !vars.cmdbApplicationIdColumn.trim()) {
      errors.push("CMDB Application ID column is required");
    }
    if (!vars.cmdbApplicationNameColumn || !vars.cmdbApplicationNameColumn.trim()) {
      errors.push("CMDB Application Name column is required");
    }
    if (!vars.cmdbOwnerColumn || !vars.cmdbOwnerColumn.trim()) {
      errors.push("CMDB Owner column is required");
    }
    if (!vars.cmdbTierColumn || !vars.cmdbTierColumn.trim()) {
      errors.push("CMDB Tier column is required");
    }
  }

  if (!hasAnyUniqueApplicationIdMapping) {
    errors.push("At least one source must map the Unique Application ID field");
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
