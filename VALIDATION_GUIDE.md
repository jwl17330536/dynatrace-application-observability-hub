# Phase 1 MVP - Validation Guide

**Status:** App Deployed ✅  
**Date:** 2026-07-28  
**Sprint Tenant:** https://your-tenant.sprint.apps.dynatracelabs.com

---

## Quick Start

### 1. Open the App
Go to Dynatrace → Apps → Search for "Application Observability Hub"

Or direct URL: https://your-tenant.sprint.apps.dynatracelabs.com/ui/apps/my.application.observability.hub

### 2. Tag Sample Hosts (Manual)

The app requires at least 5-10 hosts tagged with application metadata. Here's how to tag them:

#### Step-by-Step Tagging

1. Go to **Infrastructure → Hosts** in Dynatrace
2. Click on a host (e.g., `dt02`)
3. Click **Edit tags** (top right)
4. Add these 4 tags:
   ```
   Key: app.tag
   Value: api-gateway-prod
   
   Key: app.name
   Value: API Gateway
   
   Key: app.tier
   Value: Production
   
   Key: app.owner
   Value: Backend Team
   ```
5. Click **Save**
6. Repeat for 7-9 more hosts with different `app.tag` values

#### Sample Data to Tag

Tag these 8 hosts with the following values (customize as needed):

| Host | app.tag | app.name | app.tier | app.owner |
|------|---------|----------|----------|-----------|
| dt01 | auth-service | Auth Service | Production | Backend Team |
| dt02 | api-gateway | API Gateway | Production | Backend Team |
| dt03 | database-primary | PostgreSQL Primary | Production | Database Team |
| automation | monitoring-hub | Monitoring Hub | Infrastructure | Ops Team |
| ns1 | dns-server | DNS Service | Critical | Network Team |
| nuc40 | cache-layer | Redis Cache | Production | Infrastructure |
| nuc41 | frontend-app | Frontend Portal | Production | Frontend Team |
| nuc42 | logging-aggregator | Log Aggregator | Infrastructure | Ops Team |

### 3. Run Setup Wizard in App

1. Open the hub app
2. Setup wizard appears (no config exists yet)
3. Enter the 4 field names you used:
   - App Tag Field: `app.tag`
   - App Name Field: `app.name`
   - Tier Field: `app.tier`
   - Owner Field: `app.owner`
4. Click **"Save & Continue"**

The configuration is now saved to Document Store.

### 4. View Overview

1. App automatically navigates to **Overview**
2. You should see a table with 8 rows (one per tagged host)
3. Columns: [app.name] [app.tier] [app.owner] [app.tag]
4. Example:
   ```
   | API Gateway      | Production     | Backend Team    | api-gateway       |
   | Auth Service     | Production     | Backend Team    | auth-service      |
   | PostgreSQL Prim. | Production     | Database Team   | database-primary  |
   | Monitoring Hub   | Infrastructure | Ops Team        | monitoring-hub    |
   | DNS Service      | Critical       | Network Team    | dns-server        |
   | Redis Cache      | Production     | Infrastructure  | cache-layer       |
   | Frontend Portal  | Production     | Frontend Team   | frontend-app      |
   | Log Aggregator   | Infrastructure | Ops Team        | logging-aggregator|
   ```

---

## Validation Checklist

### ✅ Phase 1 MVP Success Criteria

- [ ] **App Deploys**
  - URL loads without errors
  - No console JavaScript errors

- [ ] **Setup Wizard Works**
  - Wizard appears on first load (no config)
  - Can enter 4 field names
  - "Save & Continue" button works
  - No validation errors

- [ ] **Config Persisted**
  - Config saved to Document Store (or localStorage with warning)
  - Refresh page → Overview still shows
  - No re-entry of setup required

