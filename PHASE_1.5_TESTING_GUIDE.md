# Phase 1.5 - Adapter Pattern Validation (Optional But Recommended)

**Purpose:** Prove that switching from tags to lookup tables requires ZERO UI changes  
**Status:** Architecture ready, testing recommended before Phase 2  
**Timeline:** 30-45 minutes

---

## Why Phase 1.5 Matters

The entire Phase 2 scalability depends on this architecture validation:

```
Current State (Phase 1):
  Setup.tsx → tagsAdapter → fetch dt.entity.host (tags)
  Overview.tsx → renders generic table
  No hardcoded schema

Phase 1.5 Test:
  Setup.tsx → adds "Lookup Table" option
  queryBuilder.ts → routes to lookupAdapter
  lookupAdapter → fetch data from table (custom schema)
  Overview.tsx → renders IDENTICAL table (no changes!)

Phase 2 Implication:
  If Overview renders identically → zero rework needed
  Add more visualizations in Phase 2 → all adapters support them
  Scale to 100+ CMDB data sources → single visualization logic
```

---

## Prerequisites

1. ✅ Phase 1 MVP deployed and validated
2. ✅ At least 8 hosts tagged with app.tag, app.name, app.tier, app.owner
3. ✅ Node.js 18+ and npm installed
4. ✅ Access to Dynatrace lookup table creation

---

## Step 1: Create Lookup Table in Dynatrace (10 min)

### 1a. Create Table

1. Go to Dynatrace UI → Settings → Data Management → Lookup Tables
2. Click **"New Lookup Table"**
3. Configure:
   - **Table Name:** `applications`
   - **Max Entries:** `10000`
   - **Upload Strategy:** Replace entire table
4. Click **Create**

### 1b. Upload Sample Data

1. Go back to Lookup Tables
2. Find **applications** table
3. Click **Upload Data**
4. Select file: `lookup/sample-applications-table.json`
5. Verify: Should show 8 rows uploaded

### 1c. Verify Table Structure

Query the lookup table:
```dql
fetch data from table "applications"
| fields 
    app_id = this["app_id"],
    app_name = this["app_name"],
    tier = this["tier"],
    owner = this["owner"]
| limit 10
```

Expected output: 8 rows with correct data

---

## Step 2: Update Setup.tsx to Support Lookup Tables (10 min)

**File:** `ui/app/pages/Setup.tsx`

Add data source selector before field mappings:

```typescript
// After formData state, add:
const [dataSourceType, setDataSourceType] = useState<"tags" | "lookup">("tags");
const [lookupTableName, setLookupTableName] = useState("applications");

// In JSX, add selector before the field mapping inputs:
<div className="data-source-selector">
  <label>Data Source:</label>
  <select value={dataSourceType} onChange={(e) => setDataSourceType(e.target.value as "tags" | "lookup")}>
    <option value="tags">Tags (Phase 1)</option>
    <option value="lookup">Lookup Table (Phase 1.5+)</option>
  </select>
</div>

{dataSourceType === "lookup" && (
  <div className="lookup-table-name">
    <label>Lookup Table Name:</label>
    <input 
      type="text"
      value={lookupTableName}
      onChange={(e) => setLookupTableName(e.target.value)}
      placeholder="applications"
    />
  </div>
)}

// Update handleSaveConfig to include dataSourceType:
const handleSaveConfig = async () => {
  const config: MappingConfig = {
    dataSourceType, // Add this
    fieldMappings: formData,
    lookupTableName: dataSourceType === "lookup" ? lookupTableName : undefined
  };
  // ... rest of function
};
```

---

## Step 3: Verify queryBuilder Routes Correctly (5 min)

**File:** `ui/app/utils/queryBuilder.ts`

Verify it has this code (should already be there from Phase 1.5 implementation):

```typescript
export const buildQuery = (config: MappingConfig): string | null => {
  if (!config) return null;
  
  switch (config.dataSourceType) {
    case "tags":
      return tagsAdapter.buildQueries(config.fieldMappings).overview;
    case "lookup":
      return lookupAdapter.buildQueries(
        config.fieldMappings,
        config.lookupTableName || "applications"
      ).overview;
    default:
      return tagsAdapter.buildQueries(config.fieldMappings).overview;
  }
};
```

---

## Step 4: Rebuild and Test Locally (10 min)

### 4a. Build
```bash
cd /Users/john/dev/application-observability-hub
npm run build
```

Should see: `✔ Built the app`

### 4b. Test Development Server
```bash
npm run dev
```

Opens at `http://localhost:3000`

### 4c. Run Setup Wizard (Lookup Mode)

