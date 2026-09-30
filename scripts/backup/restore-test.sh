#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB_TEST_URI:?}"          # civicconnect-test project, NOT production
LATEST=$(ls -1t /srv/civicconnect-backups/civicconnect-*.archive.gz.gpg | head -1)
sha256sum -c "${LATEST}.sha256"
gpg --batch --decrypt "$LATEST" \
  | mongorestore --uri="$MONGODB_TEST_URI" --archive --gzip --drop \
      --nsFrom='civicconnect.*' --nsTo='civicconnect_restore.*'
mongosh "$MONGODB_TEST_URI" --quiet --file "$(dirname "$0")/consistency-check.js"
