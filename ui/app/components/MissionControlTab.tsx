import React, { useMemo, useState } from "react";
import { Button, Heading, Paragraph } from "@dynatrace/strato-components";
import { HubDataTable } from "@components/HubDataTable";
import { averageSeriesArrays, HubLineChart, hubChartColors } from "@components/HubCharts";
import { SectionIntro } from "@components/SectionIntro";
import {
  DEFAULT_ATTENTION_RISKS,
  normalizeRiskLevel,
  RiskBadge,
  SeverityChip,
} from "@utils/riskBadges";
import { density, theme } from "@utils/themeStyles";

export type MissionInventoryRow = {
  app_id?: string;
  app_name?: string;
  owner?: string;
  tier?: string;
  classification?: string;
  host_count?: number | string;
  service_count?: number | string;
  problem_count?: number | string;
  agent_mode?: string;
  vulnerabilities_critical?: number | string;
  vulnerabilities_high?: number | string;
  traces_pct?: number | string | null;
  metrics_pct?: number | string | null;
  logs_pct?: number | string | null;
  frontend_count?: number | string;
  synthetic_count?: number | string;
  sessions_24h?: number | string;
  user_actions_24h?: number | string;
};

export type MissionHostRow = {
  host_id?: string;
  host_name?: string;
  app_id?: string;
  app_name?: string;
  monitoring_mode?: string;
  traces_status?: string;
  metrics_status?: string;
  logs_status?: string;
  spans_count_num?: number | null;
  logs_count_num?: number | null;
  signal_joined?: boolean;
  cpu?: number | null;
  memory?: number | null;
  availability_pct?: number | null;
};

export type MissionFrontendRow = {
  frontend_id?: string;
  frontend_name?: string;
  app_id?: string;
  app_name?: string;
  mapping_method?: string;
  sessions?: number | null;
  actions?: number | null;
  action_p75_ms?: number | null;
  load_ms?: number | null;
  lcp_ms?: number | null;
  error_rate_pct?: number | null;
};

export type MissionSyntheticRow = {
  synthetic_id?: string;
  synthetic_name?: string;
  frontend_id?: string;
  frontend_name?: string;
  app_id?: string;
  app_name?: string;
  mapping_method?: string;
  availability?: number | null;
  duration_ms?: number | null;
  executions?: number | null;
};

export type MissionProblemRow = {
  app_id?: string;
  host_id?: string;
  host_name?: string;
  display_id?: string;
  problem_event_id?: string;
  event_name?: string;
  "event.name"?: string;
  event_category?: string;
  "event.category"?: string;
  event_status?: string;
  "event.status"?: string;
};

export type MissionVulnRow = {
  app_id?: string;
  host_id?: string;
  host_name?: string;
  vuln_id?: string;
  risk_level?: string;
  vuln_title?: string;
  vulnerable_component?: string;
};

export type MissionServiceRow = {
  app_id?: string;
  service_id?: string;
  service_name?: string;
  host_id?: string;
  host_name?: string;
  spans_24h?: number | string;
};

type HostSeriesRow = { host_id?: string; cpu?: unknown; memory?: unknown };
type FrontendSeriesRow = { name_key?: string; action_ms?: unknown; sessions?: unknown };
type SyntheticSeriesRow = { synthetic_id?: string; availability?: unknown };

function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNum(value: unknown, digits = 0): string {
  const n = toNum(value);
  if (n === null) {
    return "-";
  }
  return n.toFixed(digits);
}

