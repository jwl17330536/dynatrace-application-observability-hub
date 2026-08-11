# Environment Setup

This repository uses local, ignored files for tenant-specific configuration and secrets.

## Steps

1. Copy the template:
   - `cp .env.example .env.local`
2. Fill `.env.local` with values for your environment.
3. Keep secrets out of source files and docs.
4. Confirm `.env.local` is ignored by git.
5. Run repo-specific deploy scripts only after variables are set.

## Safety rules

- Never commit API tokens, passwords, or refresh tokens.
- Use placeholders in examples and documentation.
- Rotate any token immediately if it was ever committed.
