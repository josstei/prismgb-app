#!/usr/bin/env bash
set -euo pipefail

ARTIFACTS_DIR="${1:-artifacts}"
OUTPUT_FILE="${2:-release-files/latest-mac.yml}"

YQ_VERSION="v4.44.1"
YQ_SHA256="a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7"
YQ_URL="https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64"

if ! command -v yq >/dev/null 2>&1; then
  echo "Installing yq ${YQ_VERSION}..."
  wget -qO /tmp/yq "$YQ_URL"
  echo "${YQ_SHA256}  /tmp/yq" | sha256sum -c - || { echo "yq checksum verification failed"; exit 1; }
  sudo mv /tmp/yq /usr/local/bin/yq
  sudo chmod +x /usr/local/bin/yq
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed."
  exit 1
fi

mapfile -t MAC_YAMLS < <(find "$ARTIFACTS_DIR" -name "latest-mac.yml" -type f | sort)

echo "Found ${#MAC_YAMLS[@]} macOS YAML files"

if [ ${#MAC_YAMLS[@]} -lt 2 ]; then
  echo "Expected at least 2 macOS YAML files (arm64 and x64), found ${#MAC_YAMLS[@]}"
  exit 1
fi

VERSION=$(yq '.version' "${MAC_YAMLS[0]}")
RELEASE_DATE=$(yq '.releaseDate' "${MAC_YAMLS[0]}")

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[]" > "$TMP_DIR/all-files.json"

for yml in "${MAC_YAMLS[@]}"; do
  echo "Processing: $yml"

  FIRST_URL=$(yq '.files[0].url' "$yml")
  if echo "$FIRST_URL" | grep -qi "arm64"; then
    ARCH="arm64"
  elif echo "$FIRST_URL" | grep -qi "x64"; then
    ARCH="x64"
  elif echo "$yml" | grep -qi "arm64"; then
    ARCH="arm64"
  else
    ARCH="x64"
  fi
  echo "  Detected arch: $ARCH (from URL: $FIRST_URL)"

  yq -o=json '.files[] | {url, sha512, size, blockMapSize}' "$yml" \
    | jq -s --arg arch "$ARCH" 'map(. + {arch: $arch})' > "$TMP_DIR/arch-files.json"
  jq -s 'add' "$TMP_DIR/all-files.json" "$TMP_DIR/arch-files.json" > "$TMP_DIR/merged.json"
  mv "$TMP_DIR/merged.json" "$TMP_DIR/all-files.json"
done

mkdir -p "$(dirname "$OUTPUT_FILE")"

jq -n \
  --arg version "$VERSION" \
  --arg releaseDate "$RELEASE_DATE" \
  --arg path "$(jq -r '.[0].url' "$TMP_DIR/all-files.json")" \
  --arg sha512 "$(jq -r '.[0].sha512' "$TMP_DIR/all-files.json")" \
  --slurpfile files "$TMP_DIR/all-files.json" \
  '{
    version: $version,
    files: ($files[0] | map({url, sha512, size, blockMapSize, arch})),
    path: $path,
    sha512: $sha512,
    releaseDate: $releaseDate
  }' | yq -P > "$OUTPUT_FILE"

echo "=== Merged latest-mac.yml ==="
cat "$OUTPUT_FILE"