function formatPct(value: unknown): string {
  const n = toNum(value);
  if (n === null) {
    return "-";
  }
  return `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

function asNumberArray(value: unknown): Array<number | null | undefined> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value as Array<number | null | undefined>;
}

function seriesHasData(values: Array<number | null | undefined> | undefined): boolean {
  if (!values?.length) {
    return false;
  }
  const finite = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  return finite.length >= 2;
}

const VULN_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function problemTitle(row: MissionProblemRow): string {
  return row.event_name || row["event.name"] || "-";
}

function KpiSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: theme.textSecondary,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: "6px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: "8px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: density.cardRadius,
        padding: "10px 12px",
        backgroundColor: theme.surface,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: "11px", color: theme.textSecondary, fontWeight: 600, marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: tone || theme.text, lineHeight: 1.15 }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: density.cardRadius,
        padding: density.cardPadding,
        backgroundColor: theme.surface,
        minWidth: 0,
      }}
    >
      <SectionIntro title={title} />
      {children}
    </div>
  );
}

function AssetCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: density.cardRadius,
        padding: density.cardPadding,
        backgroundColor: theme.surface,
        marginTop: "12px",
      }}
    >
      <Heading level={3} style={{ margin: 0, fontSize: "15px", color: theme.text }}>
        {title}
      </Heading>
      {subtitle ? (
        <Paragraph style={{ margin: "4px 0 10px 0", color: theme.textSecondary, fontSize: "12px" }}>{subtitle}</Paragraph>
      ) : (
        <div style={{ height: "10px" }} />
      )}
      {children}
    </div>
  );
}

export function MissionControlTab({
  inventoryRows,
  selectedAppId,
  onSelectApp,
  hosts,
  frontends,
  synthetics,
  problems,
  vulnerabilities,
  services,
  hostSeriesRows,
  frontendSeriesRows,
  syntheticSeriesRows,
  isLoading,
  frontendKpiError,
  rumSessionsError,
}: {
  inventoryRows: MissionInventoryRow[];
  selectedAppId: string | null;
  onSelectApp: (appId: string | null, appName?: string | null) => void;
  hosts: MissionHostRow[];
  frontends: MissionFrontendRow[];
  synthetics: MissionSyntheticRow[];
  problems: MissionProblemRow[];
  vulnerabilities: MissionVulnRow[];
  services: MissionServiceRow[];
  hostSeriesRows: HostSeriesRow[];
  frontendSeriesRows: FrontendSeriesRow[];
  syntheticSeriesRows: SyntheticSeriesRow[];
  isLoading?: boolean;
  frontendKpiError?: unknown;
  rumSessionsError?: unknown;
}) {
  const [search, setSearch] = useState("");
  const [selectedRisks, setSelectedRisks] = useState<Set<string>>(() => new Set(DEFAULT_ATTENTION_RISKS));

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = inventoryRows;
    if (q) {
      rows = inventoryRows.filter((row) => {
        const hay = [row.app_id, row.app_name, row.owner, row.tier]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }
    return [...rows].sort((a, b) => {
      const probDiff = (toNum(b.problem_count) ?? 0) - (toNum(a.problem_count) ?? 0);
      if (probDiff !== 0) {
        return probDiff;
      }
      const hostDiff = (toNum(b.host_count) ?? 0) - (toNum(a.host_count) ?? 0);
      if (hostDiff !== 0) {
        return hostDiff;
      }
      const nameA = String(a.app_name || a.app_id || "").toLowerCase();
      const nameB = String(b.app_name || b.app_id || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [inventoryRows, search]);

  const selectedApp = useMemo(
    () => inventoryRows.find((row) => String(row.app_id || "") === String(selectedAppId || "")) || null,
    [inventoryRows, selectedAppId]
  );

  const appHosts = useMemo(
    () => hosts.filter((row) => String(row.app_id || "") === String(selectedAppId || "")),
    [hosts, selectedAppId]
  );
  const appFrontends = useMemo(
    () => frontends.filter((row) => String(row.app_id || "") === String(selectedAppId || "")),
    [frontends, selectedAppId]
  );
  const appSynthetics = useMemo(
    () => synthetics.filter((row) => String(row.app_id || "") === String(selectedAppId || "")),
    [synthetics, selectedAppId]
  );
  const appProblems = useMemo(
    () => problems.filter((row) => String(row.app_id || "") === String(selectedAppId || "")),
    [problems, selectedAppId]
  );
  const appVulns = useMemo(
    () => vulnerabilities.filter((row) => String(row.app_id || "") === String(selectedAppId || "")),
    [vulnerabilities, selectedAppId]
  );
  const vulnSeverityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of appVulns) {
      const risk = normalizeRiskLevel(row.risk_level) || "UNKNOWN";
      counts[risk] = (counts[risk] || 0) + 1;
    }
    return counts;
  }, [appVulns]);
  const filteredAppVulns = useMemo(() => {
    if (selectedRisks.size === 0) {
      return appVulns;
    }
    return appVulns.filter((row) => selectedRisks.has(normalizeRiskLevel(row.risk_level)));
  }, [appVulns, selectedRisks]);
  const vulnCounts = useMemo(() => {
    if (appVulns.length > 0) {
      let critical = 0;
      let high = 0;
      for (const row of appVulns) {
        const risk = normalizeRiskLevel(row.risk_level);
        if (risk === "CRITICAL") {
          critical += 1;
        } else if (risk === "HIGH") {
          high += 1;
        }
      }
      return { critical, high, fromFindings: true };
    }
    return {
      critical: toNum(selectedApp?.vulnerabilities_critical) ?? 0,
      high: toNum(selectedApp?.vulnerabilities_high) ?? 0,
      fromFindings: false,
    };
  }, [appVulns, selectedApp]);
  const appServices = useMemo(
    () => services.filter((row) => String(row.app_id || "") === String(selectedAppId || "")),
    [services, selectedAppId]
  );

  const hostIds = useMemo(() => new Set(appHosts.map((h) => String(h.host_id || "")).filter(Boolean)), [appHosts]);
  const frontendKeys = useMemo(
    () => new Set(appFrontends.map((f) => String(f.frontend_name || "").trim().toLowerCase()).filter(Boolean)),
    [appFrontends]
  );
  const syntheticIds = useMemo(
    () => new Set(appSynthetics.map((s) => String(s.synthetic_id || "")).filter(Boolean)),
    [appSynthetics]
  );

  const cpuSeries = useMemo(() => {
    const arrays = hostSeriesRows
      .filter((row) => hostIds.has(String(row.host_id || "")))
      .map((row) => asNumberArray(row.cpu));
    return averageSeriesArrays(arrays);
  }, [hostSeriesRows, hostIds]);

  const memorySeries = useMemo(() => {
    const arrays = hostSeriesRows
      .filter((row) => hostIds.has(String(row.host_id || "")))
      .map((row) => asNumberArray(row.memory));
    return averageSeriesArrays(arrays);
  }, [hostSeriesRows, hostIds]);

  const actionSeries = useMemo(() => {
    const arrays = frontendSeriesRows
      .filter((row) => frontendKeys.has(String(row.name_key || "").toLowerCase()))
      .map((row) => asNumberArray(row.action_ms));
    return averageSeriesArrays(arrays);
  }, [frontendSeriesRows, frontendKeys]);

  const sessionSeries = useMemo(() => {
    const arrays = frontendSeriesRows
      .filter((row) => frontendKeys.has(String(row.name_key || "").toLowerCase()))
      .map((row) => asNumberArray(row.sessions));
    return averageSeriesArrays(arrays);
  }, [frontendSeriesRows, frontendKeys]);

  const syntheticAvailSeries = useMemo(() => {
    const arrays = syntheticSeriesRows
      .filter((row) => syntheticIds.has(String(row.synthetic_id || "")))
      .map((row) => asNumberArray(row.availability));
    return averageSeriesArrays(arrays);
  }, [syntheticSeriesRows, syntheticIds]);

  const hostCpuAvg =
    appHosts.length > 0
      ? appHosts.reduce((sum, h) => sum + (toNum(h.cpu) ?? 0), 0) /
        Math.max(1, appHosts.filter((h) => toNum(h.cpu) !== null).length || 1)
      : null;
  const hostMemAvg =
    appHosts.length > 0
      ? appHosts.reduce((sum, h) => sum + (toNum(h.memory) ?? 0), 0) /
        Math.max(1, appHosts.filter((h) => toNum(h.memory) !== null).length || 1)
      : null;
  const hostsUp = appHosts.filter((h) => (toNum(h.availability_pct) ?? 0) >= 99).length;

  const rumSessions = appFrontends.reduce((sum, f) => sum + (toNum(f.sessions) ?? 0), 0);
  const rumActions = appFrontends.reduce((sum, f) => sum + (toNum(f.actions) ?? 0), 0);
  const rumErrorRates = appFrontends.map((f) => toNum(f.error_rate_pct)).filter((n): n is number => n !== null);
  const rumErrorAvg = rumErrorRates.length ? rumErrorRates.reduce((a, b) => a + b, 0) / rumErrorRates.length : null;
  const rumP75 = appFrontends.map((f) => toNum(f.action_p75_ms)).filter((n): n is number => n !== null);
  const rumP75Avg = rumP75.length ? rumP75.reduce((a, b) => a + b, 0) / rumP75.length : null;
  const rumLcp = appFrontends.map((f) => toNum(f.lcp_ms)).filter((n): n is number => n !== null);
  const rumLcpAvg = rumLcp.length ? rumLcp.reduce((a, b) => a + b, 0) / rumLcp.length : null;

  const toggleRisk = (risk: string) => {
    setSelectedRisks((prev) => {
      const next = new Set(prev);
      if (next.has(risk)) {
        next.delete(risk);
      } else {
        next.add(risk);
      }
      return next;
    });
  };

  const showFrontendCharts = appFrontends.length > 0;
  const showActionChart = showFrontendCharts && seriesHasData(actionSeries);
  const showSessionChart = showFrontendCharts && seriesHasData(sessionSeries);
  const hasRumQueryError =
    appFrontends.length > 0 && (frontendKpiError != null || rumSessionsError != null);

  return (
    <div>
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: density.cardRadius,
          padding: "12px",
          backgroundColor: theme.surface,
          marginBottom: "12px",
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: 700, color: theme.text, marginBottom: "8px" }}>Find application</div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by application id, name, owner, or tier"
          style={{
            width: "100%",
            maxWidth: "560px",
            padding: "10px 12px",
            borderRadius: "4px",
            border: `1px solid ${theme.borderStrong}`,
            backgroundColor: theme.pageBg,
            color: theme.text,
            fontSize: "14px",
          }}
        />
        <Paragraph style={{ margin: "8px 0 0 0", color: theme.textSecondary, fontSize: "12px" }}>
          Matches CMDB fields: application_id, application_name, cmdb_owner, tier.
        </Paragraph>
      </div>

      {!selectedAppId && (
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: density.cardRadius,
            padding: density.cardPadding,
            backgroundColor: theme.surface,
          }}
        >
          {isLoading ? (
            <Paragraph style={{ color: theme.textSecondary }}>Loading applications…</Paragraph>
          ) : filteredApps.length === 0 ? (
            <Paragraph style={{ color: theme.textMuted }}>
              {search.trim()
                ? "No applications match that search."
                : "Search by application id, name, owner, or tier."}
            </Paragraph>
          ) : (
            <HubDataTable<MissionInventoryRow>
              storageKey="aoh.hubDataTable.missionApps.v1"
              rows={filteredApps}
              rowKey={(row, index) => `mc-app-${row.app_id || index}`}
              selectable
              selectedRowKey={null}
              onSelectRow={(row) => {
                if (!row?.app_id) {
                  return;
                }
                onSelectApp(String(row.app_id), String(row.app_name || row.app_id));
              }}
              columns={[
                {
                  id: "app_name",
                  label: "Application",
                  width: 200,
                  getValue: (row) => row.app_name || row.app_id || "-",
                  render: (row) => row.app_name || row.app_id || "-",
                },
                { id: "app_id", label: "Application ID", width: 110 },
                { id: "owner", label: "Owner", width: 120 },
                { id: "tier", label: "Tier", width: 70 },
                { id: "classification", label: "Classification", width: 110 },
                {
                  id: "host_count",
                  label: "Hosts",
                  width: 70,
                  align: "right",
                  render: (row) => formatNum(row.host_count),
                },
                {
                  id: "problem_count",
                  label: "Problems",
                  width: 80,
                  align: "right",
                  render: (row) => formatNum(row.problem_count),
                },
              ]}
            />
          )}
        </div>
      )}

      {selectedApp && (
        <>
          <div
            style={{
              border: `1px solid ${theme.border}`,
              borderRadius: density.cardRadius,
              padding: "14px 16px",
              backgroundColor: theme.surface,
              marginBottom: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <Heading level={2} style={{ margin: 0, fontSize: "22px", color: theme.text }}>
                  {selectedApp.app_name || selectedApp.app_id}
                </Heading>
                <Paragraph style={{ margin: "6px 0 0 0", color: theme.textSecondary, fontSize: "13px" }}>
                  ID {selectedApp.app_id}
                  {selectedApp.owner ? ` · Owner ${selectedApp.owner}` : ""}
                  {selectedApp.tier ? ` · Tier ${selectedApp.tier}` : ""}
                  {selectedApp.classification ? ` · ${selectedApp.classification}` : ""}
                </Paragraph>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                  {(toNum(selectedApp.problem_count) ?? 0) > 0 ? (
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: theme.criticalText,
                        backgroundColor: theme.criticalBg,
                        border: `1px solid ${theme.criticalBorder}`,
                        borderRadius: "4px",
                        padding: "3px 8px",
                      }}
                    >
                      {formatNum(selectedApp.problem_count)} open problems
                    </span>
                  ) : null}
                  {vulnCounts.critical > 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <RiskBadge level="CRITICAL" />
                      <span style={{ fontSize: "12px", fontWeight: 700, color: theme.text }}>
                        {formatNum(vulnCounts.critical)}
                      </span>
                    </span>
                  ) : null}
                  {vulnCounts.high > 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <RiskBadge level="HIGH" />
                      <span style={{ fontSize: "12px", fontWeight: 700, color: theme.text }}>
                        {formatNum(vulnCounts.high)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
              <Button type="button" variant="default" onClick={() => onSelectApp(null, null)}>
                Clear selection
              </Button>
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <KpiSection title="Hosts">
              <KpiTile label="Hosts" value={formatNum(appHosts.length)} />
              <KpiTile label="Avg CPU" value={hostCpuAvg === null ? "-" : formatPct(hostCpuAvg)} />
              <KpiTile label="Avg memory" value={hostMemAvg === null ? "-" : formatPct(hostMemAvg)} />
              <KpiTile label="Hosts up" value={`${hostsUp}/${appHosts.length}`} tone={theme.successText} />
            </KpiSection>
            <KpiSection title="Signal">
              <KpiTile label="Traces %" value={formatPct(selectedApp.traces_pct)} />
              <KpiTile label="Metrics %" value={formatPct(selectedApp.metrics_pct)} />
              <KpiTile label="Logs %" value={formatPct(selectedApp.logs_pct)} />
            </KpiSection>
            <KpiSection title="Problems & Vulns">
              <KpiTile
                label="Problems"
                value={formatNum(selectedApp.problem_count)}
                tone={(toNum(selectedApp.problem_count) ?? 0) > 0 ? theme.criticalText : theme.text}
              />
              <KpiTile label="Critical" value={formatNum(vulnCounts.critical)} tone={theme.criticalText} />
              <KpiTile label="High" value={formatNum(vulnCounts.high)} tone={theme.warningEmphasized} />
            </KpiSection>
            <KpiSection title="RUM">
              <KpiTile label="Frontends" value={formatNum(appFrontends.length)} />
              <KpiTile label="Synthetics" value={formatNum(appSynthetics.length)} />
              <KpiTile label="Sessions 24h" value={formatNum(rumSessions || selectedApp.sessions_24h)} />
              <KpiTile label="Actions 24h" value={formatNum(rumActions || selectedApp.user_actions_24h)} />
              <KpiTile label="Error rate" value={rumErrorAvg === null ? "-" : formatPct(rumErrorAvg)} />
              <KpiTile label="p75 action" value={rumP75Avg === null ? "-" : `${formatNum(rumP75Avg, 0)} ms`} />
              <KpiTile label="LCP avg" value={rumLcpAvg === null ? "-" : `${formatNum(rumLcpAvg, 0)} ms`} />
            </KpiSection>
          </div>

          {hasRumQueryError ? (
            <div
              style={{
                border: `1px solid ${theme.warningBorder}`,
                borderRadius: density.cardRadius,
                padding: "10px 12px",
                backgroundColor: theme.warningBg,
                marginBottom: "12px",
                fontSize: "12px",
                color: theme.warningEmphasized,
              }}
            >
              RUM KPI or session queries failed for this application — counts and charts may be incomplete.
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
              marginBottom: "4px",
            }}
          >
            <ChartCard title="Host CPU (avg)">
              <HubLineChart values={cpuSeries} color={hubChartColors.primary} unitSuffix="%" emptyMessage="No host CPU series." />
            </ChartCard>
            <ChartCard title="Host memory (avg)">
              <HubLineChart values={memorySeries} color={hubChartColors.success} unitSuffix="%" emptyMessage="No host memory series." />
            </ChartCard>
            {showActionChart ? (
              <ChartCard title="Frontend action duration">
                <HubLineChart values={actionSeries} color={hubChartColors.warning} unitSuffix=" ms" emptyMessage="No frontend duration series." />
              </ChartCard>
            ) : null}
            {showSessionChart ? (
              <ChartCard title="Frontend sessions">
                <HubLineChart values={sessionSeries} color={hubChartColors.primary} emptyMessage="No frontend session series." />
              </ChartCard>
            ) : null}
            {appSynthetics.length > 0 ? (
              <ChartCard title="Synthetic availability">
                <HubLineChart
                  values={syntheticAvailSeries}
                  color={hubChartColors.success}
                  unitSuffix="%"
                  emptyMessage="No synthetic availability series."
                />
              </ChartCard>
            ) : null}
          </div>

          <AssetCard title="Hosts" subtitle="Signal status + CPU / memory / availability. Open jumps to Dynatrace.">
            {appHosts.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No hosts mapped to this application.</Paragraph>
            ) : (
              <HubDataTable<MissionHostRow>
                storageKey="aoh.hubDataTable.missionHosts.v1"
                rows={appHosts}
                rowKey={(row, i) => `mc-h-${row.host_id || i}`}
                columns={[
                  {
                    id: "host_name",
                    label: "Host",
                    width: 160,
                    getOpenInDynatraceId: (row) => row.host_id || null,
                  },
                  { id: "monitoring_mode", label: "Mode", width: 100, render: (row) => row.monitoring_mode || "-" },
                  {
                    id: "traces_status",
                    label: "Traces",
                    width: 70,
                    align: "center",
                    render: (row) => row.traces_status || "-",
                  },
                  {
                    id: "metrics_status",
                    label: "Metrics",
                    width: 70,
                    align: "center",
                    render: (row) => row.metrics_status || "-",
                  },
                  {
                    id: "logs_status",
                    label: "Logs",
                    width: 70,
                    align: "center",
                    render: (row) => row.logs_status || "-",
                  },
                  {
                    id: "cpu",
                    label: "CPU",
                    width: 70,
                    align: "right",
                    render: (row) => formatPct(row.cpu),
                  },
                  {
                    id: "memory",
                    label: "Mem",
                    width: 70,
                    align: "right",
                    render: (row) => formatPct(row.memory),
                  },
                  {
                    id: "availability_pct",
                    label: "Avail",
                    width: 70,
                    align: "right",
                    render: (row) => formatPct(row.availability_pct),
                  },
                ]}
              />
            )}
          </AssetCard>

          <AssetCard title="Frontends" subtitle="RUM KPIs (24h). Open jumps to Dynatrace.">
            {appFrontends.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No mapped frontends for this application.</Paragraph>
            ) : (
              <HubDataTable<MissionFrontendRow>
                storageKey="aoh.hubDataTable.missionFrontends.v1"
                rows={appFrontends}
                rowKey={(row, i) => `mc-fe-${row.frontend_id || i}`}
                columns={[
                  {
                    id: "frontend_name",
                    label: "Frontend",
                    width: 180,
                    getOpenInDynatraceId: (row) => row.frontend_id || null,
                  },
                  { id: "mapping_method", label: "Mapping", width: 110 },
                  { id: "sessions", label: "Sessions", width: 80, align: "right", render: (row) => formatNum(row.sessions) },
                  { id: "actions", label: "Actions", width: 80, align: "right", render: (row) => formatNum(row.actions) },
                  {
                    id: "action_p75_ms",
                    label: "p75 ms",
                    width: 80,
                    align: "right",
                    render: (row) => formatNum(row.action_p75_ms, 0),
                  },
                  { id: "load_ms", label: "Load ms", width: 80, align: "right", render: (row) => formatNum(row.load_ms, 0) },
                  { id: "lcp_ms", label: "LCP ms", width: 80, align: "right", render: (row) => formatNum(row.lcp_ms, 0) },
                  {
                    id: "error_rate_pct",
                    label: "Errors",
                    width: 80,
                    align: "right",
                    render: (row) => formatPct(row.error_rate_pct),
                  },
                ]}
              />
            )}
          </AssetCard>

          <AssetCard title="Synthetics" subtitle="Availability and duration (24h).">
            {appSynthetics.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No mapped synthetics for this application.</Paragraph>
            ) : (
              <HubDataTable<MissionSyntheticRow>
                storageKey="aoh.hubDataTable.missionSynthetics.v1"
                rows={appSynthetics}
                rowKey={(row, i) => `mc-sy-${row.synthetic_id || i}`}
                columns={[
                  {
                    id: "synthetic_name",
                    label: "Synthetic",
                    width: 180,
                    getOpenInDynatraceId: (row) => row.synthetic_id || null,
                  },
                  { id: "mapping_method", label: "Mapping", width: 120 },
                  {
                    id: "availability",
                    label: "Availability",
                    width: 100,
                    align: "right",
                    render: (row) => formatPct(row.availability),
                  },
                  {
                    id: "duration_ms",
                    label: "Duration",
                    width: 90,
                    align: "right",
                    render: (row) => (toNum(row.duration_ms) === null ? "-" : `${formatNum(row.duration_ms, 0)} ms`),
                  },
                  {
                    id: "executions",
                    label: "Executions",
                    width: 90,
                    align: "right",
                    render: (row) => formatNum(row.executions),
                  },
                ]}
              />
            )}
          </AssetCard>

          <AssetCard title="Problems" subtitle="Active Davis problems for this application.">
            {appProblems.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No open problems for this application.</Paragraph>
            ) : (
              <HubDataTable<MissionProblemRow>
                storageKey="aoh.hubDataTable.missionProblems.v1"
                rows={appProblems}
                rowKey={(row, i) => `mc-p-${row.problem_event_id || row.display_id || i}`}
                columns={[
                  {
                    id: "display_id",
                    label: "Problem",
                    width: 120,
                    getOpenInDynatraceId: (row) => row.problem_event_id || row.display_id || null,
                  },
                  {
                    id: "event_name",
                    label: "Name",
                    width: 420,
                    getValue: (row) => problemTitle(row),
                    render: (row) => {
                      const name = problemTitle(row);
                      return <span title={name}>{name}</span>;
                    },
                  },
                  {
                    id: "host_name",
                    label: "Host",
                    width: 140,
                    getOpenInDynatraceId: (row) => row.host_id || null,
                  },
                  {
                    id: "event_status",
                    label: "Status",
                    width: 90,
                    getValue: (row) => row.event_status || row["event.status"] || "-",
                    render: (row) => row.event_status || row["event.status"] || "-",
                  },
                ]}
              />
            )}
          </AssetCard>

          <AssetCard title="Vulnerabilities" subtitle="Open findings on hosts for this application.">
            {appVulns.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No open vulnerabilities for this application.</Paragraph>
            ) : (
              <>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                  {VULN_SEVERITIES.map((risk) => (
                    <SeverityChip
                      key={risk}
                      label={risk.charAt(0) + risk.slice(1).toLowerCase()}
                      active={selectedRisks.has(risk)}
                      count={vulnSeverityCounts[risk] ?? 0}
                      onClick={() => toggleRisk(risk)}
                    />
                  ))}
                </div>
                {filteredAppVulns.length === 0 ? (
                  <Paragraph style={{ color: theme.textMuted }}>
                    No vulnerabilities match the selected severity filters.
                  </Paragraph>
                ) : (
                  <HubDataTable<MissionVulnRow>
                    storageKey="aoh.hubDataTable.missionVulns.v1"
                    rows={filteredAppVulns}
                    rowKey={(row, i) => `mc-v-${row.vuln_id || i}`}
                    columns={[
                      {
                        id: "vuln_title",
                        label: "Finding",
                        width: 220,
                        getValue: (row) => row.vuln_title || row.vuln_id || "-",
                        render: (row) => row.vuln_title || row.vuln_id || "-",
                      },
                      {
                        id: "risk_level",
                        label: "Risk",
                        width: 90,
                        getValue: (row) => normalizeRiskLevel(row.risk_level),
                        render: (row) => <RiskBadge level={row.risk_level} />,
                      },
                      {
                        id: "host_name",
                        label: "Host",
                        width: 140,
                        getOpenInDynatraceId: (row) => row.host_id || null,
                      },
                      { id: "vulnerable_component", label: "Component", width: 160 },
                    ]}
                  />
                )}
              </>
            )}
          </AssetCard>

          <AssetCard title="Services" subtitle="Services running on hosts for this application.">
            {appServices.length === 0 ? (
              <Paragraph style={{ color: theme.textMuted }}>No services linked for this application.</Paragraph>
            ) : (
              <HubDataTable<MissionServiceRow>
                storageKey="aoh.hubDataTable.missionServices.v1"
                rows={appServices}
                rowKey={(row, i) => `mc-svc-${row.service_id || i}`}
                columns={[
                  {
                    id: "service_name",
                    label: "Service",
                    width: 200,
                    getOpenInDynatraceId: (row) => row.service_id || null,
                  },
                  {
                    id: "host_name",
                    label: "Host",
                    width: 140,
                    getOpenInDynatraceId: (row) => row.host_id || null,
                  },
                  {
                    id: "spans_24h",
                    label: "Spans 24h",
                    width: 90,
                    align: "right",
                    render: (row) => formatNum(row.spans_24h),
                  },
                ]}
              />
            )}
          </AssetCard>
        </>
      )}
    </div>
  );
}
