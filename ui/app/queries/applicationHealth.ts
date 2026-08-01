/**
 * Application Health DQL builders (hub-only).
 * Spine A: host → dt.cost.product → application_id (four CMDB fields for labels).
 * Spine B: RUM Application dt.cost.product tags (+ name/hub map fallbacks) + synthetics (not from cmdb-app).
 */
import {
  IGNORE_COLUMN_VALUE,
  type ApplicationVariableConfig,
} from "@utils/documentStore";
import { buildClassicTagAppIdExpression } from "@utils/joinSources";

function sanitizeExpression(value: string): string {
  return value.replace(/[`\n\r]/g, "").trim();
}

function sanitizeColumnName(value: string): string {
  return value.replace(/`/g, "").trim();
}

function quoteLookupColumn(column: string): string {
  return `\`${sanitizeColumnName(column)}\``;
}

function isIgnoredColumnSelection(column: string | undefined): boolean {
  const trimmed = (column || "").trim();
  return !trimmed || trimmed === IGNORE_COLUMN_VALUE;
}

function toLookupPath(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("/lookups/")) return trimmed;
  if (trimmed.startsWith("lookups/")) return `/${trimmed}`;
  return `/lookups/${trimmed}`;
}

export function buildCmdbLabelDataset(
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const nameExpression = isIgnoredColumnSelection(variables.cmdbApplicationNameColumn)
    ? `toString(${quoteLookupColumn(cmdbAppIdColumn)})`
    : `toString(${quoteLookupColumn(variables.cmdbApplicationNameColumn)})`;
  const ownerExpression = isIgnoredColumnSelection(variables.cmdbOwnerColumn)
    ? `""`
    : `toString(${quoteLookupColumn(variables.cmdbOwnerColumn)})`;
  const tierExpression = isIgnoredColumnSelection(variables.cmdbTierColumn)
    ? `""`
    : `toString(${quoteLookupColumn(variables.cmdbTierColumn)})`;

  return `load "${lookupPath}"
| fieldsAdd cmdb_app_id = toString(${quoteLookupColumn(cmdbAppIdColumn)}), cmdb_app_name = ${nameExpression}, cmdb_owner = ${ownerExpression}, cmdb_tier = ${tierExpression}
| filter isNotNull(cmdb_app_id)
| dedup cmdb_app_id`;
}

export function buildHostAppMapDataset(dynatraceApplicationIdFieldPath: string): string {
  const expression = sanitizeExpression(dynatraceApplicationIdFieldPath);
  if (expression !== "dt.cost.product") {
    return `data record(host_id = "", host_name = "", app_id = "")
| filter false`;
  }

  return `fetch dt.entity.host
| fieldsAdd cost_product_candidates = arrayRemoveNulls(
    iCollectArray(
      if(contains(tags[], "dt.cost.product:"), arrayLast(splitString(tags[], ":")))
    )
  )
| fieldsAdd app_id = arrayLast(cost_product_candidates), host_id = toString(id), host_name = toString(entity.name)
| filter isNotNull(app_id) AND app_id != ""
| fields host_id, host_name, app_id`;
}

/** Active Davis problems rolled to hosts (direct host dim + PGI→host), then to application_id. */
export function buildOpenProblemsByAppQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);

  return `fetch dt.davis.problems, from:now()-7d
| filter not(dt.davis.is_duplicate) and event.status == "ACTIVE"
| fieldsAdd host_ids = dt.entity.host
| expand host_id = host_ids
| fieldsAdd host_id = toString(host_id)
| filter isNotNull(host_id) AND host_id != ""
| fields display_id, event.name, event.category, event.status, event.start, host_id
| append [
fetch dt.davis.problems, from:now()-7d
| filter not(dt.davis.is_duplicate) and event.status == "ACTIVE"
| filter isNull(dt.entity.host) OR arraySize(dt.entity.host) == 0
| expand pgi = dt.entity.process_group_instance
| fieldsAdd pgi_id = toString(pgi)
| filter isNotNull(pgi_id) AND pgi_id != ""
| lookup [
fetch dt.entity.process_group_instance
| fieldsAdd host_id = toString(belongs_to[dt.entity.host])
| fields pgi_id = toString(id), host_id
], sourceField:pgi_id, lookupField:pgi_id, fields:{host_id}
| filter isNotNull(host_id) AND host_id != ""
| fields display_id, event.name, event.category, event.status, event.start, host_id
]
| lookup [
${hostMap}
], sourceField:host_id, lookupField:host_id, fields:{host_name, app_id}
| filter isNotNull(app_id) AND app_id != ""
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| summarize problem_count = countDistinct(display_id), categories = collectDistinct(event.category), by:{app_id, app_name}
| fields app_id, app_name, problem_count, categories
| sort problem_count desc, app_name asc
| limit 500`;
}

