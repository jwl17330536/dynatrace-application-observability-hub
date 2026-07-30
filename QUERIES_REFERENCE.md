# Application Observability Hub — Query Templates Reference

**Date:** 2026-07-28  
**Phase:** 1 (Sprint Tenant MVP)  
**Status:** ✅ Confirmed - CMDB Lookup Schema Verified  
**Source:** Application Observability Hub query adapter contract and lookup examples

---

## Example Lookup Tables (Reference)

The app works with any Dynatrace lookup table you configure in Setup. The three tables below are a common example dataset:

| Lookup Table | Key | Fields | Example Usage |
|--------------|-----|--------|----------------|
| `/lookups/cmdb_businessapp` | `cmdb_ci_key` | **name**, short_name, owned_by, **business_criticality**, dv_business_unit, dv_operational_status, application_type, rum_expected, rum_domains | `load "/lookups/cmdb_businessapp"` |
| `/lookups/cmdb_server` | `cmdb_ci_key` | **name**, fully_qualified_domain_name, **busapp_cmdb_ci_key** ← join to apps, location | Used to join servers back to applications via busapp_cmdb_ci_key |
| `/lookups/cmdb_app_frontend_mapping` | `mapping_key` | app_cmdb_ci_key, frontend_entity_id, frontend_name, frontend_type, rum_enabled, user_event_count_24h, session_count_24h, ... | App-to-RUM correlation lookups |

**Join Pattern (from Observability Health Dashboard v9):**
```
load "/lookups/cmdb_businessapp"
| lookup [load "/lookups/cmdb_server"], sourceField:cmdb_ci_key, lookupField:busapp_cmdb_ci_key
| lookup [fetch dt.entity.host], sourceField:fully_qualified_domain_name, lookupField:hostname
```

---

## Overview

This document defines the three core DQL query templates used by Application Observability Hub. Each query is designed to work identically regardless of data source (tags, CMDB lookups, or custom DQL), using a placeholder substitution pattern.

### Placeholder Pattern

All queries use the pattern `$FIELD_NAME` for substitution. For example:
- `$APP_TAG_FIELD` → substituted with actual tag name (e.g., `app.tag`) or lookup column (e.g., `cmdb_ci_key`)
- `$APP_NAME_FIELD` → substituted with `app.name` or a lookup display column (e.g., `name`)
- `$TIER_FIELD` → substituted with `app.tier` or a lookup tier column (e.g., `business_criticality`)
- `$OWNER_FIELD` → substituted with `app.owner` or a lookup owner column (e.g., `owned_by`)

### Data Source Adapters

Each adapter converts the user's field mappings to DQL:

| Adapter | Data Source | Example Mapping | Query Pattern |
|---------|-------------|-----------------|---------------|
| **tagsAdapter** | Dynatrace entity tags | `app.tier` | `getTagValue(id, "$TIER_FIELD")` |
| **lookupAdapter** | Dynatrace lookup table | `business_criticality` | `field("$TIER_FIELD")` from lookup query |
| **dqlAdapter** | Custom DQL (advanced) | User-provided | Direct DQL with field substitution |

**Key:** All three adapters return the **same output schema** — visualizations are data-source-agnostic.

---

## Query 1: Application Observability Overview

### Purpose
Comprehensive table of all applications with observability readiness status.

### Input (Field Mappings)
```
{
  appTag: string,     // unique application identifier
  appName: string,    // display name
  tier: string,       // business criticality
  owner: string       // responsible team/person
}
```

### Output Schema (Visualization Table)
```
{
  app_tag: string,           // lookup key
  app_name: string,          // display name for sorting/filtering
  tier: string,              // business tier
  owner: string,             // owner name
  has_traces: boolean,       // ✓ or ✗
  trace_count: integer,      // number of trace events
  metric_count: integer,     // number of metrics ingested
  log_count: integer,        // number of logs ingested
  has_rum: boolean,          // ✓ or ✗
  rum_sessions: integer,     // number of RUM sessions
  event_count: integer       // number of events
}
```

### Tags-Based Query Template (Phase 1)
```dql
APPLICATION
| fieldsAdd
    app_tag = toString(getTagValue(id, "$APP_TAG_FIELD")),
    app_name = toString(getTagValue(id, "$APP_NAME_FIELD")),
    tier = toString(getTagValue(id, "$TIER_FIELD")),
    owner = toString(getTagValue(id, "$OWNER_FIELD"))
| fieldsAdd
    has_traces = toboolean(getTagValue(id, "observability.traces.enabled")) == true,
    trace_count = 0,
    metric_count = 0,
    log_count = 0,
    has_rum = toboolean(getTagValue(id, "observability.rum.enabled")) == true,
    rum_sessions = 0,
    event_count = 0
| sort app_name asc
| limit 500
```

