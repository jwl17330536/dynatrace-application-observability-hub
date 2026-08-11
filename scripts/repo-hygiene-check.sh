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
STRICT_PUBLIC_GATE="${STRICT_PUBLIC_GATE:-false}"

strict_mode=false
case "$STRICT_PUBLIC_GATE" in
  1|true|TRUE|yes|YES)
    strict_mode=true
    ;;
esac

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

section "Check for sensitive tenant and domain literals"
raw_identity="/tmp/hygiene_identity_raw.out"
flt_identity="/tmp/hygiene_identity_filtered.out"
SENSITIVE_LITERAL_PATTERN='o[e]i3894h|l[i]ndleyhome|@[l]indleyhome\.com'
if "$GIT_BIN" grep -nEi "$SENSITIVE_LITERAL_PATTERN" -- . \
  ':(exclude).github/workflows/*.yml' \
  ':(exclude).claude/**' > "$raw_identity"; then
  filter_with_allowlist "$raw_identity" "$flt_identity"
  if [[ -s "$flt_identity" ]]; then
    /bin/cat "$flt_identity"
    if [[ "$strict_mode" == true ]]; then
      fail "Found sensitive tenant/domain/email literals in strict public gate mode. Replace with placeholders before publication."
    else
      echo "WARN: sensitive tenant/domain/email literals found (advisory in non-strict mode)."
    fi
  else
    echo "OK: no sensitive tenant/domain/email literals in tracked files"
  fi
else
  exit_code=$?
  if [[ "$exit_code" -eq 1 ]]; then
    echo "OK: no sensitive tenant/domain/email literals in tracked files"
  else
    fail "Sensitive literal scan failed to run (git grep exit code $exit_code)."
  fi
fi

section "Check for potential public IPv4 literals"
raw_ip="/tmp/hygiene_ip_raw.out"
flt_ip="/tmp/hygiene_ip_filtered.out"
pub_ip="/tmp/hygiene_ip_public.out"
IPV4_PATTERN='((25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1?[0-9]{1,2})'
if "$GIT_BIN" grep -nE "$IPV4_PATTERN" -- . \
  ':(exclude).github/workflows/*.yml' \
  ':(exclude).claude/**' > "$raw_ip"; then
  "$GREP_BIN" -Ev '(^|[^0-9])(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|198\.(1[89])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|22[4-9]\.|23[0-9]\.|24[0-9]\.|25[0-5]\.)' "$raw_ip" > "$pub_ip" || true
  filter_with_allowlist "$pub_ip" "$flt_ip"
  if [[ -s "$flt_ip" ]]; then
    /bin/cat "$flt_ip"
    if [[ "$strict_mode" == true ]]; then
      fail "Found potential public IPv4 literals in strict public gate mode. Use placeholders or redact before publication."
    else
      echo "WARN: potential public IPv4 literals found (advisory in non-strict mode)."
    fi
  else
    echo "OK: no potential public IPv4 literals in tracked files"
  fi
else
  exit_code=$?
  if [[ "$exit_code" -eq 1 ]]; then
    echo "OK: no potential public IPv4 literals in tracked files"
  else
    fail "Public IPv4 scan failed to run (git grep exit code $exit_code)."
  fi
fi

section "Check for personal name markers"
raw_names="/tmp/hygiene_names_raw.out"
flt_names="/tmp/hygiene_names_filtered.out"
NAME_MARKER_PATTERN='\b(j[o]hn|l[i]ndley)\b'
if "$GIT_BIN" grep -nEi "$NAME_MARKER_PATTERN" -- . \
  ':(exclude).github/workflows/*.yml' \
  ':(exclude).claude/**' > "$raw_names"; then
  filter_with_allowlist "$raw_names" "$flt_names"
  if [[ -s "$flt_names" ]]; then
    /bin/cat "$flt_names"
    if [[ "$strict_mode" == true ]]; then
      fail "Found personal name markers in strict public gate mode. Redact or allowlist intentional public references."
    else
      echo "WARN: personal name markers found (advisory in non-strict mode)."
    fi
  else
    echo "OK: no personal name markers in tracked files"
  fi
else
  exit_code=$?
  if [[ "$exit_code" -eq 1 ]]; then
    echo "OK: no personal name markers in tracked files"
  else
    fail "Personal name scan failed to run (git grep exit code $exit_code)."
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
