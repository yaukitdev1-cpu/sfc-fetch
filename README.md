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

### API Examples

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

# Retry failed document
curl -X POST http://localhost:3000/circulars/26EC6/workflow/retry \
  -H "Content-Type: application/json" \
  -d '{"reason": "network_timeout_recovery"}'

# Re-run completed document
curl -X POST http://localhost:3000/circulars/26EC6/workflow/re-run \
  -H "Content-Type: application/json" \
  -d '{"reason": "markdown_converter_bug_fix", "preservePrevious": true}'

# Manual dehydration (backup)
curl -X POST http://localhost:3000/dehydrate

# Manual hydration (restore)
curl -X POST http://localhost:3000/hydrate

# Get backup status
curl http://localhost:3000/backup/status
```

## API Endpoints

### Document Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:category/:refNo` | Get document by refNo |
| GET | `/:category/:refNo/content` | Get markdown content |
| GET | `/:category/:refNo/content?appendix=0` | Get specific appendix content |
| GET | `/:category/:refNo/workflow/status` | Get workflow status |
| GET | `/:category/:refNo/workflow/steps` | Get sub-workflow steps |
| POST | `/:category/:refNo/workflow/retry` | Retry from failure |
| POST | `/:category/:refNo/workflow/re-run` | Re-run from scratch |
| GET | `/:category/:refNo/history` | Get processing history |
| GET | `/:category` | List documents with filters |

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

| Category | Document Count | Reference Format |
|----------|---------------|------------------|
| circulars | ~700 | YYEC## (e.g., 26EC6) |
| guidelines | ~50 | UUID |
| consultations | ~217 | YYCP## / YYCC## |
| news | ~5,205 | YYPR## |

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
