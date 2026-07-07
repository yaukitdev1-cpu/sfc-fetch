# sfc-fetch Invalid Docs Scan Report

**Date:** 2026-06-27 13:28
**Script:** `scripts/scan-invalid-docs.py`

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 36 | Broken content, failed docs |
| 🟡 WARNING | 37 | Suspiciously small md, orphaned queue, anomalies |
| ℹ️ INFO | 6,155 | Normal raw file cleanup (expected) |

---

## 🔴 CRITICAL — Broken Markdown (34 docs)

### Circulars (5) — NEEDS_MANUAL_OCR

| Ref | Size | Status |
|-----|------|--------|
| H692 | 6B | COMPLETED |
| H686 | 1B | COMPLETED |
| H592 | 12B | COMPLETED |
| H480 | 3B | COMPLETED |
| H398 | 3B | COMPLETED |

> These are scanned image PDFs with no HTML fallback. Already in `manual-ocr/` directory.

### Consultations (29) — Zero-byte markdown

All COMPLETED with `markdownSize = 0`:

89CP1, 90CP1, 91CP1, 91CP2, 92CP1, 92CP2, 93CP1, 94CP1, 96CP2, 96CP3, 97CP2, 98CP1, 98CP4, 98CP5, 99CP1, 00CP1, 00CP2, 00CP3, 00CP5, 00CP6, 00CP7, 01CP5, 01CP6, 01CP7, 01CP8, 01CP9, 01CP10, 01CP11, 01CP15

> **Root cause unknown** — need to investigate. Likely old consultations with no PDF or HTML source.

---

## 🔴 CRITICAL — Failed Docs (2)

| Ref | Error |
|-----|-------|
| news/080997 | Refusing to write suspiciously small markdown (75 bytes) |
| news/050297 | Refusing to write suspiciously small markdown (75 bytes) |

> Both have `rawFilePath` pointing to `.html` files on disk. Need to check if HTML content is actually broken or if the conversion threshold is too strict.

---

## 🟡 WARNING — Suspiciously Small Markdown (9 docs)

### Circulars (1)

| Ref | Size |
|-----|------|
| H114 | 132B |

### News (8)

| Ref | Size |
|-----|------|
| 04PR55 | 193B |
| 02PR249 | 125B |
| 02PR31 | 127B |
| HKEX-GEM-1 | 147B |
| 1509 | 197B |
| 2207 | 187B |
| 1606 | 185B |
| 107 | 135B |

> May be legitimately short (e.g. one-line press releases). Spot-check needed.

---

## 🟡 WARNING — Orphaned Queue (2,070 entries)

- All `in_progress` status
- All docs already `COMPLETED` or `FAILED`
- **Root cause:** BUG-1 + BUG-6 (worker death, orphan reset runs after loading)
- **Fix:** Run queue recovery script from sfc-fetch-debugging skill

---

## 🟡 WARNING — Workflow Anomalies (29 docs)

Same 29 consultations as above: COMPLETED but `markdownSize = 0`. Duplicate of the CRITICAL broken_markdown finding.

---

## ℹ️ INFO — Missing Raw Files (6,155 docs)

- 915 circulars, 178 consultations, 5,016 news, 46 guidelines
- All COMPLETED — raw files cleaned up by `cleanupRawFile()` after conversion
- **Expected behavior**, no action needed

---

## TODO

- [x] ~~**Investigate 29 zero-byte consultations**~~ — Root cause found: `fileKeySeq` was null for old consultations (1989-2001), code skipped PDF download. **Fix applied** in `queue.service.ts` — always try PDF first. `.env` `DOCLING_TIMEOUT` bumped to 120s.
- [x] ~~**Fix 2 FAILED news** (080997, 050297)~~ — Investigated. SFC API returns placeholder HTML "English version not available" for both (1997 news). Chinese version also empty. Marked as COMPLETED with markdownSize=0 (legitimately no content). **Long-term fix applied**: Added placeholder HTML detection in `queue.service.ts` — news with placeholder content now auto-completes with 0 bytes instead of failing.
- [x] ~~**Spot-check 9 small-markdown docs**~~ — All legitimate. H114 is a superseded circular notice. News items (1996-2004) are short announcements/speeches/PDF links. Not broken conversions.
- [x] ~~**Queue recovery**~~ — Cleaned 64 orphaned entries. Queue now has 2,179 completed entries, 0 in_progress.
- [x] ~~**Run --deep scan**~~ — Found 2 truncated files (23EC21, 23EC10): disk ~7KB vs DB ~105KB. Re-downloaded PDFs, reset to DISCOVERED. Queue will re-convert after consultation OCR timeouts clear.
- [x] ~~**Schedule recurring scan**~~ — Added `scan-invalid-docs.py --hide-info` to the existing daily sfc-fetch status cron job (runs at noon daily).

**Deferred:**
- [x] ~~**Consultation OCR timeout**~~ — 9 scanned PDFs (89CP1–98CP1) routed to `manual-ocr/` directory. Status set to `NEEDS_MANUAL_OCR`. Awaiting manual OCR.
- [ ] **Manual OCR** — continue work on H692/H686/H592/H480/H398 + 9 consultations (89CP1–98CP1). All PDFs in `manual-ocr/` directory.
