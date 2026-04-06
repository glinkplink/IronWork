#!/bin/bash
# Hook 7: Auto-commit on task completion (Stop event)
# Only commits if there are staged or unstaged changes
# Exit code 0 always; does NOT push

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

CHANGES=$(git status --porcelain 2>/dev/null)

if [ -z "$CHANGES" ]; then
  exit 0
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

git add -A && git commit -m "auto: $TIMESTAMP Claude task completed" 2>/dev/null

exit 0
