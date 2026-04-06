#!/bin/bash
# Hook 4: CSS co-location warning — fires after any edit to src/App.css
# Exit code 0 always (warning only)

FILEPATH=$(jq -r '.tool_input.file_path // empty')

if [ -z "$FILEPATH" ]; then
  exit 0
fi

REL="${FILEPATH#$(pwd)/}"

# Only check App.css
if [ "$REL" != "src/App.css" ]; then
  exit 0
fi

# Look for new selectors being added in the working-tree diff vs HEAD
# Pattern: class names that suggest a specific page/component owner
PAGE_PATTERN='\.(invoice-|co-detail-|wo-|change-order-wizard-|capture-|auth-|edit-profile-)'

DIFF_OUTPUT=$(git diff HEAD -- "src/App.css" 2>/dev/null)

if [ -z "$DIFF_OUTPUT" ]; then
  exit 0
fi

# Look for lines added (starting with +) that contain page-specific selectors
MATCHES=$(echo "$DIFF_OUTPUT" | grep -E '^\+' | grep -v '^+++' | grep -E "$PAGE_PATTERN")

if [ -n "$MATCHES" ]; then
  echo ""
  echo "⚠️  Page-specific CSS detected in App.css. Per AGENTS.md and CLAUDE.md, page/component styles must be co-located with their owning component (e.g. FooPage.css). App.css is only for: design tokens (:root), app shell/layout, shared utility classes, print/PDF globals."
  echo ""
  echo "Matched lines:"
  echo "$MATCHES"
  echo ""
fi

exit 0
