# Architecture & Data Flow

**Version:** 2.0.0  
**Last Updated:** 2026-06-23

---

## System Overview

SFC-Fetch is a document processing pipeline that automates the extraction, conversion, and archival of regulatory documents from the Hong Kong Securities and Futures Commission (SFC) website.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SFC Website                              │
│                    (apps.sfc.hk)                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Circulars │  │Guidelines│  │Consultat.│  │   News   │       │
│  │   API    │  │  (HTML)  │  │   API    │  │   API    │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
└───────┼──────────────┼──────────────┼──────────────┼────────────┘
        │              │              │              │
        └──────────────┴──────────────┴──────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SFC-Fetch Service                             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Discovery Scheduler (node-cron)              │  │
│  │  • Runs daily at 2 AM                                    │  │
│  │  • Fetches document listings from SFC API                │  │
│  │  • Submits new documents to queue                        │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Queue Service (better-queue)                 │  │
│  │  • Concurrent: 1 (configurable)                          │  │
│  │  • Persistent: LowDB                                     │  │
│  │  • Actions: discover, download, convert                  │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Workflow Engine                               │  │
│  │                                                           │  │
│  │  ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌───────┐ │  │
│  │  │DISCOVER │──▶│DOWNLOAD  │──▶│ CONVERT  │──▶│COMPLETE│ │  │
│  │  └─────────┘   └──────────┘   └──────────┘   └───────┘ │  │
│  │       │              │              │              │      │  │
│  │       ▼              ▼              ▼              ▼      │  │
│  │  Fetch metadata  Download raw   Convert to      Mark    │  │
│  │  from SFC API    file (PDF/     markdown        as      │  │
│  │                  HTML/ZIP)      (Docling)       DONE    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Storage Layer                                 │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │  │
│  │  │   LowDB     │  │  Markdown   │  │  Raw Files  │     │  │
│  │  │ (metadata)  │  │   Files     │  │ (temporary) │     │  │
│  │  │ sfc-db.json │  │  data/      │  │  data/raw/  │     │  │
│  │  │             │  │  content/   │  │             │     │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                       │                                         │
│                       ▼                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Backup Service (Git)                          │  │
│  │  • Auto-commit after processing                          │  │
│  │  • Push to remote repository                             │  │
│  │  • Restore from Git on startup                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              REST API (Fastify)                            │  │
│  │  • Health checks                                         │  │
│  │  • Document queries                                      │  │
│  │  • Queue management                                      │  │
│  │  • Manual triggers                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Categories

### 1. Circulars (944 documents)

**Source:** SFC Circular API  
**Format:** PDF, HTML, ZIP  
**Frequency:** Irregular (new circulars issued as needed)

**Data Structure:**
```typescript
{
  _id: "H686",                    // Reference number
  metadata: {
    title: "Proposed India...",   // Document title
    issueDate: "2012-04-18",      // Publication date
    year: 2012,                   // Year extracted
    subject: "Taxation"           // Subject category
  },
  workflow: {
    status: "COMPLETED",          // Current state
    currentStep: "convert",       // Last completed step
    completedAt: "2026-06-23..."  // Completion timestamp
  },
  content: {
    markdownPath: "circulars/markdown/2026/H686.md",
    markdownSize: 1994,
    markdownHash: "sha256:abc123...",
    lastConverted: "2026-06-23..."
  },
  source: {
    pdfUrl: "https://apps.sfc.hk/...",
    htmlUrl: "https://apps.sfc.hk/..."
  }
}
```

### 2. Guidelines (51 documents)

**Source:** SFC Guidelines page (web scraping)  
**Format:** PDF, HTML  
**Frequency:** Rarely updated

### 3. Consultations (217 documents)

**Source:** SFC Consultations API  
**Format:** PDF, HTML  
**Frequency:** Regular (public consultation papers)

**Special:** May include conclusion papers (separate documents)

### 4. News (4,237 documents)

**Source:** SFC News API  
**Format:** HTML (inline)  
**Frequency:** Daily (press releases)

**Special:** HTML content is embedded in metadata, not downloaded separately

---

## Workflow States

### State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
PENDING ──▶ DISCOVERED ──▶ DOWNLOADING ──▶ PROCESSING ──▶ COMPLETED
   │            │               │               │
   │            │               │               │
   └────────────┴───────────────┴───────────────┘
                    │
                    ▼
                 FAILED
                    │
                    ▼
                RETRYING ──▶ (back to appropriate state)