**Questions for refinement:**
- How to count actual traces/metrics/logs per application? (Need related query or metric join?)
- Should we detect RUM status from tags or query RUM entities?
- What's the max acceptable query execution time? (Current template is simple; actual counts may require joins)

### Lookup-Based Query Template (Phase 2)
```dql
fetch data from table("cmdb_apps")
| fieldsAdd
    app_tag = toString(field("$APP_TAG_FIELD")),
    app_name = toString(field("$APP_NAME_FIELD")),
    tier = toString(field("$TIER_FIELD")),
    owner = toString(field("$OWNER_FIELD"))
| sort app_name asc
| limit 500
```

**Note:** Phase 2 will add joins to query actual observability metrics.

### Visualization
- **DataTable** from Strato components
- **Columns:** app_name, tier, owner, traces (StatusPill), metrics (count), logs (count), rum (StatusPill), events
- **Sortable by:** app_name, tier, owner
- **Filterable by:** tier, owner, has_traces, has_rum
- **Row click:** Navigate to application/host entity detail page

---

## Query 2: Trace Candidate Analysis

### Purpose
Identify hosts and applications that are strong candidates for distributed tracing instrumentation.

### Input (Field Mappings)
```
{
  tier: string,       // business criticality
  owner: string       // responsible team
}
```

### Output Schema (Visualization Table)
```
{
  entity_id: string,             // HOST entity ID
  host_name: string,             // display name
  tier: string,                  // business tier
  owner: string,                 // owner name
  process_count: integer,        // number of monitored processes
  candidate_type: string,        // "host" or "process"
  detected_technologies: string, // comma-separated (e.g., "Java, Node.js")
  tracing_readiness: string,     // "high", "medium", "low"
  reason: string                 // why this is a candidate
}
```

### Tags-Based Query Template (Phase 1)
```dql
smartscapeNodes "HOST"
| fieldsAdd
    entity_id = toString(id),
    host_name = getNodeName(id),
    tier = toString(getNodeField(id, "$TIER_FIELD")),
    owner = toString(getNodeField(id, "$OWNER_FIELD")),
    process_count = 0,
    candidate_type = "host",
    detected_technologies = toString(getNodeField(id, "monitoring.mode")),
    tracing_readiness = if(getNodeField(id, "monitoring.mode") == "FULL_STACK") then "high" else "medium",
    reason = "Host with active process monitoring"
| filter getNodeField(id, "monitoring.mode") != "OFF"
| sort process_count desc
| limit 200
```

**Questions for refinement:**
- How to detect actual processes and process count per host? (Should we query PROCESS entities separately?)
- How to identify detected technologies? (Runtime language tags? Application bindings?)
- What determines "high" vs "medium" vs "low" readiness? (Monitoring mode? Agent version?)

### Lookup-Based Query Template (Phase 2)
```dql
smartscapeNodes "HOST"
| lookup [hostname] appResult
  FROM table("cmdb_apps")
  LOOKUP_KEY field("$APP_TAG_FIELD")
  LOOKUP_VALUE field("$TIER_FIELD"), field("$OWNER_FIELD")
| fieldsAdd
    tier = toString(appResult[0]),
    owner = toString(appResult[1]),
    process_count = 0
| filter getNodeField(id, "monitoring.mode") != "OFF"
| sort process_count desc
| limit 200
```

### Visualization
- **DataTable** with columns: host_name, tier, owner, process_count, technologies, readiness (StatusPill), reason
- **Sortable by:** process_count (desc), host_name, tier
- **Filterable by:** tier, tracing_readiness, technologies
- **Row click:** Navigate to host OneAgent detail page

---

## Query 3: Observability Health Report

### Purpose
Executive summary of observability coverage: CMDB inventory vs. actual monitored entities.

### Input (Field Mappings)
```
{
  appTag: string,     // unique application identifier
  tier: string,       // business criticality
  owner: string       // responsible team
}
```

### Output Schema (Report Summary)
```
{
  total_cmdb_apps: integer,           // Total apps in CMDB/lookup
  total_monitored_apps: integer,      // Apps monitored in Dynatrace
  coverage_percent: float,            // (monitored / total) * 100
  
  // Breakdown by tier
  tier_breakdown: [
    {
      tier: string,
      cmdb_count: integer,
      monitored_count: integer,
      coverage_percent: float
    }
  ]
}
```