1. Setup wizard appears (no config yet)
2. **Data Source:** Select "Lookup Table"
3. **Table Name:** Enter `applications`
4. **Field Mappings:** Enter:
   - App Tag: `app_id`
   - App Name: `app_name`
   - Tier: `tier`
   - Owner: `owner`
5. Click **"Save & Continue"**

### 4d. Verify Overview (Should be Identical)

Expected table output:
```
| Frontend Portal     | Production  | Frontend Team     | frontend-portal-prod      |
| API Gateway         | Production  | Backend Team      | api-gateway-prod          |
| Auth Service        | Production  | Security Team     | auth-service-prod         |
| PostgreSQL Primary  | Production  | Database Team     | database-primary-prod     |
| Redis Cache         | Production  | Infrastructure... | cache-layer-prod          |
| Monitoring Hub      | Infrastructure | Ops Team       | monitoring-hub-infra      |
| DNS Service         | Critical    | Network Team      | dns-service-critical      |
| Log Aggregator      | Infrastructure | Ops Team       | logging-aggregator-infra  |
```

**Key observation:** Table structure and rendering are IDENTICAL to Phase 1 (tags mode). Only data source changed.

---

## Step 5: Deploy to Sprint Tenant (5 min)

```bash
export DT_ENVIRONMENT=https://your-tenant.sprint.apps.dynatracelabs.com
export DT_API_TOKEN="<your-dynatrace-api-token>"  # Token with app_management scope

cd /Users/john/dev/application-observability-hub
npx dt-app deploy --non-interactive
```

Expected: `✔ App is deployed`

---

## Step 6: Run End-to-End Test in Sprint Tenant (5 min)

1. Open app in sprint tenant
2. Go through setup with "Lookup Table" option
3. Verify Overview loads with lookup table data
4. Compare results to Phase 1 (tags mode) — should be identical structure

---

## Validation Success Criteria

✅ **Must See:**
- [ ] Setup wizard loads without errors
- [ ] Data source selector appears
- [ ] Lookup table option works
- [ ] Table name input works
- [ ] Field mappings match lookup table columns
- [ ] Overview renders with 8 rows from lookup table
- [ ] Table structure identical to tags mode

❌ **Must NOT See:**
- [ ] TypeScript errors during build
- [ ] Runtime JavaScript errors
- [ ] Changes to Overview.tsx visualization code
- [ ] Broken table layout or styling
- [ ] Missing data in table cells

---

## Key Insight

If you succeed at Phase 1.5, you've proven:

1. **Adapter Pattern Works** — Different data sources, same UI
2. **Pluggable Architecture** — Easy to add dql-adapter, cmdb-adapter, etc. in Phase 2
3. **Reusable Visualization** — Health reports and trace candidates (Phase 2) will work with ALL adapters
4. **Zero Rework** — Phase 2 UI features won't require touching adapter code

This is why Phase 1.5 is **critical validation before Phase 2**.

---

## Troubleshooting

### Lookup Table 404 in Query
```
Error: Unknown table "applications"
```
**Fix:** Verify table name matches exactly (case-sensitive)

### Override existing Phase 1 config?
After Phase 1.5 setup, the lookup config overwrites tags config in Document Store. To go back:
1. Delete `observability-hub-app-config-v1` from Document Store
2. Or localStorage (DevTools → Application → Storage)
3. Refresh app → setup wizard appears again

### Lookup table data doesn't match tags
Lookup sample data has different app IDs than tags. This is intentional — proves data source flexibility.

---

## Next Phase (Phase 2)

After Phase 1.5 validation, you're ready to start Phase 2 Week 1:

1. **Implement full lookupAdapter**
   - traceCandidates query
   - healthReport query

2. **Deploy CMDB sync workflow**
   - Hourly fetch from CMDB API
   - Transform to lookup table format
   - Upload to Dynatrace

3. **Add health and trace pages**
   - New React components
   - Same visualizations work (proof of adapter pattern!)
   - Release v0.2.0

See `PHASE_2_ROADMAP.md` for full 4-week plan.

---

## Time Investment vs. Risk Mitigation

| Phase | Time | Risk | Mitigation |
|-------|------|------|------------|
| Phase 1 | ✅ Done | Low (tags only) | — |
| Phase 1.5 | 45 min | **MEDIUM** (architecture) | Proves pattern works before Phase 2 effort |
| Phase 2 | ~4 weeks | HIGH (CMDB integration) | Phase 1.5 de-risks architecture |

**Recommendation:** Complete Phase 1.5. The 45 minutes invested now saves 1-2 weeks of rework if architecture needs changes in Phase 2.
