#!/bin/bash
# Start sfc-fetch in tmux

PROJECT_DIR="/home/openclaw/.openclaw/workspace/sfc-fetch"
cd "$PROJECT_DIR" || exit 1

# Kill existing sessions
tmux kill-session -t sfc-fetch 2>/dev/null

# Create new session
tmux new-session -d -s sfc-fetch -c "$PROJECT_DIR"

# Start the server
tmux send-keys -t sfc-fetch "cd $PROJECT_DIR && bun run dev" Enter

echo "SFC-Fetch started in tmux session 'sfc-fetch'"
echo "Attach with: tmux attach -t sfc-fetch"
