import React from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useNavigate, useParams } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useMappingConfig } from "@hooks/useMappingConfig";
import { IGNORE_COLUMN_VALUE, mergeFeaturePacks, type MappingConfig, type LookupSourceConfig, type ApplicationVariableConfig, type FeaturePacksConfig } from "@utils/documentStore";
import { theme } from "@utils/themeStyles";

interface GenericRow {
  [key: string]: unknown;
}

interface InventoryRow {
  app_id?: string;
  app_name?: string;
  owner?: string;
  tier?: string;
  classification?: string;
  hosts?: string;
}

interface CostProductAmbiguityRow {
  host_name?: string;
  newest_candidate?: string;
  candidate_values?: string;
  candidate_count?: number;
}

interface ObservabilitySummaryRow {
  app_id?: string;
  app_name?: string;
  host_count?: number;
  trace_eligible_hosts?: number;
  traces_pct?: number;
  metrics_pct?: number;
  logs_pct?: number;
  traces_hosts?: number;
  logs_hosts?: number;
  trace_event_count?: number;
  log_event_count?: number;
}

interface ObservabilityHostRow {
  app_id?: string;
  app_name?: string;
  host_name?: string;
  monitoring_mode?: string;
  service_count?: number | string;
  trace_eligible?: number | string;
  traces_status?: string;
  metrics_status?: string;
  logs_status?: string;
  spans_count_num?: number;
  logs_count_num?: number;
}

interface ObservabilityDiagnosticsRow {
  check?: string;
  host_hits?: number | string;
  record_hits?: number | string;
}

interface TraceCoverageGapRow {
  app_id?: string;
  app_name?: string;
  host_name?: string;
  monitoring_mode?: string;
  service_count?: number | string;
  spans_by_service_host?: number | string;
  gap_reason?: string;
}

interface ProblemsSummaryRow {
  app_id?: string;
  app_name?: string;
  host_count?: number | string;
  monitored_hosts?: number | string;
  monitoring_pct?: number | string;
  readiness?: string;
}

interface ProblemsHostRow {
  app_id?: string;
  app_name?: string;
  host_name?: string;
  monitoring_mode?: string;
  readiness?: string;
}

interface VulnerabilitySummaryRow {
  app_id?: string;
  app_name?: string;
  owner?: string;
  tier?: string;
  risk_band?: string;
  host_count?: number | string;
  monitored_hosts?: number | string;
  monitoring_pct?: number | string;
}

interface VulnerabilityHostRow {
  app_id?: string;
  app_name?: string;
  host_name?: string;
  owner?: string;
  tier?: string;
  risk_band?: string;
  monitoring_mode?: string;
  readiness?: string;
}

interface MetricRecord {
  total_applications?: number;
  apps_in_dynatrace?: number;
  signal_health_pct?: number;
}

type FeaturePackId = keyof FeaturePacksConfig;

const FEATURE_PACK_LABELS: Record<FeaturePackId, string> = {
  observabilityEvidence: "Standard Pack 1: Observability Evidence",
  problemsAndAlerts: "Standard Pack 2: Problems & Alerts",
  vulnerabilities: "Standard Pack 3: Vulnerabilities",
  infrastructureCoverage: "Feature Pack 1: Infrastructure Coverage",
};

function statusTone(value: string | undefined): string {
  if (value === "YES") {
    return theme.successText;
  }
  if (value === "BLOCKED") {
    return theme.criticalText;
  }
  if (value === "UNKNOWN") {
    return theme.warningEmphasized;
  }
  return theme.warningEmphasized;
}

function readinessTone(value: string | undefined): string {
  if (value === "READY") {
    return theme.successText;
  }
  if (value === "PARTIAL") {
    return theme.warningEmphasized;
  }
  return theme.criticalText;
}

