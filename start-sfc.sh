#!/bin/bash
# Start script for sfc-fetch with tmux monitoring
# Created: $(date)

# Validate Bun runtime availability
if ! command -v bun &> /dev/null; then
  echo "❌ Error: Bun runtime is required but not installed"
  exit 1
fi

PROJECT_DIR="/home/openclaw/.openclaw/workspace/sfc-fetch"
cd "$PROJECT_DIR" || exit 1

echo "🚀 Starting sfc-fetch tmux environment..."
echo "Project: $PROJECT_DIR"
echo "Node: $(node --version)"
echo ""

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Validate tmux availability
if ! command -v tmux &> /dev/null; then
echo "❌ Error: tmux is required but not installed"
exit 1
fi

# Kill existing sessions (if any)
echo "🧹 Cleaning up existing sessions..."
tmux kill-session -t sfc-dev 2>/dev/null
tmux kill-session -t sfc-logs 2>/dev/null
tmux kill-session -t sfc-health 2>/dev/null
# Verify cleanup
if tmux has-session -t sfc-dev 2>/dev/null; then
echo "❌ Failed to clean up sfc-dev session"
exit 1
fi
sleep 1

# Build the project first (Bun-specific build from package.json)
echo "🔨 Building TypeScript project with Bun..."
rm -rf dist
bun build src/main.ts --outdir dist --target node 2>&1 | tee logs/build.log
if [ $? -ne 0 ]; then
  echo "❌ Build failed - check logs/build.log for details"
exit 1
fi

# Verify build output exists
if [ ! -f "dist/main.js" ]; then
echo "❌ Build failed - dist/main.js not found"
exit 1
fi

# Create dev session (main application)
echo "📦 Starting development server on port 3000..."
tmux new-session -d -s sfc-dev -c "$PROJECT_DIR"
tmux send-keys -t sfc-dev "echo 'Starting sfc-fetch server with Bun...' && bun run dist/main.js 2>&1 | tee logs/app.log" Enter

# Create logs session
echo "📝 Starting log monitor..."
tmux new-session -d -s sfc-logs -c "$PROJECT_DIR/logs"
tmux send-keys -t sfc-logs "echo 'Log monitor started. Watching: app.log, error.log, access.log' && touch app.log error.log access.log && tail -f app.log error.log access.log 2>/dev/null" Enter

# Create health check session
echo "🏥 Starting health monitor..."
tmux new-session -d -s sfc-health -c "$PROJECT_DIR"
tmux send-keys -t sfc-health "/home/openclaw/.openclaw/workspace/sfc-fetch/scripts/health-check.sh" Enter

echo ""
echo "✅ All sessions started successfully!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🖥️  TMUX SESSIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  sfc-dev      → Application server (node dist/main.js)"
echo "  sfc-logs     → Log aggregation (tail -f)"
echo "  sfc-health   → Health check monitor"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔌 Attach commands:"
echo "  tmux attach -t sfc-dev       # Development server"
echo "  tmux attach -t sfc-logs      # Monitor logs"
echo "  tmux attach -t sfc-health    # Health checks"
echo ""
echo "📊 Quick status:"
echo "  ./scripts/status-sfc.sh      # Full status report"
echo "  tmux list-sessions           # List all sessions"
echo ""
echo "🛑 Stop all:"
echo "  ./scripts/stop-sfc.sh"
echo ""
