#!/usr/bin/env bash
# Extracts every version of every Office document committed in the history of
# <rev>, so that Gitleaks can scan their text (NFR-3.5). Gitleaks does not scan
# binary file contents, and an .xlsx/.docx/.pptx is a zip of XML, so without this
# step a secret typed into a register would never be detected.
#
# Usage: extract-office-documents.sh <repo-dir> <out-dir> [<rev>]
#   <rev> defaults to HEAD: on a pull request that is the merge result, so only
#   what the PR would merge is scanned. Pass --all to scan every branch (the
#   scheduled, non-blocking scan does this).
#   Each document version (git blob) is unzipped into <out-dir>/<blob-sha>/, and
#   a tag-stripped copy of each XML part is written next to it as *.text, so a
#   value that Excel split across formatting runs is scanned as one string.
#   A blob that is not a zip, or that unzip cannot read, is kept as
#   <out-dir>/<blob-sha>.raw and still scanned as plain bytes; the failure is
#   reported with its path, never left to stop the job.
#   <out-dir>/MANIFEST.txt maps each blob back to its path in the repository.
set -euo pipefail
REPO="${1:?repo dir}"
OUT="${2:?out dir}"
REV="${3:-HEAD}"
mkdir -p "$OUT"
: > "$OUT/MANIFEST.txt"

zips=0; raws=0; failed=0
while read -r sha path; do
  blob="$OUT/$sha.blob"
  git -C "$REPO" cat-file blob "$sha" > "$blob"
  if [ "$(head -c 2 "$blob")" = "PK" ] && unzip -q -o "$blob" -d "$OUT/$sha" 2>/dev/null; then
    rm "$blob"
    # Strip XML tags so text split across formatting runs is joined up.
    find "$OUT/$sha" -type f -name '*.xml' -print0 |
      while IFS= read -r -d '' part; do
        sed -e 's/<[^>]*>//g' "$part" > "$part.text"
      done
    echo "$sha zip $path" >> "$OUT/MANIFEST.txt"
    zips=$((zips + 1))
  else
    if [ "$(head -c 2 "$blob")" = "PK" ]; then
      echo "::warning::Could not unzip $path (blob $sha); scanning its raw bytes instead."
      failed=$((failed + 1))
    fi
    mv "$blob" "$OUT/$sha.raw"
    echo "$sha raw $path" >> "$OUT/MANIFEST.txt"
    raws=$((raws + 1))
  fi
done < <(git -C "$REPO" rev-list "$REV" --objects | grep -iE '\.(xlsx|xlsm|docx|pptx)$' || true)

echo "Extracted $zips Office document versions; $raws blobs scanned as raw bytes ($failed of them unreadable zips)."