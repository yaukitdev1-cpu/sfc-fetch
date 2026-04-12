# SFC Fetch Microservice

Document-oriented workflow service with Git-backed persistence for SFC (Securities and Futures Commission of Hong Kong) documents.

**Tech Stack:** NestJS + Bun + LowDB + TypeScript

## Features

- **Document-Centric Model**: Each document (identified by refNo) is stored as a complete record containing all metadata, workflow state, and processing history
- **Category-Specific Collections**: Guidelines, Circulars, Consultations, and News
- **Git Backup Strategy**: Compressed archives committed to GitHub for backup and history
- **Markdown-Only Storage**: Only processed markdown is stored
- **Workflow State Machine**: Full lifecycle management with retry and re-run capabilities
- **Queue-Based Processing**: Async job processing with better-queue
- **Multi-Format Conversion**: Docling (PDF → Markdown) and Turndown (HTML → Markdown)

## Quick Start

### Prerequisites

- **Bun** runtime (install: `curl -fsSL https://bun.sh/install | bash`)
- **Docling CLI** for PDF conversion (optional, falls back to Turndown)
- Git repository configured for backup (optional)

### Installation

```bash
cd sfc-fetch
bun install
```

### Configuration

Create a `.env` file:

```env
# Server
PORT=3000
NODE_ENV=development

# Directories
DATA_DIR=./data
CONTENT_DIR=./data/content
ARCHIVE_DIR=./data/archive
DB_PATH=./data/db/sfc-db.json

# Git Backup
GIT_REMOTE=origin
GIT_BRANCH=main
GIT_REPO_URL=https://github.com/your-org/sfc-backup.git
GIT_PAT=your_github_pat
GIT_USER_NAME=SFC Bot
GIT_USER_EMAIL=bot@example.com

# Auto-Backup
AUTO_HYDRATE=true
AUTO_DEHYDRATE=true

# Docling (PDF → Markdown)
DOCLING_PATH=/usr/local/bin/docling
DOCLING_TIMEOUT=30000

# Rate Limiting
SFC_BASE_URL=https://apps.sfc.hk/edistributionWeb
SFC_RATE_LIMIT=2
SFC_RETRY_ATTEMPTS=5

# Queue
QUEUE_PATH=./data/db/sfc-db.json
QUEUE_MAX_RETRIES=5

# Backup Retention
BACKUP_RETENTION=10
```

### Running the Service

```bash
# Start the service (auto-hydrates if no local data)
bun run src/main.ts

# Or run in development mode with hot reload
bun --watch run src/main.ts

# Build for production
bun run build
```

### How to Trigger Workflows

The service supports multiple mechanisms to trigger document processing workflows, from individual document operations to large-scale batch processing.

### Auto-Hydrate on Startup

If `AUTO_HYDRATE=true` and no local data exists, the service automatically restores from git backup on startup:

```bash
# Service auto-hydrates if:
# - DATA_DIR has no existing data
# - AUTO_HYDRATE=true
# - GIT_REPO_URL is configured
bun run src/main.ts
```

### Queue Endpoints

Queue jobs for asynchronous processing with built-in retry and concurrency control:

```bash
# Queue a discover job
curl -X POST http://localhost:3000/queue/discover \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "26EC6"}'

# Queue a download job
curl -X POST http://localhost:3000/queue/download \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "26EC6"}'

# Queue a convert job
curl -X POST http://localhost:3000/queue/convert \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "26EC6"}'

# Get queue statistics
curl http://localhost:3000/queue/status
```

Queue configuration (from environment):
- `QUEUE_MAX_RETRIES=5` - Maximum retry attempts per job
- `QUEUE_CONCURRENCY=4` - Concurrent jobs (default: 4)
- Jobs use exponential backoff on failure

### Document Discovery Endpoints

```bash
# Discover a single document
curl -X POST http://localhost:3000/circulars/26EC6/discover \
  -H "Content-Type: application/json"

# Batch discover documents in a category
curl -X POST http://localhost:3000/circulars/discover-batch \
  -H "Content-Type: application/json" \
  -d '{"filters": {"year": 2024, "status": "PENDING"}}'
```

### Batch Operations

```bash
# Batch download all documents in a category
curl -X POST http://localhost:3000/circulars/batch-download \
  -H "Content-Type: application/json" \
  -d '{"filters": {"year": 2024}}'

# Batch download with limit
curl -X POST http://localhost:3000/circulars/batch-download \
  -H "Content-Type: application/json" \
  -d '{"filters": {"year": 2024}, "limit": 50}'
```

### Single Document Operations