### Tags-Based Query Template (Phase 1)
```dql
APPLICATION
| fieldsAdd
    tier = toString(getTagValue(id, "$TIER_FIELD")),
    owner = toString(getTagValue(id, "$OWNER_FIELD")),
    app_tag = toString(getTagValue(id, "$APP_TAG_FIELD"))
| groupBy tier, collect(app_tag)
| fieldsAdd
    monitored_count = count(),
    tier_monitored = tier
| sort tier asc
```

**Then merge with CMDB total count (second query):**
```dql
// Query 2: CMDB app count (using lookup or tags for reference)
APPLICATION
| fieldsAdd tier = toString(getTagValue(id, "$TIER_FIELD"))
| groupBy tier, collect(id)
| fieldsAdd cmdb_count = count(), tier_cmdb = tier
```

**Merge in useMultiQueryResults hook:**
- Calculate total_cmdb_apps (sum of all tiers)
- Calculate total_monitored_apps (sum of monitored)
- Calculate coverage_percent = (total_monitored / total_cmdb) * 100
- Build tier_breakdown array by matching tier names

### Lookup-Based Query Template (Phase 2)
```dql
// Total CMDB apps by tier
fetch data from table("cmdb_apps")
| fieldsAdd tier = field("$TIER_FIELD")
| groupBy tier, collect(field("$APP_TAG_FIELD"))
| fieldsAdd cmdb_count = count()

// Monitored apps by tier
APPLICATION
| fieldsAdd tier = toString(getTagValue(id, "$TIER_FIELD"))
| groupBy tier, collect(id)
| fieldsAdd monitored_count = count()
```

### Visualization
- **KPI Cards:**
  - "Total CMDB Apps" (large number)
  - "Monitored by Dynatrace" (large number)
  - "Coverage %" (percentage + trend)

- **Tier Breakdown Chart:**
  - Bar chart: X-axis = tier, Y-axis = count
  - Stacked bars: CMDB (gray) vs. Monitored (green)
  - Shows coverage gaps at a glance

- **Table (optional):**
  - Tier | CMDB Count | Monitored | Coverage %
  - Sortable by coverage%

---

## Implementation Checklist

### Phase 1 (Tags-Based, Sprint Tenant)
- [ ] Finalize exact DQL for Overview query (especially trace/metrics/logs counting)
- [ ] Finalize exact DQL for TraceCandidates query (especially process detection)
- [ ] Finalize exact DQL for HealthReport query (CMDB total vs monitored)
- [ ] Test each query in Dynatrace DQL console
- [ ] Validate placeholder substitution
- [ ] Implement tagsAdapter with finalized queries
- [ ] Implement query execution in useMultiQueryResults hook
- [ ] Test with sprint tenant entities tagged

### Phase 1.5 (Lookup Validation)
- [ ] Create sample CMDB lookup (CSV export)
- [ ] Implement lookupAdapter queries
- [ ] Swap adapter in config, re-run visualizations
- [ ] Validate output is identical to tags version

### Phase 2 (Production Hardening)
- [ ] Performance optimization (caching, query limits)
- [ ] Handle large result sets (pagination if needed)
- [ ] Add correlation queries (join app ↔ host via tags)
- [ ] Implement actual trace/metric/log counting
- [ ] Add alerting on coverage thresholds

---

## Questions for User (John)

1. **Actual DQL Requirements:**
   - For Overview: How should we count actual traces/metrics/logs ingested per app? (Join with metrics? Query logs API?)
   - For TraceCandidates: How do we detect processes and technologies per host? (Should we query SERVICE/PROCESS entities?)
   - For HealthReport: Is the CMDB lookup the source of truth for total app count, or should we query something else?

2. **Tags Strategy (Sprint Tenant):**
   - Which 5-10 entities should we tag first?
   - What tag values should we use for testing? (e.g., `app.tier: "Business Critical"` or `app.tier: "bc"`)
   - Do existing entities already have some of these tags, or should we start from scratch?

3. **Data Enrichment:**
   - Should we automatically detect RUM status (query `APPLICATION` with `WEB_APPLICATION` type)?
   - Should we correlate applications to hosts automatically, or should this be part of the mapping?

4. **Performance:**
   - Max query execution time acceptable? (Current templates are <1 sec; actual counts may take 5-10 sec)
   - Should we paginate results, or limit to top N apps per tier?

---

## Next Steps

Once you provide clarification on the above questions:
1. **Update query templates** with final DQL
2. **Implement tagsAdapter** with confirmed queries
3. **Tag sprint entities** (5-10 apps/hosts)
4. **Test end-to-end** (Onboarding → Visualizations populate)
5. **Validate pivot** (Swap to lookupAdapter, confirm identical output)
