# SFC-Fetch Monitoring Plan

**Version:** 1.1
**Date:** 2026-04-13
**Port:** 3401 (from `.env`)
**Environment:** Development

---

## 1. Configuration Overview

| Setting | Value | Source |
|---------|-------|--------|
| **Port** | `3401` | `.env` |
| Node Env | `development` | `.env` |
| Data Dir | `./data` | `.env` |
| DB Path | `./data/db/sfc-db.json` | `.env` |
| Git Branch | `master` | `.env` |
| Auto-Hydrate | `true` | `.env` |
| Discovery | Enabled | `.env` (cron: `0 2 * * *`) |

---

## 2. Service Startup Monitoring

### Recommended: Use tmux

Always run the app inside tmux so logs persist and you can reattach to monitor:

```bash
# Create a new tmux session
tmux new -s sfc-fetch

# Start the app
cd /home/openclaw/.openclaw/workspace/sfc-fetch
bun run dev

# Detach with Ctrl+b, then d
# Reattach later with
tmux attach -t sfc-fetch
```

### Start Command (without tmux)
```bash
cd /home/openclaw/.openclaw/workspace/sfc-fetch
bun run dev
```

### Expected Startup Sequence
1. `[SFC-Fetch] Server running on port 3401`
2. `[SFC-Fetch] Health check: http://localhost:3401/health`
3. If `AUTO_HYDRATE=true` and no data: Git restore logs
4. Queue initialization: `[Queue] Initialized`
5. Auto-discovery scheduler starts (if enabled) after 5-minute delay

### Startup Issue Patterns

| Pattern | Meaning | Action |
|---------|--------|--------|
| `recoverStuckDocuments()` running | Recovery scan at startup | Normal if few documents |
| `recoverStuckDocuments()` taking >30s | Many stuck documents | Check for systemic job failures |
| `app.init()` timeout | Startup timeout (fix: use fire-and-forget recovery) | Fixed in v1.0+ |

---

## 3. Health Endpoint Monitoring

### Command
```bash
curl -s http://localhost:3401/health | jq .
```

### Expected Response
```json
{
  "status": "healthy",
  "totalDocuments": 0,
  "lastBackup": null,
  "collections": {
    "circulars": { "count": 0, "status": "loaded" },
    "guidelines": { "count": 0, "status": "loaded" },
    "consultations": { "count": 0, "status": "loaded" },
    "news": { "count": 0, "status": "loaded" }
  },
  "activeWorkflows": 0
}
```

### Note on `activeWorkflows`
`activeWorkflows` counts documents in non-terminal states (PENDING, DISCOVERED, DOWNLOADING, PROCESSING, RETRYING, RE_RUNNING). A value > 0 indicates work in progress.

---

## 4. Key Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET http://localhost:3401/health` | Service health & doc counts |
| `GET http://localhost:3401/queue/status` | Queue depth & job stats |
| `GET http://localhost:3401/workflows/stats` | Workflow state distribution |
| `GET http://localhost:3401/backup/status` | Git backup status |
| `GET http://localhost:3401/workflows?status=PENDING` | Documents awaiting processing |

---

## 5. Queue & Workflow Monitoring

### Queue Status
```bash
curl -s http://localhost:3401/queue/status
```

Returns `{ length, running }` where:
- `length` = pending jobs in queue
- `running` = currently executing jobs

### Workflow Stats
```bash
curl -s http://localhost:3401/workflows/stats
```

Returns `{ total, byCategory, byStatus }`.

### Key Metrics to Watch

| Metric | Warning Threshold | Critical Threshold | Notes |
|--------|------------------|-------------------|-------|
| Queue depth | > 100 jobs | > 500 jobs | May indicate downstream API issues |
| Failed jobs | > 10/hour | > 50/hour | Check logs for recurring errors |
| Avg job duration | > 30s | > 120s | Long jobs may indicate PDF conversion issues |
| Documents in `FAILED` state | > 5% | > 20% | Check specific categories |
| Documents in `RETRYING` state | > 5 | > 20 | Retry storm may indicate systemic issue |
| Documents with high retry count | > 3 retries | > 5 retries | Check for data quality issues |

### Workflow States

The system tracks documents through these workflow states:

| State | Description |
|-------|-------------|
| `PENDING` | Document discovered but not yet being processed |
| `DISCOVERED` | Document found in source, ready to download |
| `DOWNLOADING` | Raw content being fetched from SFC |
| `PROCESSING` | Content being converted to markdown |
| `COMPLETED` | Successfully processed, markdown available |
| `FAILED` | Error during download or processing |
| `RETRYING` | Attempting automatic recovery from failure |
| `RE_RUNNING` | Full reprocessing requested |
| `STALE` | Source content changed since last processing |

### Step Statuses

Each workflow step (`discover`, `download`, `convert`) tracks its own status:

| Step Status | Description |
|-------------|-------------|
| `PENDING` | Not yet started |
| `RUNNING` | Currently executing |
| `COMPLETED` | Successfully finished |
| `FAILED` | Error occurred |
| `SKIPPED` | Intentionally bypassed |

---

