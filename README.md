# Application Observability Hub

Lookup-first Dynatrace app for browsing application inventory from one or many Dynatrace lookup tables.

## What It Does

- Supports one or multiple lookup sources.
- Uses configurable field mappings per source.
- Requires only one mapping per source: Unique Application ID.
- Optional fields (for example Application Name, Application Tier, Application Owner) can be removed.
- Custom fields can be added freely.

## Current Configuration Model

The app saves a lookup-only configuration with:

- `mode`: `lookup`
- `defaultSourceId`: default source for shared query context
- `sources[]`: each source includes:
  - `sourceId`
  - `label`
  - `lookupTableName`
  - `fields[]` (label, source column, format)

## UI Flow

1. Home routes to Setup when no config exists.
2. Setup lets you:
   - Connect a lookup (upload CSV **or** use an existing table) and Load Preview
   - Map Unique Application ID (required join key)
   - Set join variables (Dynatrace Application ID expression + optional name/owner/tier)
   - Enable telemetry packs independently
3. Summary offers a primary Open Application Dashboard CTA.
4. Overview (Application Dashboard) shows KPIs and pack widgets across tabs: **Summary**, **Signal**, **Problems**, **Security**, **Real User Monitoring**, **Data Health Status** (`?tab=` aliases: `digital`/`experience`→rum, `inventory`/`health`→summary, `data-health`→status).

**Information architecture:** Summary is the portfolio rollup (counts/% from Signal, Problems, Security, RUM). Other tabs are deep dives. Data Health Status is meta (packs / capability), not CMDB portfolio.

## Changelog

### v0.1.75
- **Synthetics inherit frontend map:** Monitors linked to a frontend now pick up client-side mappings (`name_id` / `hub_map`), not only DQL join_source/name_match. Mapping shows as `frontend_name_id` / `frontend_hub_map` / etc.

### v0.1.74
- **Charts:** Replaced blank Strato plots with reliable HTML bars / CSS donuts + legends (Problems, Security, Signal mode, RUM mapping, diagnostics).
- **Setup Step 3:** Callout documents Frontend→CMDB auto-mapping via `name__{application_id}`, tags, or RUM-tab map.
- **Security:** First-class **Application filter** panel (selected chip + Clear) driving host findings.
- Trace Coverage Gaps Reason column wraps; wider.

### v0.1.73
- **RUM inventory:** Bare Smartscape `FRONTEND` query (no CMDB lookups) unioned with classic apps; subtitle shows Smartscape/Classic/Merged counts; emphasized banner when Smartscape is empty/unavailable.
- **Name id join:** Display names `name__{application_id}` or `{application_id}_name` auto-map to CMDB (`mapping_method: name_id`). Join priority: join_source → hub_map → name_id → name_match.
- **Summary table:** Portfolio Health groups Critical/High under Vulnerabilities; HubDataTable group headers centered.
- **Sessions:** Documented rollup via `frontend.name` → mapped app; optional OpenPipeline enrichment note in SETUP_GUIDE.

### v0.1.72
- **VP visual uplift:** Summary adds Problems / Critical / High KPI row, host X/Y comparison meters, and splits inventory into Portfolio Health + Coverage detail.
- **Charts:** Problems and Security use bar + donut rollups (host tables remain). Signal adds coverage meters + monitoring-mode donut. RUM mapped meter + mapping-method donut. Data Health pack live meter + diagnostics bar.
- Shared `ComparisonKpi`, `HubCharts`, `SectionIntro` / color legend. Signal summary query now projects `metrics_hosts`.

### v0.1.71
- **Setup Step 3:** Every mapping card has Kind + key/expression inputs (fixes Classic entity tag with no place to type a key). Host CTA no longer hardcodes `dt.cost.product` — blank key with example placeholder only.

### v0.1.70
- **RUM join (honest):** Smartscape `FRONTEND` is primary; classic is fallback. No automatic FRONTEND→host topology — tag frontends with the **same Application ID as hosts**, or map on the RUM tab (saved in hub config). Summary shows an unmapped-frontends callout.
- **Setup Step 3:** Guided checklist (Hosts required → Applications/RUM recommended → optional enrichment collapsed). Emphasized CTAs.
- **Summary UX:** Attention color only when counts &gt; 0; Inventory horizontal scroll + wider resize handle; healthier signal % tint.
- **Signal:** Dropped separate Services-by-Application widget; Evidence by Host keeps Linked Services + Spans 24h; Signal Quality Summary labels Trace events 24h.

### v0.1.69
- **RUM sessions join:** Expand `frontend.name` arrays so Summary Sessions/Actions match mapped frontend names (not stringified `[\"name\"]`).

### v0.1.68
- **RUM tab:** Renamed Digital → **Real User Monitoring** (`?tab=rum`). Classic `dt.entity.application` (+ mobile/custom) is primary; optional Smartscape FRONTEND merges when `storage:smartscape:read` is granted.
- **Summary Inventory:** Column groups (CMDB Data | Coverage | Vulnerabilities | Signal | Real User Monitoring). Coverage adds **Services**, **Problems** (renamed), **Agent mode** (or Mixed). RUM adds Sessions 24h / User actions 24h via `frontend.name` → mapped `app_id`.
- **Linked Services:** Host column clarified (classic OneAgent services on host). Summary **Services** count + Signal **Services by Application** widget.
- **Security:** Host vuln table adds component, technology, CVEs (and title).
- **Setup:** Higher-contrast mapping hints (no yellow-on-gray empty states).
- **Scopes:** `storage:smartscape:read`, `storage:user.sessions:read`, `storage:user.events:read` — re-approve app permissions after deploy.

