# Deployment Guide

**Version:** 2.0.0  
**Last Updated:** 2026-06-23

---

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores |
| **RAM** | 4 GB | 8+ GB |
| **Disk** | 1 GB | 10+ GB |
| **OS** | Linux (Ubuntu 20.04+) | Ubuntu 22.04 LTS |

### Software Requirements

- **Node.js** 18+ or **Bun** 1.0+
- **PM2** (latest)
- **Git** 2.30+
- **Python** 3.8+ (for Docling)
- **Docling** (PDF conversion tool)

---

## Installation

### 1. Clone Repository

```bash
cd /home/openclaw/.openclaw/workspace
git clone https://github.com/yaukitdev1-cpu/sfc-fetch.git
cd sfc-fetch
```

### 2. Install Dependencies

```bash
# Using Bun (recommended)
bun install

# Or using npm
npm install
```

### 3. Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit configuration
nano .env
```

**Required settings:**
```bash
PORT=3401
NODE_ENV=production

# Git backup (optional but recommended)
GIT_REMOTE=origin
GIT_BRANCH=master
AUTO_HYDRATE=true
AUTO_DEHYDRATE=true

# SFC API
SFC_BASE_URL=https://apps.sfc.hk/edistributionWeb
SFC_RATE_LIMIT=2

# Docling
DOCLING_PATH=/home/openclaw/.local/bin/docling
DOCLING_TIMEOUT=30000
```

### 4. Install Docling

Docling is required for PDF to markdown conversion.

```bash
# Install via pip
pip install docling

# Verify installation
which docling
docling --version

# Update .env with correct path
echo "DOCLING_PATH=$(which docling)" >> .env
```

**Alternative:** See [Docling GitHub](https://github.com/DS4SD/docling) for installation instructions.

### 5. Initialize Git Backup (Optional)

```bash
# Configure Git
git config user.name "SFC Bot"
git config user.email "bot@example.com"

# Set remote
git remote set-url origin https://github.com/yourusername/sfc-fetch.git

# Initial push
git add .
git commit -m "Initial setup"
git push -u origin master
```

---

## Running the Service

### Option 1: PM2 (Production - Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start service
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

**PM2 Commands:**
```bash
pm2 status              # Check status
pm2 logs sfc-fetch      # View logs
pm2 restart sfc-fetch   # Restart service
pm2 stop sfc-fetch      # Stop service
pm2 delete sfc-fetch    # Remove from PM2
```

### Option 2: Direct Execution (Development)

```bash
# Start with hot reload
bun run dev

# Or without watch
bun run start
```

### Option 3: Systemd Service

Create `/etc/systemd/system/sfc-fetch.service`:

```ini
[Unit]
Description=SFC-Fetch Document Pipeline
After=network.target

[Service]
Type=simple
User=openclaw
WorkingDirectory=/home/openclaw/.openclaw/workspace/sfc-fetch
ExecStart=/home/openclaw/.bun/bin/bun run src/main.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable sfc-fetch
sudo systemctl start sfc-fetch
sudo systemctl status sfc-fetch
```

---

## Verification

### 1. Check Service Status

```bash
# PM2
pm2 status

# Direct
curl http://localhost:3401/health | jq
```

**Expected output:**
```json
{
  "status": "healthy",
  "totalDocuments": 0,
  "collections": {
    "circulars": { "count": 0, "status": "loaded" },
    "guidelines": { "count": 0, "status": "loaded" },
    "consultations": { "count": 0, "status": "loaded" },
    "news": { "count": 0, "status": "loaded" }
  }
}
```

### 2. Check Logs

```bash
# PM2 logs
pm2 logs sfc-fetch --lines 50

# Direct log file
tail -100 logs/app.log
```

**Expected startup sequence:**
```
[SFC-Fetch] Starting SFC-Fetch server...
[SFC-Fetch] Server running on port 3401
[SFC-Fetch] Health check: http://localhost:3401/health
[QueueService] [Queue] Initialized
[DiscoverySchedulerService] Discovery scheduler disabled for first 5 minutes
```

### 3. Test API

```bash
# Health check
curl http://localhost:3401/health

