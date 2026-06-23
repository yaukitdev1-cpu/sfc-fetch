# SFC-Fetch: Hong Kong Securities and Futures Commission Document Pipeline

**Version:** 2.0.0  
**Last Updated:** 2026-06-23  
**Status:** Production

---

## Overview

SFC-Fetch is an automated document processing pipeline that fetches, converts, and archives regulatory documents from the Hong Kong Securities and Futures Commission (SFC) website. It processes four document categories:

- **Circulars** (944 documents): Regulatory notices to licensed corporations
- **Guidelines** (51 documents): Compliance guidelines and codes
- **Consultations** (217 documents): Public consultation papers and conclusions
- **News** (4,237 documents): Press releases and announcements

The system converts PDFs, HTML, and ZIP archives to markdown format, stores metadata in a local database, and provides a REST API for querying the processed documents.

---

## Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Bun | Fast TypeScript/JavaScript execution |
| **Framework** | NestJS 10 | Modular application architecture |
| **HTTP Server** | Fastify | High-performance HTTP server |
| **Database** | LowDB | JSON-based embedded database |
| **Queue** | better-queue v3 | Job queue with persistence |
| **PDF Conversion** | Docling | AI-powered PDF to markdown conversion |
| **Process Manager** | PM2 | Production process management |
| **Version Control** | Git | Data backup and synchronization |

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SFC-Fetch Service                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │  Discovery   │─────▶│    Queue     │─────▶│ Convert  │ │
│  │  Scheduler   │      │  (better-    │      │ (Docling)│ │
│  │  (node-cron) │      │   queue)     │      │          │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│         │                      │                    │        │
│         ▼                      ▼                    ▼        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              LowDB (sfc-db.json)                      │  │
│  │  - Document metadata                                  │  │
│  │  - Workflow state                                     │  │
│  │  - Queue entries                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Content Storage                          │  │
│  │  data/content/circulars/markdown/2026/*.md            │  │
│  │  data/content/guidelines/markdown/*.md                │  │
│  │  data/content/consultations/markdown/*.md             │  │
│  │  data/content/news/markdown/*.md                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────┐ │
│  │  REST API    │      │   Backup     │      │  Static  │ │
│  │  (Fastify)   │      │   (Git)      │      │  Files   │ │
│  │  Port 3401   │      │              │      │ (public) │ │
│  └──────────────┘      └──────────────┘      └──────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   SFC Website    │
                    │ apps.sfc.hk      │
                    └──────────────────┘
```

---

## Data Flow

### Document Processing Pipeline

```
1. DISCOVERY (Scheduled: Daily at 2 AM)
   ├─ Circulars: POST /api/circular/search
   ├─ Guidelines: Web scraping
   ├─ Consultations: API endpoints
   └─ News: API endpoints

2. QUEUE SUBMISSION
   └─ New documents → Queue (action: "discover")

3. DISCOVER JOB
   ├─ Fetch metadata from SFC API
   ├─ Store in LowDB
   ├─ Download raw file (PDF/HTML/ZIP)
   └─ Submit convert job

4. CONVERT JOB
   ├─ Detect file format (magic bytes)
   ├─ Convert to markdown:
   │   ├─ PDF → Docling (with OCR fallback)
   │   ├─ HTML → Turndown
   │   ├─ ZIP → Extract + convert main PDF
   │   └─ OLE2 (.doc) → Antiword
   ├─ Save markdown to data/content/
   └─ Update workflow status

5. COMPLETION
   ├─ Mark workflow as COMPLETED
   ├─ Cleanup raw files (optional)
   └─ Git commit (auto-dehydrate)
```

### Workflow States

```
PENDING → DISCOVERED → DOWNLOADING → PROCESSING → COMPLETED
                                                      │
                                                      ▼
                                                   FAILED
                                                      │
                                                      ▼
                                                  RETRYING
```

---

## Directory Structure

```
sfc-fetch/
├── src/                          # Source code
│   ├── main.ts                   # Application entry point
│   ├── app.module.ts             # Root NestJS module
│   ├── api/                      # REST API controllers
│   │   ├── circulars.controller.ts
│   │   ├── guidelines.controller.ts
│   │   ├── consultations.controller.ts
│   │   ├── news.controller.ts
│   │   ├── queue.controller.ts
│   │   ├── workflows.controller.ts
│   │   ├── health.controller.ts
│   │   └── backup.controller.ts
│   ├── workflows/                # Business logic
│   │   ├── queue.service.ts      # Job queue processing
│   │   ├── discovery-scheduler.service.ts
│   │   └── workflow.service.ts
│   ├── converters/               # Document converters
│   │   ├── docling.service.ts    # PDF → Markdown (Docling)
│   │   ├── zip-bundle.converter.ts
│   │   ├── ole-doc.converter.ts
│   │   ├── format-detector.service.ts
│   │   └── turndown.service.ts
│   ├── sfc-clients/              # SFC API clients
│   │   ├── circular.client.ts
│   │   ├── consultation.client.ts
│   │   ├── news.client.ts
│   │   └── guideline.scraper.ts
│   ├── database/
│   │   └── lowdb.service.ts      # Database operations
│   ├── backup/
│   │   ├── backup.service.ts
│   │   └── git.service.ts
│   └── config/
│       └── configuration.ts
├── data/                         # Data storage
│   ├── db/
│   │   └── sfc-db.json           # LowDB database (34 MB)
│   ├── content/                  # Converted markdown files
│   │   ├── circulars/markdown/2026/
│   │   ├── guidelines/markdown/
│   │   ├── consultations/markdown/
│   │   └── news/markdown/
│   └── raw/                      # Temporary raw files (cleaned up)
│       ├── circulars/
│       ├── guidelines/
│       ├── consultations/
│       └── news/
├── manual-ocr/                   # PDFs needing manual OCR
│   ├── H686.pdf
│   ├── H686.md
│   └── README.md
├── scripts/                      # Maintenance scripts
│   ├── fix-broken-circulars.py
│   ├── push-manual-ocr.sh
│   └── sync-manual-ocr.sh
├── logs/                         # Application logs
│   ├── app.log
│   └── app-error.log
├── public/                       # Static web files (dashboard)
├── docs/                         # Documentation
├── ecosystem.config.js           # PM2 configuration
├── package.json
└── README.md
```

---

## Configuration

### Environment Variables (.env)

```bash
# Server
PORT=3401
NODE_ENV=development

# Data paths
DATA_DIR=./data
DB_PATH=./data/db/sfc-db.json

# Git backup
GIT_REMOTE=origin
GIT_BRANCH=master
AUTO_HYDRATE=true
AUTO_DEHYDRATE=true

# SFC API
SFC_BASE_URL=https://apps.sfc.hk/edistributionWeb
SFC_RATE_LIMIT=2
SFC_RETRY_ATTEMPTS=5

# Discovery scheduler
DISCOVERY_ENABLED=true
DISCOVERY_SCHEDULE_CRON=0 2 * * *
DISCOVERY_CATEGORIES=circulars,consultations,news
DISCOVERY_START_YEAR=1990
DISCOVERY_PAGE_SIZE=100

# Document conversion
DOCLING_PATH=/home/openclaw/.local/bin/docling
DOCLING_TIMEOUT=30000

# Queue
QUEUE_MAX_RETRIES=5
```

### Configuration Hierarchy

1. **Environment variables** (highest priority)
2. **`.env` file**
3. **`configuration.ts` defaults** (lowest priority)

---

## API Reference

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "totalDocuments": 5449,
  "collections": {
    "circulars": { "count": 944, "status": "loaded" },
    "guidelines": { "count": 51, "status": "loaded" },
    "consultations": { "count": 217, "status": "loaded" },
    "news": { "count": 4237, "status": "loaded" }
  },
  "activeWorkflows": 0
}
```

### Queue Status

```bash
GET /queue/status
```

**Response:**
```json
{
  "length": 0,
  "totalPersisted": 89,
  "pendingPersisted": 0,
  "inProgressPersisted": 0,
  "completedPersisted": 89,
  "failedPersisted": 0,
  "running": 0
}
```

### Document Endpoints

#### Circulars

```bash
# Get all circulars
GET /circulars

# Get specific circular
GET /circulars/:refNo

# Trigger discovery
POST /circulars/discover

# Trigger conversion
POST /queue/convert
Body: { "category": "circulars", "refNo": "H686" }
```

#### Guidelines, Consultations, News

Similar endpoints available for each category.

### Workflow Endpoints

```bash
# Get workflow statistics
GET /workflows/stats

# Get queue status
GET /workflows/queue/status
```

---

## Deployment

### Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **PM2** (process manager)
- **Docling** (PDF conversion tool)
- **Git** (for backup/sync)

### Installation

```bash
# Clone repository
git clone https://github.com/yaukitdev1-cpu/sfc-fetch.git
cd sfc-fetch

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Install Docling (PDF converter)
# See: https://github.com/DS4SD/docling
pip install docling
```

### Running with PM2

```bash
# Start service
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs sfc-fetch

# Restart
pm2 restart sfc-fetch

# Stop
pm2 stop sfc-fetch
```

### Running in Development

```bash
# Start with hot reload
bun run dev

# Or without watch
bun run start
```

---

## Maintenance

### Checking Pipeline Health

```bash
# Check service status
pm2 status sfc-fetch

# Check queue status
curl -s http://localhost:3401/queue/status | jq

# Check for failed documents
curl -s http://localhost:3401/workflows/stats | jq

# View recent logs
tail -100 logs/app.log
```

### Fixing Broken Documents

If documents have broken markdown (e.g., scanned PDFs with no text):

```bash
# 1. Identify broken circulars
python3 scripts/fix-broken-circulars.py

# 2. Restart service to re-process
pm2 restart sfc-fetch
```

### Manual OCR Workflow

For PDFs that cannot be automatically converted:

```bash
# 1. Copy PDFs to manual-ocr/ directory
cp data/raw/circulars/H686.pdf manual-ocr/

# 2. Use OCR tool (e.g., Adobe Acrobat, Tesseract)
# 3. Save result as manual-ocr/H686.md

# 4. Sync back to database
bash scripts/sync-manual-ocr.sh
```

### Database Backup

The database is automatically backed up via Git:

```bash
# Manual backup
curl -X POST http://localhost:3401/dehydrate

# Restore from Git
curl -X POST http://localhost:3401/hydrate
```

---

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

**Symptom:** PM2 shows `errored` status

**Solution:**
```bash
# Check error logs
pm2 logs sfc-fetch --err

# Common causes:
# - Port 3401 already in use
# - Missing dependencies (bun install)
# - Invalid .env configuration
```

#### 2. Queue Stuck

**Symptom:** Queue shows `running: 1` but no progress

**Solution:**
```bash
# Restart service
pm2 restart sfc-fetch

# If still stuck, reset queue
pm2 stop sfc-fetch
# Edit data/db/sfc-db.json: set all queue entries to "status": "pending"
pm2 start sfc-fetch
```

#### 3. Docling Conversion Fails

**Symptom:** Documents marked as FAILED with Docling errors

**Solution:**
```bash
# Check Docling installation
which docling
docling --version

# Re-process failed documents
python3 scripts/fix-broken-circulars.py
pm2 restart sfc-fetch
```

#### 4. ENOENT Errors

**Symptom:** `ENOENT: no such file or directory` in logs

**Cause:** Raw PDF was deleted before conversion completed

**Solution:**
```bash
# The system auto-recovery should handle this
# If not, manually re-download and convert
curl -X POST http://localhost:3401/queue/convert \
  -H "Content-Type: application/json" \
  -d '{"category":"circulars","refNo":"H686"}'
```

#### 5. Scanned PDFs with No Text

**Symptom:** Markdown files are very small (< 100 bytes)

**Cause:** PDF contains only scanned images, no text layer

**Solution:**
- If SFC has HTML version: System will auto-fallback (implemented)
- If no HTML: Manual OCR required (see Manual OCR Workflow)

---

## Known Issues & Fixes

### Issue 1: ZIP Files Saved as PDF

**Problem:** Some circulars (H644, H664, H679) are ZIP archives from SFC but were saved with `.pdf` extension.

**Fix:** Added format detection via magic bytes. ZIP files are now properly extracted and the main PDF is converted.

**Status:** ✅ Fixed (2026-06-23)

### Issue 2: Scanned PDFs with HTML Fallback

**Problem:** Scanned PDFs (no text layer) failed conversion, but SFC often has HTML versions available.

**Fix:** Added HTML fallback in conversion pipeline. When PDF conversion produces < 50 chars, system fetches HTML from SFC API.

**Status:** ✅ Fixed (2026-06-23)

### Issue 3: Manual OCR Required

**Problem:** Some scanned PDFs have no HTML fallback on SFC.

**Fix:** Created manual OCR workflow with scripts to push PDFs to remote repo and sync OCR'd markdown back.

**Status:** ✅ Implemented (2026-06-23)

**Documents Requiring Manual OCR:**
- H686 (1 page): Proposed India Taxation Legislation
- H398 (3 pages): Suspicious Transactions Reports Classification
- H480 (3 pages): Streamlining of Authorisation Process
- H692 (6 pages): SFC Disciplinary Fining Guidelines
- H592 (12 pages): FATF Statements on AML/CFT

---

## Performance

### Current Statistics

| Metric | Value |
|--------|-------|
| Total Documents | 5,449 |
| Circulars | 944 |
| Guidelines | 51 |
| Consultations | 217 |
| News | 4,237 |
| Database Size | 34 MB |
| Markdown Files | 5,449 |
| Average Conversion Time | 5-30 seconds |

### Resource Usage

- **Memory:** ~200 MB (idle), ~400 MB (converting)
- **CPU:** Low (mostly I/O bound)
- **Disk:** ~100 MB (database + markdown files)

---

## Development

### Project Structure

- **Modular Architecture:** NestJS modules for separation of concerns
- **Dependency Injection:** All services are injected via NestJS DI
- **Type Safety:** Full TypeScript with strict mode
- **Testing:** Unit tests in `tests/` directory

### Adding New Document Types

1. Create new client in `src/sfc-clients/`
2. Add controller in `src/api/`
3. Update `configuration.ts` categories
4. Update `LowdbService` schema

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Conventional commits

---

## Security

- **No Authentication:** API is open (intended for internal use)
- **Rate Limiting:** SFC API calls limited to 2 req/sec
- **Input Validation:** Zod schemas for API inputs
- **No Secrets in Code:** All credentials in `.env`

---

## License

This project is for internal use. SFC documents are public domain.

---

## Support

For issues or questions:
1. Check this README
2. Review `docs/MONITORING_PLAN.md`
3. Check logs: `logs/app.log`
4. Contact: York (project owner)

---

## Changelog

### 2026-06-23
- ✅ Fixed ZIP file handling (H644, H664, H679)
- ✅ Added HTML fallback for scanned PDFs
- ✅ Implemented manual OCR workflow
- ✅ Converted 5 remaining scanned PDFs using vision AI
- ✅ All 944 circulars now have valid markdown

### 2026-05-23
- Fixed OOM crashes (reduced Docling concurrency)
- Added swap space
- Fixed journald crash

### 2026-04-30
- Initial production deployment
- Implemented discovery scheduler
- Added Git backup integration

---

**End of Documentation**
