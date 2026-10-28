#!/usr/bin/env bash
# Mirror the R2 media bucket to a second, non-Cloudflare location.
# R2 has no versioning, so this is the only protection against deletions.
#
# Requires an rclone remote configured for R2 (S3-compatible) named "r2" and
# a destination remote (e.g. Backblaze "b2" or a local path).
#   rclone config  # once, to set up remotes
# Usage: scripts/backup/sync-media.sh [source] [destination]
set -euo pipefail

SOURCE="${1:-r2:stezora-publisher-media}"
DEST="${2:-${BACKUP_MEDIA_DEST:-backups/media}}"

rclone sync "$SOURCE" "$DEST" --progress
echo "backup: media synced from $SOURCE to $DEST"