## 6. Discovery Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `DISCOVERY_ENABLED` | `true` | Enable/disable auto-discovery |
| `DISCOVERY_SCHEDULE_CRON` | `0 2 * * *` | Cron schedule (daily at 2 AM) |
| `DISCOVERY_CATEGORIES` | `circulars,consultations,news` | Categories to discover |
| `DISCOVERY_START_YEAR` | `1990` | Earliest year for circulars |
| `DISCOVERY_PAGE_SIZE` | `100` | Items per page |
| `DISCOVERY_REQUEST_INTERVAL_MS` | `500` | Delay between API calls |
| Startup delay | 5 minutes | Discovery disabled first 5 min to let queue process |

**Note:** Guidelines are scraped from the SFC main website, not discovered via API.

---

## 7. Auto-Discovery Schedule

- **Cron:** `0 2 * * *` → Runs daily at 2:00 AM
- **Startup:** Delayed 5 minutes after server start

### Monitor Discovery Jobs
```bash
curl -s http://localhost:3401/workflows?status=PENDING | jq '.count'
```

### Discovery Log Patterns

| Pattern | Meaning | Action |
|---------|--------|--------|
| `Discovery run complete: found=N, queued=M, skipped=K` | Normal completion | None |
| `discoverCategory(${category}) errors: N` | Category discovery failed | Check API connectivity |
| `PDF not available for circular ${refNo}, trying HTML` | PDF fallback | Normal for older circulars |
| `recoverStuckDocuments(): recovered N documents` | Recovery ran | Expected on startup |

---

## 8. Critical Log Patterns

### Watch For:

| Pattern | Meaning | Action |
|---------|--------|--------|
| `[Queue] Task completed` | Success | None |
| `[Queue] Task failed` | Failure | Check retry count, see section 9 |
| `[Workflow] Completed` | Doc processed | None |
| `[Queue] Downloading conclusion` | Consultation has conclusion | Verify CC downloaded |
| `[Error] Connection refused` | SFC API down | Check network |
| `[Docling] Timeout` | PDF conversion slow | Check docling CLI |
| `Auto-hydrate: restored X documents` | Data restored from git | Verify counts |
| `[Queue] Retry storm detected` | Document retried multiple times | Check data quality |

---

## 9. Failure Mode Monitoring

### Queue Stalls
**Symptom:** Queue depth stays > 100 for > 15 minutes without processing.

**Check:**
```bash
# Watch queue depth over time
watch -n 30 'curl -s http://localhost:3401/queue/status'
```

**Causes:** API downtime, malformed documents, Docling failures.

### PDF Missing Errors
**Symptom:** Document stays in `DISCOVERED` state, logs show "PDF not available" repeated.

**Check:**
```bash
# Find documents stuck in DISCOVERED
curl -s 'http://localhost:3401/workflows?status=DISCOVERED' | jq '.count'
```

**Fix:** Trigger manual download via `/queue/download` or wait for next discovery cycle.

### LowDB Write Failures
**Symptom:** `Upserted document` logs missing, documents not persisting.

**Check:** Monitor `data/db/sfc-db.json` file size. Unusually large files may indicate corruption.

### Retry Storms
**Symptom:** Same document appears in logs with repeated failures.

**Check:**
```bash
# Check documents with high retry counts
curl -s 'http://localhost:3401/workflows?status=RETRYING' | jq '.workflows[] | select(.workflow.retryCount > 3)'
```

---

## 10. Monitoring Checklist (Every 30s)

```bash
#!/bin/bash
# Quick health check
echo "=== Health ==="
curl -s http://localhost:3401/health | jq -c '{status,totalDocuments,activeWorkflows}'

echo "=== Queue ==="
curl -s http://localhost:3401/queue/status | jq -c '{length,running}'

echo "=== Workflow Stats ==="
curl -s http://localhost:3401/workflows/stats | jq -c '.byStatus'

echo "=== Failed Docs (last 5) ==="
curl -s 'http://localhost:3401/workflows?status=FAILED' | jq '.workflows[-5:]'
```

---

## 11. Alerting Response Guide

| Alert | Immediate Action |
|-------|------------------|
| Queue depth > 500 | Check SFC API connectivity, check for malformed jobs |
| Failed jobs > 50/hour | Review recent logs for pattern |
| activeWorkflows = 0 but queue has jobs | Check queue processing, check for deadlocks |
| Discovery errors > 10 in one run | Check API rate limits, check network |
| `data/db/sfc-db.json` growing rapidly | Check for write loop or corruption |

---

## Summary

| Component | Status Check | Frequency |
|-----------|-------------|-----------|
| Server running | `tmux attach -t sfc-fetch` then `curl /health` | Every 30s |
| Queue health | `curl /queue/status` | Every 60s |
| Workflow stats | `curl /workflows/stats` | Every 5min |
| Log errors | `tmux attach -t sfc-fetch` and watch logs | Real-time |
| Disk space | `df -h` | Every 5min |

> **Always use tmux** when running the app — do not run `bun run dev` directly in a terminal you need to close.

---

**Note:** Port is **3401** (not 3000) as configured in `.env`.

---

## Changelog

### v1.1 (2026-04-13)
- Added startup issue patterns (recoverStuckDocuments delays, app.init timeout fix)
- Added note on `activeWorkflows` metric (now correctly shows in-progress docs)
- Added discovery log patterns for PDF fallbacks and recovery runs
- Added Failure Mode Monitoring section (Queue Stalls, PDF Missing, LowDB Write Failures, Retry Storms)
- Added Monitoring Checklist script for 30-second checks
- Added Alerting Response Guide
- Clarified thresholds for RETRYING state documents
- Added startup delay note for discovery scheduler
- Clarified that guidelines use separate scrape mechanism