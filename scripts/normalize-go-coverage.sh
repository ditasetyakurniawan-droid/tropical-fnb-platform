#!/usr/bin/env bash
set -euo pipefail

# Normalizes Go coverage output by prepending 'backend/' to module paths
# so SonarQube scanner can match them relative to the repository root.

INPUT=${1:-backend/coverage.out}
OUTPUT=${2:-backend/coverage.sonar.out}

if [[ ! -s "$INPUT" ]]; then
  echo "coverage input is missing or empty: $INPUT" >&2
  exit 1
fi

MODULE_PATH="tropical-fnb/backend"

{
  IFS= read -r header
  printf '%s\n' "$header"

  while IFS= read -r line; do
    case "$line" in
      "$MODULE_PATH"/*)
        printf '%s\n' "backend/${line#"$MODULE_PATH"/}"
        ;;
      *)
        printf '%s\n' "$line"
        ;;
    esac
  done
} < "$INPUT" > "$OUTPUT"

echo "Normalized coverage written to: $OUTPUT"
