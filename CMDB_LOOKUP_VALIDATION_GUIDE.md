# Lookup Validation Guide

**Objective:** Validate that the hub app correctly queries lookup tables and displays application metadata.

---

## Pre-Check: Verify Lookup Tables are Populated

### 1. Query your application lookup table in Dynatrace

Open Dynatrace Query Console (Dynatrace → Data Explorer or `/ui/grail-console`) and run:

```dql
fetch data from table "<YOUR_APP_TABLE>"
| limit 10
```

**Expected Result:**
- At least 5-10 rows returned
- Columns visible: your mapped ID/display/tier/owner columns (for example: `cmdb_ci_key`, `name`, `business_criticality`, `owned_by`)
- Example:
  ```
  cmdb_ci_key | name                  | business_criticality | owned_by
  APP-0001    | Jira Cloud            | Critical             | Platform Team
  APP-0002    | Confluence             | High                 | Ops Team
  APP-0003    | Slack Integration      | Medium               | Dev Team
  ```

If **empty**, your lookup sync hasn't populated data yet:
- Check execution logs for your lookup sync workflow
- May take 15-60 minutes on first run
- Manually trigger workflow if needed

### 2. Query related lookup tables (Optional)

```dql
fetch data from table "<YOUR_SERVER_TABLE>"
| limit 5
```

Expected: records with server identity and an application reference column (if you use host correlation).

---

## Validation Steps

### Step 1: Access the Hub App

Navigate to: `https://<TENANT>/ui/apps/my.application.observability.hub`

**Expected:** Redirected to Setup page (if no prior config)

### Step 2: Setup Wizard

**Step 2a: Configure at least one source**
- Ensure at least one source is present
- Ensure `Lookup Table Name` is set to your application table (for example `cmdb_businessapp`)

**Step 2b: Map required field**
- In Field Mappings, set `Unique Application ID` to your unique ID column
- Add optional fields (display name, tier, owner) as needed

### Step 3: Save Configuration

- Keep your configured default source selected
- Click "Connect & Continue ->" button
- Should see loading indicator briefly
- Should redirect to Overview page

### Step 4: Verify Overview Table

**Expected Display:**
- Heading: "Application Overview"
- Subtitle references your configured source label/table
- Table columns reflect your mapped fields

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

**Check 1: Setup.tsx default is backward-compatible but editable**
```bash
grep -n "DEFAULT_LOOKUP_TABLE_NAME\|Lookup Table Name" ui/app/pages/Setup.tsx
# Should show a default plus editable table name input
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
  1. Check lookup table: `fetch data from table "<YOUR_APP_TABLE>"`
  2. If empty, trigger workflows manually
  3. Wait 5-15 minutes for sync
  4. Refresh app

### Scenario 2: "Error loading applications"
- **Cause:** DQL query syntax error or Document Store issue
- **Fix:**
  1. Check browser console for full error message
  2. Verify lookup table exists: `fetch data from table "<YOUR_APP_TABLE>"`
  3. Clear localStorage (browser DevTools → Application → Local Storage → clear)
  4. Refresh app and redo setup wizard

### Scenario 3: Redirected to Setup after refresh
- **Cause:** Config not saved to Document Store, fell back to localStorage
- **Fix:**
  1. Save config again (may have Document Store issue)
  2. Check browser console for Document Store errors
  3. If errors persist, config saved to localStorage (works, but not shared)

### Scenario 4: Wrong columns displayed
- **Cause:** Field mapping does not match lookup column names
- **Fix:**
  1. Check Setup configuration maps each field label to an existing source column
  2. Rebuild app: `npm run build`
  3. Redeploy: `npx dt-app deploy --non-interactive`

---

## Success Criteria

✅ **All of the following must pass:**

- [ ] Lookup table `cmdb_businessapp` contains 5+ business applications
- [ ] App Setup page allows configuring at least one lookup source
- [ ] Saving configuration redirects to Overview
- [ ] Overview displays rows from the configured source
- [ ] Table columns match configured field mappings
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