```

### State Descriptions

| State | Description | Next State |
|-------|-------------|------------|
| **PENDING** | Document discovered, waiting for processing | DISCOVERED |
| **DISCOVERED** | Metadata fetched, ready for download | DOWNLOADING |
| **DOWNLOADING** | Raw file being downloaded | PROCESSING |
| **PROCESSING** | Converting to markdown | COMPLETED |
| **COMPLETED** | Successfully converted | (terminal) |
| **FAILED** | Error occurred | RETRYING |
| **RETRYING** | Being retried | (back to appropriate state) |

### Special States

| State | Description |
|-------|-------------|
| **NEEDS_MANUAL_OCR** | Scanned PDF with no text layer, requires manual OCR |
| **STALE** | Old documents that haven't been processed |
| **RE_RUNNING** | Being re-processed after failure |

---

## Queue Architecture

### better-queue Configuration

```typescript
{
  concurrent: 1,        // Process one job at a time
  maxRetries: 0,        // Disable built-in retry (we manage it)
  retryDelay: 0,
  retryBackoff: false,
  persistPath: './data/db/sfc-db.json'  // Persist to LowDB
}
```

### Job Types

| Action | Description | Trigger |
|--------|-------------|---------|
| **discover** | Fetch metadata from SFC API | Discovery scheduler |
| **download** | Download raw file (PDF/HTML/ZIP) | After discover |
| **convert** | Convert to markdown | After download |

### Job Lifecycle

```
1. Job created (status: pending)
   ↓
2. Job picked up by queue worker
   ↓
3. Job status: in_progress
   ↓
4. Job processed (discover/download/convert)
   ↓
5. Job status: completed OR failed
   ↓
6. If failed: retry logic (up to 5 attempts)
```

### Queue Persistence

Jobs are persisted to LowDB (`sfc-db.json`) to survive restarts.

**On startup:**
1. Clean up stale `in_progress` jobs (reset to `pending`)
2. Run recovery for stuck documents
3. Load `pending` jobs into queue

---

## Conversion Pipeline

### File Format Detection

The system uses magic bytes to detect file format:

```typescript
enum FileFormat {
  PDF = 'pdf',        // %PDF
  ZIP = 'zip',        // PK\x03\x04
  OLE2 = 'ole2',      // \xD0\xCF\x11\xE0
  UNKNOWN = 'unknown'
}
```

### Conversion Flow

```
┌─────────────┐
│  Raw File   │
│  (PDF/HTML/ │
│   ZIP/OLE2) │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Format Detector │
│ (magic bytes)   │
└──────┬──────────┘
       │
       ├─▶ PDF ──────────┐
       │                 │
       ├─▶ ZIP ──────────┤
       │                 │
       ├─▶ HTML ─────────┤
       │                 │
       └─▶ OLE2 ─────────┤
                         │
                         ▼
              ┌─────────────────────┐
              │   Converter Logic   │
              └─────────┬───────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ Docling │   │Turndown │   │Antiword │
    │ (PDF)   │   │ (HTML)  │   │ (OLE2)  │
    └────┬────┘   └────┬────┘   └────┬────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   Markdown      │
              │   Output        │
              └─────────────────┘
```

### PDF Conversion (Docling)

**Tool:** [Docling](https://github.com/DS4SD/docling)  
**Capabilities:**
- Text extraction
- OCR for scanned PDFs
- Table detection
- Layout analysis

**Fallback chain:**
1. Docling (primary)
2. pdftotext (if Docling fails)
3. HTML fallback (if PDF has no text layer)
4. Manual OCR (if no HTML available)

### ZIP Conversion

**Process:**
1. Extract ZIP archive
2. Find main PDF (heuristic: filename contains "Circular" or "Eng")
3. Convert main PDF using Docling
4. If PDF is scanned, use HTML fallback

### HTML Conversion

**Tool:** Turndown  
**Process:**
1. Parse HTML with Cheerio
2. Convert to markdown with Turndown
3. Clean up formatting

---

## Database Schema

### LowDB Structure

```typescript
{
  // Document collections
  circulars: Circular[],
  guidelines: Guideline[],
  consultations: Consultation[],
  news: NewsItem[],
  
  // Queue entries
  queue: QueueEntry[],
  
  // Metadata
  metadata: {
    version: "2.0.0",
    lastBackup: "2026-06-23T10:00:00.000Z",
    lastRestore: "2026-06-23T09:00:00.000Z"
  }
}
```

### Queue Entry

```typescript
{
  _id: "convert-circulars-H686",
  action: "convert",           // discover, download, convert
  category: "circulars",       // circulars, guidelines, etc.
  refNo: "H686",              // Document reference number
  status: "completed",        // pending, in_progress, completed, failed
  priority: 0,
  attempts: 0,
  createdAt: "2026-06-23T10:00:00.000Z",
  updatedAt: "2026-06-23T10:00:30.000Z"
}
```

---

## Discovery Scheduler

### Configuration

```bash
DISCOVERY_ENABLED=true
DISCOVERY_SCHEDULE_CRON=0 2 * * *    # Daily at 2 AM
DISCOVERY_CATEGORIES=circulars,consultations,news
DISCOVERY_START_YEAR=1990
DISCOVERY_PAGE_SIZE=100
```

### Discovery Process

```
1. Wait 5 minutes after startup (avoid conflicts)
   ↓
