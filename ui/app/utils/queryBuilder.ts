import { MappingConfig } from "@utils/documentStore";
import { lookupAdapter } from "./adapters/lookupAdapter";

export interface QuerySet {
  overview: string;
  traceCandidates: string;
  healthReport: string;
}

/**
 * Build DQL queries based on data source type and field mappings
 * Routes to appropriate adapter
 */
export function buildQueriesForDataSource(config: MappingConfig): QuerySet {
  if (config.mode === "lookup") {
    const defaultSource = config.sources.find((source) => source.sourceId === config.defaultSourceId);
    if (!defaultSource) {
      throw new Error(`Default source '${config.defaultSourceId}' not found`);
    }

    return lookupAdapter.buildQueries(
      defaultSource.fields.map((field) => ({
        id: field.id,
        sourceColumn: field.sourceColumn,
      })),
      defaultSource.lookupTableName
    );
  }

  throw new Error(`Unknown mode: ${(config as { mode?: string }).mode}`);
}
