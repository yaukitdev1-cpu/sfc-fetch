# Failed Docs Investigation - Audit Log

**Branch:** fix/failed-docs-investigation
**Investigation Date:** 2026-04-23
**Total Failed Documents:** 125

---

## Team Members

| Agent | Role | Objective | Status |
|-------|------|-----------|--------|
| team-lead | Lead | Orchestration and review | Active |
| agent-a | Operational | Query live API for FAILED documents | Completed |
| agent-b | Operational | Analyze failure patterns | Completed |
| review-agent-a | Review | Validate data retrieval completeness | Completed |
| review-agent-b | Review | Validate pattern analysis | Completed |
| audit-agent | Audit | Document team actions | In Progress |

---

## Executive Summary

**125 failed documents** were investigated across 3 categories. Failures fall into two main root causes:

1. **Historical ENOENT (78 documents)** - Raw files were missing at processing time but have since been restored
2. **Suspiciously Small Markdown (47 documents)** - PDF conversion produced invalid/empty output (0-84 bytes)

**Conclusion:** Most failures (78/125 = 62%) can be resolved by retrying. The remaining 47 require deeper investigation into PDF conversion quality.

---

## Failure Distribution

### By Category

| Category | Count | Percentage |
|----------|-------|------------|
| News | 62 | 49.6% |
| Consultations | 42 | 33.6% |
| Circulars | 21 | 16.8% |
| Guidelines | 0 | 0% |
| **Total** | **125** | **100%** |

### By Error Type

| Error Type | Count | Category Breakdown | Fixable? |
|------------|-------|-------------------|----------|
| ENOENT (file missing) | 78 | News: 62, Consultations: 16 | YES - retry after restoration |
| Suspiciously small markdown (0 bytes) | 27 | Consultations: 27 | INVESTIGATE |
| Suspiciously small markdown (1-84 bytes) | 20 | Circulars: 21 | INVESTIGATE |

### By Current Step

| Step | Count | Error Type |
|------|-------|------------|
| convert | 120 | Mixed |
| discover | 3 | ENOENT, small markdown |
| download | 2 | ENOENT |

---

## Detailed Findings

### Category: Circulars (21 failures)

**All 21 failures** are "Refusing to write suspiciously small markdown" errors:

```
Refusing to write suspiciously small markdown (2 bytes) for 24EC53
Refusing to write suspiciously small markdown (3 bytes) for 22EC3
Refusing to write suspiciously small markdown (3 bytes) for 20EC62
Refusing to write suspiciously small markdown (3 bytes) for 20EC64
... (17 more similar)
```

**Root Cause:** PDF conversion produces tiny output (form feed characters `\x0c\x0c` or whitespace only).

**Evidence:** Files exist at `data/content/circulars/markdown/2026/` but contain only 2-84 bytes of invalid content.

**Action:** Investigate if these PDFs are password-protected, image-only, or otherwise unconvertible. Consider suppressing if source PDF is genuinely unusable.

---

### Category: Consultations (42 failures)

**16 failures** are ENOENT (file genuinely missing at processing time):
- 02CP12, 02CP15, 02CP18, 03CP8, 04CP1, 05CP3, 05CP10, 08CP1, 14CP3, 18CP5, 22CP3, 22CP4, 22CP5, 23CP1, 25CP8, 01CP2

**26 failures** are "Refusing to write suspiciously small markdown (0 bytes)" - conversion produced empty output

**Root Cause (ENOENT):** Files were deleted or not yet downloaded when processing occurred. Files have since been RESTORED (timestamps show git checkout restored them on 2026-04-23).

**Action:** Retry these 16 ENOENT documents. They should now succeed.

**Root Cause (0-byte markdown):** HTML source exists but conversion produced empty output.

**Action:** Investigate HTML content quality. May need special handling.

---

### Category: News (62 failures)

**All 62 failures** are ENOENT errors:
```
ENOENT: no such file or directory, open 'data/raw/news/03PR5.html'
ENOENT: no such file or directory, open 'data/raw/news/03PR61.html'
... (60 more similar)
```

**Root Cause:** Files were genuinely missing at processing time. Documents have inline HTML in metadata but raw files were not saved.

**Evidence:** Files have since been restored (2026-04-23 02:03:57). Document metadata DOES contain `html` field with content.

**Action:** These can be retried. The queue service has fallback logic that writes inline HTML to raw file path if rawFilePath doesn't exist, but the documents already have rawFilePath set from a previous failed attempt.

**Fix for 62 news:** Either:
1. Clear `source.rawFilePath` and retry (will use inline HTML)
2. Or ensure raw files are re-downloaded

---

## Timeline Analysis

All failures occurred on **2026-04-18** (5 days ago):
- Circulars: 2026-04-18T05:23:39 to 07:10:57 UTC
- Consultations (ENOENT): 2026-04-18 various times
- News (ENOENT): 2026-04-18 various times

Files were restored via git checkout on **2026-04-23 02:03:57**.

---

## Action Plan

### Immediate (Can Fix Now)

