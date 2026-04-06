#!/bin/bash
# Hook 6: Append every bash command Claude runs to .claude/command-log.txt
# Exit code 0 always

CMD=$(jq -r '.tool_input.command // empty')

if [ -z "$CMD" ]; then
  exit 0
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOG_FILE="$(dirname "$0")/../command-log.txt"

echo "[$TIMESTAMP] $CMD" >> "$LOG_FILE"

exit 0
