#!/usr/bin/env bash
# Extracts every version of every Office document ever committed, so that
# Gitleaks can scan their text (NFR-3.5). Gitleaks does not scan binary file
# contents, and an .xlsx/.docx/.pptx is a zip of XML, so without this step a
# secret typed into a register would never be detected.
#
# Usage: extract-office-documents.sh <repo-dir> <out-dir>
#   Each document version (git blob) is unzipped into <out-dir>/<blob-sha>/.
#   A blob that is not a zip (e.g. an Office "~$" lock file) is copied as
#   <out-dir>/<blob-sha>.raw so it is still scanned, as plain bytes.
#   <out-dir>/MANIFEST.txt maps each blob back to its path in the repository.
set -euo pipefail
REPO="${1:?repo dir}"
OUT="${2:?out dir}"
mkdir -p "$OUT"
: > "$OUT/MANIFEST.txt"

zips=0; raws=0
while read -r sha path; do
  blob="$OUT/$sha.blob"
  git -C "$REPO" cat-file blob "$sha" > "$blob"
  if [ "$(head -c 2 "$blob")" = "PK" ]; then
    unzip -q -o "$blob" -d "$OUT/$sha"
    rm "$blob"
    echo "$sha zip $path" >> "$OUT/MANIFEST.txt"
    zips=$((zips + 1))
  else
    mv "$blob" "$OUT/$sha.raw"
    echo "$sha raw $path" >> "$OUT/MANIFEST.txt"
    raws=$((raws + 1))
  fi
done < <(git -C "$REPO" rev-list --all --objects | grep -iE '\.(xlsx|xlsm|docx|pptx)$' || true)

echo "Extracted $zips Office document versions; $raws non-zip blobs copied as raw bytes."