function riskTone(value: string | undefined): string {
  if (value === "CRITICAL") {
    return theme.criticalText;
  }
  if (value === "HIGH") {
    return theme.warningEmphasized;
  }
  if (value === "ELEVATED") {
    return theme.warningEmphasized;
  }
  return theme.primaryText;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCount(value: unknown): string {
  const parsed = toNumber(value);
  return parsed === null ? "-" : String(parsed);
}

function formatPercent(value: unknown, fallback = "-"): string {
  const parsed = toNumber(value);
  return parsed === null ? fallback : `${parsed}%`;
}

function formatYesNoFromPercent(value: unknown): string {
  const parsed = toNumber(value);
  if (parsed === null) {
    return "NO";
  }
  return parsed > 0 ? "YES" : "NO";
}

function formatSignalCount(value: unknown, telemetryBlocked: boolean): string {
  if (telemetryBlocked) {
    return "-";
  }
  return formatCount(value);
}

function formatSignalPercent(value: unknown, telemetryBlocked: boolean): string {
  if (telemetryBlocked) {
    return "-";
  }
  return formatPercent(value, "-");
}

function formatEligibleTraceCount(value: unknown, eligibleValue: unknown, telemetryBlocked: boolean): string {
  if (telemetryBlocked) {
    return "-";
  }
  const eligible = toNumber(eligibleValue);
  if (eligible === 0) {
    return "-";
  }
  return formatCount(value);
}

function resolveSignalStatus(value: string | undefined, telemetryBlocked: boolean): string {
  if (telemetryBlocked) {
    return "BLOCKED";
  }
  return value || "NO";
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
          backgroundColor: theme.surfaceSubtle,
          border: `1px solid ${theme.border}`,
          borderRadius: "3px",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.05em",
          color: theme.text,
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
          border: `1px solid ${theme.border}`,
          backgroundColor: theme.surfaceSubtle,
          color: theme.textSecondary,
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

function isIgnoredColumnSelection(column: string | undefined): boolean {
  const trimmed = (column || "").trim();
  return !trimmed || trimmed === IGNORE_COLUMN_VALUE;
}

function getUniqueApplicationIdColumn(source: LookupSourceConfig | undefined): string {
  if (!source) {
    return "";
  }
  const uniqueField = source.fields.find((field) => field.id === "uniqueApplicationId");
  return uniqueField?.sourceColumn.trim() || "";
}

function buildFrontendApplicationsDataset(dynatraceApplicationIdFieldPath: string): string {
  const expression = sanitizeExpression(dynatraceApplicationIdFieldPath);
  if (expression === "dt.cost.product") {
    return `fetch dt.entity.host
| fieldsAdd cost_product_candidates = arrayRemoveNulls(
    iCollectArray(
      if(contains(tags[], "dt.cost.product:"), arrayLast(splitString(tags[], ":")))
    )
  )
| fieldsAdd dynatrace_app_id = arrayLast(cost_product_candidates), dynatrace_host_name = toString(entity.name)
| filter isNotNull(dynatrace_app_id) AND dynatrace_app_id != ""
| summarize
    dynatrace_hosts_array = collectDistinct(dynatrace_host_name),
    dynatrace_host_count = countDistinct(dynatrace_host_name),
    dynatrace_app_name = takeFirst(dynatrace_host_name),
    by: {dynatrace_app_id}
| fieldsAdd dynatrace_hosts = arrayToString(dynatrace_hosts_array, delimiter: ", ")`;
  }

  return `fetch dt.entity.application
| fieldsAdd dynatrace_app_id = toString(${expression}), dynatrace_app_name = toString(entity.name)
| filter isNotNull(dynatrace_app_id)
| dedup dynatrace_app_id
| fieldsAdd dynatrace_hosts = "", dynatrace_host_count = 0`;
}

function buildCmdbApplicationsDataset(lookupPath: string, variables: ApplicationVariableConfig, cmdbAppIdColumn: string): string {
  const ownerExpression = isIgnoredColumnSelection(variables.cmdbOwnerColumn)
    ? `""`
    : `toString(${quoteLookupColumn(variables.cmdbOwnerColumn)})`;
  const tierExpression = isIgnoredColumnSelection(variables.cmdbTierColumn)
    ? `""`
    : `toString(${quoteLookupColumn(variables.cmdbTierColumn)})`;

  return `load "${lookupPath}"
| fieldsAdd cmdb_app_id = toString(${quoteLookupColumn(cmdbAppIdColumn)}), cmdb_app_name = toString(${quoteLookupColumn(variables.cmdbApplicationNameColumn)}), cmdb_owner = ${ownerExpression}, cmdb_tier = ${tierExpression}
| filter isNotNull(cmdb_app_id)
| dedup cmdb_app_id`;
}

function buildTotalApplicationsQuery(lookupPath: string, cmdbAppIdColumn: string): string {
  return `load "${lookupPath}"
| fieldsAdd cmdb_app_id = toString(${quoteLookupColumn(cmdbAppIdColumn)})
| filter isNotNull(cmdb_app_id)
| summarize total_applications = countDistinct(cmdb_app_id)`;
}

function buildAppsInDynatraceQuery(lookupPath: string, variables: ApplicationVariableConfig, cmdbAppIdColumn: string): string {
  return `${buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn)}
| lookup [
${buildFrontendApplicationsDataset(variables.dynatraceApplicationIdFieldPath)}
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id}
| fieldsAdd in_dynatrace = if(isNotNull(dynatrace_app_id), then:1, else:0)
| summarize apps_in_dynatrace = sum(in_dynatrace)`;
}

function buildSignalHealthQuery(lookupPath: string, variables: ApplicationVariableConfig, cmdbAppIdColumn: string): string {
  return `${buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn)}
| lookup [
${buildFrontendApplicationsDataset(variables.dynatraceApplicationIdFieldPath)}
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id}
| fieldsAdd in_dynatrace = if(isNotNull(dynatrace_app_id), then:1, else:0)
| summarize total_applications = countDistinct(cmdb_app_id), apps_in_dynatrace = sum(in_dynatrace)
| fieldsAdd signal_health_pct = if(total_applications == 0, then:0, else:round(100.0 * apps_in_dynatrace / total_applications))`;
}

function buildApplicationInventoryQuery(lookupPath: string, variables: ApplicationVariableConfig, cmdbAppIdColumn: string): string {
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);
  const frontendDataset = buildFrontendApplicationsDataset(variables.dynatraceApplicationIdFieldPath);

  return `${cmdbDataset}
| lookup [
${frontendDataset}
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id, dynatrace_app_name, dynatrace_hosts}
| fieldsAdd app_id = cmdb_app_id, app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:dynatrace_app_name), owner = cmdb_owner, tier = cmdb_tier, classification = if(isNotNull(dynatrace_app_id), then:"In both", else:"CMDB only"), hosts = if(isNotNull(dynatrace_hosts) AND dynatrace_hosts != "", then:dynatrace_hosts, else:"")
| fields app_id, app_name, owner, tier, classification, hosts
| append [
${frontendDataset}
| lookup [
${cmdbDataset}
], sourceField:dynatrace_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_id}
| filter isNull(cmdb_app_id)
| fieldsAdd app_id = dynatrace_app_id, app_name = dynatrace_app_name, owner = "", tier = "", classification = "Dynatrace only", hosts = dynatrace_hosts
| fields app_id, app_name, owner, tier, classification, hosts
]
| sort classification asc, app_name asc
| limit 500`;
}

function buildCostProductAmbiguityQuery(dynatraceApplicationIdFieldPath: string): string {
  const expression = sanitizeExpression(dynatraceApplicationIdFieldPath);
  if (expression !== "dt.cost.product") {
    return `data record(host_name = "", newest_candidate = "", candidate_values = "", candidate_count = 0)
| filter false`;
  }

  return `fetch dt.entity.host
| fieldsAdd cost_product_candidates = arrayRemoveNulls(
    iCollectArray(
      if(contains(tags[], "dt.cost.product:"), arrayLast(splitString(tags[], ":")))
    )
  )
| fieldsAdd distinct_candidates = arrayDistinct(cost_product_candidates)
| fieldsAdd candidate_count = arraySize(distinct_candidates), newest_candidate = arrayLast(cost_product_candidates)
| filter candidate_count > 1
| fieldsAdd host_name = toString(entity.name), candidate_values = arrayToString(distinct_candidates, delimiter: ", ")
| fields host_name, newest_candidate, candidate_values, candidate_count
| sort host_name asc
| limit 200`;
}

function buildHostEvidenceDataset(dynatraceApplicationIdFieldPath: string): string {
  const expression = sanitizeExpression(dynatraceApplicationIdFieldPath);
  if (expression !== "dt.cost.product") {
    return `data record(host_id = "", host_name = "", host_match_key = "", app_id = "", monitoring_mode = "")
| filter false`;
  }

  return `fetch dt.entity.host
| fieldsAdd cost_product_candidates = arrayRemoveNulls(
    iCollectArray(
      if(contains(tags[], "dt.cost.product:"), arrayLast(splitString(tags[], ":")))
    )
  )
| fieldsAdd derived_app_id = arrayLast(cost_product_candidates), host_id = toString(id), host_name = toString(entity.name), monitoring_mode = toString(monitoringMode)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| fieldsAdd app_id = if(isNotNull(derived_app_id) AND derived_app_id != "", then:derived_app_id, else:"UNMAPPED")
| fields host_id, host_name, host_match_key, app_id, monitoring_mode`;
}

function buildObservabilitySignalSummaryQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields host_id = toString(host_id), service_id
| summarize service_count = countDistinct(service_id), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{service_count}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize spans_count_by_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{spans_count_by_id}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize spans_count_by_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{spans_count_by_name}
| lookup [
fetch logs, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize logs_count_by_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{logs_count_by_id}
| lookup [
fetch logs, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize logs_count_by_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{logs_count_by_name}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.service)
| summarize spans_count_by_service = count(), by:{service_id = toString(dt.entity.service)}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields service_id, host_id = toString(host_id)
], sourceField:service_id, lookupField:service_id, fields:{host_id}
| filter isNotNull(host_id)
| summarize spans_count_by_service_host = sum(spans_count_by_service), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{spans_count_by_service_host}
| lookup [
timeseries logs_status = sum(dt.log.status_per_entity_count), by:{dt.entity.host}
| fieldsAdd host_id = toString(dt.entity.host), logs_count_by_metric = arraySum(logs_status)
| fields host_id, logs_count_by_metric
], sourceField:host_id, lookupField:host_id, fields:{logs_count_by_metric}
| fieldsAdd spans_count_num = coalesce(toLong(spans_count_by_id), toLong(spans_count_by_name), toLong(spans_count_by_service_host), 0), logs_count_num = coalesce(toLong(logs_count_by_id), toLong(logs_count_by_name), toLong(logs_count_by_metric), 0)
| fieldsAdd trace_eligible = if(coalesce(toLong(service_count), 0) > 0, then:1, else:0)
| fieldsAdd has_traces = if(trace_eligible == 1 AND isNotNull(spans_count_num) AND spans_count_num > 0, then:1, else:0), has_logs = if(isNotNull(logs_count_num) AND logs_count_num > 0, then:1, else:0), has_metrics = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:1, else:0)
| summarize host_count = countDistinct(host_id), trace_eligible_hosts = sum(trace_eligible), traces_hosts = sum(has_traces), metrics_hosts = sum(has_metrics), logs_hosts = sum(has_logs), trace_event_count = sum(spans_count_num), log_event_count = sum(logs_count_num), by:{app_id}
| fieldsAdd traces_pct = if(trace_eligible_hosts == 0, then:null, else:round(100.0 * traces_hosts / trace_eligible_hosts)), metrics_pct = if(host_count == 0, then:0, else:round(100.0 * metrics_hosts / host_count)), logs_pct = if(host_count == 0, then:0, else:round(100.0 * logs_hosts / host_count))
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_count, trace_eligible_hosts, traces_hosts, logs_hosts, trace_event_count, log_event_count, traces_pct, metrics_pct, logs_pct
| sort app_name asc
| limit 500`;
}

function buildObservabilityByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields host_id = toString(host_id), service_id
| summarize service_count = countDistinct(service_id), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{service_count}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize spans_count_by_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{spans_count_by_id}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize spans_count_by_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{spans_count_by_name}
| lookup [
fetch logs, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize logs_count_by_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{logs_count_by_id}
| lookup [
fetch logs, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize logs_count_by_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{logs_count_by_name}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.service)
| summarize spans_count_by_service = count(), by:{service_id = toString(dt.entity.service)}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields service_id, host_id = toString(host_id)
], sourceField:service_id, lookupField:service_id, fields:{host_id}
| filter isNotNull(host_id)
| summarize spans_count_by_service_host = sum(spans_count_by_service), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{spans_count_by_service_host}
| lookup [
timeseries logs_status = sum(dt.log.status_per_entity_count), by:{dt.entity.host}
| fieldsAdd host_id = toString(dt.entity.host), logs_count_by_metric = arraySum(logs_status)
| fields host_id, logs_count_by_metric
], sourceField:host_id, lookupField:host_id, fields:{logs_count_by_metric}
| fieldsAdd spans_count_num = coalesce(toLong(spans_count_by_id), toLong(spans_count_by_name), toLong(spans_count_by_service_host), 0), logs_count_num = coalesce(toLong(logs_count_by_id), toLong(logs_count_by_name), toLong(logs_count_by_metric), 0)
| fieldsAdd trace_eligible = if(coalesce(toLong(service_count), 0) > 0, then:1, else:0)
| fieldsAdd traces_status = if(trace_eligible == 0, then:"N/A", else:if(isNotNull(spans_count_num) AND spans_count_num > 0, then:"YES", else:"NO")), logs_status = if(isNotNull(logs_count_num) AND logs_count_num > 0, then:"YES", else:"NO"), metrics_status = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:"YES", else:"NO")
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_name, monitoring_mode, service_count, trace_eligible, spans_count_num, logs_count_num, traces_status, metrics_status, logs_status
| sort app_name asc, host_name asc
| limit 1000`;
}

