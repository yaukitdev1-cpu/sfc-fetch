# SFC-Fetch API Reference

**Base URL:** `http://localhost:3401`  
**Version:** 2.0.0

---

## Table of Contents

1. [Health & Status](#health--status)
2. [Circulars](#circulars)
3. [Guidelines](#guidelines)
4. [Consultations](#consultations)
5. [News](#news)
6. [Queue Management](#queue-management)
7. [Workflows](#workflows)
8. [Backup & Sync](#backup--sync)

---

## Health & Status

### Health Check

```http
GET /health
```

Returns service health status and document counts.

**Response:**
```json
{
  "status": "healthy",
  "totalDocuments": 5449,
  "lastBackup": "2026-06-23T10:00:00.000Z",
  "collections": {
    "circulars": { "count": 944, "status": "loaded" },
    "guidelines": { "count": 51, "status": "loaded" },
    "consultations": { "count": 217, "status": "loaded" },
    "news": { "count": 4237, "status": "loaded" }
  },
  "activeWorkflows": 0
}
```

**Status Codes:**
- `200`: Service is healthy
- `503`: Service is unhealthy

---

## Circulars

### List All Circulars

```http
GET /circulars
```

Returns all circulars with metadata.

**Query Parameters:**
- `limit` (optional): Maximum number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)
- `year` (optional): Filter by year

**Response:**
```json
{
  "total": 944,
  "items": [
    {
      "_id": "H686",
      "metadata": {
        "title": "Proposed India Taxation Legislation",
        "issueDate": "2012-04-18",
        "year": 2012
      },
      "workflow": {
        "status": "COMPLETED",
        "completedAt": "2026-06-23T10:00:00.000Z"
      },
      "content": {
        "markdownPath": "circulars/markdown/2026/H686.md",
        "markdownSize": 1994
      }
    }
  ]
}
```

### Get Specific Circular

```http
GET /circulars/:refNo
```

**Example:**
```http
GET /circulars/H686
```

**Response:**
```json
{
  "_id": "H686",
  "metadata": {
    "title": "Proposed India Taxation Legislation",
    "issueDate": "2012-04-18",
    "year": 2012,
    "subject": "Taxation"
  },
  "workflow": {
    "status": "COMPLETED",
    "currentStep": "convert",
    "completedAt": "2026-06-23T10:00:00.000Z"
  },
  "content": {
    "markdownPath": "circulars/markdown/2026/H686.md",
    "markdownSize": 1994,
    "markdownHash": "sha256:abc123...",
    "lastConverted": "2026-06-23T10:00:00.000Z"
  },
  "source": {
    "pdfUrl": "https://apps.sfc.hk/edistributionWeb/api/circular/openFile?refNo=H686"
  }
}
```

### Discover Circulars

```http
POST /circulars/discover
```

Triggers discovery of new circulars from SFC API.

**Body:**
```json
{
  "year": 2026,
  "pageSize": 100
}
```

**Response:**
```json
{
  "discovered": 5,
  "alreadyExists": 939,
  "errors": 0
}
```

---

## Guidelines

### List All Guidelines

```http
GET /guidelines
```

**Response:**
```json
{
  "total": 51,
  "items": [
    {
      "_id": "CDCBF5863B7742FA82F028B3A0497337",
      "metadata": {
        "title": "Code of Conduct",
        "issueDate": "2026-01-15"
      },
      "workflow": {
        "status": "COMPLETED"
      }
    }
  ]
}
```

### Get Specific Guideline

```http
GET /guidelines/:refNo
```

---

## Consultations

### List All Consultations

```http
GET /consultations
```

**Response:**
```json
{
  "total": 217,
  "items": [
    {
      "_id": "04CP5",
      "metadata": {
        "title": "Consultation Paper on...",
        "issueDate": "2026-03-01",
        "status": "concluded"
      },
      "workflow": {
        "status": "COMPLETED"
      }
    }
  ]
}
```

### Get Specific Consultation

```http
GET /consultations/:refNo
```

---

## News

### List All News

```http
GET /news
```

**Query Parameters:**
- `limit` (optional): Maximum results (default: 100)
- `offset` (optional): Pagination offset
- `year` (optional): Filter by year

**Response:**
```json
{
  "total": 4237,
  "items": [
    {
      "_id": "26PR10",
      "metadata": {
        "title": "SFC takes disciplinary action against...",
        "issueDate": "2026-01-10",
        "year": 2026
      },
      "workflow": {
        "status": "COMPLETED"
      }
    }
  ]
}
```

### Get Specific News

```http
GET /news/:refNo
```

### Batch Download News

```http
POST /news/batch-download
```

Downloads multiple news articles.

**Body:**
```json
{
  "refNos": ["26PR10", "26PR11", "26PR12"]
}
```

---

## Queue Management

### Queue Status

```http
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

### Submit Discover Job

```http
POST /queue/discover
```

**Body:**
```json
{
  "category": "circulars",
  "refNo": "H686"
}
```

### Submit Download Job

```http
POST /queue/download
```

**Body:**
```json
{
  "category": "circulars",
  "refNo": "H686",
  "sourceUrl": "https://apps.sfc.hk/..."
}
```

### Submit Convert Job

```http
POST /queue/convert
```

**Body:**
```json
{
  "category": "circulars",
  "refNo": "H686"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "convert-circulars-H686",
  "status": "queued"
}
```

---

## Workflows

### Workflow Statistics

```http
GET /workflows/stats
```

**Response:**
```json
{
  "total": 5449,
  "byStatus": {
    "COMPLETED": 5444,
    "FAILED": 5,
    "PROCESSING": 0,
    "PENDING": 0
  },
  "byCategory": {
    "circulars": 944,
    "guidelines": 51,
    "consultations": 217,
    "news": 4237
  }
}
```

### Queue Status (Detailed)

```http
GET /workflows/queue/status
```

**Response:**
```json
{
  "queue": {
    "pending": 0,
    "inProgress": 0,
    "completed": 89,
    "failed": 0
  },
  "recentJobs": [
    {
      "id": "convert-circulars-H686",
      "action": "convert",
      "category": "circulars",
      "refNo": "H686",
      "status": "completed",
      "createdAt": "2026-06-23T10:00:00.000Z",
      "updatedAt": "2026-06-23T10:00:30.000Z"
    }
  ]
}
```

---

## Backup & Sync

### Dehydrate (Backup to Git)

```http
POST /dehydrate
```

Commits and pushes all data to Git remote.

**Response:**
```json
{
  "success": true,
  "commitHash": "abc123...",
  "filesChanged": 5,
  "pushed": true
}
```

### Hydrate (Restore from Git)

```http
POST /hydrate
```

Pulls latest data from Git remote.

**Response:**
```json
{
  "success": true,
  "commitHash": "abc123...",
  "filesRestored": 5
}
```

### Backup Status

```http
GET /backup/status
```

**Response:**
```json
{
  "lastBackup": "2026-06-23T10:00:00.000Z",
  "lastRestore": "2026-06-23T09:00:00.000Z",
  "autoHydrate": true,
  "autoDehydrate": true,
  "gitRemote": "origin",
  "gitBranch": "master"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "statusCode": 404,
  "message": "Document not found",
  "error": "Not Found"
}
```

**Common Status Codes:**
- `200`: Success
- `400`: Bad request (invalid parameters)
- `404`: Resource not found
- `500`: Internal server error
- `503`: Service unavailable

---

## Rate Limiting

- **SFC API calls:** Limited to 2 requests per second
- **Local API:** No rate limiting (internal use only)

---

## Authentication

No authentication required (internal service).

**Security Note:** This API is intended for internal use only. Do not expose to public internet without adding authentication.

---

## Examples

### cURL Examples

```bash
# Health check
curl http://localhost:3401/health | jq

# Get circular
curl http://localhost:3401/circulars/H686 | jq

# List news from 2026
curl "http://localhost:3401/news?year=2026&limit=10" | jq

# Trigger conversion
curl -X POST http://localhost:3401/queue/convert \
  -H "Content-Type: application/json" \
  -d '{"category":"circulars","refNo":"H686"}'

# Backup to Git
curl -X POST http://localhost:3401/dehydrate
```

### Python Examples

```python
import requests

BASE_URL = "http://localhost:3401"

# Get circular
response = requests.get(f"{BASE_URL}/circulars/H686")
circular = response.json()
print(circular["metadata"]["title"])

# Trigger conversion
response = requests.post(f"{BASE_URL}/queue/convert", json={
    "category": "circulars",
    "refNo": "H686"
})
print(response.json())

# List all completed circulars
response = requests.get(f"{BASE_URL}/circulars")
for item in response.json()["items"]:
    if item["workflow"]["status"] == "COMPLETED":
        print(f"{item['_id']}: {item['metadata']['title']}")
```

---

**End of API Reference**