```bash
# Download a single document
curl -X POST http://localhost:3000/circulars/26EC6/download \
  -H "Content-Type: application/json"

# Retry from failure (resume workflow at failed step)
curl -X POST http://localhost:3000/circulars/26EC6/workflow/retry \
  -H "Content-Type: application/json" \
  -d '{"reason": "network_timeout_recovery"}'

# Re-run from scratch (full workflow reset)
curl -X POST http://localhost:3000/circulars/26EC6/workflow/re-run \
  -H "Content-Type: application/json" \
  -d '{"reason": "markdown_converter_bug_fix", "preservePrevious": true}'
```

### Job Processing Flow

Documents progress through these sequential steps:

```
discover → download → convert → store
```

| Step | Description |
|------|-------------|
| `discover` | Locates document in SFC source system |
| `download` | Fetches raw PDF/HTML content |
| `convert` | Transforms to Markdown (Docling or Turndown) |
| `store` | Saves markdown to content directory |

Each step can succeed, fail, or be skipped. Failed steps trigger automatic retry with backoff. The workflow state machine tracks all transitions.

### Manual Backup Operations

```bash
# Create backup (dehydrate) - archives all data to git
curl -X POST http://localhost:3000/dehydrate

# Restore from backup (hydrate)
curl -X POST http://localhost:3000/hydrate

# Check backup status
curl http://localhost:3000/backup/status
```

## API Examples

```bash
# Health check
curl http://localhost:3000/health

# Get document
curl http://localhost:3000/circulars/26EC6

# Get document content (markdown)
curl http://localhost:3000/circulars/26EC6/content

# Get workflow status
curl http://localhost:3000/circulars/26EC6/workflow/status

# Get workflow steps
curl http://localhost:3000/circulars/26EC6/workflow/steps

# Get processing history
curl http://localhost:3000/circulars/26EC6/history

# List documents with filters
curl http://localhost:3000/circulars?status=COMPLETED&year=2024

# Discover a single document
curl -X POST http://localhost:3000/circulars/26EC6/discover \
  -H "Content-Type: application/json"

# Download a single document
curl -X POST http://localhost:3000/circulars/26EC6/download \
  -H "Content-Type: application/json"

# Batch discover
curl -X POST http://localhost:3000/circulars/discover-batch \
  -H "Content-Type: application/json" \
  -d '{"filters": {"year": 2024}}'

# Batch download
curl -X POST http://localhost:3000/circulars/batch-download \
  -H "Content-Type: application/json" \
  -d '{"filters": {"year": 2024}}'

# Queue a discover job
curl -X POST http://localhost:3000/queue/discover \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "26EC6"}'

# Queue a download job
curl -X POST http://localhost:3000/queue/download \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "26EC6"}'

# Queue a convert job
curl -X POST http://localhost:3000/queue/convert \
  -H "Content-Type: application/json" \
  -d '{"category": "circulars", "refNo": "26EC6"}'

# Get queue statistics
curl http://localhost:3000/queue/status

# Health check
curl http://localhost:3000/health

# Get backup status
curl http://localhost:3000/backup/status
```

## API Endpoints

### Queue Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/queue/discover` | Queue a discover job |
| POST | `/queue/download` | Queue a download job |
| POST | `/queue/convert` | Queue a convert job |
| GET | `/queue/status` | Get queue statistics |

### Document Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:category/:refNo` | Get document by refNo |
| GET | `/:category/:refNo/content` | Get markdown content |
| GET | `/:category/:refNo/content?appendix=0` | Get specific appendix content |
| POST | `/:category/:refNo/discover` | Discover a document |
| POST | `/:category/:refNo/download` | Download a document |
| GET | `/:category/:refNo/workflow/status` | Get workflow status |
| GET | `/:category/:refNo/workflow/steps` | Get sub-workflow steps |
| POST | `/:category/:refNo/workflow/retry` | Retry from failure |
| POST | `/:category/:refNo/workflow/re-run` | Re-run from scratch |
| GET | `/:category/:refNo/history` | Get processing history |
| GET | `/:category` | List documents with filters |
| POST | `/:category/discover-batch` | Batch discover documents |
| POST | `/:category/batch-download` | Batch download documents |

**Categories:** `circulars`, `guidelines`, `consultations`, `news`

**Query Filters:** `status`, `year`

### Backup Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/dehydrate` | Create backup and commit to git |
| POST | `/hydrate` | Restore from git backup |
| GET | `/backup/status` | Get backup status |

### Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## Workflow States

| State | Description |
|-------|-------------|
| `PENDING` | Not yet discovered or re-run reset |
| `DISCOVERED` | Found in source, ready to download |
| `DOWNLOADING` | Fetching raw content from SFC |
| `PROCESSING` | Converting to markdown |
| `COMPLETED` | All done, markdown available |
| `FAILED` | Error during download or processing |
| `RETRYING` | Attempting recovery from failure |
| `RE_RUNNING` | Complete reprocessing requested |
| `STALE` | Source changed since last processing |

## Sub-Workflow Steps

