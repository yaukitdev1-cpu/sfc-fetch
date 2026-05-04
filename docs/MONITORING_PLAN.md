# SFC-Fetch Monitoring Plan

**Version:** 1.4
**Date:** 2026-04-30
**Port:** 3401 (from `.env`)
**Environment:** Development

---

## 1. Configuration Overview

| Setting | Default | Actual (`.env`) | Source |
|---------|---------|----------------|--------|
| **Port** | `3000` | `3401` | `.env` |
| Node Env | `development` | `development` | `.env` |
| Data Dir | `./data` | `./data` | `.env` |
| DB Path | `./data/db/sfc-db.json` | `./data/db/sfc-db.json` | `.env` |
| Git Branch | `main` | `master` | `.env` |
| Auto-Hydrate | `true` | `true` | `.env` |
| Auto-Dehydrate | `true` | `true` | `.env` |
| Discovery | Enabled | Enabled (cron: `0 2 * * *`) | `.env` |
| SFC Base URL | `https://apps.sfc.hk/edistributionWeb` | `https://apps.sfc.hk/edistributionWeb` | `.env` |
| SFC Rate Limit | 2 req/s | 2 req/s | `.env` |
| Queue Max Retries | 5 | 5 | `.env` |
| Docling Path | `/usr/local/bin/docling` | `/home/openclaw/.local/bin/docling` | `.env` override |
| Docling Timeout | 30000ms | 30000ms | `.env` |

> `.env` is the source of truth — this table is a summary. Always cross-check against `.env` for production.

---

## 2. Service Startup Monitoring

### Recommended: Use tmux

Always run the app inside tmux so logs persist and you can reattach to monitor:

```bash
# Create a new tmux session
tmux new -s sfc-fetch

# Start the app
cd ~/sfc-fetch
bun run dev

# Detach with Ctrl+b, then d
# Reattach later with
tmux attach -t sfc-fetch
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
| `app.init()` timeout | Startup timeout | Fixed in v1.0+ |

---

## 3. Health Endpoint Monitoring

### Command
```bash
curl -s http://localhost:3401/health | jq .
```

### Expected Response (development)
```json
{
  "status": "healthy",
  "totalDocuments": 5401,
  "lastBackup": "2026-04-29T...",
  "collections": {
    "circulars": { "count": 1234, "status": "loaded" },
    "guidelines": { "count": 567, "status": "loaded" },
    "consultations": { "count": 890, "status": "loaded" },
    "news": { "count": 2710, "status": "loaded" }
  },
  "activeWorkflows": 0
}
```

### About `activeWorkflows`
> `activeWorkflows` reflects `queueService.getStats().running` — the number of jobs currently being tracked via a latency map (jobs that have started but not yet completed/failed). This is the count of in-flight work, not all non-terminal documents.

### Production Response
In non-development `NODE_ENV`, `collections` and `activeWorkflows` are redacted for security.

---

## 4. Key Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET http://localhost:3401/health` | Service health & doc counts |
| `GET http://localhost:3401/queue/status` | Queue depth, running jobs, job counters |
| `GET http://localhost:3401/workflows/stats` | Workflow state distribution |
| `GET http://localhost:3401/workflows?status=FAILED` | Documents in failed state |
| `GET http://localhost:3401/backup/status` | Git backup status |
| `POST http://localhost:3401/queue/discover` | Manually queue a discover job |
| `POST http://localhost:3401/queue/download` | Manually queue a download job |
| `POST http://localhost:3401/queue/convert` | Manually queue a convert job |
| `POST http://localhost:3401/{category}/{refNo}/workflow/retry` | Retry a specific document |

---

## 5. Queue & Workflow Monitoring

### Queue Status
```bash
curl -s http://localhost:3401/queue/status
```

### Response Fields

| Field | Description |
|-------|-------------|
| `length` | Pending jobs in the in-memory queue |
| `running` | Jobs currently executing (tracked via latency map) |
| `totalPersisted` | All jobs ever persisted to LowDB |
| `pendingPersisted` | Persisted jobs with `status=pending` |
| `inProgressPersisted` | Persisted jobs with `status=in_progress` |
| `completedPersisted` | Persisted jobs with `status=completed` |
| `failedPersisted` | Persisted jobs with `status=failed` |

### Workflow Stats
```bash
curl -s http://localhost:3401/workflows/stats
```

Returns `{ total, byCategory, byStatus }`.

### Key Metrics to Watch

