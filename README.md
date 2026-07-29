# Application Observability Hub

A configurable, reusable Dynatrace Hub App for multi-tenant application observability with flexible data source support (CMDB lookups, tags, or custom DQL).

## Overview

**Application Observability Hub** enables organizations to visualize how their applications map to Dynatrace observability data. The app queries CMDB-enriched lookup tables (synced hourly from CMDB) to display all applications with criticality, owner, and monitoring status.

## Current Phase

**Phase 1 MVP (CMDB Lookup-Based)** — Production-ready with zero manual setup
- Query Dynatrace lookup tables synced from CMDB simulator
- 3 CMDB tables available: Business Apps, Servers, RUM Mappings
- Setup wizard: Select CMDB table → Rendered table
- Built-in Document Store persistence + localStorage fallback
- Adapter pattern enables Phase 2 features without UI code changes

## Key Features

✅ **Production-Ready, Zero Setup**
- CMDB data auto-syncs hourly to Dynatrace lookup tables
- App displays real data immediately after deployment
- No manual tagging or configuration burden

✅ **Flexible, Scalable Architecture**
- Data source adapter pattern: swap CMDB ↔ tags ↔ DQL without changing visualization code
- Phase 1: CMDB Lookups (immediate value)
- Phase 2+: Custom metrics, health reporting, trend analysis

✅ **Multi-Tenant Support**
- Per-tenant config in Document Store
- Tenant selector in UI (if needed)
- Same Hub App code runs everywhere

✅ **Error Handling & Debugging**
- Clear messaging if lookup tables are empty
- Debug panel shows query structure
- Auto-refresh when CMDB syncs complete

## Getting Started (2 minutes)

### 1. Verify CMDB Lookup Tables are Populated

In Dynatrace, query the lookup tables:
```dql
# Should show 10+ business applications
fetch data from table "cmdb_businessapp"
| limit 5
```

If empty, verify workflows are running:
- `dynatrace-to-cmdb-push-workflow` (syncs Dynatrace → CMDB, every 15 min)
- `observability-health-cmdb-lookup-sync-workflow-v2` (syncs CMDB → lookup tables, every 15 min)


### 2. Deploy the Hub App

```bash
git clone <repo>
cd application-observability-hub
npm install
npm run build
# Deploy to your Dynatrace tenant via dt-app or UI upload
npx dt-app deploy --non-interactive
```

### 3. Configure via Setup Wizard

- Open Hub App
- You'll see three options:
  1. **Business Applications** — cmdb_businessapp lookup table (13 apps)
  2. **Infrastructure Servers** — cmdb_server lookup table (22 servers)
  3. **App→Frontend RUM Mappings** — cmdb_app_frontend_mapping lookup table
- Select "Business Applications" (most common)
- Click "Save & Continue"
- View Overview table with CMDB business apps

**No manual setup needed** — CMDB data already synced via Dynatrace workflows.

## Architecture

### Data Flow (Phase 1: CMDB Lookups)

```
CMDB Simulator (cmdb.lindleyhome.com:8088)
    ↓ (exports: businessapp, server, mapping)
Dynatrace Workflow: dynatrace-to-cmdb-push (every 15 min)
    ↓ (maps dt.cost.product to business apps)
Dynatrace Workflow: observability-health-cmdb-lookup-sync (every 15 min)
    ↓ (normalizes, dedupes)
Dynatrace Lookup Tables: cmdb_businessapp, cmdb_server, cmdb_app_frontend_mapping
    ↓
Setup wizard: Select which table to display
    ↓
Config saved to Document Store
    ↓
Overview page:
  1. Fetch config from Document Store
  2. Build DQL: fetch data from table "{lookupTableName}"
  3. Execute query
  4. Render generic table from results
```

### Adapter Pattern (Zero UI Changes for Data Source Pivots)

Same table component, different query builders:

**Tags-Based (Phase 1 MVP, deprecated but supported):**
```dql
fetch dt.entity.host
| filter tags["app.tag"] != null
| fields appTag = tags["app.tag"], appName = tags["app.name"], ...
```

