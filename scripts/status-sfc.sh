#!/bin/bash
# Status monitor for sfc-fetch tmux sessions

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📊 SFC-FETCH TMUX STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if tmux is running
if ! command -v tmux &> /dev/null; then
    echo "❌ tmux is not installed"
    exit 1
fi

# List all sfc sessions
SESSIONS=$(tmux list-sessions 2>/dev/null | grep -E '^sfc-')

if [ -z "$SESSIONS" ]; then
    echo "   ⚠️  No sfc-* sessions running"
    echo ""
    echo "   Start with: ./start-sfc.sh"
    exit 0
fi

# Display session info
echo "$SESSIONS" | while read line; do
    SESSION_NAME=$(echo "$line" | cut -d':' -f1)
    WINDOW_INFO=$(echo "$line" | cut -d'(' -f2 | cut -d')' -f1)
    
    echo "  🖥️  $SESSION_NAME ($WINDOW_INFO)"
    
    # Get last few lines from the session
    LAST_OUTPUT=$(tmux capture-pane -t "$SESSION_NAME" -p 2>/dev/null | tail -3 | grep -v '^$' | head -2)
    if [ -n "$LAST_OUTPUT" ]; then
        echo "     └─> $(echo "$LAST_OUTPUT" | head -1 | cut -c1-50)"
    fi
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔌 QUICK ACTIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Attach to sessions:"
echo "    tmux attach -t sfc-dev       # Development server"
echo "    tmux attach -t sfc-logs      # Log monitor"
echo "    tmux attach -t sfc-health    # Health checks"
echo ""
echo "  Control commands:"
echo "    ./start-sfc.sh               # Start all sessions"
echo "    ./scripts/stop-sfc.sh        # Stop all sessions"
echo "    ./scripts/status-sfc.sh      # Show this status"
echo ""
echo "  Health check:"
echo "    curl http://localhost:3000/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