- [ ] **Overview Table Renders**
  - Shows correct number of rows (# of tagged hosts)
  - All 4 columns populated
  - Data matches tag values
  - Table header visible and correct

- [ ] **Data Accuracy**
  - app.name column shows `app.name` tag values
  - app.tier column shows `app.tier` tag values
  - app.owner column shows `app.owner` tag values
  - app.tag column shows `app.tag` tag values
  - No misalignment or empty fields

- [ ] **Error Handling**
  - Empty state works: tag hosts with different names, setup with generic tag name → no errors
  - Network error: see error message, not broken UI
  - Missing config: Setup wizard appears, not 404

- [ ] **Code Quality**
  - npm run build passes (0 TypeScript errors)
  - No console warnings or errors when using app
  - All imports resolve correctly

---

## If Issues Occur

### Setup Wizard Doesn't Appear
- **Check:** Is this your first time? Config might be in Document Store
- **Fix:** Open browser DevTools → Application → Storage → Check for `observability-hub-app-config-v1` key
- **If found:** Config exists, should navigate to Overview automatically
- **If not found:** Check browser console for fetch errors

### Overview Shows No Data
- **Check:** Did you tag at least 5 hosts?
- **Query:** Go to DQL Editor and run:
  ```dql
  fetch dt.entity.host
  | filter tags["app.tag"] != null
  | fields entity.name, tags["app.tag"]
  | limit 20
  ```
- **Result:** Should show 5+ rows if tags were applied correctly

### Can't Create Tags
- **Option 1 (Via UI - Recommended):**
  1. Go to Infrastructure → Hosts
  2. Click host → Edit tags
  3. Add tag manually

- **Option 2 (Via API):**
  Set `DT_ENV` and `TOKEN` environment variables, then:
  ```bash
  curl -X POST "$DT_ENV/api/v1/config/tags" \
    -H "Authorization: Api-Token $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "entitySelector": "entityId(\"HOST-27F4251B2C517B93\")",
      "tags": [
        {"key":"app.tag","value":"my-app"},
        {"key":"app.name","value":"My App"}
      ]
    }'
  ```

### localStorage Warning Banner
- **Why:** Document Store API temporarily unavailable
- **Expected:** Warning banner at top of app
- **Data:** Still persists in browser localStorage
- **Resolution:** Automatic when Document Store comes back online

### Setup Wizard Form Validation Errors
- **Check:** All 4 fields are required
- **Valid:** Any text value (uppercase, lowercase, special chars OK)
- **Error message:** Should clearly indicate which field is missing

---

## Next Steps (After Validation)

### Phase 1.5: Optional - Test Adapter Pattern
To validate that the architecture supports switching to lookup tables without UI changes:

1. Create a lookup table named `applications` in Dynatrace
2. Upload sample data: `lookup/sample-applications-table.json`
3. Update Setup.tsx to show "Lookup Table" option (see PHASE_1.5_TESTING_GUIDE.md)
4. Rebuild and redeploy
5. Open app → Select "Lookup Table" → Enter table name
6. Verify Overview renders identically

Expected result: **Zero visualization code changes needed** — proves Phase 2 scalability.

### Phase 2: CMDB Integration Roadmap
See `PHASE_2_ROADMAP.md` for 4-week plan to:
- Fetch CMDB data hourly
- Sync to Dynatrace lookup table
- Add health reports and trace candidates
- Full production release (v0.2.0)

---

## Debug Info

### Check Document Store Config
Open browser DevTools → Console:
```javascript
// Fetch from Document Store
fetch('https://your-tenant.sprint.apps.dynatracelabs.com/platform/storage/resource-store/v1/files/observability-hub-app-config-v1', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
```

### Check DQL Query Generated
After setup, open DQL Editor and copy-paste the generated query:
```dql
fetch dt.entity.host
| filter tags["app.tag"] != null
| fields 
    appTag = tags["app.tag"],
    appName = tags["app.name"],
    tier = tags["app.tier"],
    owner = tags["app.owner"]
| sort by appTag
```

Should return 8+ rows if tags were applied.

---

## Sprint Tenant Hosts (19 Total)

Available hosts to tag:
- dt01, dt02, dt03 (Dynatrace infrastructure)
- automation (Ops infrastructure)
- ns0, ns1, nslb (Network)
- nuc40, nuc41, nuc42, nuc43, nuc44, nuc45, nuc46 (Compute nodes)
- torrent, mail, minecraft.example-home.com, plex, EasyTravel on Windows (Other)

**Recommendation:** Tag dt01-03, automation, and 4 NUC hosts (8 total) for a realistic test scenario.

---

## Support

If validation fails, check:
1. **App loads** → Check network tab, verify no 404s
2. **Tags exist** → Use DQL Editor to confirm tags on hosts
3. **Setup form** → Check all 4 fields are filled (required)
4. **Config persisted** → Check localStorage (`observability-hub-app-config-v1`)
5. **DQL query** → Verify manually in DQL Editor

For detailed phase documentation, see:
- `PHASE_1_COMPLETION_SUMMARY.md` — Deployment status
- `PHASE_1.5_TESTING_GUIDE.md` — Adapter pattern testing (optional)
- `PHASE_2_ROADMAP.md` — Future CMDB integration (Phase 2)