| Metric | Warning Threshold | Critical Threshold | Notes |
|--------|------------------|-------------------|-------|
| Queue depth (`length`) | > 100 jobs | > 500 jobs | May indicate downstream API issues |
| Running jobs (`running`) | > 10 | > 20 | Sustained parallel work |
| Failed persisted jobs | > 10/hour | > 50/hour | Check logs for recurring errors |
| Documents in `RETRYING` state | > 5 | > 20 | Retry storm may indicate systemic issue |
| Documents with high retry count | > 3 retries | > 5 retries | Check for data quality issues |

### Workflow States

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

| Setting | Default | Actual (.env) | Description |
|---------|---------|---------------|-------------|
| `DISCOVERY_ENABLED` | `true` | `true` | Enable/disable auto-discovery |
| `DISCOVERY_SCHEDULE_CRON` | `0 2 * * *` | `0 2 * * *` | Cron schedule (daily at 2 AM) |
| `DISCOVERY_CATEGORIES` | `circulars,consultations,news` | `circulars,guidelines,consultations,news` | Categories to discover |
| `DISCOVERY_START_YEAR` | `2000` | `1990` | Earliest year for circulars |
| `DISCOVERY_PAGE_SIZE` | `100` | `100` | Items per page |
| `DISCOVERY_REQUEST_INTERVAL_MS` | `500` | `500` | Delay between API calls |
| Startup delay | 5 minutes | 5 minutes | Discovery disabled first 5 min to let queue process |

> **Note:** The `discoveryStartYear` default in code is `2000`, but `.env` overrides it to `1990`. The service reads `.env` so the effective value is `1990`.

---

## 7. Auto-Discovery Schedule

- **Cron:** `0 2 * * *` → Runs daily at 2:00 AM
- **Startup:** Delayed 5 minutes after server start

### Discovery Categories (in order)

1. **Circulars** — iterates backward year-by-year from current year to `DISCOVERY_START_YEAR` (1990), stopping when a year returns 0 items
2. **Guidelines** — scrapes from SFC website (separate scrape mechanism, not paginated API)
3. **Consultations** — fetches all-at-once from API
4. **News** — fetches all-at-once from API

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
| `[Queue] Auto-submitting convert job for ${category}/${refNo} after direct PDF fetch` | Circular processed inline in discover | Normal for circulars |

---

## 8. Critical Log Patterns

| Pattern | Meaning | Action |
|---------|--------|--------|
| `[Queue] Task completed` | Success | None |
| `[Queue] Task failed` | Failure | Check retry count, see section 9 |
| `[Workflow] Completed` | Doc processed | None |
| `[Queue] Downloading conclusion` | Consultation has conclusion | Verify CC downloaded |
| `[Error] Connection refused` | SFC API down | Check network |
| `[Docling] Timeout` | PDF conversion slow | Check docling CLI |
| `Auto-hydrate: restored X documents` | Data restored from git | Verify counts |
| `ENOENT: no such file or directory` | Raw file missing | Retry document after restore |

---

## 9. Failure Mode Monitoring

### Queue Stalls
**Symptom:** Queue `length` stays > 100 for > 15 minutes without processing.

**Check:**
```bash
watch -n 30 'curl -s http://localhost:3401/queue/status | jq "{length, running}"'
```

**Causes:** API downtime, malformed documents, Docling failures.

### PDF Missing Errors
**Symptom:** Document stays in `DISCOVERED` state, logs show "PDF not available" repeated.

**Check:**
```bash
curl -s 'http://localhost:3401/workflows?status=DISCOVERED' | jq '.count'
```

**Fix:**
```bash
curl -X POST http://localhost:3401/queue/download \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "H123"}'
```

### LowDB Write Failures
**Symptom:** `Upserted document` logs missing, documents not persisting.

**Check:** Monitor `data/db/sfc-db.json` file size. Unusually large files may indicate corruption.

### Retry Storms
**Symptom:** Same document appears in logs with repeated failures.

**Check:**
```bash
# Documents in RETRYING state
curl -s 'http://localhost:3401/workflows?status=RETRYING' | jq '.count'

# High retry counts
curl -s 'http://localhost:3401/workflows?status=FAILED' | jq \
  '.workflows[] | select(.workflow.retryCount > 3) | {refNo: ._id, category, retryCount: .workflow.retryCount}'
```

**Fix:** Retry individual documents:
```bash
curl -X POST "http://localhost:3401/circulars/H123/workflow/retry" \
  -H "Content-Type: application/json" \
  -d '{"reason": "manual retry after fix"}'
```

---

## 10. Manual Intervention Commands

