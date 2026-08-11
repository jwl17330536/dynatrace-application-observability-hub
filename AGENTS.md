# AGENTS

This repository is public and must remain easy for non-developers to install, configure, and run.

## Non-negotiable rules

1. Keep one canonical setup path in `README.md` and `QUICK_START.md`.
2. Keep contributor-only iteration workflows in `CONTRIBUTING.md`.
3. Keep tenant-specific values and secrets out of tracked files; use placeholders and local overrides.
4. Keep local/private scaffolding untracked (`.local.*`, `local-only/`, private docs).
5. Keep setup and validation guidance consistent; do not maintain conflicting user paths.
6. Keep public repo operation standalone with no required dependency on private/internal sibling repos.
7. Keep strict PII/secret checks and required branch protections green before release.

## Publishing expectations

1. End users must be able to complete setup without local IDE context.
2. Configuration examples must be copy-safe and generic.
3. Changes to query/setup behavior require documentation updates in the same change set.