export function buildOpenProblemsByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);

  return `fetch dt.davis.problems, from:now()-7d
| filter not(dt.davis.is_duplicate) and event.status == "ACTIVE"
| fieldsAdd host_ids = dt.entity.host
| expand host_id = host_ids
| fieldsAdd host_id = toString(host_id)
| filter isNotNull(host_id) AND host_id != ""
| fields display_id, problem_event_id = toString(event.id), event.name, event.category, event.status, event.start, host_id
| append [
fetch dt.davis.problems, from:now()-7d
| filter not(dt.davis.is_duplicate) and event.status == "ACTIVE"
| filter isNull(dt.entity.host) OR arraySize(dt.entity.host) == 0
| expand pgi = dt.entity.process_group_instance
| fieldsAdd pgi_id = toString(pgi)
| filter isNotNull(pgi_id) AND pgi_id != ""
| lookup [
fetch dt.entity.process_group_instance
| fieldsAdd host_id = toString(belongs_to[dt.entity.host])
| fields pgi_id = toString(id), host_id
], sourceField:pgi_id, lookupField:pgi_id, fields:{host_id}
| filter isNotNull(host_id) AND host_id != ""
| fields display_id, problem_event_id = toString(event.id), event.name, event.category, event.status, event.start, host_id
]
| lookup [
${hostMap}
], sourceField:host_id, lookupField:host_id, fields:{host_name, app_id}
| filter isNotNull(app_id) AND app_id != ""
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_id, host_name, display_id, problem_event_id, event.name, event.category, event.status, event.start
| sort app_name asc, host_name asc, event.start desc
| limit 1000`;
}

export function buildOpenVulnerabilitiesByAppQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);

  return `fetch security.events, from:now()-7d
| filter event.provider == "Dynatrace"
  and event.type == "VULNERABILITY_STATE_REPORT_EVENT"
  and event.level == "ENTITY"
| dedup {vulnerability.display_id, affected_entity.id}, sort:{timestamp desc}
| filter vulnerability.resolution.status == "OPEN"
| expand host_id = related_entities.hosts.ids
| fieldsAdd host_id = toString(host_id)
| filter isNotNull(host_id) AND host_id != ""
| lookup [
${hostMap}
], sourceField:host_id, lookupField:host_id, fields:{host_name, app_id}
| filter isNotNull(app_id) AND app_id != ""
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name, cmdb_owner, cmdb_tier
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name, cmdb_owner, cmdb_tier}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fieldsAdd owner = if(isNotNull(cmdb_owner) AND cmdb_owner != "", then:cmdb_owner, else:""), tier = if(isNotNull(cmdb_tier) AND cmdb_tier != "", then:cmdb_tier, else:"")
| dedup {vulnerability.display_id, app_id}, sort:{timestamp desc}
| fieldsAdd
    is_critical = if(vulnerability.risk.level == "CRITICAL", then:1, else:0),
    is_high = if(vulnerability.risk.level == "HIGH", then:1, else:0),
    is_medium = if(vulnerability.risk.level == "MEDIUM", then:1, else:0),
    is_low = if(vulnerability.risk.level == "LOW", then:1, else:0)
| summarize
    vulnerabilities_critical = sum(is_critical),
    vulnerabilities_high = sum(is_high),
    vulnerabilities_medium = sum(is_medium),
    vulnerabilities_low = sum(is_low),
    vulnerabilities_total = sum(is_critical) + sum(is_high) + sum(is_medium) + sum(is_low),
    by:{app_id, app_name, owner, tier}
| fields app_id, app_name, owner, tier, vulnerabilities_critical, vulnerabilities_high, vulnerabilities_medium, vulnerabilities_low, vulnerabilities_total
| sort vulnerabilities_critical desc, vulnerabilities_high desc, vulnerabilities_total desc, app_name asc
| limit 500`;
}

