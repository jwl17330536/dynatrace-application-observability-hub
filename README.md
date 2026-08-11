# Application Observability Hub

Lookup-first Dynatrace app for browsing application inventory from one or many Dynatrace lookup tables.

## Repository Standards

1. Canonical user install path: `README.md` + `QUICK_START.md`.
2. Contributor workflow: `CONTRIBUTING.md`.
3. Release history: `CHANGELOG.md`.
4. This repository is standalone and does not require `dynatrace-infrastructure-observability-framework`.

## Features

1. Supports one or multiple lookup sources.
2. Configurable field mappings per source.
3. Requires one join key per source: Unique Application ID.
4. Optional enrichment fields (name, tier, owner) can be included or omitted.
5. Provides application dashboard tabs for summary and pack-level insights.

## Prerequisites

1. Dynatrace tenant with app deployment capability.
2. Lookup table(s) populated with application inventory data.
3. App permissions approved for required storage and telemetry scopes.

## Install and Run

1. Follow [QUICK_START.md](QUICK_START.md) for the shortest install path.
2. Use [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed mapping guidance.
3. Use [VALIDATION_GUIDE.md](VALIDATION_GUIDE.md) only when validating or troubleshooting mappings.

## Install Boundary

Required for first-time install:

1. App deploy command path in [QUICK_START.md](QUICK_START.md).
2. Runtime lookup source data with a Unique Application ID field.

Not required for initial install:

1. Internal architecture and implementation notes.
2. Local-only scaffolding described in [CONTRIBUTING.md](CONTRIBUTING.md).

## Developer Workflow

1. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and local scaffolding conventions.
2. See [DEVELOPMENT.md](DEVELOPMENT.md) for deeper implementation details.

## Security and Publication

1. PII and publication controls are defined in [PII_PUBLICATION_POLICY.md](PII_PUBLICATION_POLICY.md).
2. Strict hygiene/public-release gates must pass before merge or release.

## License

[LICENSE](LICENSE)