**Lookup-Based (Current, Phase 1 production):**
```dql
fetch data from table "cmdb_businessapp"
| fields appTag = this["cmdb_ci_key"], appName = this["name"], ...
```

Both return the same fields (appTag, appName, tier, owner), so the Overview table component never changes.

## Configuration

### Setup Wizard (CMDB Table Selection)

**Step 1: Choose CMDB Data Source**
- Business Applications (cmdb_businessapp) — 13 applications with criticality, owner, business unit
- Infrastructure Servers (cmdb_server) — 22 servers with FQDN, location, business app mapping
- App→Frontend RUM Mappings (cmdb_app_frontend_mapping) — app↔RUM entity relationships

**Step 2: Click Save & Continue**
- Config persisted to Document Store (with localStorage fallback)
- Auto-redirect to Overview

**Step 3: View Table**
- Lookup table results rendered in generic table
- Columns: Application, Business Criticality, Owner, ID
- Updates reflect any CMDB workflow syncs (every 15 minutes)

## Project Structure

```
application-observability-hub/
├── ui/app/
│   ├── pages/
│   │   ├── Home.tsx                 # Entry point → Setup or Overview
│   │   ├── Setup.tsx                # CMDB table selection wizard
│   │   ├── Overview.tsx             # Generic table (works with any data source)
│   │   └── ...
│   ├── hooks/
│   │   └── useMappingConfig.ts      # Fetch config from Document Store
│   ├── utils/
│   │   ├── documentStore.ts         # Document Store API + localStorage fallback
│   │   ├── queryBuilder.ts          # Route to appropriate adapter based on config
│   │   └── adapters/
│   │       ├── lookupAdapter.ts     # Build DQL for lookup tables (current)
│   │       ├── tagsAdapter.ts       # Build DQL for tags (deprecated, fallback support)
│   │       └── dqlAdapter.ts        # Build custom DQL queries (Phase 2)
│   └── App.tsx                      # Router
├── app.config.json                  # Hub App manifest (my.application.observability.hub)
├── package.json
├── ARCHITECTURE_PIVOT.md            # This pivot from tags → CMDB lookups
├── DEPLOYMENT_SUMMARY.txt           # Current deployment status
└── README.md
```

Key files:
- **Setup.tsx** — CMDB table selector (Business Apps, Servers, or RUM Mappings)
- **Overview.tsx** — Generic table that works with any adapter
- **queryBuilder.ts** — Routes to lookupAdapter for CMDB tables
- **lookupAdapter.ts** — Builds DQL queries for cmdb_businessapp, cmdb_server, etc.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Type check
npm run type-check
```

## Deployment

### Prerequisites
- Dynatrace tenant (sprint or production)
- `dtctl` CLI installed and authenticated
- Hub App namespace required: `my.application.observability.hub`

### Deploy Steps

```bash
# Build
npm run build

# Deploy to Dynatrace tenant
npx dt-app deploy --non-interactive

# Or use dtctl
dtctl apply -f app.config.json
```

### Verify Deployment
1. Navigate to `/ui/apps/my.application.observability.hub` on your tenant
2. You should be redirected to Setup wizard
3. Select "Business Applications"
4. Click "Save & Continue"
5. Overview should display CMDB applications

## Troubleshooting

### "No applications found" on Overview
- Verify CMDB workflows are running and syncing (check workflow execution logs)
- Query the lookup table directly: `fetch data from table "cmdb_businessapp"`
- If empty, workflows may need a manual trigger
- Check Document Store config was saved (check browser console)

### Document Store unavailable
- Configuration falls back to localStorage
- App will still work, but config lost if you clear browser cache
- See debug panel in Setup page for details

### TypeScript errors during build
- Run `npm run type-check` to see all errors
- Fix in Setup.tsx or Overview.tsx
- Ensure imports from `@utils/documentStore` and `@utils/queryBuilder` are correct

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

Apache 2.0 — See [LICENSE](./LICENSE)

## Support

For issues, questions, or feature requests:
1. Check [ARCHITECTURE_PIVOT.md](./ARCHITECTURE_PIVOT.md) for architectural details
2. Review lookup table queries in Dynatrace
3. Check workflow execution logs
4. Open an issue on GitHub