/**
 * Host-level open vulnerabilities. Hard | limit 1000 — UI gates the table behind
 * application selection + Critical/High severity chips. At 10k+ hosts, follow-up:
 * inject app_id into DQL and/or group-by-CVE instead of client-side full dumps.
 */
export function buildOpenVulnerabilitiesByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);

  return `fetch security.events, from:now()-7d
| filter event.provider == "Dynatrace"
  and event.type == "VULNERABILITY_STATE_REPORT_EVENT"
  and event.level == "ENTITY"
| dedup {vulnerability.display_id, affected_entity.id}, sort:{timestamp desc}
| filter vulnerability.resolution.status == "OPEN"
| expand host_id = related_entities.hosts.ids
| fieldsAdd host_id = toString(host_id)
| filter isNotNull(host_id) AND host_id != ""
| lookup [
${hostMap}
], sourceField:host_id, lookupField:host_id, fields:{host_name, app_id}
| filter isNotNull(app_id) AND app_id != ""
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name, cmdb_owner, cmdb_tier
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name, cmdb_owner, cmdb_tier}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fieldsAdd owner = if(isNotNull(cmdb_owner) AND cmdb_owner != "", then:cmdb_owner, else:""), tier = if(isNotNull(cmdb_tier) AND cmdb_tier != "", then:cmdb_tier, else:"")
| fields app_id, app_name, host_id, host_name, owner, tier, vuln_id = vulnerability.display_id, risk_level = vulnerability.risk.level, vuln_title = coalesce(vulnerability.title, event.description), vulnerable_component = toString(affected_entity.vulnerable_component.name), technology = toString(vulnerability.technology), cves = arrayToString(vulnerability.references.cve, delimiter: ", "), external_id = toString(vulnerability.external_id)
| sort risk_level asc, app_name asc, host_name asc
| limit 1000`;
}

/**
 * RUM frontend inventory from classic entities (fallback when Smartscape unavailable).
 * Join waterfall: Setup join_source → hub map lookup → name match.
 */
export function buildExperienceFrontendsQuery(
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string,
  frontendMappingLookupName: string
): string {
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);
  const mapName = frontendMappingLookupName.trim();
  const mapPath = mapName ? toLookupPath(mapName) : "";
  const tagExpr = buildClassicTagAppIdExpression(
    variables.entityJoinSources,
    variables.dynatraceApplicationIdFieldPath,
    "application"
  );

  const hubLookup = mapPath
    ? `| lookup [
load "${mapPath}"
| fieldsAdd app_id = toString(application_id), frontend_id = toString(frontend_entity_id)
| filter isNotNull(app_id) AND isNotNull(frontend_id) AND frontend_id != ""
| fields app_id, frontend_id
], sourceField:frontend_id, lookupField:frontend_id, fields:{app_id}
| fieldsAdd hub_app_id = app_id
| fieldsRemove app_id`
    : `| fieldsAdd hub_app_id = ""`;

  const mapAndProject = `| fieldsAdd tag_app_id = ${tagExpr}
| lookup [
${cmdb}
| fieldsAdd match_key = lower(cmdb_app_name)
| fields cmdb_app_id, cmdb_app_name, match_key
], sourceField:match_key, lookupField:match_key, fields:{cmdb_app_id, cmdb_app_name}
| fieldsAdd name_app_id = cmdb_app_id, name_app_name = cmdb_app_name
| fieldsRemove cmdb_app_id, cmdb_app_name
${hubLookup}
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:tag_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd tag_app_name = cmdb_app_name
| fieldsRemove cmdb_app_name
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:hub_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd hub_app_name = cmdb_app_name
| fieldsRemove cmdb_app_name
| fieldsAdd
    app_id = if(isNotNull(tag_app_id) AND tag_app_id != "", then:tag_app_id, else:if(isNotNull(hub_app_id) AND hub_app_id != "", then:hub_app_id, else:name_app_id)),
    app_name = if(isNotNull(tag_app_id) AND tag_app_id != "", then:coalesce(tag_app_name, tag_app_id), else:if(isNotNull(hub_app_id) AND hub_app_id != "", then:coalesce(hub_app_name, hub_app_id), else:name_app_name)),
    mapping_method = if(isNotNull(tag_app_id) AND tag_app_id != "", then:"join_source", else:if(isNotNull(hub_app_id) AND hub_app_id != "", then:"hub_map", else:if(isNotNull(name_app_id) AND name_app_id != "", then:"name_match", else:"unmapped")))
| fields frontend_id, frontend_name, app_id, app_name, mapping_method, name_key`;

  return `fetch dt.entity.application
| fieldsAdd frontend_id = toString(id), frontend_name = toString(entity.name), match_key = lower(toString(entity.name)), name_key = lower(toString(entity.name))
${mapAndProject}
| append [
fetch dt.entity.mobile_application
| fieldsAdd frontend_id = toString(id), frontend_name = toString(entity.name), match_key = lower(toString(entity.name)), name_key = lower(toString(entity.name))
${mapAndProject}
]
| append [
fetch dt.entity.custom_application
| fieldsAdd frontend_id = toString(id), frontend_name = toString(entity.name), match_key = lower(toString(entity.name)), name_key = lower(toString(entity.name))
${mapAndProject}
]
| dedup frontend_id
| fields frontend_id, frontend_name, app_id, app_name, mapping_method
| sort mapping_method asc, frontend_name asc
| limit 500`;
}

