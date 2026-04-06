#!/bin/bash
# Hook 2: Block dangerous bash commands
# Exit code 2 = block with message; exit code 0 = allow

CMD=$(jq -r '.tool_input.command // empty')

if [ -z "$CMD" ]; then
  exit 0
fi

block() {
  echo "$1" >&2
  exit 2
}

# rm -rf — allow only node_modules, dist, .cache
if echo "$CMD" | grep -qE 'rm\s+-rf'; then
  if ! echo "$CMD" | grep -qE 'rm\s+-rf\s+(node_modules|dist|\.cache)\b'; then
    block "BLOCKED: rm -rf is not allowed except for node_modules, dist, or .cache. Use targeted deletes instead."
  fi
fi

# git reset --hard
if echo "$CMD" | grep -qE 'git\s+reset\s+--hard'; then
  block "BLOCKED: git reset --hard is a destructive operation. Stash or commit changes first, then ask the user to confirm."
fi

# git push --force / git push -f
if echo "$CMD" | grep -qE 'git\s+push\s+(--force|-f)\b'; then
  block "BLOCKED: Force push is not allowed. Rebase and discuss with the user before force-pushing."
fi

# DROP TABLE / DROP DATABASE (SQL)
if echo "$CMD" | grep -qiE '\bDROP\s+(TABLE|DATABASE)\b'; then
  block "BLOCKED: DROP TABLE / DROP DATABASE detected. Do not run destructive SQL through Claude."
fi

# curl/wget piped to sh/bash
if echo "$CMD" | grep -qE '(curl|wget).+\|\s*(sh|bash)'; then
  block "BLOCKED: Piping curl/wget output directly to sh/bash is a security risk. Download the script, inspect it, then run it."
fi

# npx supabase db reset
if echo "$CMD" | grep -qE 'npx\s+supabase\s+db\s+reset'; then
  block "BLOCKED: npx supabase db reset would nuke the database. This must be run manually by the developer, not by Claude."
fi

# Direct psql or supabase CLI with a production URL
if echo "$CMD" | grep -qE '(psql|supabase)\s+.*supabase\.co'; then
  block "BLOCKED: Direct psql/supabase CLI command targeting a production Supabase URL is not allowed. Use the Supabase Dashboard or confirm manually."
fi

exit 0
