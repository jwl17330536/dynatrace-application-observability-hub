# Application Observability Hub — Implementation Plan (Reset)

**Status:** Phase 1 MVP (Tags-Based)  
**Updated:** 2026-07-28  
**GitHub:** TBD (initializing)

---

## What Was Wrong With Previous Approach

- **Hard-coded to CMDB:** 3-lookup tables (cmdb_businessapp, cmdb_server, cmdb_app_frontend_mapping)
- **Not scalable:** Only works for that specific CMDB schema; not reusable for other orgs
- **Complex user flow:** Users must upload 3 CSV files with specific columns
- **Tight coupling:** Visualization code tied to CMDB field names

---

## New Approach: Generic Tags-Based MVP → Lookup Pivot (Phase 2)

### Phase 1: Tags-Based MVP (Sprint Tenant Validation)

**Goal:** Validate architecture with simplest data source (Dynatrace entity tags)

**User Flow:**
1. Open Hub App → Setup wizard appears
2. User selects "Tags" as data source
3. User defines 4 field mappings:
   - `Application Tag` → e.g., `app.tag` (tag key to use as unique app identifier)
   - `Application Name` → e.g., `app.name`
   - `Tier` → e.g., `app.tier`
   - `Owner` → e.g., `app.owner`
4. Hub App queries entities with those tags
5. Overview table shows: App, Tier, Owner, Monitored (✓/✗)
6. Config saved to Document Store (persistent)

**Data Flow:**
```
User tags 5-10 hosts with app.tag, app.name, app.tier, app.owner
    ↓
Setup wizard collects user's field names
    ↓
Config saved to Document Store
    ↓
Overview page fetches config → builds DQL query with substituted tag names
    ↓
DQL: fetch dt.entity.host | filter tags[app_tag]=="*" | fields tags[app_tag], tags[app_name], tags[app_tier], tags[app_owner]
    ↓
Render generic table from results
```

**Key Files (New/Modified):**
- `ui/app/pages/Setup.tsx` — Simplified: tags-only mode, 4 field inputs
- `ui/app/pages/Overview.tsx` — Generic table, works with any tag names
- `ui/app/utils/adapters/tagsAdapter.ts` — Single, simple tag-to-DQL converter
- `ui/app/hooks/useMappingConfig.ts` — Fetch config from Document Store
- **REMOVED:** Complex CSV validation, 3-lookup logic, CMDB-specific code

**Config Structure (Simple):**
```json
{
  "dataSourceType": "tags",
  "fieldMappings": {
    "appTag": "app.tag",
    "appName": "app.name",
    "tier": "app.tier",
    "owner": "app.owner"
  }
}
```

**Timeline:** 3-4 days
- Day 1: Simplify Setup.tsx (remove 3-lookup logic)
- Day 2: Rebuild Overview.tsx (generic table)
- Day 3: Test build + deploy to sprint tenant
- Day 4: Tag sample hosts + validate end-to-end

---

### Phase 1.5: Lookup Pivot Validation (2-3 days, validates adapter pattern)

**Goal:** Prove that Phase 2 architecture works (swap adapter, zero UI changes)

**Steps:**
1. Create single generic lookup table: `applications`
   - Columns: `app_id`, `app_name`, `tier`, `owner`
   - 5-10 rows of sample data
2. Create `lookupAdapter.ts` (parallel to `tagsAdapter.ts`)
3. Change config: `dataSourceType: "lookup"`, add `lookupTableName: "applications"`
4. **Same Overview visualization should render identical results**
5. No UI changes, no Setup.tsx changes (adapter pattern proves itself)

**Outcome:** Confident that Phase 2 production CMDB pivot will work seamlessly

---

### Phase 2: CMDB Lookup (Production Readiness, Later)

**What changes:**
- Create production CMDB sync workflow (Dynatrace → lookup table)
- Activate `lookupAdapter` in Hub App
- Update config for production lookup table name + CMDB field mappings
- **Visualization code: UNCHANGED**

**Benefit:** Same Hub App works with tags (sprint) OR lookup (Amex production)

---

## GitHub Setup

**Repo:** `jwl17330536/dynatrace-application-observability-hub` (public, Apache 2.0)

**Branch strategy:**
- `main` — Production-ready builds
- `phase-1-tags-mvp` — Current sprint work (merge to main after validation)

**First commit:**
- Clean up dist/ and build artifacts
- Add IMPLEMENTATION_PLAN.md
- Reset src/ to tags-only (remove 3-lookup code)
- Commit message: "Phase 1: Tags-based MVP (reset from CMDB 3-lookup approach)"

---

## Validation Checklist

### Phase 1 (Tags MVP):
- [ ] Setup wizard collects 4 tag name mappings
- [ ] Config persisted to Document Store
- [ ] Overview table renders with queried tag data
- [ ] Tier/Owner/Coverage metrics calculated correctly
- [ ] Multi-tenant support (if needed)
- [ ] Deploy to sprint tenant + test with sample data

### Phase 1.5 (Lookup Pivot):
- [ ] Single lookup table created
- [ ] `lookupAdapter.ts` built and integrated
- [ ] Config updated to use lookup
- [ ] **Same Overview table renders with identical results (zero UI changes)**
- [ ] Confirms architecture is flexible

### Phase 2 (Production):
- [ ] CMDB sync workflow deployed
- [ ] Production lookup table created from CMDB data
- [ ] Hub App config updated for production
- [ ] Performance tested at scale (100+ apps)

---

## Key Differences From Previous Approach

| Aspect | Old (3-Lookup) | New (Tags-Based) |
|--------|----------------|-----------------|
| **CSV files** | 3 files | 0 files (for tags) |
| **Setup complexity** | High (upload + validate) | Low (4 text inputs) |
| **Scalability** | CMDB-specific | Generic (works with any tags/lookups) |
| **Phase 2 pivot** | Would require UI rewrite | Zero UI changes |
| **Validation** | CSV schema + FK checks | Simple field mapping |
| **User onboarding** | ~15 min | ~5 min |

---

## Next Steps

1. **Today:** Clean up codebase, initialize GitHub
2. **Day 1-2:** Rebuild Setup.tsx and Overview.tsx for tags-only
3. **Day 3:** Deploy to sprint tenant, tag sample hosts
4. **Day 4:** Validate end-to-end, document learnings
5. **Day 5-6:** Phase 1.5 lookup pivot validation (prove adapter pattern)
6. **Week 2:** Phase 2 planning (CMDB sync, production rollout)