/**
 * Bare Smartscape FRONTEND inventory — no CMDB lookups.
 * Use this for the full Experience Explorer list; mapping is applied client-side.
 * Requires storage:smartscape:read.
 */
export function buildSmartscapeFrontendsInventoryQuery(): string {
  return `smartscapeNodes FRONTEND
| fieldsAdd
    frontend_id = toString(id),
    frontend_name = toString(name),
    classic_id = toString(id_classic)
| filter isNotNull(frontend_id) AND frontend_id != ""
| fields frontend_id, frontend_name, classic_id
| sort frontend_name asc
| limit 500`;
}

/** @deprecated Prefer bare inventory + client mapping; kept for Query details / synthetics enrichment. */
export function buildSmartscapeFrontendsQuery(
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string,
  frontendMappingLookupName: string
): string {
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);
  const mapName = frontendMappingLookupName.trim();
  const mapPath = mapName ? toLookupPath(mapName) : "";
  const tagExpr = buildClassicTagAppIdExpression(
    variables.entityJoinSources,
    variables.dynatraceApplicationIdFieldPath,
    "application"
  );

  const hubLookup = mapPath
    ? `| lookup [
load "${mapPath}"
| fieldsAdd app_id = toString(application_id), frontend_id = toString(frontend_entity_id)
| filter isNotNull(app_id) AND isNotNull(frontend_id) AND frontend_id != ""
| fields app_id, frontend_id
], sourceField:frontend_id, lookupField:frontend_id, fields:{app_id}
| fieldsAdd hub_app_id = app_id
| fieldsRemove app_id`
    : `| fieldsAdd hub_app_id = ""`;

  return `smartscapeNodes FRONTEND
| fieldsAdd
    frontend_id = toString(id),
    frontend_name = toString(name),
    classic_id = toString(id_classic),
    match_key = lower(toString(name)),
    name_key = lower(toString(name))
| fieldsAdd tag_app_id = ${tagExpr}
| lookup [
${cmdb}
| fieldsAdd match_key = lower(cmdb_app_name)
| fields cmdb_app_id, cmdb_app_name, match_key
], sourceField:match_key, lookupField:match_key, fields:{cmdb_app_id, cmdb_app_name}
| fieldsAdd name_app_id = cmdb_app_id, name_app_name = cmdb_app_name
| fieldsRemove cmdb_app_id, cmdb_app_name
${hubLookup}
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:tag_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd tag_app_name = cmdb_app_name
| fieldsRemove cmdb_app_name
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:hub_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd hub_app_name = cmdb_app_name
| fieldsRemove cmdb_app_name
| fieldsAdd
    app_id = if(isNotNull(tag_app_id) AND tag_app_id != "", then:tag_app_id, else:if(isNotNull(hub_app_id) AND hub_app_id != "", then:hub_app_id, else:name_app_id)),
    app_name = if(isNotNull(tag_app_id) AND tag_app_id != "", then:coalesce(tag_app_name, tag_app_id), else:if(isNotNull(hub_app_id) AND hub_app_id != "", then:coalesce(hub_app_name, hub_app_id), else:name_app_name)),
    mapping_method = if(isNotNull(tag_app_id) AND tag_app_id != "", then:"join_source", else:if(isNotNull(hub_app_id) AND hub_app_id != "", then:"hub_map", else:if(isNotNull(name_app_id) AND name_app_id != "", then:"name_match", else:"unmapped")))
| fields frontend_id, frontend_name, classic_id, app_id, app_name, mapping_method
| sort mapping_method asc, frontend_name asc
| limit 500`;
}