# Queue status
curl http://localhost:3401/queue/status
```

---

## Initial Data Load

### Option 1: Automatic Discovery

The discovery scheduler will automatically fetch documents on startup (after 5-minute delay) and daily at 2 AM.

**Wait for discovery to complete:**
```bash
# Monitor progress
watch -n 5 'curl -s http://localhost:3401/health | jq .totalDocuments'
```

**Expected timeline:**
- Circulars: ~10 minutes (944 documents)
- Guidelines: ~5 minutes (51 documents)
- Consultations: ~15 minutes (217 documents)
- News: ~30 minutes (4,237 documents)

### Option 2: Manual Trigger

```bash
# Trigger discovery for all categories
curl -X POST http://localhost:3401/circulars/discover
curl -X POST http://localhost:3401/guidelines/discover
curl -X POST http://localhost:3401/consultations/discover
curl -X POST http://localhost:3401/news/discover
```

### Option 3: Restore from Git Backup

```bash
# Restore from Git
curl -X POST http://localhost:3401/hydrate

# Or manually
git pull origin master
```

---

## Monitoring

### Health Checks

```bash
# Simple health check
curl -f http://localhost:3401/health || echo "UNHEALTHY"

# Detailed status
curl -s http://localhost:3401/health | jq
```

### Queue Monitoring

```bash
# Check queue status
curl -s http://localhost:3401/queue/status | jq

# Monitor processing
watch -n 2 'curl -s http://localhost:3401/queue/status | jq'
```

### Log Monitoring

```bash
# Real-time logs
tail -f logs/app.log

# Error logs only
tail -f logs/app-error.log

# Filter for specific issues
grep -i "error\|fail" logs/app.log | tail -20
```

### Resource Monitoring

```bash
# PM2 monitoring
pm2 monit

# System resources
htop
df -h
```

---

## Backup & Recovery

### Automatic Backup

If `AUTO_DEHYDRATE=true`, the system automatically commits and pushes data to Git after processing.

**Check backup status:**
```bash
curl -s http://localhost:3401/backup/status | jq
```

### Manual Backup

```bash
# Trigger backup
curl -X POST http://localhost:3401/dehydrate

# Or via Git
cd /home/openclaw/.openclaw/workspace/sfc-fetch
git add .
git commit -m "Manual backup $(date +%Y-%m-%d)"
git push origin master
```

### Recovery from Backup

```bash
# Restore from Git
curl -X POST http://localhost:3401/hydrate

# Or manually
git pull origin master
pm2 restart sfc-fetch
```

### Database Backup

```bash
# Backup database file
cp data/db/sfc-db.json data/db/sfc-db.json.backup.$(date +%Y%m%d)

# Restore
cp data/db/sfc-db.json.backup.YYYYMMDD data/db/sfc-db.json
pm2 restart sfc-fetch
```

---

## Troubleshooting

### Service Won't Start

**Symptom:** PM2 shows `errored` status

**Diagnosis:**
```bash
pm2 logs sfc-fetch --err
```

**Common causes:**
1. **Port already in use**
   ```bash
   lsof -i :3401
   kill -9 <PID>
   ```

2. **Missing dependencies**
   ```bash
   bun install
   ```

3. **Invalid .env**
   ```bash
   # Check for syntax errors
   cat .env | grep -v "^#" | grep "="
   ```

### Queue Stuck

**Symptom:** Queue shows `running: 1` but no progress

**Solution:**
```bash
# 1. Restart service
pm2 restart sfc-fetch

# 2. If still stuck, reset queue
pm2 stop sfc-fetch

# Edit database
nano data/db/sfc-db.json
# Set all queue entries: "status": "pending"

