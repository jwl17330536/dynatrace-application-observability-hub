import React, { useCallback } from "react";
import { Heading, Paragraph, Button } from "@dynatrace/strato-components";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useMappingConfig } from "@hooks/useMappingConfig";
import { IGNORE_COLUMN_VALUE, mergeFeaturePacks, saveConfig, type MappingConfig, type LookupSourceConfig, type ApplicationVariableConfig, type FeaturePacksConfig, type FrontendEntityMap } from "@utils/documentStore";
import { density, theme } from "@utils/themeStyles";
import { HubDataTable, type HubColumnDef } from "@components/HubDataTable";
import { ComparisonKpi } from "@components/ComparisonKpi";
import { ColorLegend, SectionIntro } from "@components/SectionIntro";
import { HubDonutChart, HubHorizontalBarChart, HubStackedBarChart } from "@components/HubCharts";
import {
  buildAgentModeByAppQuery,
  buildApplicationHealthPortfolioQuery,
  buildDigitalHostsQuery,
  buildExperienceFrontendsQuery,
  buildExperienceSyntheticsQuery,
  buildOpenProblemsByAppQuery,
  buildOpenProblemsByHostQuery,
  buildOpenVulnerabilitiesByAppQuery,
  buildOpenVulnerabilitiesByHostQuery,
  buildRumSessionsByFrontendNameQuery,
  buildServicesByAppSummaryQuery,
  buildSmartscapeFrontendsInventoryQuery,
  extractApplicationIdFromFrontendName,
} from "@queries/applicationHealth";

/**
 * v0.1.68: Summary rollup IA, Real User Monitoring tab, Linked Services enrichment.
 * HubDataTable auto-links cells when getOpenInDynatraceId resolves (and ⋮ Open remains).
 */
const USE_HUB_DATA_TABLE_INVENTORY = true;

/** Application Dashboard tabs. URL: ?tab=<id> (aliases: digital/experience→rum, inventory/health→summary, data-health→status, alerts→problems). */
type DashboardTabId = "summary" | "signal" | "problems" | "security" | "rum" | "status";

const DASHBOARD_TABS: { id: DashboardTabId; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "signal", label: "Signal" },
  { id: "problems", label: "Problems" },
  { id: "security", label: "Security" },
  { id: "rum", label: "Real User Monitoring" },
  { id: "status", label: "Data Health Status" },
];

function parseDashboardTab(value: string | null): DashboardTabId {
  if (value === "alerts") {
    return "problems";
  }
  if (value === "experience" || value === "digital") {
    return "rum";
  }
  if (value === "data-health") {
    return "status";
  }
  if (value === "inventory" || value === "health") {
    return "summary";
  }
  const match = DASHBOARD_TABS.find((tab) => tab.id === value);
  return match ? match.id : "summary";
}

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
  host_count?: number | string;
  service_count?: number | string;
  problem_count?: number | string;
  agent_mode?: string;
  vulnerabilities_critical?: number | string;
  vulnerabilities_high?: number | string;
  vulnerabilities_medium?: number | string;
  vulnerabilities_low?: number | string;
  vulnerabilities_total?: number | string;
  traces_pct?: number | string;
  metrics_pct?: number | string;
  logs_pct?: number | string;
  frontend_count?: number | string;
  synthetic_count?: number | string;
  sessions_24h?: number | string;
  user_actions_24h?: number | string;
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
  metrics_hosts?: number;
  logs_hosts?: number;
  trace_event_count?: number;
  log_event_count?: number;
}

interface ObservabilityHostRow {
  app_id?: string;
  app_name?: string;
  host_id?: string;
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
  host_id?: string;
  host_name?: string;
  monitoring_mode?: string;
  service_count?: number | string;
  spans_by_service_host?: number | string;
  gap_reason?: string;
}

interface ProblemsSummaryRow {
  app_id?: string;
  app_name?: string;
  problem_count?: number | string;
  categories?: unknown;
}

interface ProblemsHostRow {
  app_id?: string;
  app_name?: string;
  host_id?: string;
  host_name?: string;
  display_id?: string;
  problem_event_id?: string;
  "event.name"?: string;
  event_name?: string;
  "event.category"?: string;
  event_category?: string;
  "event.status"?: string;
  event_status?: string;
}

interface VulnerabilitySummaryRow {
  app_id?: string;
  app_name?: string;
  owner?: string;
  tier?: string;
  vulnerabilities_critical?: number | string;
  vulnerabilities_high?: number | string;
  vulnerabilities_medium?: number | string;
  vulnerabilities_low?: number | string;
  vulnerabilities_total?: number | string;
  open_vulns?: number | string;
  critical_high?: number | string;
}

interface VulnerabilityHostRow {
  app_id?: string;
  app_name?: string;
  host_id?: string;
  host_name?: string;
  owner?: string;
  tier?: string;
  vuln_id?: string;
  risk_level?: string;
  vuln_title?: string;
  vulnerable_component?: string;
  technology?: string;
  cves?: string;
  external_id?: string;
}

interface ExperienceFrontendRow {
  app_id?: string;
  app_name?: string;
  frontend_id?: string;
  frontend_name?: string;
  classic_id?: string;
  mapping_method?: string;
}

interface ExperienceSyntheticRow {
  app_id?: string;
  app_name?: string;
  frontend_id?: string;
  frontend_name?: string;
  synthetic_id?: string;
  synthetic_name?: string;
  mapping_method?: string;
}

interface DigitalHostRow {
  host_id?: string;
  host_name?: string;
  app_id?: string;
  app_name?: string;
}

interface ServiceByAppRow {
  app_id?: string;
  service_count?: number | string;
}

interface AgentModeByAppRow {
  app_id?: string;
  agent_mode?: string;
}

interface RumSessionByFrontendRow {
  name_key?: string;
  frontend_name?: string;
  sessions_24h?: number | string;
  user_actions_24h?: number | string;
}

interface ApplicationHealthRow {
  app_id?: string;
  app_name?: string;
  owner?: string;
  tier?: string;
  in_dynatrace?: string;
  host_count?: number | string;
  problem_count?: number | string;
  vulnerabilities_critical?: number | string;
  vulnerabilities_high?: number | string;
  vulnerabilities_medium?: number | string;
  vulnerabilities_low?: number | string;
  vulnerabilities_total?: number | string;
}

interface MetricRecord {
  total_applications?: number;
  apps_in_dynatrace?: number;
  signal_health_pct?: number;
}

type FeaturePackId = keyof FeaturePacksConfig;

const FEATURE_PACK_LABELS: Record<FeaturePackId, string> = {
  observabilityEvidence: "Standard Pack 1: Observability Evidence",
  problemsAndAlerts: "Standard Pack 2: Problems",
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

function attentionCountColor(value: unknown): string {
  const n = toNumber(value);
  if (n !== null && n > 0) {
    return theme.criticalText;
  }
  return theme.text;
}

function signalPctColor(value: unknown): string {
  const n = toNumber(value);
  if (n === null) {
    return theme.textMuted;
  }
  if (n >= 100) {
    return theme.successText;
  }
  if (n >= 60) {
    return theme.text;
  }
  return theme.warningEmphasized;
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
], sourceField:cmdb_app_id, lookupField:dynatrace_app_id, fields:{dynatrace_app_id, dynatrace_app_name, dynatrace_host_count}
| fieldsAdd app_id = cmdb_app_id, app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:dynatrace_app_name), owner = cmdb_owner, tier = cmdb_tier, classification = if(isNotNull(dynatrace_app_id), then:"In both", else:"CMDB only"), host_count = coalesce(toLong(dynatrace_host_count), 0)
| fields app_id, app_name, owner, tier, classification, host_count
| append [
${frontendDataset}
| lookup [
${cmdbDataset}
], sourceField:dynatrace_app_id, lookupField:cmdb_app_id, fields:{cmdb_app_id}
| filter isNull(cmdb_app_id)
| fieldsAdd app_id = dynatrace_app_id, app_name = dynatrace_app_name, owner = "", tier = "", classification = "Dynatrace only", host_count = coalesce(toLong(dynatrace_host_count), 0)
| fields app_id, app_name, owner, tier, classification, host_count
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
| fields app_id, app_name, host_count, trace_eligible_hosts, traces_hosts, metrics_hosts, logs_hosts, trace_event_count, log_event_count, traces_pct, metrics_pct, logs_pct
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
| fields app_id, app_name, host_id, host_name, monitoring_mode, service_count, trace_eligible, spans_count_num, logs_count_num, traces_status, metrics_status, logs_status
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

  // Gap = FULL_STACK with zero host-attributed spans (host.id / host.name).
  // Service-path spans are diagnostic only (reason), not part of the gap filter —
  // otherwise "attribution missing" can never appear.
  return `${hostDataset}
| filter monitoring_mode == "FULL_STACK"
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
| filter isNotNull(host_id) AND host_id != ""
| append [
fetch dt.entity.service
| fields service_id = toString(id), pg_refs = runs_on[dt.entity.process_group]
| expand pg_id = pg_refs
| fields service_id, pg_id = toString(pg_id)
| filter isNotNull(pg_id) AND pg_id != ""
| lookup [
fetch dt.entity.process_group
| fields pg_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields pg_id, host_id = toString(host_id)
], sourceField:pg_id, lookupField:pg_id, fields:{host_id}
| filter isNotNull(host_id) AND host_id != ""
| fields host_id, service_id
]
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
| filter isNotNull(host_id) AND host_id != ""
| append [
fetch dt.entity.service
| fields service_id = toString(id), pg_refs = runs_on[dt.entity.process_group]
| expand pg_id = pg_refs
| fields service_id, pg_id = toString(pg_id)
| filter isNotNull(pg_id) AND pg_id != ""
| lookup [
fetch dt.entity.process_group
| fields pg_id = toString(id), host_refs = runs_on[dt.entity.host]
| expand host_id = host_refs
| fields pg_id, host_id = toString(host_id)
], sourceField:pg_id, lookupField:pg_id, fields:{host_id}
| filter isNotNull(host_id) AND host_id != ""
| fields service_id, host_id
]
], sourceField:service_id, lookupField:service_id, fields:{host_id}
| filter isNotNull(host_id)
| summarize spans_by_service_host = sum(spans_count_by_service), by:{host_id}
], sourceField:host_id, lookupField:host_id, fields:{spans_by_service_host}
| fieldsAdd host_span_count = coalesce(toLong(spans_by_host_id), toLong(spans_by_host_name), 0)
| fieldsAdd service_count = coalesce(toLong(service_count), 0)
| fieldsAdd spans_by_service_host = coalesce(toLong(spans_by_service_host), 0)
| filter host_span_count == 0
| fieldsAdd gap_reason = if(service_count == 0, then:"No classic services linked to this host (common on some FULL_STACK / custom workloads)", else:if(spans_by_service_host == 0, then:"Services present but no spans in 24h", else:"Spans on services but not attributed to host.id / host.name"))
| lookup [
${cmdbDataset}
| fields cmdb_app_id, cmdb_app_name
], sourceField:app_id, lookupField:cmdb_app_id, fields:{cmdb_app_name}
| fieldsAdd app_name = if(isNotNull(cmdb_app_name) AND cmdb_app_name != "", then:cmdb_app_name, else:app_id)
| fields app_id, app_name, host_id, host_name, monitoring_mode, service_count, spans_by_service_host, gap_reason
| sort app_name asc, host_name asc
| limit 1000`;
}

function buildProblemsReadinessSummaryQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  return buildOpenProblemsByAppQuery(dynatraceApplicationIdFieldPath, lookupPath, variables, cmdbAppIdColumn);
}

function buildProblemsReadinessByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  return buildOpenProblemsByHostQuery(dynatraceApplicationIdFieldPath, lookupPath, variables, cmdbAppIdColumn);
}

function buildVulnerabilityBaselineSummaryQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  return buildOpenVulnerabilitiesByAppQuery(dynatraceApplicationIdFieldPath, lookupPath, variables, cmdbAppIdColumn);
}

function buildVulnerabilityBaselineByHostQuery(
  dynatraceApplicationIdFieldPath: string,
  lookupPath: string,
  variables: ApplicationVariableConfig,
  cmdbAppIdColumn: string
): string {
  return buildOpenVulnerabilitiesByHostQuery(dynatraceApplicationIdFieldPath, lookupPath, variables, cmdbAppIdColumn);
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
    variables.dynatraceApplicationIdFieldPath?.trim()
  );
}

function WidgetCard({
  title,
  provenance,
  subtitle,
  query,
  isLoading,
  error,
  children,
}: {
  title: string;
  /** Secondary pack/source label (e.g. "Standard Pack 1"). Shown muted + tooltip. */
  provenance?: string;
  subtitle?: string;
  query: string;
  isLoading: boolean;
  error: unknown;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: density.cardRadius, padding: density.cardPadding, backgroundColor: theme.surface }}>
      <div style={{ marginBottom: "8px" }}>
        <Heading level={2} style={{ margin: 0, fontSize: density.widgetTitleSize }}>
          {title}
          {provenance ? (
            <span
              title={`Data source: ${provenance}`}
              style={{
                marginLeft: "8px",
                fontSize: "11px",
                fontWeight: 500,
                color: theme.textSecondary,
              }}
            >
              ({provenance})
            </span>
          ) : null}
        </Heading>
        {subtitle && <Paragraph style={{ marginTop: "4px", color: theme.textSecondary, fontSize: "12px" }}>{subtitle}</Paragraph>}
      </div>

      {isLoading && <Paragraph style={{ color: theme.textSecondary }}>Loading...</Paragraph>}

      {!isLoading && Boolean(error) && (
        <div style={{ backgroundColor: theme.criticalBg, border: `1px solid ${theme.criticalBorder}`, borderRadius: "6px", padding: "10px" }}>
          <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: theme.criticalText }}>Widget query failed</p>
          <p style={{ margin: 0, fontSize: density.thFontSize, color: theme.textSecondary }}>{typeof error === "string" ? error : String(error)}</p>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: density.tableFontSize }}>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseDashboardTab(searchParams.get("tab"));
  const setActiveTab = useCallback(
    (tab: DashboardTabId) => {
      const next = new URLSearchParams(searchParams);
      if (tab === "summary") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );
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
  const [selectedSecurityAppId, setSelectedSecurityAppId] = React.useState<string | null>(null);
  const [selectedSecurityAppName, setSelectedSecurityAppName] = React.useState<string | null>(null);
  const [selectedSecurityRowKey, setSelectedSecurityRowKey] = React.useState<string | null>(null);
  const filteredVulnerabilityHostRows = React.useMemo(() => {
    if (!selectedSecurityAppId) {
      return vulnerabilityHostRows;
    }
    return vulnerabilityHostRows.filter((row) => String(row.app_id || "") === selectedSecurityAppId);
  }, [vulnerabilityHostRows, selectedSecurityAppId]);

  const frontendMapName = variables?.frontendMappingLookupName || "";
  const experienceFrontendsQuery =
    hasSource && hasVariables
      ? buildExperienceFrontendsQuery(lookupPath, variables, derivedCmdbAppIdColumn, frontendMapName)
      : "";
  const smartscapeFrontendsInventoryQuery = hasSource && hasVariables ? buildSmartscapeFrontendsInventoryQuery() : "";
  const experienceSyntheticsQuery =
    hasSource && hasVariables
      ? buildExperienceSyntheticsQuery(lookupPath, variables, derivedCmdbAppIdColumn, frontendMapName)
      : "";
  const digitalHostsQuery =
    hasSource && hasVariables
      ? buildDigitalHostsQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const rumSessionsQuery = hasSource && hasVariables ? buildRumSessionsByFrontendNameQuery() : "";
  const servicesByAppQuery =
    hasSource && hasVariables && isCostProductMode
      ? buildServicesByAppSummaryQuery(variables.dynatraceApplicationIdFieldPath)
      : "";
  const agentModeByAppQuery =
    hasSource && hasVariables && isCostProductMode
      ? buildAgentModeByAppQuery(variables.dynatraceApplicationIdFieldPath)
      : "";
  const experienceFrontendsResult = useDql({ query: experienceFrontendsQuery });
  const smartscapeFrontendsInventoryResult = useDql({ query: smartscapeFrontendsInventoryQuery });
  const experienceSyntheticsResult = useDql({ query: experienceSyntheticsQuery });
  const digitalHostsResult = useDql({ query: digitalHostsQuery });
  const rumSessionsResult = useDql({ query: rumSessionsQuery });
  const servicesByAppResult = useDql({ query: servicesByAppQuery });
  const agentModeByAppResult = useDql({ query: agentModeByAppQuery });
  const classicFrontendRows = (experienceFrontendsResult.data?.records || []) as ExperienceFrontendRow[];
  const smartscapeInventoryRows = !smartscapeFrontendsInventoryResult.error
    ? ((smartscapeFrontendsInventoryResult.data?.records || []) as ExperienceFrontendRow[])
    : [];
  const smartscapeInventoryCount = smartscapeInventoryRows.length;
  const classicFrontendCount = classicFrontendRows.length;

  const [frontendEntityMaps, setFrontendEntityMaps] = React.useState<FrontendEntityMap[]>(
    () => variables?.frontendEntityMaps || []
  );
  React.useEffect(() => {
    setFrontendEntityMaps(variables?.frontendEntityMaps || []);
  }, [variables?.frontendEntityMaps]);

  const [mappingSaveError, setMappingSaveError] = React.useState<string | null>(null);
  const [mappingSavingId, setMappingSavingId] = React.useState<string | null>(null);

  const cmdbAppOptions = React.useMemo(() => {
    return inventoryRows
      .map((row) => ({
        id: String(row.app_id || "").trim(),
        name: String(row.app_name || row.app_id || "").trim(),
      }))
      .filter((row) => row.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryRows]);

  const experienceFrontendRows = React.useMemo(() => {
    const byId = new Map<string, ExperienceFrontendRow>();
    const byClassicId = new Map<string, string>(); // classic_id → frontend_id (smartscape)
    const byName = new Map<string, string>(); // lower name → frontend_id

    const upsert = (row: ExperienceFrontendRow, preferExistingMapping: boolean) => {
      const id = String(row.frontend_id || "").trim();
      if (!id) {
        return;
      }
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { ...row, frontend_id: id });
        const classicId = String(row.classic_id || "").trim();
        if (classicId) {
          byClassicId.set(classicId, id);
        }
        const nameKey = String(row.frontend_name || "")
          .trim()
          .toLowerCase();
        if (nameKey) {
          byName.set(nameKey, id);
        }
        return;
      }
      // Merge: keep smartscape ids/names; fill mapping from classic when helpful.
      const merged: ExperienceFrontendRow = {
        ...existing,
        frontend_name: existing.frontend_name || row.frontend_name,
        classic_id: existing.classic_id || row.classic_id,
      };
      if (preferExistingMapping) {
        if (!String(existing.app_id || "").trim() && String(row.app_id || "").trim()) {
          merged.app_id = row.app_id;
          merged.app_name = row.app_name;
          merged.mapping_method = row.mapping_method;
        }
      }
      byId.set(id, merged);
    };

    // Smartscape inventory is the full Experience list when available.
    for (const row of smartscapeInventoryRows) {
      upsert(row, false);
    }

    // Union classic: attach by classic_id / same id / same name; otherwise add.
    for (const row of classicFrontendRows) {
      const classicId = String(row.frontend_id || "").trim();
      const nameKey = String(row.frontend_name || "")
        .trim()
        .toLowerCase();
      const mappedSmartscapeId =
        (classicId && byClassicId.get(classicId)) ||
        (classicId && byId.has(classicId) ? classicId : "") ||
        (nameKey ? byName.get(nameKey) : "") ||
        "";

      if (mappedSmartscapeId) {
        const existing = byId.get(mappedSmartscapeId);
        if (existing) {
          byId.set(mappedSmartscapeId, {
            ...existing,
            classic_id: existing.classic_id || classicId,
            frontend_name: existing.frontend_name || row.frontend_name,
            app_id: String(existing.app_id || "").trim() ? existing.app_id : row.app_id,
            app_name: String(existing.app_id || "").trim() ? existing.app_name : row.app_name,
            mapping_method: String(existing.app_id || "").trim()
              ? existing.mapping_method
              : row.mapping_method,
          });
        }
        continue;
      }
      upsert({ ...row, classic_id: classicId }, true);
    }

    const mapsByFrontend = new Map(
      frontendEntityMaps.map((m) => [String(m.frontend_entity_id || "").trim(), String(m.application_id || "").trim()] as const)
    );
    const appNameById = new Map(cmdbAppOptions.map((o) => [o.id, o.name] as const));
    const validAppIds = new Set(cmdbAppOptions.map((o) => o.id));

    return Array.from(byId.values())
      .map((row) => {
        const frontendId = String(row.frontend_id || "").trim();
        const classicId = String(row.classic_id || "").trim();
        const hubMapped =
          mapsByFrontend.get(frontendId) || (classicId ? mapsByFrontend.get(classicId) : "") || "";

        // Priority: hub_map → existing join_source/name_match from classic → name_id → keep
        if (hubMapped && validAppIds.has(hubMapped)) {
          return {
            ...row,
            app_id: hubMapped,
            app_name: appNameById.get(hubMapped) || hubMapped,
            mapping_method: "hub_map",
          };
        }

        const existingMethod = String(row.mapping_method || "");
        const existingAppId = String(row.app_id || "").trim();
        if (
          existingAppId &&
          validAppIds.has(existingAppId) &&
          (existingMethod === "join_source" || existingMethod === "name_match")
        ) {
          return {
            ...row,
            app_id: existingAppId,
            app_name: appNameById.get(existingAppId) || row.app_name || existingAppId,
            mapping_method: existingMethod,
          };
        }

        const extractedId = extractApplicationIdFromFrontendName(row.frontend_name);
        if (extractedId && validAppIds.has(extractedId)) {
          return {
            ...row,
            app_id: extractedId,
            app_name: appNameById.get(extractedId) || extractedId,
            mapping_method: "name_id",
          };
        }

        if (existingAppId && validAppIds.has(existingAppId)) {
          return {
            ...row,
            app_name: appNameById.get(existingAppId) || row.app_name || existingAppId,
            mapping_method: existingMethod || "name_match",
          };
        }

        return {
          ...row,
          app_id: "",
          app_name: "",
          mapping_method: "unmapped",
        };
      })
      .sort((a, b) => {
        const methodCmp = String(a.mapping_method || "").localeCompare(String(b.mapping_method || ""));
        if (methodCmp !== 0) {
          return methodCmp;
        }
        return String(a.frontend_name || "").localeCompare(String(b.frontend_name || ""));
      });
  }, [classicFrontendRows, smartscapeInventoryRows, frontendEntityMaps, cmdbAppOptions]);

  const unmappedFrontendCount = React.useMemo(
    () => experienceFrontendRows.filter((row) => !String(row.app_id || "").trim()).length,
    [experienceFrontendRows]
  );

  const persistFrontendMap = React.useCallback(
    async (frontendId: string, applicationId: string) => {
      if (!config) {
        return;
      }
      setMappingSavingId(frontendId);
      setMappingSaveError(null);
      try {
        const nextMaps = [
          ...(frontendEntityMaps || []).filter((m) => String(m.frontend_entity_id) !== frontendId),
          ...(applicationId
            ? [{ frontend_entity_id: frontendId, application_id: applicationId } satisfies FrontendEntityMap]
            : []),
        ];
        const nextConfig: MappingConfig = {
          ...config,
          applicationVariables: {
            ...config.applicationVariables,
            frontendEntityMaps: nextMaps,
          },
        };
        await saveConfig(nextConfig);
        setFrontendEntityMaps(nextMaps);
      } catch (error) {
        setMappingSaveError((error as Error).message || "Failed to save frontend map");
      } finally {
        setMappingSavingId(null);
      }
    },
    [config, frontendEntityMaps]
  );
  const experienceSyntheticRows = (experienceSyntheticsResult.data?.records || []) as ExperienceSyntheticRow[];
  const digitalHostRows = (digitalHostsResult.data?.records || []) as DigitalHostRow[];
  const rumSessionRows = !rumSessionsResult.error
    ? ((rumSessionsResult.data?.records || []) as RumSessionByFrontendRow[])
    : [];
  const servicesByAppRows = !servicesByAppResult.error
    ? ((servicesByAppResult.data?.records || []) as ServiceByAppRow[])
    : [];
  const agentModeByAppRows = !agentModeByAppResult.error
    ? ((agentModeByAppResult.data?.records || []) as AgentModeByAppRow[])
    : [];
  const [selectedDigitalAppId, setSelectedDigitalAppId] = React.useState<string | null>(null);
  const [selectedDigitalAppName, setSelectedDigitalAppName] = React.useState<string | null>(null);
  const [selectedDigitalRowKey, setSelectedDigitalRowKey] = React.useState<string | null>(null);
  const filteredDigitalHostRows = React.useMemo(() => {
    if (!selectedDigitalAppId) {
      return digitalHostRows;
    }
    return digitalHostRows.filter((row) => String(row.app_id || "") === selectedDigitalAppId);
  }, [digitalHostRows, selectedDigitalAppId]);

  const applicationHealthQuery =
    hasSource && hasVariables && isCostProductMode
      ? buildApplicationHealthPortfolioQuery(variables.dynatraceApplicationIdFieldPath, lookupPath, variables, derivedCmdbAppIdColumn)
      : "";
  const applicationHealthResult = useDql({ query: applicationHealthQuery });
  const applicationHealthRows = (applicationHealthResult.data?.records || []) as ApplicationHealthRow[];

  const mergedInventoryRows = React.useMemo(() => {
    const healthByApp = new Map(
      applicationHealthRows.map((row) => [String(row.app_id || ""), row] as const)
    );
    const signalByApp = new Map(
      observabilitySummaryRows.map((row) => [String(row.app_id || ""), row] as const)
    );
    const serviceCountByApp = new Map(
      servicesByAppRows.map((row) => [String(row.app_id || ""), toNumber(row.service_count) ?? 0] as const)
    );
    const agentModeByApp = new Map(
      agentModeByAppRows.map((row) => [String(row.app_id || ""), String(row.agent_mode || "")] as const)
    );
    const frontendCountByApp = new Map<string, number>();
    const frontendNameToApp = new Map<string, string>();
    for (const row of experienceFrontendRows) {
      const appId = String(row.app_id || "").trim();
      if (!appId) {
        continue;
      }
      frontendCountByApp.set(appId, (frontendCountByApp.get(appId) || 0) + 1);
      const nameKey = String(row.frontend_name || "")
        .trim()
        .toLowerCase();
      if (nameKey) {
        frontendNameToApp.set(nameKey, appId);
      }
    }
    const syntheticCountByApp = new Map<string, number>();
    for (const row of experienceSyntheticRows) {
      const appId = String(row.app_id || "").trim();
      if (!appId) {
        continue;
      }
      syntheticCountByApp.set(appId, (syntheticCountByApp.get(appId) || 0) + 1);
    }
    const sessionsByApp = new Map<string, number>();
    const actionsByApp = new Map<string, number>();
    for (const row of rumSessionRows) {
      const nameKey = String(row.name_key || "").trim().toLowerCase();
      const appId = frontendNameToApp.get(nameKey);
      if (!appId) {
        continue;
      }
      sessionsByApp.set(appId, (sessionsByApp.get(appId) || 0) + (toNumber(row.sessions_24h) ?? 0));
      actionsByApp.set(appId, (actionsByApp.get(appId) || 0) + (toNumber(row.user_actions_24h) ?? 0));
    }

    return inventoryRows.map((row) => {
      const appId = String(row.app_id || "");
      const health = healthByApp.get(appId);
      const signal = signalByApp.get(appId);
      return {
        ...row,
        host_count: health?.host_count ?? row.host_count ?? 0,
        service_count: serviceCountByApp.get(appId) ?? 0,
        problem_count: health?.problem_count ?? 0,
        agent_mode: agentModeByApp.get(appId) || "-",
        vulnerabilities_critical: health?.vulnerabilities_critical ?? 0,
        vulnerabilities_high: health?.vulnerabilities_high ?? 0,
        vulnerabilities_medium: health?.vulnerabilities_medium ?? 0,
        vulnerabilities_low: health?.vulnerabilities_low ?? 0,
        vulnerabilities_total: health?.vulnerabilities_total ?? 0,
        traces_pct: signal?.traces_pct ?? null,
        metrics_pct: signal?.metrics_pct ?? null,
        logs_pct: signal?.logs_pct ?? null,
        frontend_count: frontendCountByApp.get(appId) || 0,
        synthetic_count: syntheticCountByApp.get(appId) || 0,
        sessions_24h: sessionsByApp.get(appId) || 0,
        user_actions_24h: actionsByApp.get(appId) || 0,
      } as InventoryRow;
    });
  }, [
    inventoryRows,
    applicationHealthRows,
    observabilitySummaryRows,
    experienceFrontendRows,
    experienceSyntheticRows,
    rumSessionRows,
    servicesByAppRows,
    agentModeByAppRows,
  ]);

  const summaryInventoryLoading =
    inventoryResult.isLoading ||
    applicationHealthResult.isLoading ||
    (standardPack1Enabled && isCostProductMode && observabilitySignalSummaryResult.isLoading) ||
    experienceFrontendsResult.isLoading ||
    experienceSyntheticsResult.isLoading ||
    servicesByAppResult.isLoading ||
    agentModeByAppResult.isLoading ||
    rumSessionsResult.isLoading;

  const liveStandardPackCount = [standardPack1Enabled && isCostProductMode, standardPack2Enabled && isCostProductMode, standardPack3Enabled && isCostProductMode].filter(Boolean).length;
  const enabledStandardPackCount = [standardPack1Enabled, standardPack2Enabled, standardPack3Enabled].filter(Boolean).length;
  const blockedByModeStandardPackCount = [standardPack1Enabled && !isCostProductMode, standardPack2Enabled && !isCostProductMode, standardPack3Enabled && !isCostProductMode].filter(Boolean).length;

  const portfolioAttentionTotals = React.useMemo(() => {
    let problems = 0;
    let critical = 0;
    let high = 0;
    for (const row of mergedInventoryRows) {
      problems += toNumber(row.problem_count) ?? 0;
      critical += toNumber(row.vulnerabilities_critical) ?? 0;
      high += toNumber(row.vulnerabilities_high) ?? 0;
    }
    return { problems, critical, high };
  }, [mergedInventoryRows]);

  const hostCoverageTotals = React.useMemo(() => {
    let hostCount = 0;
    let traceEligible = 0;
    let tracesHosts = 0;
    let metricsHosts = 0;
    let logsHosts = 0;
    for (const row of observabilitySummaryRows) {
      hostCount += toNumber(row.host_count) ?? 0;
      traceEligible += toNumber(row.trace_eligible_hosts) ?? 0;
      tracesHosts += toNumber(row.traces_hosts) ?? 0;
      metricsHosts += toNumber(row.metrics_hosts) ?? 0;
      logsHosts += toNumber(row.logs_hosts) ?? 0;
    }
    let fullStack = 0;
    const modeCounts = new Map<string, number>();
    for (const row of observabilityHostRows) {
      const mode = String(row.monitoring_mode || "UNKNOWN").trim() || "UNKNOWN";
      modeCounts.set(mode, (modeCounts.get(mode) || 0) + 1);
      if (mode === "FULL_STACK") {
        fullStack += 1;
      }
    }
    const hostRowCount = observabilityHostRows.length;
    return {
      hostCount: hostCount || hostRowCount,
      traceEligible,
      tracesHosts,
      metricsHosts,
      logsHosts,
      fullStack,
      modeCounts,
    };
  }, [observabilitySummaryRows, observabilityHostRows]);

  const problemsChartData = React.useMemo(
    () =>
      problemsSummaryRows.map((row) => ({
        category: String(row.app_name || row.app_id || "Unknown"),
        value: toNumber(row.problem_count) ?? 0,
      })),
    [problemsSummaryRows]
  );

  const problemsCategoryDonut = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of problemsSummaryRows) {
      const cats = Array.isArray(row.categories)
        ? row.categories
        : String(row.categories || "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
      const weight = toNumber(row.problem_count) ?? 0;
      if (cats.length === 0 && weight > 0) {
        counts.set("Uncategorized", (counts.get("Uncategorized") || 0) + weight);
        continue;
      }
      for (const cat of cats) {
        const label = String(cat);
        counts.set(label, (counts.get(label) || 0) + Math.max(1, Math.round(weight / cats.length)));
      }
    }
    return Array.from(counts.entries()).map(([category, value]) => ({ category, value }));
  }, [problemsSummaryRows]);

  const problemsTabTotals = React.useMemo(() => {
    const total = problemsSummaryRows.reduce((sum, row) => sum + (toNumber(row.problem_count) ?? 0), 0);
    const appsWithProblems = problemsSummaryRows.filter((row) => (toNumber(row.problem_count) ?? 0) > 0).length;
    return { total, appsWithProblems };
  }, [problemsSummaryRows]);

  const vulnerabilityStackedData = React.useMemo(
    () =>
      vulnerabilitySummaryRows.map((row) => ({
        category: String(row.app_name || row.app_id || "Unknown"),
        value: {
          Critical: toNumber(row.vulnerabilities_critical) ?? 0,
          High: toNumber(row.vulnerabilities_high) ?? 0,
          Medium: toNumber(row.vulnerabilities_medium) ?? 0,
          Low: toNumber(row.vulnerabilities_low) ?? 0,
        },
      })),
    [vulnerabilitySummaryRows]
  );

  const vulnerabilitySeverityDonut = React.useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const row of vulnerabilitySummaryRows) {
      critical += toNumber(row.vulnerabilities_critical) ?? 0;
      high += toNumber(row.vulnerabilities_high) ?? 0;
      medium += toNumber(row.vulnerabilities_medium) ?? 0;
      low += toNumber(row.vulnerabilities_low) ?? 0;
    }
    return [
      { category: "Critical", value: critical, color: "#c33c54" },
      { category: "High", value: high, color: "#c9842b" },
      { category: "Medium", value: medium, color: "#3d6df2" },
      { category: "Low", value: low, color: "#6b7280" },
    ];
  }, [vulnerabilitySummaryRows]);

  const vulnerabilityTabTotals = React.useMemo(() => {
    const critical = vulnerabilitySeverityDonut.find((d) => d.category === "Critical")?.value ?? 0;
    const high = vulnerabilitySeverityDonut.find((d) => d.category === "High")?.value ?? 0;
    const total = vulnerabilitySeverityDonut.reduce((sum, d) => sum + d.value, 0);
    return { critical, high, total };
  }, [vulnerabilitySeverityDonut]);

  const monitoringModeDonut = React.useMemo(
    () =>
      Array.from(hostCoverageTotals.modeCounts.entries()).map(([category, value]) => ({
        category,
        value,
      })),
    [hostCoverageTotals.modeCounts]
  );

  const rumMappedCount = experienceFrontendRows.length - unmappedFrontendCount;
  const rumMappingMethodDonut = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of experienceFrontendRows) {
      const method = String(row.mapping_method || (row.app_id ? "mapped" : "unmapped"));
      counts.set(method, (counts.get(method) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, value]) => ({ category, value }));
  }, [experienceFrontendRows]);

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
    <div style={{ padding: density.pagePadding, maxWidth: density.pageMaxWidth, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
        <div>
          <Heading level={1} style={{ margin: 0 }}>Application Dashboard</Heading>
          <Paragraph style={{ marginTop: "8px", color: theme.textSecondary }}>
            Summary rolls up Signal, Problems, Security, and Real User Monitoring. Use each tab for deeper evidence.
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

      <div
        role="tablist"
        aria-label="Application Dashboard sections"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0",
          marginBottom: "14px",
          border: `1px solid ${theme.border}`,
          borderRadius: "6px",
          overflow: "hidden",
          backgroundColor: theme.surface,
        }}
      >
        {DASHBOARD_TABS.map((tab, index) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: "1 1 auto",
                minWidth: "88px",
                padding: "10px 12px",
                border: "none",
                borderRight: index < DASHBOARD_TABS.length - 1 ? `1px solid ${theme.border}` : "none",
                backgroundColor: selected ? theme.primarySubtle : theme.surface,
                color: selected ? theme.primaryText : theme.text,
                fontWeight: selected ? 700 : 600,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: selected ? `inset 0 -3px 0 ${theme.primary}` : "none",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "summary" && (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>
        <WidgetCard
          title="Total Applications"
          subtitle="CMDB applications from lookup"
          query={totalApplicationsQuery}
          isLoading={totalApplicationsResult.isLoading}
          error={totalApplicationsResult.error}
        >
          <div style={{ fontSize: density.kpiValueSize, fontWeight: 700, color: theme.primaryText }}>{totalApplications}</div>
        </WidgetCard>

        <WidgetCard
          title="Apps in Dynatrace"
          subtitle="Matched via configured Application ID field"
          query={appsInDynatraceQuery}
          isLoading={appsInDynatraceResult.isLoading}
          error={appsInDynatraceResult.error}
        >
          <div style={{ fontSize: density.kpiValueSize, fontWeight: 700, color: theme.primaryText }}>{appsInDynatrace}</div>
        </WidgetCard>

        <WidgetCard
          title="Signal Health"
          subtitle="Coverage % = Apps in Dynatrace / Total Applications"
          query={signalHealthQuery}
          isLoading={signalHealthResult.isLoading}
          error={signalHealthResult.error}
        >
          <div style={{ fontSize: density.kpiValueSize, fontWeight: 700, color: signalHealth >= 90 ? theme.successText : signalHealth >= 60 ? theme.warningEmphasized : theme.criticalText }}>
            {signalHealth}%
          </div>
        </WidgetCard>
      </div>

      <ColorLegend />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>
        <WidgetCard
          title="Total Problems"
          subtitle="Open Davis problems (7d) across portfolio"
          query={inventoryQuery}
          isLoading={summaryInventoryLoading}
          error={inventoryResult.error || applicationHealthResult.error}
        >
          <div
            style={{
              fontSize: density.kpiValueSize,
              fontWeight: 700,
              color: portfolioAttentionTotals.problems > 0 ? theme.criticalText : theme.text,
            }}
          >
            {portfolioAttentionTotals.problems}
          </div>
        </WidgetCard>
        <WidgetCard
          title="Total Critical Vulnerabilities"
          subtitle="Open critical RVA findings across portfolio"
          query={inventoryQuery}
          isLoading={summaryInventoryLoading}
          error={inventoryResult.error || applicationHealthResult.error}
        >
          <div
            style={{
              fontSize: density.kpiValueSize,
              fontWeight: 700,
              color: portfolioAttentionTotals.critical > 0 ? theme.criticalText : theme.text,
            }}
          >
            {portfolioAttentionTotals.critical}
          </div>
        </WidgetCard>
        <WidgetCard
          title="Total High Vulnerabilities"
          subtitle="Open high RVA findings across portfolio"
          query={inventoryQuery}
          isLoading={summaryInventoryLoading}
          error={inventoryResult.error || applicationHealthResult.error}
        >
          <div
            style={{
              fontSize: density.kpiValueSize,
              fontWeight: 700,
              color: portfolioAttentionTotals.high > 0 ? theme.criticalText : theme.text,
            }}
          >
            {portfolioAttentionTotals.high}
          </div>
        </WidgetCard>
      </div>

      {standardPack1Enabled && isCostProductMode && (
        <div style={{ marginBottom: "12px" }}>
          <SectionIntro title="Host coverage">
            Portfolio X/Y comparisons from Signal evidence (24h). Open the Signal tab for host detail.
          </SectionIntro>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: "12px" }}>
            <ComparisonKpi
              title="Hosts full stack"
              numerator={hostCoverageTotals.fullStack}
              denominator={hostCoverageTotals.hostCount}
              subtitle="monitoring_mode = FULL_STACK"
            />
            <ComparisonKpi
              title="Hosts with log evidence"
              numerator={hostCoverageTotals.logsHosts}
              denominator={hostCoverageTotals.hostCount}
              subtitle="Hosts with logs in 24h"
            />
            <ComparisonKpi
              title="Hosts with trace evidence"
              numerator={hostCoverageTotals.tracesHosts}
              denominator={hostCoverageTotals.traceEligible || hostCoverageTotals.hostCount}
              subtitle="Eligible hosts with spans in 24h"
            />
            <ComparisonKpi
              title="Hosts monitored"
              numerator={hostCoverageTotals.metricsHosts}
              denominator={hostCoverageTotals.hostCount}
              subtitle="Agent mode not OFF"
            />
          </div>
        </div>
      )}

      {unmappedFrontendCount > 0 && (
        <Paragraph style={{ margin: "0 0 10px 0", color: theme.text, fontSize: "13px", fontWeight: 600 }}>
          {unmappedFrontendCount} frontend{unmappedFrontendCount === 1 ? "" : "s"} not linked to CMDB — tag with the same
          Application ID as hosts, or map on the Real User Monitoring tab.
        </Paragraph>
      )}

      <WidgetCard
        title="Portfolio Health"
        subtitle="VP scan — attention counts. Open detail tabs to dig in."
        query={inventoryQuery}
        isLoading={summaryInventoryLoading}
        error={inventoryResult.error || applicationHealthResult.error}
      >
        {mergedInventoryRows.length === 0 ? (
          <Paragraph style={{ color: theme.textMuted }}>No inventory rows returned by current mappings.</Paragraph>
        ) : USE_HUB_DATA_TABLE_INVENTORY ? (
          <HubDataTable<InventoryRow>
            storageKey="aoh.hubDataTable.portfolioHealth.v2"
            rows={mergedInventoryRows}
            rowKey={(row, index) => `${row.app_id || "row"}-${index}`}
            emptyMessage="No inventory rows returned by current mappings."
            columns={
              [
                { id: "app_id", label: "Application ID", group: "CMDB Data", width: 110, minWidth: 90 },
                { id: "app_name", label: "Application Name", group: "CMDB Data", width: 200, minWidth: 140 },
                ...(showOwnerColumn
                  ? [{ id: "owner", label: "Owner", group: "CMDB Data", width: 110, minWidth: 80 } satisfies HubColumnDef<InventoryRow>]
                  : []),
                ...(showTierColumn
                  ? [{ id: "tier", label: "Tier", group: "CMDB Data", width: 70, minWidth: 56 } satisfies HubColumnDef<InventoryRow>]
                  : []),
                {
                  id: "classification",
                  label: "Classification",
                  group: "CMDB Data",
                  width: 110,
                  minWidth: 90,
                  render: (row) => renderField("pill", row.classification || "-"),
                },
                {
                  id: "host_count",
                  label: "Hosts",
                  group: "Coverage",
                  width: 70,
                  align: "right" as const,
                  getValue: (row) => toNumber(row.host_count) ?? 0,
                  render: (row) => formatCount(row.host_count),
                },
                {
                  id: "service_count",
                  label: "Services",
                  group: "Coverage",
                  width: 80,
                  align: "right" as const,
                  getValue: (row) => toNumber(row.service_count) ?? 0,
                  render: (row) => formatCount(row.service_count),
                },
                {
                  id: "problem_count",
                  label: "Problems",
                  group: "Problems",
                  width: 90,
                  align: "right" as const,
                  getValue: (row) => toNumber(row.problem_count) ?? 0,
                  render: (row) => (
                    <span style={{ fontWeight: (toNumber(row.problem_count) ?? 0) > 0 ? 700 : 400, color: attentionCountColor(row.problem_count) }}>
                      {formatCount(row.problem_count)}
                    </span>
                  ),
                },
                {
                  id: "vulnerabilities_critical",
                  label: "Critical",
                  group: "Vulnerabilities",
                  width: 80,
                  align: "right" as const,
                  getValue: (row) => toNumber(row.vulnerabilities_critical) ?? 0,
                  render: (row) => (
                    <span style={{ fontWeight: (toNumber(row.vulnerabilities_critical) ?? 0) > 0 ? 700 : 400, color: attentionCountColor(row.vulnerabilities_critical) }}>
                      {formatCount(row.vulnerabilities_critical)}
                    </span>
                  ),
                },
                {
                  id: "vulnerabilities_high",
                  label: "High",
                  group: "Vulnerabilities",
                  width: 70,
                  align: "right" as const,
                  getValue: (row) => toNumber(row.vulnerabilities_high) ?? 0,
                  render: (row) => (
                    <span style={{ fontWeight: (toNumber(row.vulnerabilities_high) ?? 0) > 0 ? 700 : 400, color: attentionCountColor(row.vulnerabilities_high) }}>
                      {formatCount(row.vulnerabilities_high)}
                    </span>
                  ),
                },
              ] as HubColumnDef<InventoryRow>[]
            }
          />
        ) : (
          <Paragraph style={{ color: theme.textMuted }}>Enable HubDataTable for the merged inventory.</Paragraph>
        )}
      </WidgetCard>

      <div style={{ marginTop: "12px" }}>
        <WidgetCard
          title="Coverage detail"
          subtitle="Signal %, agent mode, RUM, and remaining vulnerability severities."
          query={inventoryQuery}
          isLoading={summaryInventoryLoading}
          error={inventoryResult.error || applicationHealthResult.error}
        >
          {mergedInventoryRows.length === 0 ? (
            <Paragraph style={{ color: theme.textMuted }}>No inventory rows returned by current mappings.</Paragraph>
          ) : USE_HUB_DATA_TABLE_INVENTORY ? (
            <HubDataTable<InventoryRow>
              storageKey="aoh.hubDataTable.coverageDetail.v1"
              rows={mergedInventoryRows}
              rowKey={(row, index) => `${row.app_id || "row"}-cov-${index}`}
              emptyMessage="No inventory rows returned by current mappings."
              columns={
                [
                  { id: "app_id", label: "Application ID", group: "CMDB", width: 110, minWidth: 90 },
                  { id: "app_name", label: "Application Name", group: "CMDB", width: 180, minWidth: 140 },
                  {
                    id: "agent_mode",
                    label: "Agent mode",
                    group: "Signal",
                    width: 120,
                    minWidth: 100,
                    getValue: (row) => row.agent_mode || "-",
                    render: (row) => row.agent_mode || "-",
                  },
                  {
                    id: "traces_pct",
                    label: "Traces %",
                    group: "Signal",
                    width: 80,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.traces_pct) ?? -1,
                    render: (row) =>
                      row.traces_pct === null || row.traces_pct === undefined ? (
                        "-"
                      ) : (
                        <span style={{ color: signalPctColor(row.traces_pct), fontWeight: 600 }}>{formatCount(row.traces_pct)}%</span>
                      ),
                  },
                  {
                    id: "metrics_pct",
                    label: "Metrics %",
                    group: "Signal",
                    width: 80,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.metrics_pct) ?? -1,
                    render: (row) =>
                      row.metrics_pct === null || row.metrics_pct === undefined ? (
                        "-"
                      ) : (
                        <span style={{ color: signalPctColor(row.metrics_pct), fontWeight: 600 }}>{formatCount(row.metrics_pct)}%</span>
                      ),
                  },
                  {
                    id: "logs_pct",
                    label: "Logs %",
                    group: "Signal",
                    width: 80,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.logs_pct) ?? -1,
                    render: (row) =>
                      row.logs_pct === null || row.logs_pct === undefined ? (
                        "-"
                      ) : (
                        <span style={{ color: signalPctColor(row.logs_pct), fontWeight: 600 }}>{formatCount(row.logs_pct)}%</span>
                      ),
                  },
                  {
                    id: "frontend_count",
                    label: "Frontends",
                    group: "RUM",
                    width: 90,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.frontend_count) ?? 0,
                    render: (row) => formatCount(row.frontend_count),
                  },
                  {
                    id: "synthetic_count",
                    label: "Synthetics",
                    group: "RUM",
                    width: 90,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.synthetic_count) ?? 0,
                    render: (row) => formatCount(row.synthetic_count),
                  },
                  {
                    id: "sessions_24h",
                    label: "Sessions 24h",
                    group: "RUM",
                    width: 100,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.sessions_24h) ?? 0,
                    render: (row) => formatCount(row.sessions_24h),
                  },
                  {
                    id: "user_actions_24h",
                    label: "User actions 24h",
                    group: "RUM",
                    width: 120,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.user_actions_24h) ?? 0,
                    render: (row) => formatCount(row.user_actions_24h),
                  },
                  {
                    id: "vulnerabilities_medium",
                    label: "Medium",
                    group: "Vulnerabilities",
                    width: 80,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.vulnerabilities_medium) ?? 0,
                    render: (row) => formatCount(row.vulnerabilities_medium),
                  },
                  {
                    id: "vulnerabilities_low",
                    label: "Low",
                    group: "Vulnerabilities",
                    width: 70,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.vulnerabilities_low) ?? 0,
                    render: (row) => formatCount(row.vulnerabilities_low),
                  },
                  {
                    id: "vulnerabilities_total",
                    label: "Total",
                    group: "Vulnerabilities",
                    width: 80,
                    align: "right" as const,
                    getValue: (row) => toNumber(row.vulnerabilities_total) ?? 0,
                    render: (row) => formatCount(row.vulnerabilities_total),
                  },
                ] as HubColumnDef<InventoryRow>[]
              }
            />
          ) : (
            <Paragraph style={{ color: theme.textMuted }}>Enable HubDataTable for the merged inventory.</Paragraph>
          )}
        </WidgetCard>
      </div>

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
              <HubDataTable<CostProductAmbiguityRow>
                storageKey="aoh.hubDataTable.costProductAmbiguity.v1"
                rows={costProductAmbiguityRows}
                rowKey={(row, index) => `${row.host_name || "host"}-${index}`}
                columns={[
                  { id: "host_name", label: "Host", width: 180 },
                  { id: "newest_candidate", label: "Newest Value Used", width: 160 },
                  { id: "candidate_values", label: "Distinct Values Seen", width: 220 },
                  {
                    id: "candidate_count",
                    label: "Count",
                    width: 80,
                    align: "right",
                    getValue: (row) => toNumber(row.candidate_count) ?? 0,
                  },
                ]}
              />
            )}
          </WidgetCard>
        </div>
      )}
      </>
      )}

