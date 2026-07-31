# Application Observability Hub - Development Notes

## Project Structure Summary

```
application-observability-hub/
├── ui/app/
│   ├── pages/           # Route pages (Home, Onboarding, Overview, etc.)
│   ├── components/      # Reusable UI components (MappingForm, TenantSelector, etc.)
│   ├── queries/         # DQL query builders (prepared for Phase 1 Step 1)
│   ├── hooks/           # Custom React hooks (useMappingConfig, useMultiQueryResults)
│   ├── utils/
│   │   ├── adapters/    # Data source adapters (tagsAdapter, lookupAdapter, dqlAdapter)
│   │   ├── documentStore.ts   # Document Store / localStorage persistence
│   │   ├── queryBuilder.ts    # Routes queries to appropriate adapter
│   │   ├── queryPlaceholders.ts
│   │   └── entityLinks.ts
│   ├── constants/       # Mapping schema, defaults
│   ├── App.tsx          # Router
│   └── index.tsx        # Entry point
├── scripts/             # Utility scripts (validation, etc.)
├── package.json
├── app.config.json
├── tsconfig.json
├── .gitignore
├── README.md
└── LICENSE
```

## Phase 1 Status

### ✅ Complete
- [x] Folder structure created
- [x] Package.json with all dependencies
- [x] TypeScript configuration
- [x] Page stubs (Home, Onboarding, Overview, TraceCandidates, HealthReport, Settings)
- [x] Component stubs (MappingForm, TenantSelector, StatusPill, QueryBuilder)
- [x] Hook stubs (useMappingConfig, useMultiQueryResults)
- [x] Data source adapter stubs (tagsAdapter, lookupAdapter, dqlAdapter)
- [x] Utility files (documentStore, queryBuilder, queryPlaceholders, entityLinks)
- [x] Constants (mappingSchema, defaultQueries)
- [x] GitHub-ready README.md
- [x] .gitignore (excludes secrets, customer data, planning docs)
- [x] Pre-flight validation script

### ⏳ Next (Phase 1 Step 1)
- [ ] Analyze & document three query templates (Overview, Trace Candidates, Health Report)
- [ ] Create DQL query documentation
- [ ] Implement query validation logic
- [ ] Build data source field detection (what tags/columns are available?)

## Implementation Notes

### Data Source Adapter Pattern
The architecture ensures zero-friction data source swapping:
1. `tagsAdapter` (Phase 1) ← converts tag mappings to DQL
2. `lookupAdapter` (Phase 2) ← converts lookup mappings to DQL
3. `dqlAdapter` (advanced) ← users provide custom DQL

All adapters return the same `QuerySet` interface. Visualizations don't know which adapter was used.

### Query Execution Flow
```
useMappingConfig
    ↓ (fetches config from Document Store)
useMultiQueryResults
    ↓ (builds queries via adapter)
buildQueriesForDataSource (routes to correct adapter)
    ↓ (executes 3 queries in parallel)
useDql (x3)
    ↓ (merges results)
Visualization components (render tables/charts)
```

### Document Store Fallback
- Primary: Document Store API (`/platform/storage/resource-store/v1/...`)
- Fallback: Browser localStorage
- Warning banner shown if localStorage is used

### Field Validation
When user enters field name:
1. Query available fields from data source
2. Check if field exists
3. Show helpful error if not found: "❌ Field 'X' not found. Available: [...]"
4. Disable Save button until all fields are valid

## Next Steps to Complete Phase 1

1. **Analyze queries** (Step 1)
   - Define exact DQL for each visualization
   - Document expected output columns
   - Validate placeholder patterns

2. **Implement query templates** (Step 5)
   - Fill in complete DQL for `tagsAdapter` queries
   - Prepare `lookupAdapter` templates
   - Add query validation logic

3. **Build field detection** (Step 4)
   - Implement `getAvailableTagNames()` function
   - Implement `getAvailableLookupColumns()` function
   - Cache results for performance

4. **Wire up UI** (Steps 4, 6, 7)
   - Complete MappingForm validation
   - Implement useMultiQueryResults to actually fetch data
   - Build visualization DataTables

5. **Sprint entity setup** (Step 8)
   - Document which entities to tag
   - Create tag values for testing

6. **Testing & validation** (Step 10)
   - End-to-end test flow
   - Verify error messages work
   - Performance testing (query execution time)

## Development Tips

### Running Queries Locally
Test DQL queries in Dynatrace DQL console before implementing:
```dql
APPLICATION
| fieldsAdd
    app_tag = toString(getTagValue(id, "app.tag")),
    app_name = toString(getTagValue(id, "app.name"))
| limit 10
```

### Using TypeScript Paths
The `tsconfig.json` defines path aliases:
- `@pages/*` → `ui/app/pages/`
- `@components/*` → `ui/app/components/`
- `@hooks/*` → `ui/app/hooks/`
- `@utils/*` → `ui/app/utils/`
- `@constants/*` → `ui/app/constants/`

Use them in imports for cleaner code:
```typescript
import { useMappingConfig } from "@hooks/useMappingConfig";
```

### Adding Dependencies
Always coordinate with `package.json`. Check existing apps for dependency versions:
- NetFlow, UniFi, Proxmox use same Strato/SDK versions
- Keep versions in sync across observability apps

### Dashboard density (v0.1.60+)

Application Dashboard spacing/fonts live in `ui/app/utils/themeStyles.ts` as the `density` export (Flow Analyst–like compact tables: ~12px body, tighter cell padding). Change tokens there rather than one-off magic numbers in `Overview.tsx` when adjusting visual density. Do not mix density changes with query or tab logic in the same release.

### HubDataTable (v0.1.61+)

`ui/app/components/HubDataTable.tsx` is a small client-side table (sort / filter / column picker / resize) inspired by Netflow Flow Analyst. Migrate **one** Overview table per version. Application Inventory is first (`USE_HUB_DATA_TABLE_INVENTORY` in `Overview.tsx`). Prefer keeping the legacy `<table>` branch until the next table migration proves stable.