function buildObservabilityDiagnosticsQuery(dynatraceApplicationIdFieldPath: string): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);

  return `data record(check = "", host_hits = 0, record_hits = 0)
| filter false
| append [
fetch spans, from:now()-24h
| summarize host_hits = countDistinct(dt.entity.host), record_hits = count()
| fieldsAdd check = "direct_spans"
| fields check, host_hits, record_hits
]
| append [
fetch logs, from:now()-24h
| summarize host_hits = countDistinct(dt.entity.host), record_hits = count()
| fieldsAdd check = "direct_logs"
| fields check, host_hits, record_hits
]
| append [
timeseries logs_status = sum(dt.log.status_per_entity_count), by:{dt.entity.host}
| fieldsAdd host_id = toString(dt.entity.host), logs_count_by_metric = arraySum(logs_status)
| summarize host_hits = countDistinct(host_id), record_hits = sum(coalesce(toLong(logs_count_by_metric), 0))
| fieldsAdd check = "direct_logs_metric"
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| summarize host_hits = countDistinct(host_id)
| fieldsAdd check = "host_inventory", record_hits = host_hits
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize spans_count_by_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{spans_count_by_id}
| fieldsAdd host_has = if(coalesce(toLong(spans_count_by_id), 0) > 0, then:1, else:0)
| summarize host_hits = sum(host_has), record_hits = sum(coalesce(toLong(spans_count_by_id), 0))
| fieldsAdd check = "spans_by_host_id"
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize spans_count_by_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{spans_count_by_name}
| fieldsAdd host_has = if(coalesce(toLong(spans_count_by_name), 0) > 0, then:1, else:0)
| summarize host_hits = sum(host_has), record_hits = sum(coalesce(toLong(spans_count_by_name), 0))
| fieldsAdd check = "spans_by_host_name"
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.service)
| summarize spans_count_by_service = count(), by:{service_id = toString(dt.entity.service)}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields service_id, host_id = toString(host_id)
], sourceField:service_id, lookupField:service_id, fields:{host_id}
| filter isNotNull(host_id)
| summarize spans_count_by_service_host = sum(spans_count_by_service), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{spans_count_by_service_host}
| fieldsAdd host_has = if(coalesce(toLong(spans_count_by_service_host), 0) > 0, then:1, else:0)
| summarize host_hits = sum(host_has), record_hits = sum(coalesce(toLong(spans_count_by_service_host), 0))
| fieldsAdd check = "spans_by_service_topology"
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| lookup [
fetch logs, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize logs_count_by_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{logs_count_by_id}
| fieldsAdd host_has = if(coalesce(toLong(logs_count_by_id), 0) > 0, then:1, else:0)
| summarize host_hits = sum(host_has), record_hits = sum(coalesce(toLong(logs_count_by_id), 0))
| fieldsAdd check = "logs_by_host_id"
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| lookup [
fetch logs, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize logs_count_by_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{logs_count_by_name}
| fieldsAdd host_has = if(coalesce(toLong(logs_count_by_name), 0) > 0, then:1, else:0)
| summarize host_hits = sum(host_has), record_hits = sum(coalesce(toLong(logs_count_by_name), 0))
| fieldsAdd check = "logs_by_host_name"
| fields check, host_hits, record_hits
]
| append [
${hostDataset}
| lookup [
timeseries logs_status = sum(dt.log.status_per_entity_count), by:{dt.entity.host}
| fieldsAdd host_id = toString(dt.entity.host), logs_count_by_metric = arraySum(logs_status)
| fields host_id, logs_count_by_metric
], sourceField:host_id, lookupField:host_id, fields:{logs_count_by_metric}
| fieldsAdd host_has = if(coalesce(toLong(logs_count_by_metric), 0) > 0, then:1, else:0)
| summarize host_hits = sum(host_has), record_hits = sum(coalesce(toLong(logs_count_by_metric), 0))
| fieldsAdd check = "logs_by_metric_status"
| fields check, host_hits, record_hits
]
| sort check asc`;
}

function buildTraceCoverageGapsQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| fieldsAdd monitoring_enabled = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:1, else:0)
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.host)
| summarize spans_by_host_id = count(), by:{host_id = toString(dt.entity.host)}
], sourceField:host_id, lookupField:host_id, fields:{spans_by_host_id}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(host.name)
| fieldsAdd host_name = toString(host.name)
| parse host_name, """LD:host_short ('.' LD:host_domain)? EOS"""
| fieldsAdd host_match_key = lower(coalesce(host_short, host_name))
| summarize spans_by_host_name = count(), by:{host_match_key}
], sourceField:host_match_key, lookupField:host_match_key, fields:{spans_by_host_name}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields host_id = toString(host_id), service_id
| summarize service_count = countDistinct(service_id), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{service_count}
| lookup [
fetch spans, from:now()-24h
| filter isNotNull(dt.entity.service)
| summarize spans_count_by_service = count(), by:{service_id = toString(dt.entity.service)}
| lookup [
fetch dt.entity.service
| fields service_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields service_id, host_id = toString(host_id)
], sourceField:service_id, lookupField:service_id, fields:{host_id}
| filter isNotNull(host_id)
| summarize spans_by_service_host = sum(spans_count_by_service), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{spans_by_service_host}
| fieldsAdd span_count = coalesce(toLong(spans_by_host_id), toLong(spans_by_host_name), toLong(spans_by_service_host), 0)
| filter monitoring_enabled == 1 AND span_count == 0
| fieldsAdd gap_reason = if(coalesce(toLong(service_count), 0) == 0, then:"No linked service topology", else:if(coalesce(toLong(spans_by_service_host), 0) > 0, then:"Host-level span attribution missing", else:"No span traffic in 24h"))
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_name, monitoring_mode, service_count, spans_by_service_host, gap_reason
| sort app_name asc, host_name asc
| limit 1000`;
}

function buildProblemsReadinessSummaryQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| fieldsAdd monitoring_enabled = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:1, else:0)
| summarize host_count = countDistinct(host_id), monitored_hosts = sum(monitoring_enabled), by:{app_id}
| fieldsAdd monitoring_pct = if(host_count == 0, then:0, else:round(100.0 * monitored_hosts / host_count))
| fieldsAdd readiness = if(monitoring_pct >= 100, then:"READY", else:if(monitoring_pct >= 50, then:"PARTIAL", else:"GAP"))
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_count, monitored_hosts, monitoring_pct, readiness
| sort app_name asc
| limit 500`;
}

function buildProblemsReadinessByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| fieldsAdd monitoring_enabled = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:1, else:0)
| fieldsAdd readiness = if(monitoring_enabled == 1, then:"READY", else:"GAP")
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_name, monitoring_mode, readiness
| sort app_name asc, host_name asc
| limit 1000`;
}

function buildVulnerabilityBaselineSummaryQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| fieldsAdd monitoring_enabled = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:1, else:0)
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name, cmdb_owner, cmdb_tier
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name, cmdb_owner, cmdb_tier}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id), owner = if(isNotNull(cmdb_owner) AND cmdb_owner != "", then:cmdb_owner, else:"Unassigned"), tier = if(isNotNull(cmdb_tier) AND cmdb_tier != "", then:cmdb_tier, else:"Unknown")
| fieldsAdd risk_band = if(tier == "Platinum", then:"CRITICAL", else:if(tier == "Gold", then:"HIGH", else:if(tier == "Silver", then:"ELEVATED", else:"BASELINE")))
| fieldsAdd risk_rank = if(risk_band == "CRITICAL", then:4, else:if(risk_band == "HIGH", then:3, else:if(risk_band == "ELEVATED", then:2, else:1)))
| summarize host_count = countDistinct(host_id), monitored_hosts = sum(monitoring_enabled), by:{app_id, app_name, owner, tier, risk_band, risk_rank}
| fieldsAdd monitoring_pct = if(host_count == 0, then:0, else:round(100.0 * monitored_hosts / host_count))
| fields app_id, app_name, owner, tier, risk_band, host_count, monitored_hosts, monitoring_pct, risk_rank
| sort risk_rank desc, app_name asc
| fields app_id, app_name, owner, tier, risk_band, host_count, monitored_hosts, monitoring_pct
| limit 500`;
}

function buildVulnerabilityBaselineByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  const hostDataset = buildHostEvidenceDataset(dynatraceApplicationIdFieldPath);
  const cmdbDataset = buildCmdbApplicationsDataset(lookupPath, variables, cmdbAppIdColumn);

  return `${hostDataset}
| fieldsAdd monitoring_enabled = if(isNotNull(monitoring_mode) AND monitoring_mode != "" AND monitoring_mode != "OFF", then:1, else:0)
| fieldsAdd readiness = if(monitoring_enabled == 1, then:"READY", else:"GAP")
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name, cmdb_owner, cmdb_tier
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name, cmdb_owner, cmdb_tier}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id), owner = if(isNotNull(cmdb_owner) AND cmdb_owner != "", then:cmdb_owner, else:"Unassigned"), tier = if(isNotNull(cmdb_tier) AND cmdb_tier != "", then:cmdb_tier, else:"Unknown")
| fieldsAdd risk_band = if(tier == "Platinum", then:"CRITICAL", else:if(tier == "Gold", then:"HIGH", else:if(tier == "Silver", then:"ELEVATED", else:"BASELINE")))
| fieldsAdd risk_rank = if(risk_band == "CRITICAL", then:4, else:if(risk_band == "HIGH", then:3, else:if(risk_band == "ELEVATED", then:2, else:1)))
| fields app_id, app_name, host_name, owner, tier, risk_band, monitoring_mode, readiness, risk_rank
| sort risk_rank desc, app_name asc, host_name asc
| fields app_id, app_name, host_name, owner, tier, risk_band, monitoring_mode, readiness
| limit 1000`;
}