/**
 * Extract CMDB application_id from frontend display name.
 * Prefer suffix __digits (homeassistant__5805); else prefix digits_ (5805_homeassistant).
 */
export function extractApplicationIdFromFrontendName(frontendName: string | undefined | null): string | null {
  const name = String(frontendName || "").trim();
  if (!name) {
    return null;
  }
  const suffix = name.match(/__(\d+)$/);
  if (suffix?.[1]) {
    return suffix[1];
  }
  const prefix = name.match(/^(\d+)_/);
  if (prefix?.[1]) {
    return prefix[1];
  }
  return null;
}


export function buildExperienceSyntheticsQuery(
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string,
  frontendMappingLookupName: string
): string {
  const frontends = buildExperienceFrontendsQuery(lookupPath, variables, cmdbAppIdColumn, frontendMappingLookupName);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);
  const tagExpr = buildClassicTagAppIdExpression(
    variables.entityJoinSources,
    variables.dynatraceApplicationIdFieldPath,
    "synthetic"
  );

  return `fetch dt.entity.synthetic_test
| fieldsAdd synthetic_id = toString(id), synthetic_name = toString(entity.name), frontend_refs = monitors[dt.entity.application]
| fieldsAdd synth_tag_app_id = ${tagExpr}
| fields synthetic_id, synthetic_name, frontend_refs, synth_tag_app_id
| append [
fetch dt.entity.http_check
| fieldsAdd synthetic_id = toString(id), synthetic_name = toString(entity.name), frontend_refs = monitors[dt.entity.application]
| fieldsAdd synth_tag_app_id = ${tagExpr}
| fields synthetic_id, synthetic_name, frontend_refs, synth_tag_app_id
]
| expand frontend_id = frontend_refs
| fieldsAdd frontend_id = toString(frontend_id)
| lookup [
${frontends}
| fields frontend_id, frontend_name, app_id, app_name, mapping_method
], sourceField:frontend_id, lookupField:frontend_id, fields:{frontend_name, app_id, app_name, mapping_method}
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:synth_tag_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd
    app_id = if(isNotNull(synth_tag_app_id) AND synth_tag_app_id != "", then:synth_tag_app_id, else:app_id),
    app_name = if(isNotNull(synth_tag_app_id) AND synth_tag_app_id != "", then:coalesce(cmdb_app_name, synth_tag_app_id), else:app_name),
    mapping_method = if(isNotNull(synth_tag_app_id) AND synth_tag_app_id != "", then:"join_source", else:if(isNotNull(mapping_method) AND mapping_method != "" AND mapping_method != "unmapped", then:mapping_method, else:if(isNotNull(frontend_id) AND frontend_id != "", then:"frontend_unmapped", else:"unmapped")))
| dedup synthetic_id, sort:{mapping_method asc}
| fields synthetic_id, synthetic_name, frontend_id, frontend_name, app_id, app_name, mapping_method
| sort mapping_method asc, synthetic_name asc
| limit 500`;
}

