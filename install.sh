#!/usr/bin/env bash
# Install dsh-companion-face into a DeepSeek Harness profile.
#
# Copies this package into <DSH_HOME>/profiles/node_modules/ and appends one additive row
# to <DSH_HOME>/profiles/<PROFILE>/cordis.patch.yml.
#
# Idempotent: re-running refreshes lib/ and will not add a second patch row. It backs the
# patch file up before writing and never restarts the harness for you.
#
#   ./install.sh                       # uses $DSH_HOME, else ~/.dsh, profile 'web'
#   DSH_HOME=/opt/dsh ./install.sh
#   PROFILE=headless ./install.sh
#   DRY_RUN=1 ./install.sh

set -euo pipefail

PKG_NAME='dsh-companion-face'
PROFILE="${PROFILE:-web}"
DRY_RUN="${DRY_RUN:-}"

info() { printf '  %s\n' "$1"; }
ok()   { printf '  \033[32m%s\033[0m\n' "$1"; }
die()  { printf '  \033[31m%s\033[0m\n' "$1" >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

printf '\ndsh-companion-face installer\n\n'

# --- 1. resolve the DSH home -----------------------------------------------------------------
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
[ -d "$DSH_HOME" ] || die "DSH_HOME does not exist: $DSH_HOME"
info "DSH_HOME      : $DSH_HOME"

PROFILES_DIR="$DSH_HOME/profiles"
[ -d "$PROFILES_DIR" ] || die "No profiles directory at $PROFILES_DIR — is this a DSH home?"

PROFILE_DIR="$PROFILES_DIR/$PROFILE"
[ -d "$PROFILE_DIR" ] || die "No '$PROFILE' profile in $PROFILES_DIR. Available: $(ls -1 "$PROFILES_DIR" 2>/dev/null | tr '\n' ' ')"
info "profile       : $PROFILE"

# --- 2. verify the payload -------------------------------------------------------------------
for rel in package.json lib/index.js lib/client.js; do
  [ -f "$HERE/$rel" ] || die "Package is incomplete: missing $rel"
done
info "bundle        : lib/client.js ($(wc -c < "$HERE/lib/client.js" | tr -d ' ') bytes)"

# --- 3. copy into the profile's node_modules -------------------------------------------------
# profiles/node_modules is a plain drop-in directory in a stock install: there is no
# package.json, lockfile or workspace above it, so no package manager is involved.
MODULES_DIR="$PROFILES_DIR/node_modules"
TARGET="$MODULES_DIR/$PKG_NAME"

if [ -n "$DRY_RUN" ]; then
  info "[dry run] would copy  $HERE -> $TARGET"
else
  mkdir -p "$TARGET/lib"
  cp -f "$HERE/package.json" "$TARGET/package.json"
  cp -f "$HERE/lib/index.js" "$TARGET/lib/index.js"
  cp -f "$HERE/lib/client.js" "$TARGET/lib/client.js"
  [ -f "$HERE/README.md" ] && cp -f "$HERE/README.md" "$TARGET/README.md"
  # The README embeds docs/mood-sheet.png; without it the installed copy has a broken image.
  if [ -d "$HERE/docs" ]; then
    mkdir -p "$TARGET/docs"
    cp -f "$HERE/docs/"* "$TARGET/docs/" 2>/dev/null || true
  fi
  ok "installed     : $TARGET"
fi

# --- 4. append the patch row -----------------------------------------------------------------
# cordis.patch.yml is a top-level YAML array of loader patch entries, so appending a
# sequence item as text is valid YAML. We only ever append, never rewrite.
PATCH="$PROFILE_DIR/cordis.patch.yml"
BACKUP_MADE=''

# Match the plugin NAME as a YAML value, quoted or bare, and only at the start of a
# mapping key. Two earlier forms were wrong in opposite directions: a fixed
# `grep -F "'$PKG_NAME'"` misses `name: dsh-companion-face` (no quotes), which appends a
# SECOND row and loads the plugin twice; a bare substring search matches the comment
# banner at the top of the patch file, which appends NOTHING and silently "succeeds".
NAME_RE="^[[:space:]]*name:[[:space:]]*[\"']?$PKG_NAME"
if [ -f "$PATCH" ] && grep -qE "$NAME_RE" "$PATCH"; then
  ok "patch row     : already present, left alone"
elif [ -n "$DRY_RUN" ]; then
  info "[dry run] would append the companion-face row to $PATCH"
else
  if [ -f "$PATCH" ]; then
    BACKUP="$PATCH.bak-$(date +%Y%m%d-%H%M%S)"
    cp -f "$PATCH" "$BACKUP"
    BACKUP_MADE="$BACKUP"
    info "backup        : $BACKUP"
    # Ensure the file ends with a newline so the appended item starts on its own line.
    [ -n "$(tail -c 1 "$PATCH" 2>/dev/null)" ] && printf '\n' >> "$PATCH"
  fi
  cat >> "$PATCH" <<YAML

- insert:
    - id: companion-face
      name: '$PKG_NAME'
YAML
  ok "patch row     : appended to $PATCH"
fi

# --- 5. next steps ---------------------------------------------------------------------------
printf '\nDone.\n\n'
printf '  Restart the harness, then reload the Web GUI page.\n'
printf '  The face appears in the canvas; the mood chip appears in the session header.\n\n'
if [ -n "$BACKUP_MADE" ]; then
  printf '  Rollback: restore the backup at %s,\n' "$BACKUP_MADE"
else
  printf '  Rollback: remove the companion-face entry from %s,\n' "$PATCH"
fi
printf '            then delete %s, and restart.\n\n' "$TARGET"
