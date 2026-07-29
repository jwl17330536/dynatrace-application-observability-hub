/**
 * Lookup Adapter - Phase 1.5 & Phase 2
 * 
 * Converts field mappings to lookup-table-based DQL queries.
 * Works with generic lookup tables (e.g., "applications" table with user-defined columns).
 * 
 * Example lookup table structure:
 *   app_id (key), app_name, tier, owner
 * 
 * User defines mappings in Setup wizard:
 *   - appTag field → maps to lookup table column name (e.g., "app_id")
 *   - appName field → maps to lookup table column name (e.g., "app_name")
 *   - tier field → maps to lookup table column name (e.g., "tier")
 *   - owner field → maps to lookup table column name (e.g., "owner")
 * 
 * Phase 2: Replace tagsAdapter with lookupAdapter by changing config.dataSourceType in Setup.tsx
 * KEY INSIGHT: Visualization code needs ZERO changes (same table rendering for both adapters)
 */

export interface QuerySet {
  overview: string;
  traceCandidates: string;
  healthReport: string;
}

export interface LookupFieldInput {
  id: string;
  sourceColumn: string;
}

/**
 * Overview query: Fetch all rows from lookup table, project user-defined columns
 * 
 * Example: If user maps:
 *   appTag → "app_id"
 *   appName → "app_name"
 *   tier → "tier"
 *   owner → "owner"
 * 
 * This generates:
 *   fetch data from table "applications"
 *   | fields 
 *       appTag = this["app_id"],
 *       appName = this["app_name"],
 *       tier = this["tier"],
 *       owner = this["owner"]
 *   | sort by appTag
 */
const buildOverviewQuery = (
  fields: LookupFieldInput[],
  tableName: string
): string => {
  const selectedFields = fields.filter((field) => field.sourceColumn && field.sourceColumn.trim());
  const projections = selectedFields
    .map((field) => `    ${field.id} = this["${field.sourceColumn}"]`)
    .join(",\n");

  const hasAppName = selectedFields.some((field) => field.id === "applicationName");
  const sortKey = hasAppName ? "applicationName" : "uniqueApplicationId";

  return `fetch data from table "${tableName}"
| fields 
${projections}
| sort by ${sortKey} asc`;
};

/**
 * Trace Candidates query (Phase 2+)
 * 
 * For now: returns empty (Phase 1.5 doesn't require multi-query)
 * Phase 2: Implement correlation between lookup table and DT infrastructure
 */
const buildTraceCandidatesQuery = (
  _fields: LookupFieldInput[],
  _tableName: string
): string => {
  // Phase 2: Will implement lookup-to-host correlation
  return `fetch dt.entity.host
| limit 0`;
};

/**
 * Health Report query (Phase 2+)
 * 
 * For now: returns empty (Phase 1.5 doesn't require multi-query)
 * Phase 2: Implement coverage analysis (lookup records with/without DT entities)
 */
const buildHealthReportQuery = (
  _fields: LookupFieldInput[],
  _tableName: string
): string => {
  // Phase 2: Will implement lookup coverage analysis
  return `fetch data from table "${tableName}"
| limit 0`;
};

/**
 * Export the lookupAdapter with identical interface to tagsAdapter
 * 
 * Usage in Overview.tsx:
 *   const adapter = config.dataSourceType === "lookup" ? lookupAdapter : tagsAdapter;
 *   const query = adapter.buildQueries(config.fieldMappings, config.lookupTableName).overview;
 * 
 * KEY INSIGHT: Table rendering code never changes between adapters.
 * This proves Phase 1 → Phase 2 pivot requires ZERO visualization code changes.
 */
export const lookupAdapter = {
  /**
   * Build all three queries (overview, traceCandidates, healthReport)
   * @param fieldMappings User-defined column name mappings
   * @param tableName Name of the lookup table to query (default: "applications")
   * @returns QuerySet with overview, traceCandidates, and healthReport queries
   */
  buildQueries(
    fields: LookupFieldInput[],
    tableName: string = "applications"
  ): QuerySet {
    return {
      overview: buildOverviewQuery(fields, tableName),
      traceCandidates: buildTraceCandidatesQuery(fields, tableName),
      healthReport: buildHealthReportQuery(fields, tableName),
    } as QuerySet;
  },
};