/** Digital hosts: hosts → join sources / primary cost product → CMDB. */
export function buildDigitalHostsQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);
  // When primary expression is not dt.cost.product, still try classic-tag join sources on hosts.
  const tagExpr = buildClassicTagAppIdExpression(
    variables.entityJoinSources,
    variables.dynatraceApplicationIdFieldPath,
    "host"
  );
  const primary = sanitizeExpression(dynatraceApplicationIdFieldPath);

  if (primary === "dt.cost.product") {
    return `${hostMap}
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields host_id, host_name, app_id, app_name
| sort app_name asc, host_name asc
| limit 1000`;
  }

  return `fetch dt.entity.host
| fieldsAdd host_id = toString(id), host_name = toString(entity.name)
| fieldsAdd app_id = ${tagExpr}
| filter isNotNull(app_id) AND app_id != ""
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields host_id, host_name, app_id, app_name
| sort app_name asc, host_name asc
| limit 1000`;
}

/** Portfolio health: CMDB apps + host counts + open problems + vulnerability severity counts. */
export function buildApplicationHealthPortfolioQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);
  const problems = buildOpenProblemsByAppQuery(dynatraceApplicationIdFieldPath, lookupPath, variables, cmdbAppIdColumn);
  const vulns = buildOpenVulnerabilitiesByAppQuery(dynatraceApplicationIdFieldPath, lookupPath, variables, cmdbAppIdColumn);

  return `${cmdb}
| fields app_id = cmdb_app_id, app_name = cmdb_app_name, owner = cmdb_owner, tier = cmdb_tier
| lookup [
${hostMap}
| summarize host_count = countDistinct(host_id), by:{app_id}
], sourceField:app_id, lookupField:app_id, fields:{host_count}
| lookup [
${problems}
| fields app_id, problem_count
], sourceField:app_id, lookupField:app_id, fields:{problem_count}
| lookup [
${vulns}
| fields app_id, vulnerabilities_critical, vulnerabilities_high, vulnerabilities_medium, vulnerabilities_low, vulnerabilities_total
], sourceField:app_id, lookupField:app_id, fields:{vulnerabilities_critical, vulnerabilities_high, vulnerabilities_medium, vulnerabilities_low, vulnerabilities_total}
| fieldsAdd
    host_count = coalesce(toLong(host_count), 0),
    problem_count = coalesce(toLong(problem_count), 0),
    vulnerabilities_critical = coalesce(toLong(vulnerabilities_critical), 0),
    vulnerabilities_high = coalesce(toLong(vulnerabilities_high), 0),
    vulnerabilities_medium = coalesce(toLong(vulnerabilities_medium), 0),
    vulnerabilities_low = coalesce(toLong(vulnerabilities_low), 0),
    vulnerabilities_total = coalesce(toLong(vulnerabilities_total), 0),
    in_dynatrace = if(coalesce(toLong(host_count), 0) > 0, then:"YES", else:"NO")
| fields app_id, app_name, owner, tier, in_dynatrace, host_count, problem_count, vulnerabilities_critical, vulnerabilities_high, vulnerabilities_medium, vulnerabilities_low, vulnerabilities_total
| sort problem_count desc, vulnerabilities_critical desc, vulnerabilities_high desc, app_name asc
| limit 500`;
}

/** Classic services per CMDB app (service → host → dt.cost.product). */
export function buildServicesByAppSummaryQuery(dynatraceApplicationIdFieldPath: string): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  return `fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fieldsAdd host_id = toString(host_id)
| filter isNotNull(host_id) AND host_id != ""
| lookup [
${hostMap}
], sourceField:host_id, lookupField:host_id, fields:{app_id}
| filter isNotNull(app_id) AND app_id != ""
| summarize service_count = countDistinct(service_id), by:{app_id}
| fields app_id, service_count
| sort service_count desc
| limit 500`;
}

/** Agent monitoring modes per CMDB app (distinct modes or Mixed). */
export function buildAgentModeByAppQuery(dynatraceApplicationIdFieldPath: string): string {
  const expression = sanitizeExpression(dynatraceApplicationIdFieldPath);
  if (expression !== "dt.cost.product") {
    return `data record(app_id = "", agent_mode = "")
| filter false`;
  }
  return `fetch dt.entity.host
| fieldsAdd cost_product_candidates = arrayRemoveNulls(
    iCollectArray(
      if(contains(tags[], "dt.cost.product:"), arrayLast(splitString(tags[], ":")))
    )
  )
| fieldsAdd app_id = arrayLast(cost_product_candidates), monitoring_mode = toString(monitoringMode)
| filter isNotNull(app_id) AND app_id != "" AND isNotNull(monitoring_mode) AND monitoring_mode != ""
| summarize modes = collectDistinct(monitoring_mode), by:{app_id}
| fieldsAdd agent_mode = if(arraySize(modes) > 1, then:"Mixed", else:arrayFirst(modes))
| fields app_id, agent_mode
| limit 500`;
}

