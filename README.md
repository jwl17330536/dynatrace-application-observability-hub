# Application Observability Hub

Lookup-first Dynatrace app for browsing application inventory from one or many Dynatrace lookup tables.

## What It Does

- Supports one or multiple lookup sources.
- Uses configurable field mappings per source.
- Requires only one mapping per source: Unique Application ID.
- Optional fields (for example Application Name, Application Tier, Application Owner) can be removed.
- Custom fields can be added freely.

## Current Configuration Model

The app saves a lookup-only configuration with:

- `mode`: `lookup`
- `defaultSourceId`: default source for shared query context
- `sources[]`: each source includes:
  - `sourceId`
  - `label`
  - `lookupTableName`
  - `fields[]` (label, source column, format)

## UI Flow

1. Home routes to Setup when no config exists.
2. Setup lets you:
   - Add/remove sources
   - Select default source
   - Add/remove fields per source
   - Keep only Unique Application ID as required
3. Summary shows cards for all configured sources.
4. Overview renders the selected source with dynamic columns and query projection.

## Development

```bash
npm install
npm run build
npm run lint
npm run type-check
```

For local development:

```bash
npm run dev
```

## Deploy

```bash
npm run build
npx dt-app deploy --non-interactive
```

## Notes

- This app is lookup-first by design.
- It does not require a direct CMDB connection.
- A CMDB-driven workflow can still populate lookup tables upstream, but that is optional.