{activeTab === "status" && (
      <>
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: "8px", padding: "14px", backgroundColor: theme.surface, marginBottom: "12px" }}>
        <Heading level={2} style={{ margin: 0, fontSize: "16px" }}>
          Pack Activation
          <span
            title="Configured in Setup · telemetry pack enablement"
            style={{ marginLeft: "8px", fontSize: "12px", fontWeight: 500, color: theme.textSecondary }}
          >
            (Setup)
          </span>
        </Heading>
        <Paragraph style={{ marginTop: "6px", color: theme.textSecondary }}>
          Telemetry packs are configured in Setup. Standard packs are Dynatrace-native.
        </Paragraph>
        {enabledStandardPackCount > 0 && (
          <div style={{ marginTop: "10px", maxWidth: "420px" }}>
            <div style={{ fontSize: density.kpiValueSize, fontWeight: 700, color: theme.primaryText, marginBottom: "6px" }}>
              {liveStandardPackCount}
              <span style={{ fontSize: "18px", fontWeight: 600, color: theme.textSecondary }}>/{enabledStandardPackCount}</span>
              <span style={{ fontSize: "13px", fontWeight: 500, color: theme.textSecondary, marginLeft: "8px" }}>packs live</span>
            </div>
            <div style={{ height: "10px", borderRadius: "4px", backgroundColor: theme.surfaceSubtle, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(4, Math.round((liveStandardPackCount / Math.max(1, enabledStandardPackCount)) * 100))}%`,
                  height: "100%",
                  backgroundColor: liveStandardPackCount === enabledStandardPackCount ? "#2c8b57" : "#c9842b",
                  borderRadius: "4px",
                }}
              />
            </div>
          </div>
        )}
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
          <Heading level={2} style={{ margin: 0, fontSize: "15px" }}>
            Capability Status
            <span
              title="Data source: Standard Pack 1"
              style={{ marginLeft: "8px", fontSize: "12px", fontWeight: 500, color: theme.textSecondary }}
            >
              (Standard Pack 1)
            </span>
          </Heading>
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
              <div style={{ fontSize: density.thFontSize, color: theme.textSecondary, marginTop: "4px" }}>Available now via entity monitoring mode.</div>
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

      {!standardPack1Enabled && (
        <Paragraph style={{ color: theme.warningEmphasized }}>
          Observability evidence pack is disabled. Enable Standard Pack 1 in Setup → Telemetry Selection.
        </Paragraph>
      )}
      {standardPack1Enabled && (
        <div style={{ marginBottom: "12px" }}>
          {!isCostProductMode ? (
            <WidgetCard
              title="Observability Evidence"
              provenance="Standard Pack 1"
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
                title="Runtime Diagnostics"
                provenance="Standard Pack 1"
                subtitle="Per-path host hits and record totals for trace/log evidence resolution."
                query={observabilityDiagnosticsQuery}
                isLoading={observabilityDiagnosticsResult.isLoading}
                error={observabilityDiagnosticsResult.error}
              >
                {observabilityDiagnosticsRows.length === 0 ? (
                  <Paragraph style={{ color: theme.textMuted }}>No diagnostics rows returned for the selected timeframe.</Paragraph>
                ) : (
                  <>
                    <div style={{ marginBottom: "12px" }}>
                      <SectionIntro title="Host hits by path">Quick view of which evidence paths resolve hosts.</SectionIntro>
                      <HubHorizontalBarChart
                        data={observabilityDiagnosticsRows.map((row) => ({
                          category: String(row.check || "path"),
                          value: toNumber(row.host_hits) ?? 0,
                        }))}
                        height={200}
                        emptyMessage="No host hits to chart."
                      />
                    </div>
                    <HubDataTable<ObservabilityDiagnosticsRow>
                      storageKey="aoh.hubDataTable.diagnostics.v1"
                      rows={observabilityDiagnosticsRows}
                      rowKey={(row, index) => `${row.check || "path"}-${index}`}
                      columns={[
                        { id: "check", label: "Path", width: 220 },
                        {
                          id: "host_hits",
                          label: "Host Hits",
                          width: 100,
                          align: "right",
                          getValue: (row) => toNumber(row.host_hits) ?? 0,
                          render: (row) => formatCount(row.host_hits),
                        },
                        {
                          id: "record_hits",
                          label: "Record Totals",
                          width: 120,
                          align: "right",
                          getValue: (row) => toNumber(row.record_hits) ?? 0,
                          render: (row) => formatCount(row.record_hits),
                        },
                      ]}
                    />
                  </>
                )}
              </WidgetCard>
            </>
          )}
        </div>
      )}
      </>
      )}

      {activeTab === "signal" && (
      <>
      {!standardPack1Enabled && (
        <Paragraph style={{ color: theme.warningEmphasized }}>
          Signal widgets require Standard Pack 1. Enable it in Setup → Telemetry Selection.
        </Paragraph>
      )}
      {standardPack1Enabled && !isCostProductMode && (
        <Paragraph style={{ color: theme.warningEmphasized }}>
          Set Dynatrace Application ID Expression to dt.cost.product in Setup to enable Signal widgets.
        </Paragraph>
      )}
      {standardPack1Enabled && isCostProductMode && (
        <div style={{ marginBottom: "12px", display: "grid", gap: "12px" }}>
              <div>
                <SectionIntro title="Host coverage">Same X/Y ratios as Summary — Signal evidence over 24h.</SectionIntro>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                  <ComparisonKpi
                    title="Hosts full stack"
                    numerator={hostCoverageTotals.fullStack}
                    denominator={hostCoverageTotals.hostCount}
                  />
                  <ComparisonKpi
                    title="Hosts with logs"
                    numerator={hostCoverageTotals.logsHosts}
                    denominator={hostCoverageTotals.hostCount}
                  />
                  <ComparisonKpi
                    title="Hosts with traces"
                    numerator={hostCoverageTotals.tracesHosts}
                    denominator={hostCoverageTotals.traceEligible || hostCoverageTotals.hostCount}
                  />
                  <ComparisonKpi
                    title="Hosts monitored"
                    numerator={hostCoverageTotals.metricsHosts}
                    denominator={hostCoverageTotals.hostCount}
                  />
                </div>
                <div
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: density.cardRadius,
                    padding: density.cardPadding,
                    backgroundColor: theme.surface,
                    marginBottom: "12px",
                  }}
                >
                  <SectionIntro title="Monitoring mode mix">Distribution of agent monitoring modes across hosts.</SectionIntro>
                  <HubDonutChart data={monitoringModeDonut} height={200} emptyMessage="No host modes to chart." />
                </div>
              </div>
              <WidgetCard
                title="Signal Quality Summary"
                provenance="Standard Pack 1"
                subtitle="24h coverage by application."
                query={observabilitySignalSummaryQuery}
                isLoading={observabilitySignalSummaryResult.isLoading}
                error={observabilitySignalSummaryResult.error}
              >
                {observabilitySummaryRows.length === 0 ? (
                  <Paragraph style={{ color: theme.textMuted }}>No observability summary rows returned for the selected timeframe.</Paragraph>
                ) : (
                  <HubDataTable<ObservabilitySummaryRow>
                    storageKey="aoh.hubDataTable.signalSummary.v2"
                    rows={observabilitySummaryRows}
                    rowKey={(row, index) => `${row.app_id || "app"}-${index}`}
                    columns={[
                      {
                        id: "app_name",
                        label: "Application",
                        width: 160,
                        minWidth: 120,
                        getValue: (row) => row.app_name || row.app_id || "-",
                        render: (row) => row.app_name || row.app_id || "-",
                      },
                      { id: "host_count", label: "Hosts", width: 80, align: "right", getValue: (row) => toNumber(row.host_count) ?? 0, render: (row) => formatCount(row.host_count) },
                      { id: "trace_eligible_hosts", label: "Trace Eligible Hosts", width: 130, align: "right", render: (row) => formatSignalCount(row.trace_eligible_hosts, telemetryRuntimeBlocked) },
                      { id: "traces_hosts", label: "Trace Hosts", width: 100, align: "right", render: (row) => formatEligibleTraceCount(row.traces_hosts, row.trace_eligible_hosts, telemetryRuntimeBlocked) },
                      {
                        id: "traces_pct",
                        label: "Traces %",
                        width: 90,
                        align: "right",
                        render: (row) => (
                          <span style={{ color: signalPctColor(row.traces_pct), fontWeight: 600 }}>
                            {formatSignalPercent(row.traces_pct, telemetryRuntimeBlocked)}
                          </span>
                        ),
                      },
                      {
                        id: "trace_event_count",
                        label: "Trace events 24h",
                        width: 120,
                        align: "right",
                        render: (row) => formatEligibleTraceCount(row.trace_event_count, row.trace_eligible_hosts, telemetryRuntimeBlocked),
                      },
                      {
                        id: "metrics_pct",
                        label: "Metrics (Mode)",
                        width: 110,
                        align: "center",
                        getValue: (row) => formatYesNoFromPercent(row.metrics_pct),
                        render: (row) => (
                          <span style={{ color: statusTone(formatYesNoFromPercent(row.metrics_pct)), fontWeight: 700 }}>
                            {formatYesNoFromPercent(row.metrics_pct)}
                          </span>
                        ),
                      },
                      { id: "logs_hosts", label: "Log Hosts", width: 90, align: "right", render: (row) => formatSignalCount(row.logs_hosts, telemetryRuntimeBlocked) },
                      {
                        id: "logs_pct",
                        label: "Logs %",
                        width: 80,
                        align: "right",
                        render: (row) => (
                          <span style={{ color: signalPctColor(row.logs_pct), fontWeight: 600 }}>
                            {formatSignalPercent(row.logs_pct, telemetryRuntimeBlocked)}
                          </span>
                        ),
                      },
                      { id: "log_event_count", label: "Log Count", width: 90, align: "right", render: (row) => formatSignalCount(row.log_event_count, telemetryRuntimeBlocked) },
                    ]}
                  />
                )}
              </WidgetCard>

              <div style={{ marginTop: "12px" }}>
                <WidgetCard
                  title="Evidence by Host"
                  provenance="Standard Pack 1"
                  subtitle="Host matrix: Linked Services (classic OneAgent) + Spans 24h + signal status."
                  query={observabilityByHostQuery}
                  isLoading={observabilityByHostResult.isLoading}
                  error={observabilityByHostResult.error}
                >
                  {observabilityHostRows.length === 0 ? (
                    <Paragraph style={{ color: theme.textMuted }}>No host evidence rows returned for the selected timeframe.</Paragraph>
                  ) : (
                    <HubDataTable<ObservabilityHostRow>
                      storageKey="aoh.hubDataTable.evidenceByHost.v2"
                      rows={observabilityHostRows}
                      rowKey={(row, index) => `${row.host_name || "host"}-${index}`}
                      columns={[
                        { id: "app_name", label: "Application", width: 140, minWidth: 110, getValue: (row) => row.app_name || row.app_id || "-", render: (row) => row.app_name || row.app_id || "-" },
                        {
                          id: "host_name",
                          label: "Host",
                          width: 160,
                          minWidth: 120,
                          getOpenInDynatraceId: (row) => row.host_id || null,
                        },
                        { id: "monitoring_mode", label: "Monitoring Mode", width: 120, minWidth: 100 },
                        {
                          id: "service_count",
                          label: "Linked Services",
                          width: 120,
                          align: "right",
                          getValue: (row) => toNumber(row.service_count) ?? 0,
                          render: (row) => formatCount(row.service_count),
                        },
                        {
                          id: "spans_count_num",
                          label: "Spans 24h",
                          width: 100,
                          align: "right",
                          render: (row) => (row.traces_status === "N/A" ? "-" : formatSignalCount(row.spans_count_num, telemetryRuntimeBlocked)),
                        },
                        {
                          id: "traces_status",
                          label: "Traces",
                          width: 90,
                          align: "center",
                          getValue: (row) => resolveSignalStatus(row.traces_status, telemetryRuntimeBlocked),
                          render: (row) => {
                            const status = resolveSignalStatus(row.traces_status, telemetryRuntimeBlocked);
                            return <span style={{ color: statusTone(status), fontWeight: 700 }}>{status}</span>;
                          },
                        },
                        {
                          id: "metrics_status",
                          label: "Metrics (Mode)",
                          width: 110,
                          align: "center",
                          getValue: (row) => row.metrics_status || "NO",
                          render: (row) => <span style={{ color: statusTone(row.metrics_status), fontWeight: 700 }}>{row.metrics_status || "NO"}</span>,
                        },
                        { id: "logs_count_num", label: "Log Count", width: 90, align: "right", render: (row) => formatSignalCount(row.logs_count_num, telemetryRuntimeBlocked) },
                        {
                          id: "logs_status",
                          label: "Logs",
                          width: 80,
                          align: "center",
                          getValue: (row) => resolveSignalStatus(row.logs_status, telemetryRuntimeBlocked),
                          render: (row) => {
                            const status = resolveSignalStatus(row.logs_status, telemetryRuntimeBlocked);
                            return <span style={{ color: statusTone(status), fontWeight: 700 }}>{status}</span>;
                          },
                        },
                      ]}
                    />
                  )}
                </WidgetCard>
              </div>

              <div style={{ marginTop: "12px" }}>
                <WidgetCard
                  title="Trace Coverage Gaps"
                  provenance="Standard Pack 1"
                  subtitle="FULL_STACK hosts with no host-attributed spans in 24h."
                  query={traceCoverageGapsQuery}
                  isLoading={traceCoverageGapsResult.isLoading}
                  error={traceCoverageGapsResult.error}
                >
                  {traceCoverageGapRows.length === 0 ? (
                    <Paragraph style={{ color: theme.successText }}>No FULL_STACK hosts currently show host-level trace coverage gaps.</Paragraph>
                  ) : (
                    <HubDataTable<TraceCoverageGapRow>
                      storageKey="aoh.hubDataTable.traceGaps.v1"
                      rows={traceCoverageGapRows}
                      rowKey={(row, index) => `${row.host_name || "host"}-${index}`}
                      columns={[
                        { id: "app_name", label: "Application", width: 140, getValue: (row) => row.app_name || row.app_id || "-", render: (row) => row.app_name || row.app_id || "-" },
                        {
                          id: "host_name",
                          label: "Host",
                          width: 160,
                          getOpenInDynatraceId: (row) => row.host_id || null,
                        },
                        { id: "monitoring_mode", label: "Monitoring Mode", width: 120 },
                        {
                          id: "service_count",
                          label: "Linked Services",
                          width: 120,
                          align: "right",
                          getValue: (row) => toNumber(row.service_count) ?? 0,
                          render: (row) => String(toNumber(row.service_count) ?? 0),
                        },
                        {
                          id: "spans_by_service_host",
                          label: "Service-Path Spans",
                          width: 130,
                          align: "right",
                          getValue: (row) => toNumber(row.spans_by_service_host) ?? 0,
                          render: (row) => String(toNumber(row.spans_by_service_host) ?? 0),
                        },
                        {
                          id: "gap_reason",
                          label: "Reason",
                          width: 420,
                          minWidth: 280,
                          getValue: (row) => row.gap_reason || "-",
                          render: (row) => (
                            <span
                              title={row.gap_reason || undefined}
                              style={{
                                color: theme.warningEmphasized,
                                fontWeight: 600,
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                                display: "block",
                                lineHeight: 1.35,
                              }}
                            >
                              {row.gap_reason || "-"}
                            </span>
                          ),
                        },
                      ]}
                    />
                  )}
                </WidgetCard>
              </div>
        </div>
      )}
      </>
      )}

      {activeTab === "problems" && (
      <>
      {!standardPack2Enabled && (
        <Paragraph style={{ color: theme.warningEmphasized }}>
          Problems pack is disabled. Enable Standard Pack 2 in Setup → Telemetry Selection.
        </Paragraph>
      )}
      {standardPack2Enabled && !isCostProductMode && (
        <WidgetCard
          title="Open Problems"
          provenance="Standard Pack 2"
          subtitle="Requires dt.cost.product host join."
          query={variables?.dynatraceApplicationIdFieldPath || ""}
          isLoading={false}
          error={null}
        >
          <Paragraph style={{ color: theme.warningEmphasized }}>
            Set Dynatrace Application ID Expression to dt.cost.product in Setup to roll problems up by application.
          </Paragraph>
        </WidgetCard>
      )}
      {standardPack2Enabled && isCostProductMode && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <WidgetCard
              title="Open Problems"
              subtitle="Active Davis problems (7d) across mapped apps"
              query={problemsReadinessSummaryQuery}
              isLoading={problemsReadinessSummaryResult.isLoading}
              error={problemsReadinessSummaryResult.error}
            >
              <div
                style={{
                  fontSize: density.kpiValueSize,
                  fontWeight: 700,
                  color: problemsTabTotals.total > 0 ? theme.criticalText : theme.text,
                }}
              >
                {problemsTabTotals.total}
              </div>
            </WidgetCard>
            <WidgetCard
              title="Apps with Problems"
              subtitle="Applications with at least one open problem"
              query={problemsReadinessSummaryQuery}
              isLoading={problemsReadinessSummaryResult.isLoading}
              error={problemsReadinessSummaryResult.error}
            >
              <div
                style={{
                  fontSize: density.kpiValueSize,
                  fontWeight: 700,
                  color: problemsTabTotals.appsWithProblems > 0 ? theme.criticalText : theme.text,
                }}
              >
                {problemsTabTotals.appsWithProblems}
              </div>
            </WidgetCard>
          </div>
          <WidgetCard
            title="Open Problems by Application"
            provenance="Standard Pack 2"
            subtitle="Active Davis problems (7d) on hosts tagged with dt.cost.product, joined to CMDB application_id."
            query={problemsReadinessSummaryQuery}
            isLoading={problemsReadinessSummaryResult.isLoading}
            error={problemsReadinessSummaryResult.error}
          >
            {problemsSummaryRows.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No active problems mapped to CMDB applications in the last 7 days.</Paragraph>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
                <div>
                  <SectionIntro title="Problems by application">Horizontal bar — open problem count per app.</SectionIntro>
                  <HubHorizontalBarChart data={problemsChartData} emptyMessage="No open problems to chart." />
                </div>
                <div>
                  <SectionIntro title="By category">Category mix across open problems.</SectionIntro>
                  <HubDonutChart data={problemsCategoryDonut} height={220} emptyMessage="No categories to chart." />
                </div>
              </div>
            )}
          </WidgetCard>
          <div style={{ marginTop: "12px" }}>
            <WidgetCard
              title="Open Problems by Host"
              provenance="Standard Pack 2"
              subtitle="Host-level active problems for mapped applications."
              query={problemsReadinessByHostQuery}
              isLoading={problemsReadinessByHostResult.isLoading}
              error={problemsReadinessByHostResult.error}
            >
              {problemsHostRows.length === 0 ? (
                <Paragraph style={{ color: theme.textMuted }}>No host-level active problems mapped in the last 7 days.</Paragraph>
              ) : (
                <HubDataTable<ProblemsHostRow>
                  storageKey="aoh.hubDataTable.problemsByHost.v1"
                  rows={problemsHostRows}
                  rowKey={(row, index) => `${row.display_id || "p"}-${index}`}
                  columns={[
                    { id: "app_name", label: "Application", width: 140, getValue: (row) => row.app_name || row.app_id || "-", render: (row) => row.app_name || row.app_id || "-" },
                    {
                      id: "host_name",
                      label: "Host",
                      width: 140,
                      getOpenInDynatraceId: (row) => row.host_id || null,
                    },
                    {
                      id: "event.name",
                      label: "Problem",
                      width: 220,
                      getValue: (row) => row["event.name"] || row.event_name || "-",
                      render: (row) => row["event.name"] || row.event_name || "-",
                      getOpenInDynatraceId: (row) => row.problem_event_id || row.display_id || null,
                    },
                    {
                      id: "event.category",
                      label: "Category",
                      width: 120,
                      getValue: (row) => row["event.category"] || row.event_category || "-",
                      render: (row) => row["event.category"] || row.event_category || "-",
                    },
                    {
                      id: "display_id",
                      label: "ID",
                      width: 120,
                      getOpenInDynatraceId: (row) => row.problem_event_id || row.display_id || null,
                    },
                  ]}
                />
              )}
            </WidgetCard>
          </div>
        </>
      )}
      </>
      )}

{activeTab === "security" && (
      <>
      {!standardPack3Enabled && (
        <Paragraph style={{ color: theme.warningEmphasized }}>
          Vulnerabilities pack is disabled. Enable Standard Pack 3 in Setup → Telemetry Selection.
        </Paragraph>
      )}
      {standardPack3Enabled && !isCostProductMode && (
        <WidgetCard
          title="Open Vulnerabilities"
          provenance="Standard Pack 3"
          subtitle="Requires dt.cost.product host join."
          query={variables?.dynatraceApplicationIdFieldPath || ""}
          isLoading={false}
          error={null}
        >
          <Paragraph style={{ color: theme.warningEmphasized }}>
            Set Dynatrace Application ID Expression to dt.cost.product in Setup to roll vulnerabilities up by application.
          </Paragraph>
        </WidgetCard>
      )}
      {standardPack3Enabled && isCostProductMode && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <WidgetCard
              title="Critical"
              subtitle="Open critical vulnerabilities"
              query={vulnerabilityBaselineSummaryQuery}
              isLoading={vulnerabilityBaselineSummaryResult.isLoading}
              error={vulnerabilityBaselineSummaryResult.error}
            >
              <div
                style={{
                  fontSize: density.kpiValueSize,
                  fontWeight: 700,
                  color: vulnerabilityTabTotals.critical > 0 ? theme.criticalText : theme.text,
                }}
              >
                {vulnerabilityTabTotals.critical}
              </div>
            </WidgetCard>
            <WidgetCard
              title="High"
              subtitle="Open high vulnerabilities"
              query={vulnerabilityBaselineSummaryQuery}
              isLoading={vulnerabilityBaselineSummaryResult.isLoading}
              error={vulnerabilityBaselineSummaryResult.error}
            >
              <div
                style={{
                  fontSize: density.kpiValueSize,
                  fontWeight: 700,
                  color: vulnerabilityTabTotals.high > 0 ? theme.criticalText : theme.text,
                }}
              >
                {vulnerabilityTabTotals.high}
              </div>
            </WidgetCard>
            <WidgetCard
              title="Total Open"
              subtitle="All severities across portfolio"
              query={vulnerabilityBaselineSummaryQuery}
              isLoading={vulnerabilityBaselineSummaryResult.isLoading}
              error={vulnerabilityBaselineSummaryResult.error}
            >
              <div style={{ fontSize: density.kpiValueSize, fontWeight: 700, color: theme.primaryText }}>
                {vulnerabilityTabTotals.total}
              </div>
            </WidgetCard>
          </div>
          <WidgetCard
            title="Open Vulnerabilities by Application"
            provenance="Standard Pack 3"
            subtitle="Open RVA findings (7d). Charts above; select a row below to filter host detail."
            query={vulnerabilityBaselineSummaryQuery}
            isLoading={vulnerabilityBaselineSummaryResult.isLoading}
            error={vulnerabilityBaselineSummaryResult.error}
          >
            {vulnerabilitySummaryRows.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No open vulnerabilities mapped to CMDB applications (or security.events scope missing).</Paragraph>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: "16px", alignItems: "start", marginBottom: "14px" }}>
                  <div>
                    <SectionIntro title="Severity by application">Stacked bar — Critical / High / Medium / Low.</SectionIntro>
                    <HubStackedBarChart data={vulnerabilityStackedData} emptyMessage="No vulnerabilities to chart." />
                  </div>
                  <div>
                    <SectionIntro title="Portfolio severity mix">Share of open findings by risk level.</SectionIntro>
                    <HubDonutChart data={vulnerabilitySeverityDonut} height={220} emptyMessage="No severities to chart." />
                  </div>
                </div>
                <div
                  style={{
                    border: `2px solid ${theme.primary}`,
                    borderRadius: density.cardRadius,
                    padding: "14px",
                    backgroundColor: theme.primarySubtle,
                    marginBottom: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: theme.text }}>Application filter</div>
                      <Paragraph style={{ margin: "4px 0 0 0", color: theme.text, fontSize: "13px" }}>
                        Click a row — host findings below filter to that app.
                      </Paragraph>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      {selectedSecurityAppId ? (
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 700,
                            color: theme.primaryText,
                            backgroundColor: theme.surface,
                            border: `1px solid ${theme.primary}`,
                            borderRadius: "999px",
                            padding: "4px 10px",
                          }}
                        >
                          Selected: {selectedSecurityAppName || selectedSecurityAppId}
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px", color: theme.textSecondary, fontWeight: 600 }}>No app selected — showing all hosts</span>
                      )}
                      {selectedSecurityAppId ? (
                        <Button
                          type="button"
                          variant="default"
                          onClick={() => {
                            setSelectedSecurityAppId(null);
                            setSelectedSecurityAppName(null);
                            setSelectedSecurityRowKey(null);
                          }}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ marginTop: "12px", backgroundColor: theme.surface, borderRadius: "6px", padding: "8px" }}>
                <HubDataTable<VulnerabilitySummaryRow>
                  storageKey="aoh.hubDataTable.vulnsByApp.v3"
                  rows={vulnerabilitySummaryRows}
                  rowKey={(row, index) => `${row.app_id || "app"}-${index}`}
                  selectable
                  selectedRowKey={selectedSecurityRowKey}
                  onSelectRow={(row, key) => {
                    if (!row || !key) {
                      setSelectedSecurityAppId(null);
                      setSelectedSecurityAppName(null);
                      setSelectedSecurityRowKey(null);
                      return;
                    }
                    setSelectedSecurityAppId(String(row.app_id || ""));
                    setSelectedSecurityAppName(String(row.app_name || row.app_id || ""));
                    setSelectedSecurityRowKey(key);
                  }}
                  columns={[
                    { id: "app_name", label: "Application", width: 200, getValue: (row) => row.app_name || row.app_id || "-", render: (row) => row.app_name || row.app_id || "-" },
                    {
                      id: "vulnerabilities_critical",
                      label: "Critical",
                      width: 90,
                      align: "right",
                      getValue: (row) => toNumber(row.vulnerabilities_critical) ?? 0,
                      render: (row) => (
                        <span style={{ fontWeight: (toNumber(row.vulnerabilities_critical) ?? 0) > 0 ? 700 : 400, color: attentionCountColor(row.vulnerabilities_critical) }}>
                          {formatCount(row.vulnerabilities_critical)}
                        </span>
                      ),
                    },
                    {
                      id: "vulnerabilities_high",
                      label: "High",
                      width: 80,
                      align: "right",
                      getValue: (row) => toNumber(row.vulnerabilities_high) ?? 0,
                      render: (row) => (
                        <span style={{ fontWeight: (toNumber(row.vulnerabilities_high) ?? 0) > 0 ? 700 : 400, color: attentionCountColor(row.vulnerabilities_high) }}>
                          {formatCount(row.vulnerabilities_high)}
                        </span>
                      ),
                    },
                    {
                      id: "vulnerabilities_total",
                      label: "Total",
                      width: 90,
                      align: "right",
                      getValue: (row) => toNumber(row.vulnerabilities_total) ?? 0,
                      render: (row) => formatCount(row.vulnerabilities_total),
                    },
                  ]}
                />
                  </div>
                </div>
              </>
            )}
          </WidgetCard>
          <div style={{ marginTop: "12px" }}>
            <WidgetCard
              title={selectedSecurityAppId ? `Open Vulnerabilities for ${selectedSecurityAppName || selectedSecurityAppId}` : "Open Vulnerabilities by Host"}
              provenance="Standard Pack 3"
              subtitle={
                selectedSecurityAppId
                  ? "Host-level findings for the selected application. Clear row selection above to show all apps."
                  : "Host-level open vulnerability findings for mapped applications. Select an application row above to filter."
              }
              query={vulnerabilityBaselineByHostQuery}
              isLoading={vulnerabilityBaselineByHostResult.isLoading}
              error={vulnerabilityBaselineByHostResult.error}
            >
              {filteredVulnerabilityHostRows.length === 0 ? (
                <Paragraph style={{ color: theme.textMuted }}>
                  {selectedSecurityAppId ? "No host-level open vulnerabilities for the selected application." : "No host-level open vulnerabilities mapped."}
                </Paragraph>
              ) : (
                <HubDataTable<VulnerabilityHostRow>
                  storageKey="aoh.hubDataTable.vulnsByHost.v2"
                  rows={filteredVulnerabilityHostRows}
                  rowKey={(row, index) => `${row.vuln_id || "v"}-${row.host_name || ""}-${index}`}
                  columns={[
                    { id: "app_name", label: "Application", width: 140, getValue: (row) => row.app_name || row.app_id || "-", render: (row) => row.app_name || row.app_id || "-" },
                    {
                      id: "host_name",
                      label: "Host",
                      width: 140,
                      getOpenInDynatraceId: (row) => row.host_id || null,
                    },
                    { id: "vuln_id", label: "Vuln ID", width: 140 },
                    {
                      id: "vuln_title",
                      label: "Title",
                      width: 180,
                      getValue: (row) => row.vuln_title || "-",
                      render: (row) => row.vuln_title || "-",
                    },
                    {
                      id: "vulnerable_component",
                      label: "Component",
                      width: 150,
                      getValue: (row) => row.vulnerable_component || "-",
                      render: (row) => row.vulnerable_component || "-",
                    },
                    {
                      id: "technology",
                      label: "Technology",
                      width: 110,
                      getValue: (row) => row.technology || "-",
                      render: (row) => row.technology || "-",
                    },
                    {
                      id: "cves",
                      label: "CVEs",
                      width: 160,
                      getValue: (row) => row.cves || "-",
                      render: (row) => row.cves || "-",
                    },
                    {
                      id: "risk_level",
                      label: "Risk",
                      width: 100,
                      render: (row) => (
                        <span
                          style={{
                            fontWeight: 700,
                            color: row.risk_level === "CRITICAL" || row.risk_level === "HIGH" ? theme.criticalText : theme.text,
                          }}
                        >
                          {row.risk_level || "-"}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </WidgetCard>
          </div>
        </>
      )}
      </>
      )}

{activeTab === "rum" && (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)", gap: "12px", marginBottom: "12px" }}>
          <div
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: density.cardRadius,
              padding: density.cardPadding,
              backgroundColor: theme.surface,
            }}
          >
            <SectionIntro title="Frontend mapping">Mapped vs total Dynatrace frontends.</SectionIntro>
            <div
              style={{
                fontSize: density.kpiValueSize,
                fontWeight: 700,
                color: unmappedFrontendCount > 0 ? theme.warningEmphasized : theme.successText,
                marginBottom: "8px",
              }}
            >
              {rumMappedCount}
              <span style={{ fontSize: "18px", fontWeight: 600, color: theme.textSecondary }}>/{experienceFrontendRows.length}</span>
            </div>
            <div style={{ height: "10px", borderRadius: "4px", backgroundColor: theme.surfaceSubtle, overflow: "hidden", marginBottom: "8px" }}>
              <div
                style={{
                  width: `${
                    experienceFrontendRows.length > 0
                      ? Math.max(4, Math.round((rumMappedCount / experienceFrontendRows.length) * 100))
                      : 0
                  }%`,
                  height: "100%",
                  backgroundColor: unmappedFrontendCount > 0 ? "#c9842b" : "#2c8b57",
                  borderRadius: "4px",
                }}
              />
            </div>
            <Paragraph style={{ margin: "0", color: theme.textSecondary, fontSize: "12px" }}>
              {unmappedFrontendCount} unmapped — map below, tag with Application ID, or rename to{" "}
              <code>name__{"{application_id}"}</code>.
            </Paragraph>
          </div>
          <div
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: density.cardRadius,
              padding: density.cardPadding,
              backgroundColor: theme.surface,
            }}
          >
            <SectionIntro title="Mapping method">How frontends link to CMDB apps.</SectionIntro>
            <HubDonutChart data={rumMappingMethodDonut} height={180} emptyMessage="No frontends to chart." />
          </div>
        </div>
        <Paragraph style={{ marginBottom: "10px", color: theme.text, fontSize: "13px" }}>
          Smartscape FRONTEND inventory unioned with classic apps. Prefer display names like{" "}
          <code>frontendName__{"{application_id}"}</code> for auto-join, or map below / tag with Application ID. Select a
          mapped row to filter hosts.
        </Paragraph>
        <Paragraph style={{ marginBottom: "10px", color: theme.textSecondary, fontSize: "12px", fontWeight: 600 }}>
          Smartscape: {smartscapeInventoryCount} · Classic: {classicFrontendCount} · Merged: {experienceFrontendRows.length}
        </Paragraph>
        {(smartscapeFrontendsInventoryResult.error ||
          (smartscapeInventoryCount === 0 && classicFrontendCount > 0 && !smartscapeFrontendsInventoryResult.isLoading)) && (
          <Paragraph style={{ marginBottom: "10px", color: theme.warningEmphasized, fontSize: "13px", fontWeight: 700 }}>
            Smartscape FRONTEND inventory is empty or unavailable
            {smartscapeFrontendsInventoryResult.error
              ? ` (${String(smartscapeFrontendsInventoryResult.error)})`
              : ""}. Approve <code>storage:smartscape:read</code> for this app, then hard-refresh permissions. Classic-only
            lists miss Gen3 Experience frontends (Explorer may show ~10 while classic shows fewer).
          </Paragraph>
        )}
        {mappingSaveError && (
          <Paragraph style={{ marginBottom: "10px", color: theme.criticalText, fontSize: "12px" }}>{mappingSaveError}</Paragraph>
        )}
        <WidgetCard
          title="Dynatrace Frontends"
          subtitle={`${experienceFrontendRows.length} frontends · ${unmappedFrontendCount} unmapped · name_id = __digits or digits_`}
          query={[
            "-- Smartscape inventory (primary)",
            smartscapeFrontendsInventoryQuery,
            "",
            "-- Classic enrichment",
            experienceFrontendsQuery,
          ].join("\n")}
          isLoading={experienceFrontendsResult.isLoading || smartscapeFrontendsInventoryResult.isLoading}
          error={
            experienceFrontendRows.length === 0
              ? smartscapeFrontendsInventoryResult.error || experienceFrontendsResult.error
              : null
          }
        >
          {experienceFrontendRows.length === 0 ? (
            <Paragraph style={{ color: theme.textMuted }}>
              No Dynatrace frontends found in this environment.
            </Paragraph>
          ) : (
            <HubDataTable<ExperienceFrontendRow>
              storageKey="aoh.hubDataTable.rumFrontends.v2"
              rows={experienceFrontendRows}
              rowKey={(row, index) => `fe-${row.frontend_id || "fe"}-${index}`}
              selectable
              selectedRowKey={selectedDigitalRowKey?.startsWith("fe-") ? selectedDigitalRowKey : null}
              onSelectRow={(row, key) => {
                if (!row || !key || !row.app_id) {
                  setSelectedDigitalAppId(null);
                  setSelectedDigitalAppName(null);
                  setSelectedDigitalRowKey(null);
                  return;
                }
                setSelectedDigitalAppId(String(row.app_id));
                setSelectedDigitalAppName(String(row.app_name || row.app_id));
                setSelectedDigitalRowKey(key);
              }}
              columns={[
                {
                  id: "frontend_name",
                  label: "Frontend",
                  width: 180,
                  minWidth: 120,
                  getOpenInDynatraceId: (row) => row.frontend_id || null,
                },
                {
                  id: "frontend_id",
                  label: "Frontend ID",
                  width: 200,
                  minWidth: 140,
                  getOpenInDynatraceId: (row) => row.frontend_id || null,
                },
                {
                  id: "app_name",
                  label: "CMDB Application",
                  width: 200,
                  minWidth: 160,
                  getValue: (row) => row.app_name || row.app_id || "-",
                  render: (row) => {
                    const frontendId = String(row.frontend_id || "");
                    return (
                      <select
                        value={String(row.app_id || "")}
                        disabled={mappingSavingId === frontendId}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          event.stopPropagation();
                          void persistFrontendMap(frontendId, event.target.value);
                        }}
                        style={{
                          width: "100%",
                          fontSize: "12px",
                          padding: "4px 6px",
                          border: `1px solid ${theme.border}`,
                          borderRadius: "4px",
                          backgroundColor: theme.surface,
                          color: theme.text,
                        }}
                      >
                        <option value="">Unmapped — pick CMDB app</option>
                        {cmdbAppOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name} ({opt.id})
                          </option>
                        ))}
                      </select>
                    );
                  },
                },
                { id: "mapping_method", label: "Mapping", width: 110 },
              ]}
            />
          )}
        </WidgetCard>
        <div style={{ marginTop: "12px" }}>
          <WidgetCard
            title="Dynatrace Synthetics"
            subtitle="All synthetic monitors. Join via Setup join sources (e.g. classic tag) or linked frontend. Select to filter hosts."
            query={experienceSyntheticsQuery}
            isLoading={experienceSyntheticsResult.isLoading}
            error={experienceSyntheticsResult.error}
          >
            {experienceSyntheticRows.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No synthetic monitors found in this environment.</Paragraph>
            ) : (
              <HubDataTable<ExperienceSyntheticRow>
                storageKey="aoh.hubDataTable.digitalSynthetics.v1"
                rows={experienceSyntheticRows}
                rowKey={(row, index) => `sy-${row.synthetic_id || "s"}-${index}`}
                selectable
                selectedRowKey={selectedDigitalRowKey?.startsWith("sy-") ? selectedDigitalRowKey : null}
                onSelectRow={(row, key) => {
                  if (!row || !key || !row.app_id) {
                    setSelectedDigitalAppId(null);
                    setSelectedDigitalAppName(null);
                    setSelectedDigitalRowKey(null);
                    return;
                  }
                  setSelectedDigitalAppId(String(row.app_id));
                  setSelectedDigitalAppName(String(row.app_name || row.app_id));
                  setSelectedDigitalRowKey(key);
                }}
                columns={[
                  {
                    id: "synthetic_name",
                    label: "Synthetic",
                    width: 200,
                    getValue: (row) => row.synthetic_name || row.synthetic_id || "-",
                    render: (row) => row.synthetic_name || row.synthetic_id || "-",
                    getOpenInDynatraceId: (row) => row.synthetic_id || null,
                  },
                  {
                    id: "synthetic_id",
                    label: "Synthetic ID",
                    width: 180,
                    getOpenInDynatraceId: (row) => row.synthetic_id || null,
                  },
                  {
                    id: "frontend_name",
                    label: "Frontend",
                    width: 160,
                    getOpenInDynatraceId: (row) => row.frontend_id || null,
                  },
                  {
                    id: "app_name",
                    label: "CMDB Application",
                    width: 160,
                    getValue: (row) => row.app_name || row.app_id || "-",
                    render: (row) => row.app_name || row.app_id || "-",
                  },
                  { id: "mapping_method", label: "Mapping", width: 140 },
                ]}
              />
            )}
          </WidgetCard>
        </div>
        <div style={{ marginTop: "12px" }}>
          <WidgetCard
            title="Mapped Hosts"
            subtitle={
              selectedDigitalAppId
                ? `Filtered to ${selectedDigitalAppName || selectedDigitalAppId}. Clear selection to show all mapped hosts.`
                : "Hosts joined via Setup primary expression / join sources → CMDB. Select a frontend or synthetic above to filter."
            }
            query={digitalHostsQuery}
            isLoading={digitalHostsResult.isLoading}
            error={digitalHostsResult.error}
          >
            {selectedDigitalAppId && (
              <div style={{ marginBottom: "8px" }}>
                <Button
                  type="button"
                  variant="default"
                  onClick={() => {
                    setSelectedDigitalAppId(null);
                    setSelectedDigitalAppName(null);
                    setSelectedDigitalRowKey(null);
                  }}
                >
                  Clear app filter
                </Button>
              </div>
            )}
            {filteredDigitalHostRows.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>
                {selectedDigitalAppId
                  ? "No hosts mapped to the selected application."
                  : "No hosts mapped via the configured join expression / sources."}
              </Paragraph>
            ) : (
              <HubDataTable<DigitalHostRow>
                storageKey="aoh.hubDataTable.digitalHosts.v1"
                rows={filteredDigitalHostRows}
                rowKey={(row, index) => `${row.host_id || row.host_name || "host"}-${index}`}
                columns={[
                  {
                    id: "host_name",
                    label: "Host",
                    width: 200,
                    getOpenInDynatraceId: (row) => row.host_id || null,
                  },
                  {
                    id: "host_id",
                    label: "Host ID",
                    width: 180,
                    getOpenInDynatraceId: (row) => row.host_id || null,
                  },
                  {
                    id: "app_name",
                    label: "CMDB Application",
                    width: 160,
                    getValue: (row) => row.app_name || row.app_id || "-",
                    render: (row) => row.app_name || row.app_id || "-",
                  },
                  { id: "app_id", label: "Application ID", width: 120 },
                ]}
              />
            )}
          </WidgetCard>
        </div>
      </>
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
