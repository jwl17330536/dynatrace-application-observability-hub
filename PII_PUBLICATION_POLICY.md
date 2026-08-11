# PII and Secret Publication Policy

## Purpose
This repository must not publish personal identifiers, private network metadata, tenant identifiers, or credentials.

## Blocking Rule
A change must not be merged to `main` (or used for public release) unless all required checks pass:
- `.github/workflows/repo-hygiene.yml`
- `.github/workflows/public-release-gate.yml`

`public-release-gate.yml` runs in strict mode and blocks publication on unresolved sensitive findings.

## What We Search
1. Tenant/domain/email literals:
- `your-tenant`
- `example-home`
- `@example.com`
2. Personal name markers:
- `<given-name>`
- `<family-name>`
3. Potential public IPv4 literals (with private/test ranges excluded).
4. Credential/secret indicators:
- Dynatrace token patterns (`dt0...`)
- GitHub PAT patterns (`ghp_`, `github_pat_`)
- AWS key patterns (`AKIA...`)
- Private key blocks (`BEGIN ... PRIVATE KEY`)
- generic secret fields (`password`, `api_token`, `bearer`, `client_secret`).

## How We Search
1. Local developer check:
```bash
bash scripts/repo-hygiene-check.sh
```
2. Strict publication gate:
```bash
STRICT_PUBLIC_GATE=true bash scripts/repo-hygiene-check.sh
```
3. CI enforcement:
- `repo-hygiene.yml` runs on push and pull request.
- `public-release-gate.yml` runs on push and pull request in strict mode.

## Allowlist Rules
- Use `.hygiene-allowlist.txt` for narrow, regex-scoped exceptions only.
- Every allowlist entry must include a reason comment.
- Avoid broad wildcard allowlisting.

## Remediation Plan
1. Credential exposure (critical):
- Remove from source immediately.
- Rotate/revoke affected credentials.
- Consider history rewrite when exposure is confirmed in commit history.
2. Tenant/domain/hostname/IP exposure (high):
- Replace with placeholders (`<DT_TENANT_URL>`, `<HOSTNAME>`, `<PUBLIC_IP>`).
- Move environment-specific values to local-only files.
3. Personal identifier exposure (medium):
- Keep only intentionally public maintainer metadata.
- Redact operational references and internal user/account values.
4. Re-validate:
- Re-run local strict gate and ensure CI passes before merge.
