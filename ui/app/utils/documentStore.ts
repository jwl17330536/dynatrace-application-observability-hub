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
  featurePacks?: Partial<FeaturePacksConfig>;
}

export type FeaturePackMode = "native" | "enriched";

export interface FeaturePackConfig {
  enabled: boolean;
  mode: FeaturePackMode;
  lookupSourceId?: string;
}

export interface FeaturePacksConfig {
  observabilityEvidence: FeaturePackConfig;
  problemsAndAlerts: FeaturePackConfig;
  vulnerabilities: FeaturePackConfig;
  infrastructureCoverage: FeaturePackConfig;
}

export type EntityJoinSourceKind = "classic_tag" | "grail_field" | "grail_tag";

export type EntityJoinAppliesTo = "host" | "application" | "synthetic";

/** Extra ways to resolve CMDB application_id from Dynatrace entities (beyond primary host expression). */
export type EntityJoinSource = {
  id: string;
  kind: EntityJoinSourceKind;
  /** Classic: tag key before colon. Grail field: e.g. dt.cost.product. Grail tag: key after primary_tags. */
  key: string;
  appliesTo: EntityJoinAppliesTo[];
  label?: string;
};

export interface ApplicationVariableConfig {
  cmdbVariableSourceId: string;
  dynatraceApplicationIdFieldPath: string;
  cmdbApplicationIdColumn: string;
  cmdbApplicationNameColumn: string;
  cmdbOwnerColumn: string;
  cmdbTierColumn: string;
  /** Optional hub-managed lookup name (not cmdb-app). Columns: application_id, frontend_entity_id. */
  frontendMappingLookupName?: string;
  /**
   * In-app RUM maps (Document Store). Prefer over typing a lookup name.
   * Columns conceptually: frontend_entity_id → application_id.
   */
  frontendEntityMaps?: FrontendEntityMap[];
  /** Additional App ID join sources (classic tags / grail fields / grail tags). */
  entityJoinSources?: EntityJoinSource[];
}

export type FrontendEntityMap = {
  frontend_entity_id: string;
  application_id: string;
};

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

/** Sentinel for optional CMDB columns the operator chooses to ignore. */
export const IGNORE_COLUMN_VALUE = "__ignore__";

/** Temporary Hub upload tables → Loop B primary apps lookup. */
const LEGACY_LOOKUP_TABLE_ALIASES: Record<string, string> = {
  cmdb_fake: "cmdb_businessapp",
  cmdb_fake2: "cmdb_businessapp",
};

const LEGACY_COLUMN_ALIASES: Record<string, string> = {
  cmdb_ci_key: "application_id",
  name: "application_name",
  owned_by: "cmdb_owner",
  business_criticality: "tier",
};

