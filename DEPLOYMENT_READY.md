# Deployment Ready Checklist

**Date:** 2026-07-28  
**Status:** Phase 1 MVP Ready for Sprint Tenant Deployment  
**Build Status:** ✅ Clean build (no TypeScript errors)

---

## What's Ready

### Core App Structure
- ✅ Setup.tsx — Tags-only configuration wizard (300 lines, clean)
- ✅ Overview.tsx — Generic table renderer (works with any tag names)
- ✅ Home.tsx — Routing logic (Setup → Overview)
- ✅ Document Store integration — Config persistence + localStorage fallback
- ✅ Build artifacts — dist/ui/main.js, main.css, index.html

### Documentation
- ✅ README.md — Updated for tags-based MVP + Phase 2 roadmap
- ✅ IMPLEMENTATION_PLAN.md — Execution roadmap
- ✅ PHASE_2_ARCHITECTURE.md — How adapter pattern enables zero-friction pivot to lookups
- ✅ CONTRIBUTING.md, DEVELOPMENT.md — GitHub-ready

### Clean-Up Done
- ✅ Removed 3-lookup CMDB-specific logic
- ✅ Removed CSV file upload complexity
- ✅ Removed CMDB workflow deployment from Phase 1
- ✅ Removed tight coupling to CMDB schema

---

## Deployment Steps

### 1. Build (Already Done)
```bash
cd /Users/john/dev/dynatrace-application-observability-hub
npm run build
# Output: dist/ui/ with main.js, main.css, index.html
```

### 2. Deploy to Sprint Tenant
```bash
# Option A: dt-app CLI
dt-app deploy --app-id dynatrace-application-observability-hub

# Option B: Manual (via Dynatrace UI)
# Go to Settings → Apps → Upload
# Select dist/ folder or dist/ui/
```

### 3. Tag Sample Hosts (5-10 hosts in sprint tenant)
```
Infrastructure → Hosts → [Click host] → Edit tags
Add tags:
  app.tag=myapp1
  app.name=My App
  app.tier=Business Critical
  app.owner=Platform Team
```

### 4. Run Setup Wizard
- Open Hub App in Dynatrace
- Click "Setup" (should appear if no config exists)
- Enter tag names: `app.tag`, `app.name`, `app.tier`, `app.owner`
- Click "Save & Continue"

### 5. Validate Overview
- Should see 1 table row per tagged host
- Columns: [My App] [Business Critical] [Platform Team] [myapp1]
- All 5-10 tagged hosts visible

---

## GitHub Setup (TODO)

### Initialize Repo
```bash
cd /Users/john/dev/dynatrace-application-observability-hub

# Initialize git
git init

# Add remote
git remote add origin https://github.com/jwl17330536/dynatrace-application-observability-hub.git

# Add and commit
git add -A
git commit -m "Phase 1 MVP: Tags-based configuration (reset from CMDB 3-lookup approach)"

# Push to GitHub
git branch -M main
git push -u origin main
```

### Create GitHub Release Notes
```markdown
## v0.1.0 - Phase 1 MVP (Tags-Based)

**Major Changes:**
- 🎯 New tags-based data source (replaces complex 3-lookup CMDB approach)
- 🚀 5-minute setup: enter tag names, see table
- 🔄 Zero-friction architecture for Phase 2 lookup pivot
- 📦 Simplified from 600+ LOC to 300+ LOC per component

**What's Included:**
- Setup wizard (tags-only)
- Generic application table
- Document Store persistence
- Phase 2 architecture foundation

**Known Limitations (Phase 2):**
- Tags-only (lookup tables TBD)
- Single visualization (trace candidates & health report TBD)
- No automated CMDB sync (Phase 2)

**Next Steps:**
- Phase 1.5: Validate lookup adapter pattern
- Phase 2: Activate CMDB sync workflow
```

---

## Pre-Deployment Validation

### Build Check
```bash
npm run build 2>&1 | grep -i error
# Should return empty (no errors)
```

### Lint Check
```bash
npm run lint
# Should pass with no critical issues
```

### Type Check
```bash
npx tsc --noEmit
# Should complete without errors
```

---

## Known Issues & Workarounds

| Issue | Impact | Workaround | Timeline |
|-------|--------|-----------|----------|
| Lookup tables not active | Phase 2 requires manual enablement | Document in PHASE_2_ARCHITECTURE.md ✅ | Phase 1.5 |
| Multi-query merge removed | Trace candidates / health report not showing | Add back in Phase 2 with lookupAdapter | Phase 2 |
| No CMDB sync | Requires manual lookup creation | Wire workflow in Phase 2 | Phase 2 |

---

## Success Criteria (Phase 1 MVP)

- [ ] App deploys to sprint tenant without errors
- [ ] Setup wizard loads (config missing)
- [ ] User enters 4 tag names and saves
- [ ] Config persisted to Document Store (verify in dev tools → Application → IndexedDB OR localStorage)
- [ ] Overview table loads with tagged hosts
- [ ] Switching browsers/incognito uses Document Store (localStorage fallback works)
- [ ] App doesn't error on empty results (shows helpful message)

---

## Timeline

- **Day 1:** Deploy to sprint tenant + tag sample hosts
- **Day 2:** End-to-end validation + document learnings
- **Day 3-4:** Phase 1.5 (optional: create lookup table, test adapter pattern)
- **Week 2:** Phase 2 planning (CMDB sync, production rollout)

---

## Post-Deployment Actions

1. **GitHub:** Initialize repo, push Phase 1 MVP code
2. **Documentation:** Share README + IMPLEMENTATION_PLAN with stakeholders
3. **Feedback:** Collect feedback from Phase 1.5 lookup validation
4. **Phase 2:** Plan CMDB sync workflow + production readiness
5. **Templatization:** Create configuration templates for other organizations

---

## Support

- **Debug:** See "Debug Info" section in Overview when errors occur
- **Config Issues:** Check Document Store or localStorage for saved config
- **Build Issues:** Verify Node.js version (14+), npm version (6+)
- **Deployment:** Use dt-app CLI or manual upload via Dynatrace UI
