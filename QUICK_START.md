# Quick Start

## Prerequisites

1. Dynatrace tenant with app deployment capability.
2. Lookup table(s) populated with application inventory data.
3. App permissions approved for required storage/telemetry scopes.

## Deploy

Minimal install path:

1. Install dependencies.
2. Build app bundle.
3. Deploy app.

```bash
npm install
npm run build
npx dt-app deploy --non-interactive
```

Use `SETUP_GUIDE.md` for advanced mapping scenarios and `VALIDATION_GUIDE.md` for troubleshooting.

## Configure

1. Open the app in Dynatrace.
2. Complete Setup using a lookup source.
3. Map required field: Unique Application ID.
4. Save and open the Application Dashboard.

## Verify

1. Summary tab shows inventory rows from your lookup data.
2. Pack widgets load for enabled telemetry packs.
3. Refresh retains configuration.
