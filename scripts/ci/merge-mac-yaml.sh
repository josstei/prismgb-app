#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${1:-artifacts}"
OUTPUT_FILE="${2:-release-files/latest-mac.yml}"

if ! command -v yq >/dev/null 2>&1; then
  echo "Installing yq..."
  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
  sudo chmod +x /usr/local/bin/yq
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed."
  exit 1
fi

mapfile -t MAC_YAMLS < <(find "$ARTIFACTS_DIR" -name "latest-mac.yml" -type f | sort)

echo "Found ${#MAC_YAMLS[@]} macOS YAML files"

if [ ${#MAC_YAMLS[@]} -eq 0 ]; then
  echo "No macOS YAML files found, skipping merge"
  exit 0
fi

VERSION=$(yq '.version' "${MAC_YAMLS[0]}")
RELEASE_DATE=$(yq '.releaseDate' "${MAC_YAMLS[0]}")

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[]" > "$TMP_DIR/all-files.json"

for yml in "${MAC_YAMLS[@]}"; do
  echo "Processing: $yml"

  if echo "$yml" | grep -qi "arm64"; then
    ARCH="arm64"
  else
    ARCH="x64"
  fi
  echo "  Detected arch: $ARCH"

  yq -o=json ".files[] | . + {\"arch\": \"$ARCH\"}" "$yml" | jq -s '.' > "$TMP_DIR/arch-files.json"
  jq -s 'add' "$TMP_DIR/all-files.json" "$TMP_DIR/arch-files.json" > "$TMP_DIR/merged.json"
  mv "$TMP_DIR/merged.json" "$TMP_DIR/all-files.json"
done

mkdir -p "$(dirname "$OUTPUT_FILE")"

{
  echo "version: $VERSION"
  echo "files:"
  jq -r '.[] | "  - url: \(.url)\n    sha512: \(.sha512)\n    size: \(.size)\n    arch: \(.arch)"' "$TMP_DIR/all-files.json"
  echo "path: $(jq -r '.[0].url' "$TMP_DIR/all-files.json")"
  echo "sha512: $(jq -r '.[0].sha512' "$TMP_DIR/all-files.json")"
  echo "releaseDate: '$RELEASE_DATE'"
} > "$OUTPUT_FILE"

echo "=== Merged latest-mac.yml ==="
cat "$OUTPUT_FILE"