function readMetricValue(data: unknown, field: keyof MetricRecord): number {
  const record = (data as { records?: MetricRecord[] } | undefined)?.records?.[0];
  const value = record?.[field];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function hasApplicationVariableConfig(variables: ApplicationVariableConfig | undefined): variables is ApplicationVariableConfig {
  if (!variables) {
    return false;
  }

  return Boolean(
    variables.cmdbVariableSourceId?.trim() &&
    variables.dynatraceApplicationIdFieldPath?.trim() &&
    variables.cmdbApplicationNameColumn?.trim()
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
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", padding: "16px", backgroundColor: theme.surface }}>
      <div style={{ marginBottom: "10px" }}>
        <Heading level={2} style={{ margin: 0, fontSize: "18px" }}>{title}</Heading>
        {subtitle && <Paragraph style={{ marginTop: "6px", color: theme.textSecondary }}>{subtitle}</Paragraph>}
      </div>

      {isLoading && <Paragraph style={{ color: theme.textSecondary }}>Loading...</Paragraph>}

      {!isLoading && Boolean(error) && (
        <div style={{ backgroundColor: theme.criticalBg, border: `1px solid ${theme.criticalBorder}`, borderRadius: "6px", padding: "10px" }}>
          <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: theme.criticalText }}>Widget query failed</p>
          <p style={{ margin: 0, fontSize: "12px", color: theme.textSecondary }}>{typeof error === "string" ? error : String(error)}</p>
        </div>
      )}

      {!isLoading && !error && children}

      <details style={{ marginTop: "10px" }}>
        <summary style={{ fontSize: "12px", color: theme.textMuted, cursor: "pointer" }}>Query details</summary>
        <pre
          style={{
            marginTop: "8px",
            padding: "10px",
            backgroundColor: theme.surfaceSubtle,
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
        <Paragraph style={{ marginTop: "12px", color: theme.textSecondary }}>Loading records...</Paragraph>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>{source.label}</Heading>
        <div style={{ marginTop: "16px", padding: "16px", backgroundColor: theme.criticalBg, border: `1px solid ${theme.criticalBorder}`, borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: theme.criticalText }}>Error loading data</p>
          <p style={{ margin: 0, fontSize: "13px", color: theme.textSecondary }}>{typeof error === "string" ? error : String(error)}</p>
        </div>
        <details style={{ marginTop: "12px" }}>
          <summary style={{ fontSize: "13px", color: theme.textMuted, cursor: "pointer" }}>Query details</summary>
          <pre style={{ marginTop: "8px", padding: "12px", backgroundColor: theme.surfaceSubtle, borderRadius: "4px", fontSize: "12px", overflowX: "auto" }}>{query}</pre>
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
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: theme.textMuted }}>
            {rows.length} record{rows.length !== 1 ? "s" : ""} · source: <code>{source.lookupTableName}</code>
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button onClick={() => navigate("/summary")} variant="default">Back to Summary</Button>
          <Button onClick={() => navigate("/setup")} variant="default">Reconfigure</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", backgroundColor: theme.surfaceSubtle, border: `1px solid ${theme.border}`, borderRadius: "6px" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: theme.textSecondary }}>No records found</p>
          <p style={{ margin: 0, fontSize: "13px", color: theme.textMuted }}>
            The lookup table <code>{source.lookupTableName}</code> returned no records.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
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
                      color: theme.textSecondary,
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
                    borderBottom: `1px solid ${theme.border}`,
                    backgroundColor: idx % 2 === 0 ? theme.surface : theme.surfaceSubtle,
                  }}
                >
                  {source.fields.map((field) => {
                    const columnKey = sanitizeColumnName(field.sourceColumn);
                    const rawValue = columnKey ? row[columnKey] : undefined;
                    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
                    return (
                      <td key={field.id} style={{ padding: "12px 16px", color: theme.textSecondary, verticalAlign: "middle" }}>
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
  const derivedCmdbAppIdColumn = getUniqueApplicationIdColumn(activeCmdbSource);

  const hasSource = Boolean(activeCmdbSource);
  const hasVariables = hasApplicationVariableConfig(variables) && Boolean(derivedCmdbAppIdColumn);
  const lookupPath = hasSource ? toLookupPath(activeCmdbSource.lookupTableName) : "";

  const totalApplicationsQuery = hasSource && hasVariables ? buildTotalApplicationsQuery(lookupPath, derivedCmdbAppIdColumn) : "";
  const appsInDynatraceQuery = hasSource && hasVariables ? buildAppsInDynatraceQuery(lookupPath, variables, derivedCmdbAppIdColumn) : "";
  const signalHealthQuery = hasSource && hasVariables ? buildSignalHealthQuery(lookupPath, variables, derivedCmdbAppIdColumn) : "";
  const inventoryQuery = hasSource && hasVariables ? buildApplicationInventoryQuery(lookupPath, variables, derivedCmdbAppIdColumn) : "";
  const costProductAmbiguityQuery = hasSource && hasVariables ? buildCostProductAmbiguityQuery(variables.dynatraceApplicationIdFieldPath) : "";

  const totalApplicationsResult = useDql({ query: totalApplicationsQuery });
  const appsInDynatraceResult = useDql({ query: appsInDynatraceQuery });
  const signalHealthResult = useDql({ query: signalHealthQuery });
  const inventoryResult = useDql({ query: inventoryQuery });
  const costProductAmbiguityResult = useDql({ query: costProductAmbiguityQuery });

  const totalApplications = readMetricValue(totalApplicationsResult.data, "total_applications");
  const appsInDynatrace = readMetricValue(appsInDynatraceResult.data, "apps_in_dynatrace");
  const signalHealth = readMetricValue(signalHealthResult.data, "signal_health_pct");
  const featurePacks = mergeFeaturePacks(config.featurePacks);
  const standardPack1Enabled = featurePacks.observabilityEvidence.enabled;
  const standardPack2Enabled = featurePacks.problemsAndAlerts.enabled;
  const standardPack3Enabled = featurePacks.vulnerabilities.enabled;
  const enabledFeaturePackIds = (Object.keys(featurePacks) as FeaturePackId[]).filter((packId) => featurePacks[packId].enabled);
  const inventoryRows = (inventoryResult.data?.records || []) as InventoryRow[];
  const showOwnerColumn = !isIgnoredColumnSelection(variables?.cmdbOwnerColumn);
  const showTierColumn = !isIgnoredColumnSelection(variables?.cmdbTierColumn);
  const costProductAmbiguityRows = (costProductAmbiguityResult.data?.records || []) as CostProductAmbiguityRow[];
  const isCostProductMode = sanitizeExpression(variables?.dynatraceApplicationIdFieldPath || "") === "dt.cost.product";
  const standardPack1EntityOnlyMode = standardPack1Enabled && isCostProductMode;
  const observabilitySignalSummaryQuery =
    hasSource && hasVariables && standardPack1Enabled && isCostProductMode
      ? buildObservabilitySignalSummaryQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const observabilityByHostQuery =
    hasSource && hasVariables && standardPack1Enabled && isCostProductMode
      ? buildObservabilityByHostQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const observabilityDiagnosticsQuery =
    hasSource && hasVariables && standardPack1Enabled && isCostProductMode
      ? buildObservabilityDiagnosticsQuery(variables.dynatraceApplicationIdFieldPath)
      : "";
  const traceCoverageGapsQuery =
    hasSource && hasVariables && standardPack1Enabled && isCostProductMode
      ? buildTraceCoverageGapsQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const observabilitySignalSummaryResult = useDql({ query: observabilitySignalSummaryQuery });
  const observabilityByHostResult = useDql({ query: observabilityByHostQuery });
  const observabilityDiagnosticsResult = useDql({ query: observabilityDiagnosticsQuery });
  const traceCoverageGapsResult = useDql({ query: traceCoverageGapsQuery });
  const observabilitySummaryRows = (observabilitySignalSummaryResult.data?.records || []) as ObservabilitySummaryRow[];
  const observabilityHostRows = (observabilityByHostResult.data?.records || []) as ObservabilityHostRow[];
  const observabilityDiagnosticsRows = (observabilityDiagnosticsResult.data?.records || []) as ObservabilityDiagnosticsRow[];
  const traceCoverageGapRows = (traceCoverageGapsResult.data?.records || []) as TraceCoverageGapRow[];
  const diagnosticsByCheck = React.useMemo(() => {
    const map = new Map<string, ObservabilityDiagnosticsRow>();
    for (const row of observabilityDiagnosticsRows) {
      const key = (row.check || "").trim();
      if (key) {
        map.set(key, row);
      }
    }
    return map;
  }, [observabilityDiagnosticsRows]);
  const directTelemetryRecords =
    (toNumber(diagnosticsByCheck.get("direct_spans")?.record_hits) || 0) +
    (toNumber(diagnosticsByCheck.get("direct_logs")?.record_hits) || 0) +
    (toNumber(diagnosticsByCheck.get("direct_logs_metric")?.record_hits) || 0);
  const hostInventoryHits = toNumber(diagnosticsByCheck.get("host_inventory")?.host_hits) || 0;
  const telemetryRuntimeBlocked = hostInventoryHits > 0 && directTelemetryRecords === 0;
  const problemsReadinessSummaryQuery =
    hasSource && hasVariables && standardPack2Enabled && isCostProductMode
      ? buildProblemsReadinessSummaryQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const problemsReadinessByHostQuery =
    hasSource && hasVariables && standardPack2Enabled && isCostProductMode
      ? buildProblemsReadinessByHostQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const problemsReadinessSummaryResult = useDql({ query: problemsReadinessSummaryQuery });
  const problemsReadinessByHostResult = useDql({ query: problemsReadinessByHostQuery });
  const problemsSummaryRows = (problemsReadinessSummaryResult.data?.records || []) as ProblemsSummaryRow[];
  const problemsHostRows = (problemsReadinessByHostResult.data?.records || []) as ProblemsHostRow[];
  const vulnerabilityBaselineSummaryQuery =
    hasSource && hasVariables && standardPack3Enabled && isCostProductMode
      ? buildVulnerabilityBaselineSummaryQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const vulnerabilityBaselineByHostQuery =
    hasSource && hasVariables && standardPack3Enabled && isCostProductMode
      ? buildVulnerabilityBaselineByHostQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const vulnerabilityBaselineSummaryResult = useDql({ query: vulnerabilityBaselineSummaryQuery });
  const vulnerabilityBaselineByHostResult = useDql({ query: vulnerabilityBaselineByHostQuery });
  const vulnerabilitySummaryRows = (vulnerabilityBaselineSummaryResult.data?.records || []) as VulnerabilitySummaryRow[];
  const vulnerabilityHostRows = (vulnerabilityBaselineByHostResult.data?.records || []) as VulnerabilityHostRow[];

  const liveStandardPackCount = [standardPack1Enabled && isCostProductMode, standardPack2Enabled && isCostProductMode, standardPack3Enabled && isCostProductMode].filter(Boolean).length;
  const enabledStandardPackCount = [standardPack1Enabled, standardPack2Enabled, standardPack3Enabled].filter(Boolean).length;
  const blockedByModeStandardPackCount = [standardPack1Enabled && !isCostProductMode, standardPack2Enabled && !isCostProductMode, standardPack3Enabled && !isCostProductMode].filter(Boolean).length;

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
        <Paragraph style={{ color: theme.criticalText }}>
          Application join variables are incomplete. Set the Dynatrace Application ID expression and ensure Unique Application ID is mapped in Step 3 for the selected source.
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
          <Paragraph style={{ marginTop: "8px", color: theme.textSecondary }}>
            Variable-driven DQL view joining Dynatrace application telemetry to CMDB context from lookup mappings.
          </Paragraph>
          <Paragraph style={{ marginTop: "4px", color: theme.textMuted }}>
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
          <div style={{ fontSize: "38px", fontWeight: 700, color: theme.primaryText }}>{totalApplications}</div>
        </WidgetCard>

        <WidgetCard
          title="Apps in Dynatrace"
          subtitle="Matched via configured Application ID field"
          query={appsInDynatraceQuery}
          isLoading={appsInDynatraceResult.isLoading}
          error={appsInDynatraceResult.error}
        >
          <div style={{ fontSize: "38px", fontWeight: 700, color: theme.primaryText }}>{appsInDynatrace}</div>
        </WidgetCard>

        <WidgetCard
          title="Signal Health"
          subtitle="Coverage % = Apps in Dynatrace / Total Applications"
          query={signalHealthQuery}
          isLoading={signalHealthResult.isLoading}
          error={signalHealthResult.error}
        >
          <div style={{ fontSize: "38px", fontWeight: 700, color: signalHealth >= 90 ? theme.successText : signalHealth >= 60 ? theme.warningEmphasized : theme.criticalText }}>
            {signalHealth}%
          </div>
        </WidgetCard>
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", padding: "14px", backgroundColor: theme.surface, marginBottom: "12px" }}>
        <Heading level={2} style={{ margin: 0, fontSize: "16px" }}>Feature Pack Activation</Heading>
        <Paragraph style={{ marginTop: "6px", color: theme.textSecondary }}>
          Telemetry packs are configured in Setup. Standard packs are Dynatrace-native.
        </Paragraph>
        {enabledFeaturePackIds.length === 0 ? (
          <Paragraph style={{ marginTop: "8px", color: theme.warningEmphasized }}>No feature packs are currently enabled.</Paragraph>
        ) : (
          <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
            {enabledFeaturePackIds.map((packId) => {
              const pack = featurePacks[packId];
              return (
                <div key={packId} style={{ fontSize: "13px", color: theme.text }}>
                  <strong>{FEATURE_PACK_LABELS[packId]}</strong>: {pack.mode === "native" ? "Dynatrace-native" : "CMDB-enriched"}
                </div>
              );
            })}
          </div>
        )}
        <Paragraph style={{ marginTop: "10px", color: theme.warningEmphasized, fontSize: "12px" }}>
          {enabledStandardPackCount === 0
            ? "No standard packs are currently active in this dashboard view."
            : blockedByModeStandardPackCount > 0
              ? `${liveStandardPackCount} of ${enabledStandardPackCount} enabled standard pack${enabledStandardPackCount > 1 ? "s are" : " is"} live. ${blockedByModeStandardPackCount} require dt.cost.product mode in Setup.`
              : `${liveStandardPackCount} of ${enabledStandardPackCount} enabled standard pack${enabledStandardPackCount > 1 ? "s are" : " is"} live in this dashboard view.`}
        </Paragraph>
      </div>

      {standardPack1EntityOnlyMode && (
        <div
          style={{
            border: `1px solid ${theme.warningBorder}`,
            borderRadius: "8px",
            padding: "12px 14px",
            backgroundColor: theme.warningBg,
            marginBottom: "12px",
          }}
        >
          <Heading level={2} style={{ margin: 0, fontSize: "15px" }}>Standard Pack 1 Capability Status</Heading>
          <Paragraph style={{ marginTop: "6px", marginBottom: "8px", color: theme.warningEmphasized }}>
            Signal coverage mode is active. Traces and logs use 24h span/log telemetry when app scopes are granted.
          </Paragraph>
          {telemetryRuntimeBlocked && (
            <Paragraph style={{ marginTop: "0", marginBottom: "8px", color: theme.criticalText, fontWeight: 700 }}>
              Runtime access verdict: telemetry datasets are blocked in current app principal context (direct probes returned zero while host inventory is available).
            </Paragraph>
          )}
          {telemetryRuntimeBlocked && (
            <Paragraph style={{ marginTop: "0", marginBottom: "8px", color: theme.warningEmphasized }}>
              Remediation: ensure the app install has telemetry dataset permissions approved for this environment and that tenant data access policies for the current user/app principal allow reading spans and logs.
            </Paragraph>
          )}
          {!telemetryRuntimeBlocked && traceCoverageGapRows.length > 0 && (
            <Paragraph style={{ marginTop: "0", marginBottom: "8px", color: theme.warningEmphasized, fontWeight: 700 }}>
              Trace coverage gaps detected: {traceCoverageGapRows.length} FULL_STACK host{traceCoverageGapRows.length === 1 ? "" : "s"} with zero traces in the last 24h.
            </Paragraph>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: "8px" }}>
            <div style={{ backgroundColor: theme.surface, border: `1px solid ${theme.warningBorder}`, borderRadius: "6px", padding: "8px" }}>
              <strong>Metrics</strong>
              <div style={{ fontSize: "12px", color: theme.textSecondary, marginTop: "4px" }}>Available now via entity monitoring mode.</div>
            </div>
            <div style={{ backgroundColor: theme.surface, border: `1px solid ${theme.warningBorder}`, borderRadius: "6px", padding: "8px" }}>
              <strong>Traces</strong>
              <div style={{ fontSize: "12px", color: telemetryRuntimeBlocked ? theme.criticalText : theme.textSecondary, marginTop: "4px" }}>
                {telemetryRuntimeBlocked ? "Blocked in current app principal context." : "Enabled via spans telemetry (24h window)."}
              </div>
            </div>
            <div style={{ backgroundColor: theme.surface, border: `1px solid ${theme.warningBorder}`, borderRadius: "6px", padding: "8px" }}>
              <strong>Logs</strong>
              <div style={{ fontSize: "12px", color: telemetryRuntimeBlocked ? theme.criticalText : theme.textSecondary, marginTop: "4px" }}>
                {telemetryRuntimeBlocked ? "Blocked in current app principal context." : "Enabled via log telemetry (24h window)."}
              </div>
            </div>
          </div>
        </div>
      )}

      {standardPack1Enabled && (
        <div style={{ marginBottom: "12px" }}>
          {!isCostProductMode ? (
            <WidgetCard
              title="Standard Pack 1: Observability Evidence"
              subtitle="Native mode currently expects dt.cost.product app grouping."
              query={variables?.dynatraceApplicationIdFieldPath || ""}
              isLoading={false}
              error={null}
            >
              <Paragraph style={{ color: theme.warningEmphasized }}>
                Set "Dynatrace Application ID Expression" to dt.cost.product in Setup to enable this release of Standard Pack 1.
              </Paragraph>
            </WidgetCard>
          ) : (
            <>
              <WidgetCard
                title="Standard Pack 1: Runtime Diagnostics"
                subtitle="Per-path host hits and record totals for trace/log evidence resolution."
                query={observabilityDiagnosticsQuery}
                isLoading={observabilityDiagnosticsResult.isLoading}
                error={observabilityDiagnosticsResult.error}
              >
                {observabilityDiagnosticsRows.length === 0 ? (
                  <Paragraph style={{ color: theme.textMuted }}>No diagnostics rows returned for the selected timeframe.</Paragraph>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                          <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Path</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Host Hits</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Record Totals</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observabilityDiagnosticsRows.map((row, index) => (
                          <tr key={`${row.check || "path"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: "10px" }}>{row.check || "-"}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.host_hits)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.record_hits)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </WidgetCard>

              <div style={{ marginTop: "12px" }}>
              <WidgetCard
                title="Standard Pack 1: Signal Quality Summary"
                subtitle="24h host evidence by application (Traces, Metrics, Logs)."
                query={observabilitySignalSummaryQuery}
                isLoading={observabilitySignalSummaryResult.isLoading}
                error={observabilitySignalSummaryResult.error}
              >
                {observabilitySummaryRows.length === 0 ? (
                  <Paragraph style={{ color: theme.textMuted }}>No observability summary rows returned for the selected timeframe.</Paragraph>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                          <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Hosts</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Trace Eligible Hosts</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Trace Hosts</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Traces %</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Trace Count</th>
                          <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Metrics (Mode)</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Log Hosts</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Logs %</th>
                          <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Log Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observabilitySummaryRows.map((row, index) => (
                          <tr key={`${row.app_id || "app"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.host_count)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatSignalCount(row.trace_eligible_hosts, telemetryRuntimeBlocked)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatEligibleTraceCount(row.traces_hosts, row.trace_eligible_hosts, telemetryRuntimeBlocked)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatSignalPercent(row.traces_pct, telemetryRuntimeBlocked)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatEligibleTraceCount(row.trace_event_count, row.trace_eligible_hosts, telemetryRuntimeBlocked)}</td>
                            <td style={{ padding: "10px", textAlign: "center", color: statusTone(formatYesNoFromPercent(row.metrics_pct)), fontWeight: 700 }}>
                              {formatYesNoFromPercent(row.metrics_pct)}
                            </td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatSignalCount(row.logs_hosts, telemetryRuntimeBlocked)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatSignalPercent(row.logs_pct, telemetryRuntimeBlocked)}</td>
                            <td style={{ padding: "10px", textAlign: "right" }}>{formatSignalCount(row.log_event_count, telemetryRuntimeBlocked)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </WidgetCard>
              </div>

              <div style={{ marginTop: "12px" }}>
                <WidgetCard
                  title="Standard Pack 1: Evidence by Host"
                  subtitle="24h host evidence matrix with explicit UNMAPPED grouping."
                  query={observabilityByHostQuery}
                  isLoading={observabilityByHostResult.isLoading}
                  error={observabilityByHostResult.error}
                >
                  {observabilityHostRows.length === 0 ? (
                    <Paragraph style={{ color: theme.textMuted }}>No host evidence rows returned for the selected timeframe.</Paragraph>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Host</th>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Monitoring Mode</th>
                            <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Linked Services</th>
                            <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Trace Count</th>
                            <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Traces</th>
                            <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Metrics (Mode)</th>
                            <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Log Count</th>
                            <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Logs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {observabilityHostRows.map((row, index) => (
                            <tr key={`${row.host_name || "host"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                              <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.host_name || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.monitoring_mode || "-"}</td>
                              <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.service_count)}</td>
                              <td style={{ padding: "10px", textAlign: "right" }}>{row.traces_status === "N/A" ? "-" : formatSignalCount(row.spans_count_num, telemetryRuntimeBlocked)}</td>
                              <td style={{ padding: "10px", textAlign: "center", color: statusTone(resolveSignalStatus(row.traces_status, telemetryRuntimeBlocked)), fontWeight: 700 }}>
                                {resolveSignalStatus(row.traces_status, telemetryRuntimeBlocked)}
                              </td>
                              <td style={{ padding: "10px", textAlign: "center", color: statusTone(row.metrics_status), fontWeight: 700 }}>{row.metrics_status || "NO"}</td>
                              <td style={{ padding: "10px", textAlign: "right" }}>{formatSignalCount(row.logs_count_num, telemetryRuntimeBlocked)}</td>
                              <td style={{ padding: "10px", textAlign: "center", color: statusTone(resolveSignalStatus(row.logs_status, telemetryRuntimeBlocked)), fontWeight: 700 }}>
                                {resolveSignalStatus(row.logs_status, telemetryRuntimeBlocked)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </WidgetCard>
              </div>

              <div style={{ marginTop: "12px" }}>
                <WidgetCard
                  title="Standard Pack 1: Trace Coverage Gaps"
                  subtitle="FULL_STACK hosts with zero traces in 24h, including inferred reason."
                  query={traceCoverageGapsQuery}
                  isLoading={traceCoverageGapsResult.isLoading}
                  error={traceCoverageGapsResult.error}
                >
                  {traceCoverageGapRows.length === 0 ? (
                    <Paragraph style={{ color: theme.successText }}>No FULL_STACK hosts currently show trace coverage gaps.</Paragraph>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Host</th>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Monitoring Mode</th>
                            <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Linked Services</th>
                            <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Service-Path Spans</th>
                            <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {traceCoverageGapRows.map((row, index) => (
                            <tr key={`${row.host_name || "host"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                              <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.host_name || "-"}</td>
                              <td style={{ padding: "10px" }}>{row.monitoring_mode || "-"}</td>
                              <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.service_count)}</td>
                              <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.spans_by_service_host)}</td>
                              <td style={{ padding: "10px", color: theme.warningEmphasized, fontWeight: 600 }}>{row.gap_reason || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </WidgetCard>
              </div>
            </>
          )}
        </div>
      )}

      {(standardPack2Enabled || standardPack3Enabled) && (
        <div style={{ marginBottom: "12px", display: "grid", gap: "12px" }}>
          {standardPack2Enabled && (
            <>
              {!isCostProductMode ? (
                <WidgetCard
                  title="Standard Pack 2: Problems & Alerts"
                  subtitle="Native mode currently expects dt.cost.product app grouping."
                  query={variables?.dynatraceApplicationIdFieldPath || ""}
                  isLoading={false}
                  error={null}
                >
                  <Paragraph style={{ color: theme.warningEmphasized }}>
                    Set "Dynatrace Application ID Expression" to dt.cost.product in Setup to enable this release of Standard Pack 2.
                  </Paragraph>
                </WidgetCard>
              ) : (
                <>
                  <WidgetCard
                    title="Standard Pack 2: Alert Readiness Summary"
                    subtitle="Entity-only fallback: readiness inferred from host monitoring mode coverage by application."
                    query={problemsReadinessSummaryQuery}
                    isLoading={problemsReadinessSummaryResult.isLoading}
                    error={problemsReadinessSummaryResult.error}
                  >
                    {problemsSummaryRows.length === 0 ? (
                      <Paragraph style={{ color: theme.textMuted }}>No readiness rows returned for the selected timeframe.</Paragraph>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                          <thead>
                            <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                              <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                              <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Hosts</th>
                              <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Monitored Hosts</th>
                              <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Coverage %</th>
                              <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Readiness</th>
                            </tr>
                          </thead>
                          <tbody>
                            {problemsSummaryRows.map((row, index) => (
                              <tr key={`${row.app_id || "app"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.host_count)}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.monitored_hosts)}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{formatPercent(row.monitoring_pct, "-")}</td>
                                <td style={{ padding: "10px", textAlign: "center", color: readinessTone(row.readiness), fontWeight: 700 }}>{row.readiness || "GAP"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </WidgetCard>

                  <div style={{ marginTop: "12px" }}>
                    <WidgetCard
                      title="Standard Pack 2: Alert Readiness by Host"
                      subtitle="Entity-only host readiness matrix for alerting prerequisites."
                      query={problemsReadinessByHostQuery}
                      isLoading={problemsReadinessByHostResult.isLoading}
                      error={problemsReadinessByHostResult.error}
                    >
                      {problemsHostRows.length === 0 ? (
                        <Paragraph style={{ color: theme.textMuted }}>No host readiness rows returned for the selected timeframe.</Paragraph>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                            <thead>
                              <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Host</th>
                                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Monitoring Mode</th>
                                <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Readiness</th>
                              </tr>
                            </thead>
                            <tbody>
                              {problemsHostRows.map((row, index) => (
                                <tr key={`${row.host_name || "host"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                  <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                                  <td style={{ padding: "10px" }}>{row.host_name || "-"}</td>
                                  <td style={{ padding: "10px" }}>{row.monitoring_mode || "-"}</td>
                                  <td style={{ padding: "10px", textAlign: "center", color: readinessTone(row.readiness), fontWeight: 700 }}>{row.readiness || "GAP"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </WidgetCard>
                  </div>
                </>
              )}
            </>
          )}
          {standardPack3Enabled && (
            <>
              {!isCostProductMode ? (
                <WidgetCard
                  title="Standard Pack 3: Vulnerabilities"
                  subtitle="Native mode currently expects dt.cost.product app grouping."
                  query={variables?.dynatraceApplicationIdFieldPath || ""}
                  isLoading={false}
                  error={null}
                >
                  <Paragraph style={{ color: theme.warningEmphasized }}>
                    Set "Dynatrace Application ID Expression" to dt.cost.product in Setup to enable this release of Standard Pack 3.
                  </Paragraph>
                </WidgetCard>
              ) : (
                <>
                  <WidgetCard
                    title="Standard Pack 3: Vulnerability Exposure Baseline"
                    subtitle="Entity-only fallback: risk band by tier with monitoring coverage as vulnerability visibility baseline."
                    query={vulnerabilityBaselineSummaryQuery}
                    isLoading={vulnerabilityBaselineSummaryResult.isLoading}
                    error={vulnerabilityBaselineSummaryResult.error}
                  >
                    {vulnerabilitySummaryRows.length === 0 ? (
                      <Paragraph style={{ color: theme.textMuted }}>No vulnerability baseline rows returned for the selected timeframe.</Paragraph>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                          <thead>
                            <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                              <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                              {showOwnerColumn && <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Owner</th>}
                              {showTierColumn && <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Tier</th>}
                              <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Risk Band</th>
                              <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Hosts</th>
                              <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Monitored</th>
                              <th style={{ padding: "12px 10px", textAlign: "right", fontSize: "12px", color: theme.textSecondary }}>Coverage %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vulnerabilitySummaryRows.map((row, index) => (
                              <tr key={`${row.app_id || "app"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                                {showOwnerColumn && <td style={{ padding: "10px" }}>{row.owner || "-"}</td>}
                                {showTierColumn && <td style={{ padding: "10px" }}>{row.tier || "-"}</td>}
                                <td style={{ padding: "10px", textAlign: "center", color: riskTone(row.risk_band), fontWeight: 700 }}>{row.risk_band || "BASELINE"}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.host_count)}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{formatCount(row.monitored_hosts)}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>{formatPercent(row.monitoring_pct, "-")}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </WidgetCard>

                  <div style={{ marginTop: "12px" }}>
                    <WidgetCard
                      title="Standard Pack 3: Vulnerability Baseline by Host"
                      subtitle="Entity-only host baseline for vulnerability visibility and ownership routing."
                      query={vulnerabilityBaselineByHostQuery}
                      isLoading={vulnerabilityBaselineByHostResult.isLoading}
                      error={vulnerabilityBaselineByHostResult.error}
                    >
                      {vulnerabilityHostRows.length === 0 ? (
                        <Paragraph style={{ color: theme.textMuted }}>No vulnerability baseline host rows returned for the selected timeframe.</Paragraph>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                            <thead>
                              <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application</th>
                                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Host</th>
                                {showOwnerColumn && <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Owner</th>}
                                {showTierColumn && <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Tier</th>}
                                <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Risk Band</th>
                                <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Monitoring Mode</th>
                                <th style={{ padding: "12px 10px", textAlign: "center", fontSize: "12px", color: theme.textSecondary }}>Readiness</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vulnerabilityHostRows.map((row, index) => (
                                <tr key={`${row.host_name || "host"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                                  <td style={{ padding: "10px" }}>{row.app_name || row.app_id || "-"}</td>
                                  <td style={{ padding: "10px" }}>{row.host_name || "-"}</td>
                                  {showOwnerColumn && <td style={{ padding: "10px" }}>{row.owner || "-"}</td>}
                                  {showTierColumn && <td style={{ padding: "10px" }}>{row.tier || "-"}</td>}
                                  <td style={{ padding: "10px", textAlign: "center", color: riskTone(row.risk_band), fontWeight: 700 }}>{row.risk_band || "BASELINE"}</td>
                                  <td style={{ padding: "10px" }}>{row.monitoring_mode || "-"}</td>
                                  <td style={{ padding: "10px", textAlign: "center", color: readinessTone(row.readiness), fontWeight: 700 }}>{row.readiness || "GAP"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </WidgetCard>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <WidgetCard
        title="Application Inventory"
        subtitle="CMDB and Dynatrace union with classification"
        query={inventoryQuery}
        isLoading={inventoryResult.isLoading}
        error={inventoryResult.error}
      >
        {inventoryRows.length === 0 ? (
          <Paragraph style={{ color: theme.textMuted }}>No inventory rows returned by current mappings.</Paragraph>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application ID</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Application Name</th>
                  {showOwnerColumn && <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Owner</th>}
                  {showTierColumn && <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Tier</th>}
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Hosts</th>
                  <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Classification</th>
                </tr>
              </thead>
              <tbody>
                {inventoryRows.map((row, index) => (
                  <tr key={`${row.app_id || "row"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: "10px" }}>{row.app_id || "-"}</td>
                    <td style={{ padding: "10px" }}>{row.app_name || "-"}</td>
                    {showOwnerColumn && <td style={{ padding: "10px" }}>{row.owner || "-"}</td>}
                    {showTierColumn && <td style={{ padding: "10px" }}>{row.tier || "-"}</td>}
                    <td style={{ padding: "10px" }}>{row.hosts || "-"}</td>
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

      {isCostProductMode && (
        <div style={{ marginTop: "12px" }}>
          <WidgetCard
            title="dt.cost.product Ambiguity"
            subtitle="Hosts with multiple product tag values. Newest value is used for inventory joins."
            query={costProductAmbiguityQuery}
            isLoading={costProductAmbiguityResult.isLoading}
            error={costProductAmbiguityResult.error}
          >
            {costProductAmbiguityRows.length === 0 ? (
              <Paragraph style={{ color: theme.successText }}>No hosts currently have multiple dt.cost.product values.</Paragraph>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${theme.border}`, backgroundColor: theme.surfaceSubtle }}>
                      <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Host</th>
                      <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Newest Value Used</th>
                      <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Distinct Values Seen</th>
                      <th style={{ padding: "12px 10px", textAlign: "left", fontSize: "12px", color: theme.textSecondary }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costProductAmbiguityRows.map((row, index) => (
                      <tr key={`${row.host_name || "host"}-${index}`} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: "10px" }}>{row.host_name || "-"}</td>
                        <td style={{ padding: "10px" }}>{row.newest_candidate || "-"}</td>
                        <td style={{ padding: "10px" }}>{row.candidate_values || "-"}</td>
                        <td style={{ padding: "10px" }}>{typeof row.candidate_count === "number" ? row.candidate_count : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WidgetCard>
        </div>
      )}
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
        <Paragraph style={{ marginTop: "12px", color: theme.textSecondary }}>Loading configuration...</Paragraph>
      </div>
    );
  }

  if (configError) {
    return (
      <div style={{ padding: "32px" }}>
        <Heading level={1}>Configuration Error</Heading>
        <Paragraph style={{ color: theme.criticalText }}>{configError}</Paragraph>
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
