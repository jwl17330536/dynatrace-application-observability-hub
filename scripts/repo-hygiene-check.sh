#!/usr/bin/env bash
set -euo pipefail

# Repository hygiene policy:
# 1) No hardcoded local absolute dev paths
# 2) No obvious committed tokens/keys
# 3) No tracked local auth/cache artifacts

failures=0
GIT_BIN="${GIT_BIN:-/usr/bin/git}"
GREP_BIN="${GREP_BIN:-/usr/bin/grep}"
ALLOWLIST_FILE="${ALLOWLIST_FILE:-.hygiene-allowlist.txt}"

if [[ ! -x "$GIT_BIN" ]]; then
  GIT_BIN="$(command -v git || true)"
fi
if [[ ! -x "$GIT_BIN" ]]; then
  echo "ERROR: git is required but was not found."
  exit 1
fi

if [[ ! -x "$GREP_BIN" ]]; then
  GREP_BIN="$(command -v grep || true)"
fi
if [[ ! -x "$GREP_BIN" ]]; then
  echo "ERROR: grep is required but was not found."
  exit 1
fi

section() {
  echo
  echo "=== $1 ==="
}

fail() {
  echo "ERROR: $1"
  failures=$((failures + 1))
}

filter_with_allowlist() {
  input_file="$1"
  output_file="$2"

  if [[ -f "$ALLOWLIST_FILE" ]]; then
    allow_tmp="/tmp/hygiene_allowlist_patterns.out"
    "$GREP_BIN" -Ev '^\s*$|^\s*#' "$ALLOWLIST_FILE" > "$allow_tmp" || true
    if [[ -s "$allow_tmp" ]]; then
      "$GREP_BIN" -Evf "$allow_tmp" "$input_file" > "$output_file" || true
      return
    fi
  fi

  /bin/cp "$input_file" "$output_file"
}

section "Check for hardcoded local absolute paths"
raw_paths="/tmp/hygiene_paths_raw.out"
flt_paths="/tmp/hygiene_paths_filtered.out"
if "$GIT_BIN" grep -nE '/Users/[^/]+/dev/|/home/[^/]+/' -- . \
  ':(exclude).github/workflows/*.yml' \
  ':(exclude)CLAUDE.md' \
  ':(exclude)AGENTS.md' \
  ':(exclude)scripts/repo-hygiene-check.sh' \
  ':(exclude).claude/**' > "$raw_paths"; then
  filter_with_allowlist "$raw_paths" "$flt_paths"
  if [[ -s "$flt_paths" ]]; then
    /bin/cat "$flt_paths"
    fail 'Found hardcoded local absolute paths. Use relative paths, $REPO_ROOT, or ${workspaceFolder}.'
  else
    echo "OK: no hardcoded local absolute paths"
  fi
else
  exit_code=$?
  if [[ "$exit_code" -eq 1 ]]; then
    echo "OK: no hardcoded local absolute paths"
  else
    fail "Path scan failed to run (git grep exit code $exit_code)."
  fi
fi

section "Check for likely secret patterns"
raw_secrets="/tmp/hygiene_secrets_raw.out"
flt_secrets="/tmp/hygiene_secrets_filtered.out"
SECRET_PATTERN='dt0[a-z][0-9]{2}\.[A-Za-z0-9._-]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----'
if "$GIT_BIN" grep -nE "$SECRET_PATTERN" -- . > "$raw_secrets"; then
  filter_with_allowlist "$raw_secrets" "$flt_secrets"
  if [[ -s "$flt_secrets" ]]; then
    /bin/cat "$flt_secrets"
    fail "Found likely secret material in tracked files. Replace with placeholders and rotate exposed credentials."
  else
    echo "OK: no likely secret patterns in tracked files"
  fi
else
  exit_code=$?
  if [[ "$exit_code" -eq 1 ]]; then
    echo "OK: no likely secret patterns in tracked files"
  else
    fail "Secret scan failed to run (git grep exit code $exit_code)."
  fi
fi

section "Check for tracked auth/cache artifacts"
artifact_pattern='(^|/)\.dt-app/|\.tokens\.json$|\.token$|\.tokens$|\.secrets\.env$|\.env\.local$'
artifact_candidates_file=/tmp/hygiene_artifact_candidates.out
present_artifacts_file=/tmp/hygiene_artifacts.out
filtered_artifacts_file=/tmp/hygiene_artifacts_filtered.out

"$GIT_BIN" ls-files | "$GREP_BIN" -E "$artifact_pattern" > "$artifact_candidates_file" || true
: > "$present_artifacts_file"

while IFS= read -r candidate; do
  if [[ -n "$candidate" ]] && [[ -e "$candidate" ]]; then
    printf '%s\n' "$candidate" >> "$present_artifacts_file"
  fi
done < "$artifact_candidates_file"

if [[ -s "$present_artifacts_file" ]]; then
  filter_with_allowlist "$present_artifacts_file" "$filtered_artifacts_file"
  if [[ -s "$filtered_artifacts_file" ]]; then
    /bin/cat "$filtered_artifacts_file"
    fail "Found tracked local auth/cache artifacts. Remove from git and keep ignored."
  else
    echo "OK: no tracked auth/cache artifacts"
  fi
else
  echo "OK: no tracked auth/cache artifacts"
fi

if [[ "$failures" -gt 0 ]]; then
  echo
  echo "Hygiene checks failed: $failures issue group(s)."
  exit 1
fi

echo
echo "All hygiene checks passed."
