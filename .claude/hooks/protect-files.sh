#!/bin/bash
# Hook 3: Protect sensitive and applied files from edits
# Exit code 2 = block; exit code 0 = allow

FILEPATH=$(jq -r '.tool_input.file_path // empty')

if [ -z "$FILEPATH" ]; then
  exit 0
fi

# Normalize to relative path for matching
REL="${FILEPATH#$(pwd)/}"

block() {
  echo "$1" >&2
  exit 2
}

# Block .env and all .env.* variants
case "$REL" in
  .env|.env.*)
    block "BLOCKED: Do not edit env files (.env, .env.*). These contain secrets and are managed outside Claude. Edit them manually."
    ;;
esac

# Block package-lock.json
if [ "$REL" = "package-lock.json" ]; then
  block "BLOCKED: Do not edit package-lock.json directly. Run npm install to regenerate it."
fi

# Block existing migration files (Claude can CREATE new ones, but never modify existing)
if echo "$REL" | grep -qE '^supabase/migrations/'; then
  if [ -f "$FILEPATH" ]; then
    block "BLOCKED: Supabase migration files are immutable once applied. File already exists: $REL. Create a NEW migration file instead of modifying this one."
  fi
fi

# Block self-modification of hooks
if echo "$REL" | grep -qE '^\.claude/hooks/'; then
  block "BLOCKED: Claude must not self-modify its own hook scripts. Edit hooks manually."
fi

# Block service worker (minimal and intentional)
if [ "$REL" = "public/sw.js" ]; then
  block "BLOCKED: public/sw.js is a minimal intentional service worker. Confirm with the user before modifying it."
fi

# Block PWA manifest (intentional)
if [ "$REL" = "public/manifest.webmanifest" ]; then
  block "BLOCKED: public/manifest.webmanifest is intentional PWA config. Confirm with the user before modifying it."
fi

exit 0
