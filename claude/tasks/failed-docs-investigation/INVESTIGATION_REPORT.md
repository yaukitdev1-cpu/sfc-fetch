# Failed Documents Investigation Report

**Date:** 2026-04-23
**PR:** https://github.com/yaukitdev1-cpu/sfc-fetch/pull/30
**Total Failed Documents:** 125

---

## Current Status

| Status | Count |
|--------|-------|
| **FAILED (unfixable)** | 47 |
| **RETRYING (processing)** | 78 |
| COMPLETED | 3,648 |
| DOWNLOADING | 1,632 |

---

## UNFIXABLE: 47 Documents Requiring Design Decision

### CIRCULARS: 21 documents (Image-only PDFs)

**Root Cause:** PDFs contain only scanned images, no extractable text. Would require OCR.

| RefNo | Output Size | RefNo | Output Size |
|-------|-------------|-------|-------------|
| H357 | 84 bytes | H423 | 84 bytes |
| H428 | 84 bytes | H444 | 84 bytes |
| H451 | 84 bytes | H463 | 84 bytes |
| H644 | 84 bytes | H664 | 84 bytes |
| H679 | 84 bytes | H692 | 6 bytes |
| H398 | 3 bytes | H480 | 3 bytes |
| 16EC59 | 3 bytes | 17EC55 | 3 bytes |
| 20EC62 | 3 bytes | 20EC64 | 3 bytes |
| 22EC3 | 3 bytes | 15EC3 | 2 bytes |
| 24EC53 | 2 bytes | H592 | 12 bytes |
| H686 | 1 byte | | |

**All RefNos:**
```
H357, H423, H428, H444, H451, H463, H644, H664, H679, H692, H398, H480, 16EC59, 17EC55, 20EC62, 20EC64, 22EC3, 15EC3, 24EC53, H592, H686
```

---

### CONSULTATIONS: 26 documents (Empty HTML Source)

**Root Cause:** HTML source contains only `<p></p>` - no actual content.

| Era | RefNos |
|-----|--------|
| 2000s | 01CP5, 01CP6, 01CP7, 01CP8, 01CP9, 01CP10, 01CP11, 01CP15 |
| 1990s | 90CP1, 91CP1, 91CP2, 92CP1, 92CP2, 93CP1, 94CP1, 96CP2, 98CP1, 98CP4, 98CP5, 99CP1 |
| 2000 | 00CP1, 00CP2, 00CP3, 00CP5, 00CP6, 00CP7 |

**All RefNos:**
```
90CP1, 91CP1, 91CP2, 92CP1, 92CP2, 93CP1, 94CP1, 96CP2, 98CP1, 98CP4, 98CP5, 99CP1, 00CP1, 00CP2, 00CP3, 00CP5, 00CP6, 00CP7, 01CP5, 01CP6, 01CP7, 01CP8, 01CP9, 01CP10, 01CP11, 01CP15
```

---

## RETRYING: 78 Documents (Processing After Retry)

### NEWS: 62 documents

All ENOENT errors - files missing at processing time, now restored:

```
03PR5, 03PR61, 03PR78, 04PR124, 04PR142, 04PR252, 05PR33, 05PR47, 05PR110, 05PR144, 05PR179, 05PR213, 05PR216, 05PR261, 05PR286, 06PR97, 06PR112, 06PR164, 06PR271, 07PR91, 07PR107, 07PR191, 08PR2, 08PR37, 08PR125, 08PR194, 09PR76, 09PR79, 09PR124, 09PR127, 10PR10, 11PR8, 11PR105, 11PR138, 11PR153, 12PR28, 12PR92, 12PR132, 13PR65, 14PR44, 14PR57, 14PR137, 15PR49, 16PR105, 17PR83, 17PR88, 17PR106, 18PR74, 19PR29, 20PR3, 20PR58, 20PR62, 21PR3, 21PR29, 21PR82, 22PR70, 22PR106, 24PR21, 24PR121, 25PR42, 25PR53, 25PR65
```

### CONSULTATIONS: 16 documents

All ENOENT errors - files missing at processing time, now restored:

```
01CP2, 02CP12, 02CP15, 02CP18, 03CP8, 04CP1, 05CP3, 05CP10, 08CP1, 14CP3, 18CP5, 22CP3, 22CP4, 22CP5, 23CP1, 25CP8
```

---

## Summary Table

| Category | Total | Status | Root Cause |
|----------|-------|--------|-----------|
| Circulars - Image PDF | 21 | UNFIXABLE | Image-only PDFs, no text |
| Consultations - Empty HTML | 26 | UNFIXABLE | HTML contains `<p></p>` only |
| News - Files Restored | 62 | RETRYING | Files missing, now restored |
| Consultations - Files Restored | 16 | RETRYING | Files missing, now restored |
| **TOTAL** | **125** | | |

---

## Root Causes

### Fixable (78 documents)
Files were genuinely missing at processing time but have since been restored. Retry mechanism has been triggered for all 78 documents.

### Unfixable (47 documents) - require design decision

**21 Circulars:**
- PDFs contain only images (verified via `pdfimages -list`)
- No extractable text content
- Would require OCR (Optical Character Recognition) to process

**26 Consultations:**
- HTML source is literally `<p></p>` - empty paragraphs
- No actual content to extract
- Source content genuinely unavailable

---

## Actions Taken

1. **Retried 78 ENOENT documents** (62 news + 16 consultations)
2. **Updated MONITORING_PLAN.md** with 3 new failure patterns (v1.3)
3. **Created audit log** documenting complete investigation

---

## Next Steps for 47 Unfixable

| Option | Description | Effort |
|--------|-------------|--------|
| **Suppress** | Mark as `SUPPRESSED` with reason `image_only_pdf` or `empty_source_content` | Low |
| **OCR Enhancement** | Implement OCR for image-based PDFs | High |
| **Accept Loss** | Accept that these legacy documents cannot be digitized with current tooling | None |

---

*Generated 2026-04-23*