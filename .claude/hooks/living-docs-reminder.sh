#!/bin/bash
# Hook 8: Living doc cross-alignment reminder
# Fires before editing any of the living documentation files
# Exit code 0 (reminder only, never blocks)

FILEPATH=$(jq -r '.tool_input.file_path // empty')

if [ -z "$FILEPATH" ]; then
  exit 0
fi

REL="${FILEPATH#$(pwd)/}"

MATCH=0
case "$REL" in
  CLAUDE.md|\
  AGENTS.md|\
  ARCHITECTURE.md|\
  .cursor/rules/ScopeLock-Project-Rules.mdc|\
  .cursor/rules/high-priority.mdc)
    MATCH=1
    ;;
esac

if [ "$MATCH" -eq 0 ]; then
  exit 0
fi

echo ""
echo "📝 You are editing a living document ($REL). Per AGENTS.md: 'When editing any of these agent-facing files, compare the same topic across the others and align them so guidance does not drift or contradict.' Check if the change you just made needs to be mirrored in the other living docs."
echo ""
echo "   Living docs: CLAUDE.md, AGENTS.md, ARCHITECTURE.md,"
echo "   .cursor/rules/ScopeLock-Project-Rules.mdc, .cursor/rules/high-priority.mdc"
echo ""

exit 0
