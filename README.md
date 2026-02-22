# SFC Fetch Microservice

Document-oriented workflow service with Git-backed persistence for SFC (Securities and Futures Commission of Hong Kong) documents.

## Features

- **Document-Centric Model**: Each document (identified by refNo) is stored as a complete record containing all metadata, workflow state, and processing history
- **Category-Specific Collections**: Guidelines, Circulars, Consultations, and News
- **Git Backup Strategy**: Compressed archives committed to GitHub for backup and history
- **Markdown-Only Storage**: Only processed markdown is stored
- **Workflow State Machine**: Full lifecycle management with retry and re-run capabilities

## Quick Start

### Prerequisites

- Node.js 18+
- Git repository configured for backup (optional)

### Installation

```bash
cd sfc-fetch
npm install
```

### Configuration

Create a `.env` file:

```env
PORT=3000
DATA_DIR=./data
CONTENT_DIR=./data/content
ARCHIVE_DIR=./data/archive
DB_PATH=./data/db/sfc.db
GIT_REMOTE=origin
GIT_BRANCH=master
AUTO_HYDRATE=true
AUTO_DEHYDRATE=true
```

### Running the Service

```bash
# Start the service (auto-hydrates if no local data)
npm start

# Or run in development mode
npm run dev
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
```

## API Endpoints

### Document Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:category/:refNo` | Get document by refNo |
| GET | `/:category/:refNo/content` | Get markdown content |
| GET | `/:category/:refNo/workflow/status` | Get workflow status |
| GET | `/:category/:refNo/workflow/steps` | Get sub-workflow steps |
| POST | `/:category/:refNo/workflow/retry` | Retry from failure |
| POST | `/:category/:refNo/workflow/re-run` | Re-run from scratch |
| GET | `/:category/:refNo/history` | Get processing history |

### Query Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:category` | List documents with filters |
| POST | `/query` | Advanced query |

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

- `PENDING` - Not yet discovered or re-run reset
- `DISCOVERED` - Found in source, ready to download
- `DOWNLOADING` - Fetching raw content from SFC
- `PROCESSING` - Converting to markdown
- `COMPLETED` - All done, markdown available
- `FAILED` - Error during download or processing
- `RETRYING` - Attempting recovery from failure
- `RE_RUNNING` - Complete reprocessing requested
- `STALE` - Source changed since last processing

## Categories

| Category | Document Count | Reference Format |
|----------|---------------|------------------|
| circulars | ~700 | YYEC## (e.g., 26EC6) |
| guidelines | ~50 | UUID |
| consultations | ~217 | YYCP## / YYCC## |
| news | ~5,205 | YYPR## |

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint
npm run lint
```

## Architecture

```
sfc-fetch/
├── src/
│   ├── index.js           # Entry point
│   ├── config.js          # Configuration
│   ├── database.js       # SQLite database layer
│   ├── models/           # Document models
│   │   ├── base.js       # Base document model
│   │   ├── circular.js   # Circulars model
│   │   ├── guideline.js  # Guidelines model
│   │   ├── consultation.js # Consultations model
│   │   └── news.js       # News model
│   ├── routes/           # API routes
│   │   ├── documents.js  # Document routes
│   │   ├── workflow.js   # Workflow routes
│   │   └── backup.js     # Backup routes
│   ├── services/         # Business logic
│   │   ├── workflow.js   # Workflow state machine
│   │   ├── backup.js     # Git backup service
│   │   └── content.js    # Content management
│   └── utils/            # Utilities
├── data/                 # Data directory (created at runtime)
│   ├── db/               # SQLite database
│   ├── content/          # Markdown files
│   │   ├── circulars/
│   │   ├── guidelines/
│   │   ├── consultations/
│   │   └── news/
│   └── archive/          # Archived re-runs
└── tests/                # Tests
```
