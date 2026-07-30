# Application Observability Hub - Setup Guide

This guide explains how to configure lookup-backed application metadata sources for the Application Observability Hub.

## Overview

The Application Observability Hub can run with one or more lookup tables. A common model uses three related tables:

1. **Business Applications** (`cmdb_businessapp`) - Your applications with metadata
2. **Servers** (`cmdb_server`) - Servers mapped to applications
3. **Frontend Mappings** (`cmdb_app_frontend_mapping`) - Applications mapped to RUM entities

These should be available as **Dynatrace lookup tables**. You have two options:

### Option 1: Upload CSV Files (Quickest)
Upload pre-populated CSV files with your data. Good for:
- Quick POC/demo
- One-time setup
- Environments without CMDB integration

### Option 2: Configure Lookup Sync (Production)
Deploy a Dynatrace workflow that automatically syncs from your system of record (CMDB or equivalent). Good for:
- Always up-to-date data
- Production environments
- Automatic hourly refresh

---

## Option 1: Upload CSV Files

### Step 1: Download Templates

Three template CSV files are available:

- **cmdb_businessapp.csv** - Business applications
- **cmdb_server.csv** - Servers and their mappings
- **cmdb_app_frontend_mapping.csv** - Application-to-RUM correlations

Download from: `Application Observability Hub > Setup > Download Templates`

### Step 2: Fill in Your Data

#### cmdb_businessapp.csv

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `cmdb_ci_key` | ✓ | Unique application identifier | `app-jira-prod` |
| `name` | ✓ | Display name | `Jira Production` |
| `short_name` | | Short name for UI | `jira` |
| `owned_by` | | Owner/team | `Platform Team` |
| `business_criticality` | | Criticality level | `Business Essential` |
| `dv_business_unit` | | Business unit | `Engineering` |
| `dv_operational_status` | | Operational status | `Operational` |
| `application_type` | | Type of app | `backend`, `frontend`, `database`, `cache` |
| `rum_expected` | | RUM enabled? | `0` (no) or `1` (yes) |
| `rum_domains` | | RUM domain(s) | `app.example.com` |

**Example:**
```csv
cmdb_ci_key,name,short_name,owned_by,business_criticality,dv_business_unit,dv_operational_status,application_type,rum_expected,rum_domains
app-jira-prod,Jira Production,jira,Platform Team,Business Essential,Engineering,Operational,backend,0,none
app-mail-prod,Mail Service,mail,IT Operations,Business Essential,IT Infrastructure,Operational,backend,0,none
app-automation,Automation Engine,automation,DevOps Team,Business Important,IT Infrastructure,Operational,backend,1,automation.example.com
```

#### cmdb_server.csv

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `cmdb_ci_key` | ✓ | Unique server identifier | `srv-jira-01` |
| `name` | ✓ | Server name | `jira-01.prod.local` |
| `busapp_cmdb_ci_key` | ✓ | FK to business app | `app-jira-prod` |
| `fully_qualified_domain_name` | | FQDN (for host matching) | `jira-01.prod.local` |
| `location` | | Physical/cloud location | `US-East-1` |

**Important (example schema):** `busapp_cmdb_ci_key` should reference a valid application ID from your applications table (in this example, `cmdb_ci_key` from `cmdb_businessapp.csv`).

**Example:**
```csv
cmdb_ci_key,name,fully_qualified_domain_name,busapp_cmdb_ci_key,location
srv-jira-01,jira-01.prod.local,jira-01.prod.local,app-jira-prod,US-East-1
srv-jira-02,jira-02.prod.local,jira-02.prod.local,app-jira-prod,US-East-1
srv-mail-01,mail-01.infra.local,mail-01.infra.local,app-mail-prod,US-Central-1
```

#### cmdb_app_frontend_mapping.csv

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `mapping_key` | ✓ | Unique mapping identifier | `app-jira-prod::jira-web` |
| `app_cmdb_ci_key` | ✓ | FK to business app | `app-jira-prod` |
| `frontend_entity_id` | | Dynatrace WEB_APPLICATION ID | `WEB_APPLICATION-xxx` |
| `frontend_name` | | Frontend display name | `Jira Web` |
| `frontend_type` | | Type | `web`, `mobile`, `desktop` |
| `rum_expected` | | RUM enabled? | `0` or `1` |
| `rum_enabled` | | RUM currently active? | `0` or `1` |
| `rum_domains` | | RUM domain(s) | `jira.example.com` |
| `user_event_count_24h` | | # of RUM events in last 24h | `5432` |
| `session_count_24h` | | # of sessions in last 24h | `123` |
| `last_seen_user_event` | | Last RUM activity | ISO 8601 timestamp |
| `mapping_method` | | How mapped | `auto`, `manual`, `heuristic` |
| `mapping_confidence` | | Confidence level | `high`, `medium`, `low` |
| `notes` | | Additional notes | `Mapped via domain match` |