pm2 start sfc-fetch
```

### Docling Conversion Fails

**Symptom:** Documents marked as FAILED with Docling errors

**Diagnosis:**
```bash
# Check Docling
which docling
docling --version

# Test conversion
docling data/raw/circulars/H686.pdf --to md --output /tmp/test
```

**Solutions:**
1. **Reinstall Docling**
   ```bash
   pip uninstall docling
   pip install docling
   ```

2. **Increase timeout**
   ```bash
   # In .env
   DOCLING_TIMEOUT=60000
   ```

3. **Check disk space**
   ```bash
   df -h
   ```

### Out of Memory (OOM)

**Symptom:** Service crashes with OOM errors

**Solutions:**
1. **Increase swap space**
   ```bash
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

2. **Reduce Docling concurrency** (if applicable)

3. **Increase Node.js memory limit**
   ```bash
   # In ecosystem.config.js
   node_args: '--max-old-space-size=2048'
   ```

### Discovery Not Running

**Symptom:** No new documents being discovered

**Diagnosis:**
```bash
# Check logs
grep "DiscoveryScheduler" logs/app.log | tail -20

# Check if disabled
grep "DISCOVERY_ENABLED" .env
```

**Solutions:**
1. **Enable discovery**
   ```bash
   # In .env
   DISCOVERY_ENABLED=true
   ```

2. **Manually trigger**
   ```bash
   curl -X POST http://localhost:3401/circulars/discover
   ```

---

## Performance Tuning

### Queue Concurrency

Default: `concurrent: 1` (safe for low-resource systems)

**Increase for faster processing:**
```bash
# In src/workflows/queue.service.ts
this.queue = new Queue(processor, {
  concurrent: 2,  // or 4 for powerful systems
  ...
});
```

**Warning:** Higher concurrency increases memory usage. Monitor with `htop`.

### Docling Timeout

Default: 30 seconds

**Increase for large PDFs:**
```bash
# In .env
DOCLING_TIMEOUT=60000
```

### Discovery Rate

Default: 2 requests per second

**Adjust based on SFC API limits:**
```bash
# In .env
SFC_RATE_LIMIT=1  # slower
SFC_RATE_LIMIT=5  # faster (may be rate-limited)
```

---

## Security

### Network Security

- **Bind to localhost only** (default)
- **Use reverse proxy** (nginx) for external access
- **Add authentication** if exposing API

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name sfc-fetch.example.com;

    location / {
        proxy_pass http://localhost:3401;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Basic auth
        auth_basic "Restricted";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

### Environment Variables

- **Never commit `.env`** (already in `.gitignore`)
- **Use strong passwords** for any authentication
- **Rotate Git tokens** regularly

---

## Updates

### Updating to Latest Version

```bash
# Stop service
pm2 stop sfc-fetch

# Pull latest code
git pull origin master

# Install new dependencies
bun install

# Restart service
pm2 restart sfc-fetch

# Verify
pm2 status
curl http://localhost:3401/health | jq
```

### Database Migration

If database schema changes:

```bash
# Backup first
cp data/db/sfc-db.json data/db/sfc-db.json.backup.$(date +%Y%m%d)

# Pull latest code
git pull origin master

# Run migration script (if provided)
# bun run scripts/migrate-db.ts

# Restart
pm2 restart sfc-fetch
```

---

## Uninstallation

```bash
# Stop service
pm2 stop sfc-fetch
pm2 delete sfc-fetch

# Remove PM2 startup script
pm2 unstartup

# Remove directory
cd ..
rm -rf sfc-fetch

# Remove swap (if created)
sudo swapoff /swapfile
sudo rm /swapfile
sudo sed -i '/swapfile/d' /etc/fstab
```

---

## Support

- **Documentation:** `README.md`, `docs/`
- **Logs:** `logs/app.log`, `logs/app-error.log`
- **Issues:** GitHub Issues
- **Contact:** York (project owner)

---

**End of Deployment Guide**