### Retry a failed document
```bash
curl -X POST "http://localhost:3401/{category}/{refNo}/workflow/retry" \
  -H "Content-Type: application/json" \
  -d '{"reason": "brief reason"}'
```
Categories: `circulars`, `consultations`, `guidelines`, `news`

### Manually queue a step
```bash
# Discover
curl -X POST http://localhost:3401/queue/discover \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "H123"}'

# Download
curl -X POST http://localhost:3401/queue/download \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "H123"}'

# Convert
curl -X POST http://localhost:3401/queue/convert \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "H123"}'
```
> All three require the document to already exist in the database.

### Check specific workflow state
```bash
curl -s 'http://localhost:3401/workflows?status=FAILED' | jq '.workflows[-10:]'
curl -s 'http://localhost:3401/workflows?status=RETRYING' | jq '.count'
curl -s 'http://localhost:3401/workflows?status=COMPLETED' | jq '.count'
```

---

## 11. Monitoring Checklist

```bash
#!/bin/bash
echo "=== Health ==="
curl -s http://localhost:3401/health | jq -c '{status, totalDocuments}'

echo "=== Queue ==="
curl -s http://localhost:3401/queue/status | jq -c '{length, running, pendingPersisted, failedPersisted}'

echo "=== Workflow Stats ==="
curl -s http://localhost:3401/workflows/stats | jq -c '.byStatus'

echo "=== Failed Docs (last 5) ==="
curl -s 'http://localhost:3401/workflows?status=FAILED' | jq '.workflows[-5:] | map({refNo: ._id, category, error: .workflow.error})'
```

---

## 12. Alerting Response Guide

| Alert | Immediate Action |
|-------|------------------|
| Queue `length` > 500 | Check SFC API connectivity, check for malformed jobs |
| Failed persisted > 50 | Review recent logs for pattern |
| `running` = 0 but `pendingPersisted` > 0 | Check queue processing, check for deadlocks |
| Discovery errors > 10 in one run | Check API rate limits, check network |
| `data/db/sfc-db.json` growing rapidly | Check for write loop or corruption |
| ENOENT errors in logs | Files restored from git — retry affected docs |

---

## 13. Summary

| Component | Status Check | Frequency |
|-----------|-------------|-----------|
| Server running | `tmux attach -t sfc-fetch` then `curl /health` | Every 30s |
| Queue health | `curl /queue/status` | Every 60s |
| Workflow stats | `curl /workflows/stats` | Every 5min |
| Log errors | `tmux attach -t sfc-fetch` and watch logs | Real-time |
| Disk space | `df -h` | Every 5min |

> **Always use tmux** when running the app — do not run `bun run dev` directly in a terminal you need to close.

---

## 14. Known Failure Patterns

### FAILED documents with error=null

**Symptom:** Documents show `status: FAILED` but `error: null` and `currentStep: discover`.

**Root Cause:** When `getCircular()` (or similar SFC API) fails BEFORE `startStep()` is called in discoverResource:
1. The document was never created/upserted in the current attempt
2. `failStep()` is called but finds no document (or finds one without the discover step)
3. `failStep()` throws "Document not found" before properly recording the error
4. The workflow status is set to FAILED but the error is never recorded

**Fix:** Modified `discoverResource()` catch block to create a minimal document with FAILED status and error info BEFORE calling `failStep()` if the document doesn't exist. Also modified `failStep()` to:
- Create a minimal document if none exists
- Add a discover step with error if the step doesn't exist
- Always set `doc.workflow.error` for visibility

### DOWNLOADING documents with currentStep=discover (inconsistent state)

**Symptom:** Documents show `status: DOWNLOADING` but `currentStep: discover`.

**Root Cause:** For circulars, after discover succeeds, the PDF fetch might fail. The discover step was already marked COMPLETED, but the workflow status was set to DOWNLOADING. When failStep is called, it finds the step but the error isn't properly recorded.

**Fix:** Retry the document to re-run the discover phase with proper error recording.

### Documents stuck in DISCOVERED state

**Symptom:** Documents remain in `DISCOVERED` state and don't progress.

**Fix:**
```bash
curl -X POST http://localhost:3401/queue/download \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "XX123"}'
```

### Suspiciously Small Markdown (Circulars)

**Symptom:** Circular documents fail with "Refusing to write suspiciously small markdown (N bytes)" where N is 1–84 bytes.

**Root Cause:** PDF is image-based (scanned document) with no extractable text. The PDF contains only images (verified via `pdfimages -list` showing RGB images and CCITT stencils).

**Affected:** Circulars with refNos like 24EC53, 22EC3, H692, H357, etc.

