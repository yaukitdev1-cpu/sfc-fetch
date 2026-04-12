# SFC-Fetch Dev Mode Monitoring Plan

**Version:** 1.0  
**Date:** 2026-04-10  
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

### Start Command
```bash
cd /home/openclaw/.openclaw/workspace/sfc-fetch
bun run dev
```

### Expected Startup Sequence
1. `[SFC-Fetch] Server running on port 3401`
2. `[SFC-Fetch] Health check: http://localhost:3401/health`
3. If `AUTO_HYDRATE=true` and no data: Git restore logs
4. Queue initialization: `[Queue] Initialized`
5. Auto-discovery scheduler starts (if enabled)

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

---

## 4. Key Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET http://localhost:3401/health` | Service health & doc counts |
| `GET http://localhost:3401/queue/status` | Queue depth & job stats |
| `GET http://localhost:3401/workflows/stats` | Workflow state distribution |
| `GET http://localhost:3401/backup/status` | Git backup status |

---

## 5. Queue & Workflow Monitoring

### Queue Status
```bash
curl -s http://localhost:3401/queue/status
```

### Workflow Stats
```bash
curl -s http://localhost:3401/workflows/stats
```

### Key Metrics to Watch

| Metric | Warning Threshold | Critical Threshold |
|--------|------------------|-------------------|
| Queue depth | > 100 jobs | > 500 jobs |
| Failed jobs | > 10/hour | > 50/hour |
| Avg job duration | > 30s | > 120s |
| Documents in `FAILED` state | > 5% | > 20% |

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

**Note:** Guidelines are scraped from the SFC main website, not discovered via API.

---

## 7. Auto-Discovery Schedule

- **Cron:** `0 2 * * *` → Runs daily at 2:00 AM

### Monitor Discovery Jobs
```bash
curl -s http://localhost:3401/workflows?status=PENDING | jq '.count'
```

---

## 8. Critical Log Patterns

### Watch For:

| Pattern | Meaning | Action |
|---------|---------|--------|
| `[Queue] Task completed` | Success | None |
| `[Queue] Task failed` | Failure | Check retry count |
| `[Workflow] Completed` | Doc processed | None |
| `[Queue] Downloading conclusion` | Consultation has conclusion | Verify CC downloaded |
| `[Error] Connection refused` | SFC API down | Check network |
| `[Docling] Timeout` | PDF conversion slow | Check docling CLI |
| `Auto-hydrate: restored X documents` | Data restored from git | Verify counts |

---

## 9. tmux Session Setup (Optional)

### Start with tmux for persistence
```bash
./start-tmux.sh
```

### Monitor Windows
- **Window 1:** `bun run dev` (main server logs)
- **Window 2:** Health check script (`./scripts/health-check.sh`)
- **Window 3:** Manual curl commands for debugging

---

## 10. Monitoring Checklist (Every 30s)

```bash
#!/bin/bash
# Quick health check
curl -s http://localhost:3401/health | jq -c '{status,totalDocuments}'
curl -s http://localhost:3401/queue/status | jq -c '{pending,processing,completed,failed}'
curl -s http://localhost:3401/workflows/stats | jq -c '.byStatus'
```

---

## Summary

| Component | Status Check | Frequency |
|-----------|-------------|-----------|
| Server running | `curl /health` | Every 30s |
| Queue health | `curl /queue/status` | Every 60s |
| Workflow stats | `curl /workflows/stats` | Every 5min |
| Log errors | `tail -f` or `grep ERROR` | Real-time |
| Disk space | `df -h` | Every 5min |

---

**Note:** Port is **3401** (not 3000) as configured in `.env`.