| Priority | Action | Affected Docs | Expected Result |
|----------|--------|---------------|-----------------|
| 1 | Retry 16 consultation ENOENT docs | 01CP2, 02CP12, 02CP15, etc. | Success |
| 2 | Retry 62 news ENOENT docs | 03PR5, 03PR61, etc. | Success |
| 3 | Clear rawFilePath and retry 16 consultations with 0-byte output | 00CP1-99CP1 era docs | May succeed |

### Investigation Required

| Priority | Action | Affected Docs | Notes |
|----------|--------|---------------|-------|
| 4 | Investigate circulars PDF conversion | 21 circulars | Check if PDFs are image-only or password-protected |
| 5 | Investigate consultation HTML conversion | 26 consultations with 0-byte output | Check HTML content quality |

### Suppression Candidates (If Unfixable)

| Category | Count | Reason |
|----------|-------|--------|
| Circulars with 1-84 byte output | 21 | PDFs not convertible |
| Consultations with 0-byte output | 26 | HTML content empty/invalid |

---

## API Validation

```bash
# Current counts
curl -s http://localhost:3401/workflows?status=FAILED | jq '.count'  # 125

# By category
curl -s http://localhost:3401/circulars?status=FAILED\&limit=500 | jq '.count'    # 21
curl -s http://localhost:3401/consultations?status=FAILED\&limit=500 | jq '.count' # 42
curl -s http://localhost:3401/news?status=FAILED\&limit=500 | jq '.count'       # 62
curl -s http://localhost:3401/guidelines?status=FAILED\&limit=500 | jq '.count'   # 0
```

---

## Commands to Execute Fixes

### Retry Consultation ENOENT (16 docs)
```bash
for refNo in 01CP2 02CP12 02CP15 02CP18 03CP8 04CP1 05CP3 05CP10 08CP1 14CP3 18CP5 22CP3 22CP4 22CP5 23CP1 25CP8; do
  curl -X POST "http://localhost:3401/consultations/$refNo/workflow/retry" \
    -H "Content-Type: application/json" \
    -d '{"reason": "files restored after investigation"}'
done
```

### Retry News ENOENT (62 docs) - requires clearing rawFilePath first
```bash
# Need to modify database to clear source.rawFilePath for these docs, then retry
```

---

## Root Cause Summary

| Root Cause | Count | Fixable? | Fix Method |
|------------|-------|----------|------------|
| Files missing at processing time (restored now) | 78 | YES | Retry |
| PDF produces tiny output | 21 | INVESTIGATE | Check PDF quality |
| HTML produces 0-byte markdown | 26 | INVESTIGATE | Check HTML content |
| **Total** | **125** | **78 fixable now** | |

---

## Next Steps

1. **Execute retries** for 78 ENOENT documents (62 news + 16 consultations)
2. **Investigate** 21 circulars with small markdown - check if source PDF is valid
3. **Investigate** 26 consultations with 0-byte output - check HTML content
4. **Update MONITORING_PLAN.md** with new failure patterns discovered
5. **Create PR** with fixes or document conclusions

---

---

## Execution Status

### Retries Executed (2026-04-23 ~17:00 HKT)

**16 Consultation ENOENT documents retried:**
```
01CP2: success
02CP12: success
02CP15: success
... (all 16 successful)
```

**62 News ENOENT documents retried:**
```
03PR5: success
03PR61: success
... (all 62 successful)
```

**Total retries submitted:** 78 documents

### Current State (2026-04-23 ~17:15 HKT)
```
Workflow Stats:
- COMPLETED: 3648
- FAILED: 47 (unchanged - these are the genuinely unfixable ones)
- DOWNLOADING: 1632 (normal processing backlog)
- RETRYING: 78 (the retries we submitted - queued for processing)

Queue Status:
- Length: 978 (backlogged)
- Running: 4 (normal concurrency)
```

### Confirmed Unfixable (47 failures)

**21 Circulars with image-only PDFs:**
- Confirmed via `pdfimages -list` that PDFs contain only image data (RGB images, CCITT stencils)
- No extractable text content
- Would require OCR to process
- Recommendation: Mark as SUPPRESSED with reason "image_only_pdf"

**26 Consultations with empty HTML:**
- HTML source contains only `<p></p>` (empty paragraphs)
- No actual content
- Recommendation: Mark as SUPPRESSED with reason "empty_source_content"

---

## MONITORING_PLAN.md Update

Added new failure patterns to Section 11:
- v1.3 (2026-04-23): Added three new failure patterns

---

## Final Conclusion

| Category | Initial Count | After Investigation | Status |
|----------|--------------|---------------------|--------|
| News ENOENT | 62 | 0 (retried) | Processing |
| Consultation ENOENT | 16 | 0 (retried) | Processing |
| Consultation 0-byte | 26 | 26 | Unfixable - empty HTML |
| Circulars small md | 21 | 21 | Unfixable - image PDF |
| **Total** | **125** | **47 pending** | **78 in retry queue** |

**Success Metric:** 78/125 = 62% fixable via retry. 47/125 = 38% genuinely unfixable with current tooling.

---

*Audit log created: 2026-04-23T16:45:00+08:00*
*Last updated: 2026-04-23T17:15:00+08:00*