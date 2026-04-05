#!/bin/bash
# Stop all sfc-fetch tmux sessions

echo "🛑 Stopping sfc-fetch tmux sessions..."

SESSIONS=$(tmux list-sessions 2>/dev/null | grep -E '^sfc-' | cut -d':' -f1)

if [ -z "$SESSIONS" ]; then
    echo "   No sfc-* sessions found."
    exit 0
fi

for session in $SESSIONS; do
    echo "   Killing session: $session"
    tmux kill-session -t "$session" 2>/dev/null
done

echo "✅ All sfc-fetch sessions stopped."
echo ""
echo "Remaining tmux sessions:"
tmux list-sessions 2>/dev/null || echo "   (none)"
