// PM2 ecosystem config for sfc-fetch
// Docs: https://pm2.keymetrics.io/docs/usage/application-definition/

module.exports = {
  apps: [
    {
      name: 'sfc-fetch',
      script: '/home/openclaw/.bun/bin/bun',
      args: 'run src/main.ts',
      cwd: '/home/openclaw/.openclaw/workspace/sfc-fetch',
      interpreter: 'none', // bun is direct executable, no interpreter
      node_args: '--max-old-space-size=512',

      // Restart policy
      restart_delay: 4000,          // 4s between restarts (avoid rapid loops)
      max_restarts: 10,              // max 10 restart attempts
      min_uptime: 10000,            // must run at least 10s to be considered started

      // Graceful shutdown (wait for current jobs to finish)
      kill_timeout: 15000,          // send SIGTERM, wait 15s, then SIGKILL

      // Auto-start on boot
      pmx: false,                   // no advanced metrics (reduce overhead)

      // Logging
      out_file: '/home/openclaw/.openclaw/workspace/sfc-fetch/logs/out.log',
      error_file: '/home/openclaw/.openclaw/workspace/sfc-fetch/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Watchdog disabled (no file-change restarts for production)
      watch: false,
    },
  ],
};