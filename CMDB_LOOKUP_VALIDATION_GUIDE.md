# CMDB Lookup Validation Guide

**Objective:** Validate that the hub app correctly queries CMDB lookup tables and displays business applications.

---

## Pre-Check: Verify Lookup Tables are Populated

### 1. Query cmdb_businessapp in Dynatrace

Open Dynatrace Query Console (Dynatrace → Data Explorer or `/ui/grail-console`) and run:

```dql
fetch data from table "cmdb_businessapp"
| limit 10
```

**Expected Result:**
- At least 5-10 rows returned
- Columns visible: `cmdb_ci_key`, `name`, `business_criticality`, `owned_by`, `dv_business_unit`
- Example:
  ```
  cmdb_ci_key | name                  | business_criticality | owned_by
  APP-0001    | Jira Cloud            | Critical             | Platform Team
  APP-0002    | Confluence             | High                 | Ops Team
  APP-0003    | Slack Integration      | Medium               | Dev Team
  ```

If **empty**, the CMDB workflows haven't synced yet:
- Check workflow execution logs for `observability-health-cmdb-lookup-sync-workflow-v2`
- May take 15-60 minutes on first run
- Manually trigger workflow if needed

### 2. Query cmdb_server (Optional)

```dql
fetch data from table "cmdb_server"
| limit 5
```

Expected: 20+ server records with columns: `cmdb_ci_key`, `name`, `fully_qualified_domain_name`, `busapp_cmdb_ci_key`, `location`

---

## Validation Steps

### Step 1: Access the Hub App

Navigate to: `https://<TENANT>/ui/apps/my.application.observability.hub`

**Expected:** Redirected to Setup page (if no prior config)

### Step 2: Setup Wizard

**Step 2a: See CMDB Table Options**
- Page should show three radio button options:
  1. ✓ Business Applications (selected by default)
  2. Infrastructure Servers
  3. App→Frontend RUM Mappings

**Step 2b: Verify Option Details**
- Hover over "Business Applications" to see description:
  > "Apps from CMDB with criticality, business unit, and RUM config"
- Click radio button for "Infrastructure Servers":
  > "Servers from CMDB with FQDN, location, and business app mapping"

### Step 3: Save Configuration

- Leave "Business Applications" selected
- Click "Save & Continue" button
- Should see loading indicator briefly
- Should redirect to Overview page

### Step 4: Verify Overview Table

**Expected Display:**
- Heading: "Application Overview"
- Subtitle: 'CMDB applications from lookup table "cmdb_businessapp". Found X applications.'
- Table with 4 columns:
  1. **Application** (from `name` field)
  2. **Business Criticality** (from `business_criticality` field)
  3. **Owner** (from `owned_by` field)
  4. **ID** (from `cmdb_ci_key` field)

**Example Table:**
```
| Application       | Business Criticality | Owner           | ID      |
|-------------------|----------------------|-----------------|---------|
| Jira Cloud        | Critical             | Platform Team   | APP-001 |
| Confluence        | High                 | Ops Team        | APP-002 |
| Slack Integration | Medium               | Dev Team        | APP-003 |
```

**If No Data:**
- Check browser console (F12 → Console tab) for errors
- Look for `Error loading applications: ...` message
- Verify CMDB lookup tables populated (Step 1)
- Clear browser cache and try again

### Step 5: Test Configuration Persistence

**Step 5a: Refresh the Page**
- Press F5 or Cmd+R (macOS) to refresh
- Should still show Overview table with same data
- No redirect to Setup (config was saved)

**Step 5b: Switch Data Sources (Optional, Phase 2)**
- Currently only CMDB lookup option available
- If you see "Tags" option, verify it still works (legacy support)

### Step 6: Verify Adapter Pattern (Development Check)

If you want to verify the adapter pattern is working:

**Check 1: Setup.tsx uses CMDB sources**
```bash
grep -n "cmdb_businessapp\|cmdb_server" ui/app/pages/Setup.tsx
# Should see 3 definitions
```

**Check 2: queryBuilder routes correctly**
```bash
grep -n "buildQueriesForDataSource\|lookupAdapter" ui/app/pages/Overview.tsx
# Should see import and usage
```

**Check 3: Overview uses buildQueriesForDataSource**
```bash
grep -n "buildQueriesForDataSource" ui/app/pages/Overview.tsx
# Should see function call in query builder
```

---

## Failure Scenarios & Recovery

### Scenario 1: "No applications found"
- **Cause:** Lookup table empty or workflow not synced
- **Fix:** 
  1. Check lookup table: `fetch data from table "cmdb_businessapp"`
  2. If empty, trigger workflows manually
  3. Wait 5-15 minutes for sync
  4. Refresh app

### Scenario 2: "Error loading applications"
- **Cause:** DQL query syntax error or Document Store issue
- **Fix:**
  1. Check browser console for full error message
  2. Verify lookup table exists: `fetch data from table "cmdb_businessapp"`
  3. Clear localStorage (browser DevTools → Application → Local Storage → clear)
  4. Refresh app and redo setup wizard

### Scenario 3: Redirected to Setup after refresh
- **Cause:** Config not saved to Document Store, fell back to localStorage
- **Fix:**
  1. Save config again (may have Document Store issue)
  2. Check browser console for Document Store errors
  3. If errors persist, config saved to localStorage (works, but not shared)

### Scenario 4: Wrong columns displayed
- **Cause:** Adapter mapping not updated to CMDB schema
- **Fix:**
  1. Check Setup.tsx has correct field mappings:
     ```
     appTag: "cmdb_ci_key",
     appName: "name",
     tier: "business_criticality",
     owner: "owned_by",
     ```
  2. Rebuild app: `npm run build`
  3. Redeploy: `npx dt-app deploy --non-interactive`

---

## Success Criteria

✅ **All of the following must pass:**

- [ ] Lookup table `cmdb_businessapp` contains 5+ business applications
- [ ] App Setup page shows three CMDB table options
- [ ] Selecting "Business Applications" and saving redirects to Overview
- [ ] Overview displays table with 4+ business applications
- [ ] Table columns are: Application, Business Criticality, Owner, ID
- [ ] Refreshing page shows same data (config persisted)
- [ ] No errors in browser console (F12 → Console)
- [ ] No 404 errors in Network tab

---

## Sign-Off

**Date Tested:** _______________  
**Tester Name:** _______________  
**Result:** ☐ PASS ☐ FAIL  
**Notes:**  
```
[Add any issues or blockers here]
```

---

## Next Steps

If validation passes:
1. ✅ Phase 1 MVP complete
2. ⏳ Phase 2: Add health reports, trace candidates
3. ⏳ Phase 2+: Add custom DQL support, multi-table joining

If validation fails:
1. Check failure scenario above
2. Review logs from CMDB workflows
3. Verify lookup table population
4. Open issue with reproduction steps
