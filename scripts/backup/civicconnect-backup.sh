#!/usr/bin/env bash
# CivicConnect scheduled backup — DEC-010 / NFR-1.5.
# Runs every 12 h from cron on the institutional backup server. Exits non-zero on any failure
# so the scheduler's mail/alert fires. Never writes an unencrypted archive to disk.
set -euo pipefail
umask 077

: "${MONGODB_BACKUP_URI:?set in /etc/civicconnect/backup.env (mode 600)}"   # mongodb+srv://civicconnect-backup:...@.../civicconnect
: "${BACKUP_DIR:=/srv/civicconnect-backups}"
: "${GPG_RECIPIENT:=civicconnect-backup@team}"                               # public key only on this server
: "${RETENTION_DAYS:=7}"
LOG="${BACKUP_DIR}/backup.log"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/civicconnect-${STAMP}.archive.gz.gpg"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
trap 'log "FAILED (exit $?) at line $LINENO"; rm -f "${OUT}.partial"' ERR

mkdir -p "$BACKUP_DIR"
log "START dump -> $(basename "$OUT")"

# --oplog is unsupported on free clusters (Atlas docs), so the dump is per-collection consistent only;
# restore runs the consistency check. Stream: dump -> gzip -> encrypt -> disk.
mongodump --uri="$MONGODB_BACKUP_URI" --archive --gzip --quiet \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
  > "${OUT}.partial"
mv "${OUT}.partial" "$OUT"
sha256sum "$OUT" > "${OUT}.sha256"

SIZE=$(stat -c %s "$OUT")
[ "$SIZE" -gt 1024 ] || { log "archive suspiciously small (${SIZE} B)"; exit 2; }

# Retention: DEC-016 purpose C — archives contain personal data; keep 7 days only.
find "$BACKUP_DIR" -name 'civicconnect-*.archive.gz.gpg*' -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/pruned /' >> "$LOG"

log "OK size=${SIZE}B sha256=$(cut -d' ' -f1 "${OUT}.sha256")"