| Step | Status Options |
|------|----------------|
| `discover` | PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |
| `download` | PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |
| `convert` | PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |
| `store` | PENDING, RUNNING, COMPLETED, FAILED, SKIPPED |

## Categories

| Category | Document Count | Reference Format | Notes |
|----------|---------------|-------------------|-------|
| circulars | ~700 | YYEC## (e.g., 26EC6) | PDF for all years (2000+), HTML for 2012+ |
| guidelines | ~50 | UUID | PDF scraped from main website |
| consultations | ~217 | YYCP## (paper), YYCC## (conclusion) | CP + optional CC when concluded |
| news | ~5,205 | YYPR## | HTML only |

### Consultations

Consultations have a two-document lifecycle:
1. **Consultation Paper (CP)** - The initial consultation document
2. **Conclusion Paper (CC)** - Published when the consultation concludes (85% of consultations have conclusions)

When a consultation has a conclusion (`hasConclusion: true`), both the consultation paper and the conclusion paper are downloaded automatically.

## Architecture

```
sfc-fetch/
├── src/
│   ├── main.ts              # NestJS bootstrap
│   ├── app.module.ts        # Root module
│   ├── config/
│   │   └── configuration.ts  # Config schema (TypeScript)
│   ├── api/                 # Controllers (routes)
│   │   ├── api.module.ts
│   │   ├── circulars.controller.ts
│   │   ├── consultations.controller.ts
│   │   ├── guidelines.controller.ts
│   │   ├── news.controller.ts
│   │   ├── workflows.controller.ts
│   │   └── health.controller.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   └── lowdb.service.ts  # LowDB service (JSON database)
│   ├── workflows/
│   │   ├── workflow.module.ts
│   │   ├── workflow.service.ts  # Workflow state machine
│   │   └── queue.service.ts     # Job queue (better-queue)
│   ├── backup/
│   │   ├── backup.module.ts
│   │   ├── backup.service.ts    # Backup orchestration
│   │   └── git.service.ts       # Git operations
│   ├── converters/
│   │   ├── converters.module.ts
│   │   ├── docling.service.ts   # PDF → Markdown (Docling CLI)
│   │   └── turndown.service.ts  # HTML → Markdown (Turndown)
│   ├── sfc-clients/
│   │   ├── sfc-clients.module.ts
│   │   ├── circular.client.ts
│   │   ├── consultation.client.ts
│   │   ├── guideline.scraper.ts
│   │   └── news.client.ts
│   ├── services/
│   │   └── content.service.ts   # Content management
│   ├── common/
│   │   └── ...
│   └── types.d.ts             # TypeScript definitions
├── data/                     # Runtime data (created at startup)
│   ├── db/
│   │   └── sfc-db.json       # LowDB database
│   ├── content/              # Markdown files
│   │   ├── circulars/
│   │   ├── guidelines/
│   │   ├── consultations/
│   │   └── news/
│   ├── archive/              # Archived re-runs
│   └── backups/              # Backup metadata
├── tests/                    # Tests (Bun test)
├── package.json
├── tsconfig.json             # TypeScript config
└── README.md
```

## Tech Stack Details

### Core Framework
- **NestJS**: Progressive Node.js framework for building efficient, scalable applications
- **Fastify**: High-performance HTTP server (via @nestjs/platform-fastify)

### Runtime & Language
- **Bun**: Fast JavaScript runtime, package manager, and test runner
- **TypeScript**: Type-safe development with full ES2022 support

### Database & Persistence
- **LowDB v7**: Small JSON database for Node.js, browser, and Deno
- **AdmZip**: ZIP file manipulation for backup archives
- **simple-git**: Git operations for backup/restore

### Document Processing
- **Docling**: PDF to Markdown conversion (Python CLI)
- **Turndown**: HTML to Markdown conversion (fallback)
- **Cheerio**: Server-side jQuery for HTML parsing

### Workflow & Queue
- **better-queue**: Persistent, prioritized job queue with retry/backoff
- **p-throttle**: Rate limiting for SFC API calls

### Utilities
- **date-fns**: Date manipulation and formatting
- **zod**: Schema validation
- **uuid**: Unique ID generation
- **fs-extra**: Enhanced file system operations

## Development

```bash
# Run tests
bun test

# Development with hot reload
bun --watch run src/main.ts

# Build for production
bun run build

# Type checking
tsc --noEmit
```

## Migration Notes

This service was migrated from **Node.js + Express + SQLite** to **Bun + NestJS + LowDB** in recent sessions:

- **Runtime**: Node.js → Bun
- **Framework**: Express → NestJS
- **Database**: SQLite → LowDB (JSON)
- **Language**: JavaScript → TypeScript
- **HTTP Server**: Express → Fastify
- **Queue Processing**: Manual → better-queue
- **PDF Conversion**: Native → Docling CLI

The sfc-research design docs reflect the old architecture. See current source code for accurate implementation details.