**Fix:** These documents cannot be processed with the current text-extraction pipeline. Options:
1. Implement OCR (Optical Character Recognition) to handle image-based PDFs
2. Mark as SUPPRESSED with reason `image_only_pdf`
3. Accept that some legacy circulars cannot be digitized

**Discovery Date:** 2026-04-23 — 21 such failures found in investigation.

### Suspiciously Small Markdown (0 bytes) — Consultations

**Symptom:** Consultation documents fail with "Refusing to write suspiciously small markdown (0 bytes)".

**Root Cause:** The HTML source file contains only empty tags (`<p></p>`). The original content is genuinely empty or was not captured.

**Affected:** Consultations from 1990s–2000s era (90CP1, 91CP1, 92CP1, 00CP1, 00CP2, etc.)

**Fix:** These documents have no meaningful content to extract. Options:
1. Mark as SUPPRESSED with reason `empty_source_content`
2. Investigate if HTML was supposed to be populated from a different source

**Discovery Date:** 2026-04-23 — 26 such failures found in investigation.

### ENOENT Errors on Restored Files

**Symptom:** Documents fail with "ENOENT: no such file or directory, open 'data/raw/category/refNo.html'" even though files exist.

**Root Cause:** Files were genuinely missing at processing time but were later restored (e.g., via git checkout). The workflow status was not updated after restoration.

**Affected:** 62 news documents, 16 consultation documents

**Fix:** After files are restored, retry the documents:
```bash
curl -X POST "http://localhost:3401/{category}/{refNo}/workflow/retry" \
  -H "Content-Type: application/json" \
  -d '{"reason": "files restored after outage"}'
```

**Resolution:** 78 such documents were successfully retried on 2026-04-23.

### `activeWorkflows` Always Returns 0 ~~(Known Bug)~~ ✅ FIXED

> **Fixed in commit a58a7358 (2026-04-30)** — previously hardcoded to 0, now returns `queueService.getStats().running`.

---

## Changelog

### v1.4 (2026-04-30)
- **Fixed path**: Startup path updated from `/home/openclaw/.openclaw/workspace/sfc-fetch` → `~/sfc-fetch`
- **Fixed `activeWorkflows` bug**: Now returns `queueService.getStats().running` (was hardcoded to 0) — commit a58a7358
- **Added Section 4**: Documented `/queue/status` endpoint and all manual intervention endpoints
- **Fixed Section 5**: Queue status returns 7 fields, not 2; updated table
- **Fixed Section 7**: Added guidelines discovery to category list; corrected circulars iteration logic
- **Fixed Section 9**: Corrected download curl from path-based to JSON body
- **Added Section 10**: Manual Intervention Commands — all retry/queue/convert operations
- **Deduplicated changelog**: Removed duplicate v1.1 entry
- **Added `activeWorkflows` bug fix**: Known failure pattern documented as fixed
- **Added SFC_BASE_URL / SFC_RATE_LIMIT**: Added to config overview
- **Added discovery order**: Documented the 4-category discovery sequence
- **Fixed config table**: Now shows Default + Actual columns; port defaults 3000 (not 3401), gitBranch defaults `main` (not `master`), doclingPath defaults `/usr/local/bin/docling` (not the `.env` value)

### v1.3 (2026-04-23)
- Added "Suspiciously Small Markdown (Circulars)" failure pattern — image-based PDFs cannot be text-extracted
- Added "Suspiciously Small Markdown (0 bytes) — Consultations" — empty HTML source content
- Added "ENOENT Errors on Restored Files" — files missing at processing time but later restored
- Documented investigation findings: 125 failures → 78 retried (fixable) + 47 require design decision

### v1.2 (2026-04-14)
- Fixed error recording bug in discoverResource catch block
- Modified failStep() to always set doc.workflow.error and handle missing document/step gracefully
- Fixed retryDocument() to initialize doc.history if it doesn't exist
- Fixed health.controller.ts to await async getStatus() call

### v1.1 (2026-04-13)
- Added startup issue patterns (recoverStuckDocuments delays, app.init timeout fix)
- Added note on `activeWorkflows` metric
- Added discovery log patterns for PDF fallbacks and recovery runs
- Added Failure Mode Monitoring section (Queue Stalls, PDF Missing, LowDB Write Failures, Retry Storms)
- Added Monitoring Checklist script for 30-second checks
- Added Alerting Response Guide
- Clarified thresholds for RETRYING state documents
- Added startup delay note for discovery scheduler
- Clarified that guidelines use separate scrape mechanism

### v1.0
- Initial monitoring plan