/** Service detail rows: service + host + app (Signal deep dive). */
export function buildServicesByApplicationDetailQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostMap = buildHostAppMapDataset(dynatraceApplicationIdFieldPath);
  const cmdb = buildCmdbLabelDataset(lookupPath, variables, cmdbAppIdColumn);
  return `fetch dt.entity.service
| fieldsAdd service_id = toString(id), service_name = toString(entity.name), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fieldsAdd host_id = toString(host_id)
| filter isNotNull(host_id) AND host_id != ""
| lookup [
${hostMap}
], sourceField:host_id, lookupField:host_id, fields:{host_name, app_id}
| filter isNotNull(app_id) AND app_id != ""
| lookup [
${cmdb}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.service)
| summarize spans_24h = count(), by:{service_id = toString(dt.entity.service)}
], sourceField:service_id, lookupField:service_id, fields:{spans_24h}
| fieldsAdd spans_24h = coalesce(toLong(spans_24h), 0)
| fields app_id, app_name, service_id, service_name, host_id, host_name, spans_24h
| sort app_name asc, service_name asc
| limit 500`;
}

/**
 * Gen3 RUM session aggregates by frontend.name (24h).
 * Join client-side to mapped frontends via lower(frontend_name).
 */
export function buildRumSessionsByFrontendNameQuery(): string {
  // Prefer user.sessions; include null user_type. Fallback path uses estimated_count metric.
  return `fetch user.sessions, from:now()-24h
| filter isNull(dt.rum.user_type) OR dt.rum.user_type == "real_user" OR dt.rum.user_type == "REAL_USER"
| expand frontend_name = frontend.name
| fieldsAdd frontend_name = toString(frontend_name), name_key = lower(toString(frontend_name))
| filter isNotNull(name_key) AND name_key != "" AND name_key != "null"
| summarize
    sessions_24h = count(),
    user_actions_24h = sum(toLong(user_action_count)),
    by:{name_key, frontend_name}
| fields name_key, frontend_name, sessions_24h, user_actions_24h
| sort sessions_24h desc
| limit 500`;
}

/** Fallback when user.sessions join fails — estimated active sessions by frontend.name (24h). */
export function buildRumSessionsFallbackByFrontendNameQuery(): string {
  return `timeseries {
  sessions_24h = countDistinct(dt.frontend.session.active.estimated_count, scalar: true)
},
by: { frontend.name },
from: now() - 24h
| fieldsAdd
    frontend_name = toString(frontend.name),
    name_key = lower(toString(frontend.name)),
    user_actions_24h = 0
| filter isNotNull(name_key) AND name_key != "" AND name_key != "null"
| fields name_key, frontend_name, sessions_24h, user_actions_24h
| sort sessions_24h desc
| limit 500`;
}

/** Host CPU / memory / availability scalars (2h) for Mission Control tables. */
export function buildHostKpiScalarsQuery(): string {
  return `timeseries {
  cpu = avg(dt.host.cpu.usage, scalar: true),
  memory = avg(dt.host.memory.usage, scalar: true),
  avail_up = sum(dt.host.availability, scalar: true, default: 0, filter: { availability.state == "up" }),
  avail_all = sum(dt.host.availability, scalar: true, default: 0)
},
by: { dt.entity.host },
from: now() - 2h
| fieldsAdd
    host_id = toString(dt.entity.host),
    host_name = entityName(dt.entity.host),
    availability_pct = if(avail_all > 0, then: avail_up * 100.0 / avail_all, else: if(avail_up > 0, then: 100.0, else: 0.0))
| fields host_id, host_name, cpu, memory, availability_pct
| limit 500`;
}

