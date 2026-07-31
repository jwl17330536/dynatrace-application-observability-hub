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
4. Overview (Application Dashboard) shows KPIs and pack widgets across tabs: **Summary**, **Status**, **Signal**, **Alerts**, **Security**, **Inventory** (`?tab=` in the URL).

## Changelog

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