### v0.1.67
- **Deep links:** Use environment URL via `getEnvironmentUrl()` (fixes broken `/ui/nav/…` links from the app iframe origin). Support `FRONTEND-` entity ids.
- **Digital frontends:** Inventory from Smartscape `FRONTEND` (aligns with Experience Vitals) plus classic application/mobile/custom append.
- **Summary Application Inventory:** Merges Health + Signal % + Digital counts; vulnerability columns Critical / High / Medium / Low / Total Vulnerabilities. Health tab removed (`?tab=health` → Summary).

### v0.1.66
- **Setup UX:** Dynatrace Application ID mappings — **Add Dynatrace Mapping** → choose Classic entity tag / Primary Grail field / Primary Grail tag → expression field appears. Stack as many as needed. Host primary expression syncs from host mappings.

### v0.1.65
- **IA:** Experience → **Digital**; Status → **Data Health Status** (last tab); Inventory widgets move to **Summary**; Pack Activation moves to Data Health Status (above Capability Status).
- **Visible deep links:** Host / frontend / synthetic / problem cells show underlined Open-in-Dynatrace links (⋮ Open remains).
- **Join sources:** Setup supports addable App ID join sources (`classic_tag` | `grail_field` | `grail_tag`) with key + applies-to (host / application / synthetic). Primary expression stays the host join; sources are additive (e.g. classic tag `application_id` for synthetics).
- **Digital:** Mapped Hosts widget; select a frontend/synthetic to filter hosts by `app_id`.

### v0.1.64
- **HubDataTable:** Removed per-column filter dropdowns; filtering is ⋮ only (Copy / Filter / Exclude) plus chips. Added **Open in Dynatrace** for entity/problem ids.
- **Experience:** Dynatrace-first inventory of Applications + Synthetics (`synthetic_test` and `http_check`), with optional CMDB join via tag / name / hub map (`mapping_method`).
- **Deep links:** `/ui/nav/{id}` for hosts, frontends, synthetics; Davis Problems app for problem ids. Wire via ⋮ on host / frontend / synthetic / problem cells.

### v0.1.63
- **HubDataTable v2:** Distinct-value dropdown filters (text fallback if >80 values), cell ⋮ menu (Copy / Filter by / Exclude), filter chips, optional row selection. All Application Dashboard data widgets use HubDataTable.
- **Security drill:** Selecting an app row in Open Vulnerabilities by Application filters the detail widget by `app_id` (title becomes “Open Vulnerabilities for {app}”).
- **Experience:** Primary join is RUM Application tag `dt.cost.product` → `application_id`; name match and optional hub map are fallbacks. Setup copy updated; tab shows `mapping_method`.
- **Trace Coverage Gaps:** Explicit FULL_STACK filter; host-attributed spans define gaps; service counts include process-group path; actionable reasons; numeric zeros show as `0`.

### v0.1.62
- **Problems (Pack 2):** Replaced Alert Readiness with real active Davis problems rolled up host → `dt.cost.product` → `application_id` (PGI→host when needed). Tab renamed to Problems (`?tab=alerts` still works).
- **Security (Pack 3):** Replaced tier “baseline” with open RVA `security.events` by host → application (open + Critical/High counts).
- **Experience tab:** RUM Applications matched by name to `application_name`, optional hub-managed frontend map lookup (`application_id` + `frontend_entity_id`); synthetics assigned to those frontends. Does **not** change cmdb-app (four fields only).
- **Health tab:** Portfolio table (CMDB four fields + hosts / open problems / vulns).
- **Scopes:** `storage:events:read`, `storage:security.events:read`.
- CMDB contract unchanged: `application_id`, `application_name`, `cmdb_owner`, `tier`.

### v0.1.61
- **HubDataTable (Inventory only):** Application Inventory gains Flow Analyst–style client-side sort, per-column filter, column picker, and drag-resize. Prefs in `localStorage` key `aoh.hubDataTable.inventory.v1` (Reset table prefs clears them). Other tables unchanged. Rollback: set `USE_HUB_DATA_TABLE_INVENTORY = false` in `Overview.tsx`.

### v0.1.60
- **Dashboard density:** Tighter card padding, ~12px table text, smaller KPI figures, wider canvas (`density` tokens in `themeStyles.ts`). Visual only — queries and tab structure unchanged.

### v0.1.59
- **Application Dashboard tabs:** Summary, Status, Signal, Alerts, Security, Inventory. Same widgets and queries as before; URL `?tab=` keeps the selected section (default Summary). Disabled packs show a short enable-in-Setup empty state on their tab.

### v0.1.58
- **Application Dashboard:** Widget titles use operator language first (e.g. Signal Quality Summary). Pack provenance is a muted secondary label with hover tooltip (`Standard Pack N`), not the primary heading.

### v0.1.57
- **Setup Step 3:** Optional Name / Owner / Tier dropdowns no longer collapse to Ignore-only after preview.
  Column options come from Load Preview (non-empty rows only; empty results never wipe prior detections) and from CSV headers when using path 1A.
  Ignore remains a valid choice for optional enrichment.

## Development

```bash
npm install
npm run build
npm run lint
npm run type-check
```

For local development:

```bash
npm run dev
```

## Deploy

```bash
npm run build
npx dt-app deploy --non-interactive
```

## Notes

- This app is lookup-first by design.
- It does not require a direct CMDB connection.
- A CMDB-driven workflow can still populate lookup tables upstream, but that is optional.
