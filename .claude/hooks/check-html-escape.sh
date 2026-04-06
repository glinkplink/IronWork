#!/bin/bash
# Hook 5: esc() security check for HTML generator files
# Exit code 2 = block; exit code 0 = pass

FILEPATH=$(jq -r '.tool_input.file_path // empty')

if [ -z "$FILEPATH" ]; then
  exit 0
fi

REL="${FILEPATH#$(pwd)/}"

# Only check relevant HTML generator files
MATCH=0
case "$REL" in
  src/lib/*-generator.ts|\
  src/lib/*-html.ts|\
  src/lib/docuseal-*.ts|\
  src/lib/agreement-sections-html.ts)
    MATCH=1
    ;;
esac

if [ "$MATCH" -eq 0 ]; then
  exit 0
fi

if [ ! -f "$FILEPATH" ]; then
  exit 0
fi

# Check for template literal interpolation
HAS_INTERPOLATION=$(grep -c '\${' "$FILEPATH" 2>/dev/null || echo 0)

if [ "$HAS_INTERPOLATION" -eq 0 ]; then
  # No interpolation — nothing to check
  exit 0
fi

# Check if esc is imported from html-escape.ts
HAS_ESC_IMPORT=$(grep -c 'html-escape' "$FILEPATH" 2>/dev/null || echo 0)

if [ "$HAS_ESC_IMPORT" -eq 0 ]; then
  echo "" >&2
  echo "🚨 HTML generator file modified without importing esc() from html-escape.ts." >&2
  echo "   File: $REL" >&2
  echo "   Per CLAUDE.md and AGENTS.md, ALL user-supplied text in HTML string generators must go through esc()." >&2
  echo "   Do not add raw interpolation. Add: import { esc } from './html-escape.js';" >&2
  echo "" >&2
  exit 2
fi

exit 0