function normalizeLookupTableName(name: string): string {
  const trimmed = (name || "").trim();
  const withoutPrefix = trimmed.replace(/^\/?lookups\//, "");
  return LEGACY_LOOKUP_TABLE_ALIASES[withoutPrefix] || withoutPrefix;
}

function normalizeColumnName(column: string): string {
  const trimmed = (column || "").trim();
  if (!trimmed || trimmed === IGNORE_COLUMN_VALUE) {
    return trimmed;
  }
  return LEGACY_COLUMN_ALIASES[trimmed] || trimmed;
}

/**
 * Point legacy cmdb_fake sources at /lookups/cmdb_businessapp and remap old export columns.
 */
export function migrateLookupConfig(config: MappingConfig): { config: MappingConfig; migrated: boolean } {
  let migrated = false;

  const sources = config.sources.map((source) => {
    const originalTable = (source.lookupTableName || "").trim();
    const nextTable = normalizeLookupTableName(originalTable);
    if (nextTable !== originalTable) {
      migrated = true;
    }

    const fields = source.fields.map((field) => {
      const nextColumn = normalizeColumnName(field.sourceColumn);
      if (nextColumn !== field.sourceColumn) {
        migrated = true;
        return { ...field, sourceColumn: nextColumn };
      }
      return field;
    });

    return {
      ...source,
      lookupTableName: nextTable,
      fields,
    };
  });

  const vars = config.applicationVariables;
  const nextVars: ApplicationVariableConfig = {
    ...vars,
    cmdbApplicationIdColumn: normalizeColumnName(vars.cmdbApplicationIdColumn),
    cmdbApplicationNameColumn: normalizeColumnName(vars.cmdbApplicationNameColumn),
    cmdbOwnerColumn: normalizeColumnName(vars.cmdbOwnerColumn),
    cmdbTierColumn: normalizeColumnName(vars.cmdbTierColumn),
  };
  if (
    nextVars.cmdbApplicationIdColumn !== vars.cmdbApplicationIdColumn ||
    nextVars.cmdbApplicationNameColumn !== vars.cmdbApplicationNameColumn ||
    nextVars.cmdbOwnerColumn !== vars.cmdbOwnerColumn ||
    nextVars.cmdbTierColumn !== vars.cmdbTierColumn
  ) {
    migrated = true;
  }

  return {
    config: {
      ...config,
      sources,
      applicationVariables: nextVars,
    },
    migrated,
  };
}

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

async function applyLookupMigration(raw: MappingConfig | null): Promise<MappingConfig | null> {
  if (!raw) {
    return null;
  }
  const { config, migrated } = migrateLookupConfig(raw);
  if (migrated) {
    try {
      await saveConfig(config);
    } catch (error) {
      console.warn("Migrated lookup config but failed to persist:", error);
    }
  }
  return config;
}

export async function fetchConfigFromDocumentStore(): Promise<MappingConfig | null> {
  if (USE_LOCAL_STORAGE) {
    const cached = localStorage.getItem(DOCUMENT_STORE_KEY);
    return applyLookupMigration(cached ? JSON.parse(cached) : null);
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
    return applyLookupMigration(data);
  } catch (error) {
    console.warn("Error fetching from Document Store, falling back to localStorage:", error);
    const cached = localStorage.getItem(DOCUMENT_STORE_KEY);
    return applyLookupMigration(cached ? JSON.parse(cached) : null);
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
    cmdbApplicationNameColumn: IGNORE_COLUMN_VALUE,
    cmdbOwnerColumn: IGNORE_COLUMN_VALUE,
    cmdbTierColumn: IGNORE_COLUMN_VALUE,
    frontendMappingLookupName: "",
    frontendEntityMaps: [],
    entityJoinSources: [],
  };
}

export function normalizeEntityJoinSources(
  sources: EntityJoinSource[] | undefined,
  primaryExpression: string
): EntityJoinSource[] {
  const cleaned = (sources || [])
    .map((source) => ({
      ...source,
      id: source.id || `join-${Math.random().toString(36).slice(2, 9)}`,
      key: (source.key || "").trim(),
      appliesTo: (source.appliesTo || []).filter(Boolean) as EntityJoinAppliesTo[],
    }))
    .filter((source) => source.key && source.appliesTo.length > 0);

  // If nothing configured and primary is a simple identifier, treat as grail_field for hosts.
  if (!cleaned.length) {
    const primary = (primaryExpression || "").trim();
    if (primary && !primary.includes("(") && !primary.includes(" ")) {
      return [
        {
          id: "primary-host-field",
          kind: "grail_field",
          key: primary,
          appliesTo: ["host"],
          label: "Primary host expression",
        },
      ];
    }
  }
  return cleaned;
}

/** Seed UI list from legacy primary expression when entityJoinSources is empty. */
export function seedEntityJoinSourcesFromPrimary(
  sources: EntityJoinSource[] | undefined,
  primaryExpression: string
): EntityJoinSource[] {
  const existing = sources || [];
  if (existing.length > 0) {
    return existing;
  }
  const primary = (primaryExpression || "").trim();
  if (!primary) {
    return [];
  }
  return [
    {
      id: `join-seed-${Date.now().toString(36)}`,
      kind: "grail_field",
      key: primary,
      appliesTo: ["host"],
      label: "Primary host expression",
    },
  ];
}

/** Prefer first host grail_field key; else first host mapping key. */
export function resolvePrimaryFromJoinSources(sources: EntityJoinSource[] | undefined): string {
  const list = sources || [];
  const hostGrail = list.find(
    (source) => source.kind === "grail_field" && source.appliesTo.includes("host") && (source.key || "").trim()
  );
  if (hostGrail) {
    return hostGrail.key.trim();
  }
  const hostAny = list.find((source) => source.appliesTo.includes("host") && (source.key || "").trim());
  return hostAny ? hostAny.key.trim() : "";
}

export function defaultAppliesToForKind(kind: EntityJoinSourceKind): EntityJoinAppliesTo[] {
  if (kind === "grail_field") {
    return ["host"];
  }
  return ["application", "synthetic"];
}

export function placeholderForJoinKind(kind: EntityJoinSourceKind): string {
  if (kind === "grail_field") {
    return "e.g. dt.cost.product";
  }
  return "e.g. application_id";
}

export function labelForJoinKind(kind: EntityJoinSourceKind): string {
  if (kind === "classic_tag") {
    return "Classic entity tag";
  }
  if (kind === "grail_field") {
    return "Primary Grail field";
  }
  return "Primary Grail tag";
}

export function getDefaultFeaturePacks(): FeaturePacksConfig {
  return {
    observabilityEvidence: {
      enabled: true,
      mode: "native",
    },
    problemsAndAlerts: {
      enabled: true,
      mode: "native",
    },
    vulnerabilities: {
      enabled: true,
      mode: "native",
    },
    infrastructureCoverage: {
      enabled: false,
      mode: "enriched",
      lookupSourceId: "",
    },
  };
}

export function mergeFeaturePacks(featurePacks?: Partial<FeaturePacksConfig>): FeaturePacksConfig {
  const defaults = getDefaultFeaturePacks();
  return {
    observabilityEvidence: {
      ...defaults.observabilityEvidence,
      ...(featurePacks?.observabilityEvidence || {}),
    },
    problemsAndAlerts: {
      ...defaults.problemsAndAlerts,
      ...(featurePacks?.problemsAndAlerts || {}),
    },
    vulnerabilities: {
      ...defaults.vulnerabilities,
      ...(featurePacks?.vulnerabilities || {}),
    },
    infrastructureCoverage: {
      ...defaults.infrastructureCoverage,
      ...(featurePacks?.infrastructureCoverage || {}),
    },
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
      errors.push("Dynatrace Application ID expression is required");
    }

    const selectedSource = config.sources.find((source) => source.sourceId === vars.cmdbVariableSourceId);
    const selectedSourceUnique = selectedSource?.fields.find((field) => field.id === "uniqueApplicationId")?.sourceColumn?.trim();
    if (!selectedSourceUnique) {
      errors.push("Selected CMDB variable source must map Unique Application ID in Step 2");
    }
  }

  if (!hasAnyUniqueApplicationIdMapping) {
    errors.push("At least one source must map the Unique Application ID field");
  }

  const featurePacks = mergeFeaturePacks(config.featurePacks);
  const packEntries = Object.entries(featurePacks) as Array<[keyof FeaturePacksConfig, FeaturePackConfig]>;
  for (const [packId, pack] of packEntries) {
    if (pack.mode !== "native" && pack.mode !== "enriched") {
      errors.push(`Feature pack '${packId}' has an invalid mode`);
    }
    if (pack.mode === "enriched" && pack.lookupSourceId && !sourceIds.has(pack.lookupSourceId)) {
      errors.push(`Feature pack '${packId}' references unknown lookup source '${pack.lookupSourceId}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
