# Contributing

## Scope Boundary

1. End users should follow `README.md` and `QUICK_START.md`.
2. Contributor-only guidance stays in this file and deeper implementation docs.
3. Changes must preserve a clean first-time install path for public users.

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Run type checking:
   ```bash
   npm run type-check
   ```

4. Run linting:
   ```bash
   npm run lint
   ```

## Architecture Guidelines

### Data Source Adapters
All new data sources should implement the same interface:
```typescript
export interface DataSourceAdapter {
  buildQueries(mappings: FieldMappings): QuerySet;
}
```

This ensures visualizations remain data-source-agnostic.

### Adding a New Visualization
1. Create a new page in `ui/app/pages/`
2. Use `useMultiQueryResults` hook to fetch data
3. Render using Strato components (DataTable, StatusPill, etc.)
4. Add route to `App.tsx`

### Naming Conventions
- Page components: `PascalCase.tsx`
- Utility files: `camelCase.ts`
- Adapters: `{dataSourceType}Adapter.ts`
- Hooks: `use{Purpose}.ts`
- Constants: `SCREAMING_SNAKE_CASE`

## Testing

### Manual Testing Checklist
- [ ] Onboarding flow completes without errors
- [ ] Configuration saves to Document Store (or localStorage)
- [ ] All three visualizations load data
- [ ] Tenant selector works (if configured)
- [ ] Field validation shows helpful errors
- [ ] Query test button produces expected results

### Integration Testing
- Switch between data sources (tags → lookup)
- Verify query results are identical
- Check handling of invalid field mappings
- Validate multi-tenant isolation

## Local Scaffolding Workflow

Use local-only scaffolding for personal and machine-specific iteration state:

1. `.env.local` or `.env.*.local` for local environment values.
2. `local-only/` and `docs/local-only/` for private notes and runbooks.
3. `*.local.md` for local documentation drafts.

Do not commit local-only scaffolding. See `.gitignore` for enforced patterns.

If a currently tracked file must become local-only, untrack it first, then rely on `.gitignore`.

## Repository Boundary Rule

This repository must remain standalone for public reuse and must not require runtime dependency on private/internal sibling repos (including `dynatrace-infrastructure-observability-framework`).

## Submission

Before submitting a PR:
1. Run `npm run lint` and fix any issues
2. Run `npm run type-check` to ensure TypeScript is clean
3. Test manually with sample data
4. Update README.md if adding features
5. Ensure all sensitive data (.env, tokens) is excluded

## Questions?

File an issue or contact the maintainers.