**Example:**
```csv
mapping_key,app_cmdb_ci_key,app_short_name,frontend_entity_id,frontend_name,frontend_type,rum_expected,rum_enabled,rum_domains,mapping_method,mapping_confidence,user_event_count_24h,session_count_24h,last_seen_user_event,notes
app-jira-prod::jira-web,app-jira-prod,jira,WEB_APPLICATION-xxx,Jira Web,web,1,1,jira.example.com,auto,high,5432,123,2026-07-28T12:00:00Z,Mapped via domain match
app-mail-prod::mail-web,app-mail-prod,mail,WEB_APPLICATION-yyy,Mail Portal,web,1,0,mail.example.com,manual,high,0,0,1970-01-01T00:00:00Z,Awaiting RUM enablement
```

### Step 3: Upload to Application Observability Hub

1. Navigate to `Setup` page
2. Click "Upload CSV Files"
3. Upload all three files
4. App validates schema and foreign keys
5. Click "Verify & Continue"
6. Hub confirms lookups are accessible
7. Proceed to Overview

---

## Option 2: Configure Lookup Sync (Production)

### Step 1: Prepare CMDB Environment

Ensure your CMDB exposes these endpoints:

- `GET /api/cmdb/businessapp` - Returns list of applications
- `GET /api/cmdb/server` - Returns list of servers
- `GET /api/cmdb/app_frontend_mapping` - Returns mappings (optional)

Each endpoint should return a JSON array of records or an object with a `records` field.

**Required fields per endpoint:**

**businessapp endpoint:**
```json
[
  {
    "cmdb_ci_key": "app-jira-prod",
    "name": "Jira Production",
    "u_short_name": "jira",
    "owned_by": "Platform Team",
    "business_criticality": "Business Essential",
    "u_business_unit": "Engineering",
    "operational_status": "Operational",
    "application_type": "backend",
    "rum_expected": 0,
    "rum_domains": ""
  }
]
```

**server endpoint:**
```json
[
  {
    "cmdb_ci_key": "srv-jira-01",
    "name": "jira-01.prod.local",
    "fully_qualified_domain_name": "jira-01.prod.local",
    "busapp_cmdb_ci_key": "app-jira-prod",
    "location": "US-East-1"
  }
]
```

**app_frontend_mapping endpoint:**
```json
[
  {
    "mapping_key": "app-jira-prod::jira-web",
    "app_cmdb_ci_key": "app-jira-prod",
    "frontend_entity_id": "WEB_APPLICATION-xxx",
    "frontend_name": "Jira Web",
    "rum_enabled": 1
  }
]
```

### Step 2: Deploy Lookup Sync Workflow

1. Navigate to `Setup` page
2. Click "Configure Lookup Sync"
3. Enter:
  - **Source URL**: `https://cmdb.example.com:8088` (with port if needed)
  - **Username**: API username
  - **Password**: API password
4. Click "Deploy Sync Workflow"
5. Hub creates a Dynatrace workflow that:
  - Fetches data from your source endpoints
   - Validates and normalizes data
   - Uploads to Dynatrace lookup tables
   - Runs hourly automatically

### Step 3: Verify Setup

Hub automatically tests the lookups:
- Calls `load "/lookups/<your_app_table>" | limit 1` (for the configured default source)
- Confirms all three tables are populated
- Proceeds to Overview

---

## Troubleshooting

### "Lookup table not found"
- **Cause**: CSV upload failed or lookups aren't populated
- **Fix**: 
  1. Re-upload CSV files with validation
  2. Check for CSV schema errors (red error messages)
  3. Ensure all required fields are non-empty

### "Foreign key violation: busapp_cmdb_ci_key not found"
- **Cause**: A server references an app that doesn't exist
- **Fix**: 
  1. Ensure every `busapp_cmdb_ci_key` in `cmdb_server.csv` matches a `cmdb_ci_key` in `cmdb_businessapp.csv`
  2. Re-upload files

### "Lookup sync workflow failed"
- **Cause**: Source endpoint unreachable or returns invalid data
- **Fix**:
  1. Verify source URL is correct and accessible
  2. Verify credentials
  3. Check endpoint response format (should be JSON array or object with `records` field)
  4. Review workflow execution logs in Dynatrace

### "No apps showing in Overview"
- **Cause**: Lookup tables populated but queries returning empty
- **Fix**:
  1. Verify the configured app lookup has data: `load "/lookups/<your_app_table>" | limit 5`
  2. Verify server FQDN matches Dynatrace host entity names
  3. Check host monitoring mode (must not be "OFF")

---

## Next Steps

After setup completes:

1. **Review Overview** - See all applications and observability status
2. **Configure Field Mappings** (if needed) - Map your field names to standard schema
3. **Explore Trace Candidates** - Find hosts ready for distributed tracing
4. **Check Health Report** - See CMDB vs Dynatrace coverage by tier
5. **Schedule Sync** (if using source sync) - Workflow runs hourly; adjust as needed

---

## Support

- **Schema Questions**: See "Field Descriptions" sections above
- **CSV Validation Errors**: Errors are listed during upload with row numbers
- **Source Integration Issues**: Check workflow logs in Dynatrace
- **General Help**: See [README.md](../README.md)