/** Host CPU / memory series (2h) for Mission Control charts — average client-side by app hosts. */
export function buildHostKpiSeriesQuery(): string {
  return `timeseries {
  cpu = avg(dt.host.cpu.usage),
  memory = avg(dt.host.memory.usage)
},
by: { dt.entity.host },
from: now() - 2h,
interval: 10m
| fieldsAdd host_id = toString(dt.entity.host)
| fields host_id, cpu, memory
| limit 500`;
}

/** Frontend RUM KPI scalars by frontend.name (24h). No user_type filter — many tenants omit it. */
export function buildFrontendKpiScalarsQuery(): string {
  return `timeseries {
  sessions = countDistinct(dt.frontend.session.active.estimated_count, scalar: true),
  actions = sum(dt.frontend.user_action.count, scalar: true),
  action_ms = avg(dt.frontend.user_action.duration, scalar: true),
  action_p75_ms = percentile(dt.frontend.user_action.duration, 75, scalar: true),
  load_ms = avg(dt.frontend.web.navigation.load_event_end, scalar: true),
  lcp_ms = avg(dt.frontend.web.page.largest_contentful_paint, scalar: true),
  errors = sum(dt.frontend.error.count, scalar: true),
  requests = sum(dt.frontend.request.count, scalar: true)
},
by: { frontend.name },
from: now() - 24h
| fieldsAdd
    frontend_name = toString(frontend.name),
    name_key = lower(toString(frontend.name)),
    error_rate_pct = if(requests > 0, then: errors * 100.0 / requests, else: null)
| filter isNotNull(name_key) AND name_key != "" AND name_key != "null"
| fields name_key, frontend_name, sessions, actions, action_ms, action_p75_ms, load_ms, lcp_ms, error_rate_pct, errors, requests
| limit 500`;
}

/** Frontend action duration series by frontend.name (24h) for charts. */
export function buildFrontendKpiSeriesQuery(): string {
  return `timeseries {
  action_ms = avg(dt.frontend.user_action.duration),
  sessions = countDistinct(dt.frontend.session.active.estimated_count)
},
by: { frontend.name },
from: now() - 24h,
interval: 1h
| fieldsAdd name_key = lower(toString(frontend.name)), frontend_name = toString(frontend.name)
| filter isNotNull(name_key) AND name_key != "" AND name_key != "null"
| fields name_key, frontend_name, action_ms, sessions
| limit 500`;
}

/** Synthetic browser + HTTP availability / duration scalars (24h). */
export function buildSyntheticKpiScalarsQuery(): string {
  return `timeseries {
  availability = avg(dt.synthetic.browser.availability, scalar: true),
  duration_ms = avg(dt.synthetic.browser.duration, scalar: true),
  executions = sum(dt.synthetic.browser.executions, scalar: true)
},
by: { dt.entity.synthetic_test },
from: now() - 24h
| fieldsAdd
    synthetic_id = toString(dt.entity.synthetic_test),
    synthetic_name = entityName(dt.entity.synthetic_test),
    kind = "browser"
| fields synthetic_id, synthetic_name, kind, availability, duration_ms, executions
| append [
timeseries {
  availability = avg(dt.synthetic.http.availability, scalar: true),
  duration_ms = avg(dt.synthetic.http.duration, scalar: true),
  executions = sum(dt.synthetic.http.executions, scalar: true)
},
by: { dt.entity.http_check },
from: now() - 24h
| fieldsAdd
    synthetic_id = toString(dt.entity.http_check),
    synthetic_name = entityName(dt.entity.http_check),
    kind = "http"
| fields synthetic_id, synthetic_name, kind, availability, duration_ms, executions
]
| limit 500`;
}

/** Synthetic availability series (browser + HTTP) for Mission Control charts. */
export function buildSyntheticKpiSeriesQuery(): string {
  return `timeseries {
  availability = avg(dt.synthetic.browser.availability)
},
by: { dt.entity.synthetic_test },
from: now() - 24h,
interval: 1h
| fieldsAdd synthetic_id = toString(dt.entity.synthetic_test)
| fields synthetic_id, availability
| append [
timeseries {
  availability = avg(dt.synthetic.http.availability)
},
by: { dt.entity.http_check },
from: now() - 24h,
interval: 1h
| fieldsAdd synthetic_id = toString(dt.entity.http_check)
| fields synthetic_id, availability
]
| limit 500`;
}