2. For each category:
   ↓
3. Fetch document listings from SFC API
   ↓
4. For each document:
   ├─ Check if already in database
   ├─ If new: create document entry (status: PENDING)
   └─ Submit discover job to queue
   ↓
5. Log discovery results
```

### Rate Limiting

- **SFC API:** 2 requests per second (configurable)
- **Delay between requests:** 500ms

---

## Backup & Sync

### Git Integration

**Auto-dehydrate:** Automatically commit and push after processing  
**Auto-hydrate:** Automatically pull on startup

### Backup Flow

```
1. Document processed successfully
   ↓
2. Markdown file saved to data/content/
   ↓
3. Database updated
   ↓
4. Git commit created
   ↓
5. Push to remote repository
```

### Restore Flow

```
1. Service starts
   ↓
2. Check if database exists
   ↓
3. If not: pull from Git
   ↓
4. Load database into memory
   ↓
5. Continue normal operation
```

---

## Error Handling

### Retry Logic

```typescript
maxRetries: 5
retryDelay: exponential backoff

On failure:
1. Increment retryCount
2. If retryCount < maxRetries:
   - Set status to RETRYING
   - Re-submit to queue
3. Else:
   - Set status to FAILED
   - Log error
```

### Recovery Mechanisms

**On startup:**
1. **Orphan reset:** Reset `in_progress` jobs to `pending`
2. **Stuck document recovery:**
   - FAILED docs with valid markdown → mark as COMPLETED
   - DOWNLOADING docs with existing markdown → skip download
   - PROCESSING docs → re-submit convert job

### Error Categories

| Error | Cause | Recovery |
|-------|-------|----------|
| **ENOENT** | Raw file deleted before conversion | Re-download and convert |
| **Docling timeout** | Large PDF or slow system | Increase timeout or retry |
| **Network error** | SFC API unavailable | Retry with backoff |
| **Invalid format** | Corrupted file | Skip and mark as FAILED |
| **Scanned PDF** | No text layer | Use HTML fallback or manual OCR |

---

## Performance Considerations

### Memory Usage

| Component | Idle | Active | Peak |
|-----------|------|--------|------|
| **Service** | ~200 MB | ~300 MB | ~400 MB |
| **Docling** | - | ~200 MB | ~500 MB |
| **Total** | ~200 MB | ~500 MB | ~900 MB |

### CPU Usage

- **Idle:** < 1%
- **Converting:** 50-100% (single core)
- **Discovery:** 10-20%

### Disk I/O

- **Database:** ~34 MB (read/write)
- **Markdown files:** ~100 MB total
- **Raw files:** Temporary, cleaned up after conversion

### Bottlenecks

1. **Docling conversion:** CPU-intensive, 5-30 seconds per PDF
2. **SFC API calls:** Rate-limited to 2 req/sec
3. **Database writes:** LowDB is single-threaded

### Optimization Tips

1. **Increase concurrency** (if system has resources)
2. **Use SSD** for faster database operations
3. **Increase swap** to prevent OOM
4. **Reduce discovery frequency** if not needed

---

## Security Considerations

### API Security

- **No authentication** (internal use only)
- **Rate limiting** on SFC API calls
- **Input validation** with Zod schemas

### Data Security

- **No secrets in code** (use .env)
- **Git credentials** stored securely
- **Database encryption** optional (not enabled by default)

### Network Security

- **Bind to localhost** by default
- **Use reverse proxy** for external access
- **Add authentication** if exposing API

---

## Monitoring

### Health Checks

```bash
GET /health
```

**Metrics:**
- Service status
- Document counts
- Active workflows
- Last backup time

### Logging

**Log levels:**
- INFO: Normal operations
- WARN: Non-critical issues
- ERROR: Failures
- DEBUG: Detailed debugging

**Log rotation:**
- Max size: 100 MB per file
- Max files: 5
- Auto-rotation enabled

### Metrics

**Queue metrics:**
- Pending jobs
- In-progress jobs
- Completed jobs
- Failed jobs

**Workflow metrics:**
- Documents by status
- Documents by category
- Average processing time

---

## Future Enhancements

### Planned Features

1. **Webhook notifications** for new documents
2. **Full-text search** across all documents
3. **Document versioning** (track changes)
4. **Multi-language support** (TC/SC/EN)
5. **Dashboard UI** for monitoring
6. **Batch export** to various formats

### Potential Improvements

1. **Parallel processing** (multiple workers)
2. **Database migration** to PostgreSQL
3. **Caching layer** (Redis)
4. **API versioning**
5. **Authentication** (JWT/OAuth)

---

**End of Architecture Documentation**
