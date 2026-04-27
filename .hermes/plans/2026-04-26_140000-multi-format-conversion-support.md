# Plan: Multi-Format Raw File Conversion Support

**Date:** 2026-04-26
**Author:** Hermes Agent (via York)
**PR:** TBD
**Status:** Draft

---

## Goal

Support converting non-PDF raw files to markdown so that the 9 currently-failed circulars can be successfully processed. Currently `convertResource()` in `queue.service.ts` only handles `.pdf` and `.html` files — everything else fails silently or produces empty output.

---

## Background: Verified Root Causes

During the failed-docs verification (2026-04-26), we discovered that the 21 circulars originally flagged as "image-only PDF" actually break down as:

| Count | True Format | RefNos | Fixable? |
|-------|-------------|--------|-----------|
| 6 | Microsoft Word `.doc` (OLE2 compound) | H357, H423, H428, H444, H451, H463 | ✅ Yes |
| 3 | ZIP archive (package bundles) | H644, H664, H679 | ✅ Yes (extract + convert main PDF) |
| 9 | True image-only PDFs (scanned) | H692, H398, H480, 16EC59, 17EC55, 20EC62, 20EC64, 24EC53, H592 | ❌ OCR needed |
| 0 | *(correctly identified as different refs)* | 15EC3✗, 22EC3✗ = 15EC30+, 22EC30+ | — |

The 9 fixable ones represent **wrong download format**, not truly unconvertible content.

The 26 consultation failures (`<p></p>` 7-byte HTML) remain genuinely unfixable — source content is empty.

---

## Proposed Approach

### Core Strategy

Add a new `FormatDetectorService` that:
1. Detects the **actual** format of any raw file (not just by extension)
2. Routes each file to the appropriate converter
3. For ZIP bundles: extracts the primary document, converts it, and saves appendices as supplementary files
4. For OLE2/`.doc` files: extracts text using antiword or similar

Keep the existing `convertResource()` pipeline in `queue.service.ts` mostly intact — only the format routing and extraction logic changes.

### Format → Converter Routing

| Detected Format | Converter | Notes |
|-----------------|-----------|-------|
| ZIP archive (bundle) | `ZipBundleConverter` | Extract main PDF, save appendices separately |
| OLE2 Word document | `OleDocConverter` | Extract text via antiword or python-docx |
| Valid PDF | `DoclingService` (existing) | No change |
| Image-only PDF | `PdfImageExtractor` | Detect via `pdfimages -list` — flag for OCR instead of silently failing |
| HTML | `TurndownService` (existing) | No change |

### ZIP Bundle Handling

The 3 ZIP bundles contain:

- **H644** (20 files): Main = `"(1) SFC Circular 2 Aug 11 - Eng.pdf"` — this IS the RefNo content
- **H664** (15 files): Main = `"1 SFC Circular 30 Dec 11 English.pdf"` — this IS the RefNo content
- **H679** (3 files): Main = `"1.SFCCircular30Mar12English.pdf"` — this IS the RefNo content

**Design decision needed:** Do appendices (XLSX, extra PDFs) get:
- (A) Saved as-is under the same RefNo in a subdirectory
- (B) Discarded (only main circular matters)
- (C) Tracked in DB but not converted to markdown

**Recommended: Option B** — the RefNo refers to the main circular, appendices are supplementary and not needed for the corpus.

### Image-Only PDF Handling (9 circulars)

These are true scanned PDFs that will never produce text via current tooling. Options:

- (A) Mark as `SUPPRESSED` with reason `image_only_pdf` in DB
- (B) Keep in FAILED state as sentinel
- (C) Add OCR step (Tesseract) — high effort

**Recommended: Option A** — suppresses noise in monitoring without losing the record.

---

## Step-by-Step Implementation Plan

### Step 1: Add Format Detection (`src/converters/format-detector.service.ts`)

New service that peeks at magic bytes to determine true file type, regardless of extension.

```typescript
export type DetectedFormat = 'pdf' | 'ole2-doc' | 'zip-bundle' | 'html' | 'image-pdf' | 'unknown';

detectFormat(filePath: string): DetectedFormat
```

Detection logic:
- Read first 8 bytes
- `50 4B 03 04` → ZIP
- `D0 CF 11 E0` → OLE2 (Microsoft Compound Document)
- `%PDF` → PDF (then check if image-only via `pdfimages -list` or stream analysis)
- `<` → HTML
- Fall through → unknown

**File:** `src/converters/format-detector.service.ts`
**Tests:** `tests/format-detector.service.test.ts`

### Step 2: Add ZIP Bundle Converter (`src/converters/zip-bundle.converter.ts`)

Extracts ZIP, identifies main circular PDF by heuristic (filename contains "Circular" or is the first/shortest PDF), converts it with existing `DoclingService`, discards appendices.

```typescript
async convertZipBundle(zipPath: string, refNo: string): Promise<ConvertResult>
```

**Key heuristic for main PDF:**
- ZIP entry name contains "Circular" or "SFC" AND (language suffix like "Eng" or "Chinese")
- If multiple matches, pick the one with "1" prefix or earliest in alphabetical order
- Fallback: largest PDF by size

**Files:** `src/converters/zip-bundle.converter.ts`
**Tests:** `tests/zip-bundle.converter.test.ts` (use `test-data/` fixtures)

### Step 3: Add OLE2 Word Document Converter (`src/converters/ole-doc.converter.ts`)

Uses `antiword` CLI (available on Linux) to extract plain text from OLE2 `.doc` files. Falls back to `catdoc` if antiword unavailable.

```typescript
async convertOleDoc(docPath: string): Promise<string>  // returns markdown
```

**Install check:** `which antiword` at startup; throw clear error if missing.

**Files:** `src/converters/ole-doc.converter.ts`
**Tests:** `tests/ole-doc.converter.test.ts`

### Step 4: Update `convertResource()` in `queue.service.ts`

Replace the simple `rawFilePath.endsWith('.pdf')` branch with format detection:

```typescript
const detected = await this.formatDetector.detectFormat(rawFilePath);

switch (detected) {
  case 'pdf':
  case 'image-pdf':
    // existing PDF logic (Docling → fallback)
    break;
  case 'zip-bundle':
    markdownContent = await this.zipBundleConverter.convert(rawFilePath, refNo);
    break;
  case 'ole2-doc':
    markdownContent = await this.oleDocConverter.convert(rawFilePath);
    break;
  case 'html':
    markdownContent = this.basicHtmlToMarkdown(htmlContent);
    break;
  default:
    throw new Error(`Unsupported file format '${detected}' for ${refNo}`);
}
```

**File:** `src/workflows/queue.service.ts` (lines ~753-777)

### Step 5: Add Image-Only PDF Sentinel

After format detection, if a PDF is confirmed image-only (no text streams, has image XObjects):
- Call a new `markAsSuppressed(refNo, category, 'image_only_pdf')` method
- Skip conversion, mark workflow as `SUPPRESSED` instead of `FAILED`
- Log clearly: `"PDF is image-only, marking as SUPPRESSED"`

This prevents the 9 scanned PDFs from repeatedly hitting the safeguard error.

**File:** `src/workflows/workflow.service.ts` (add `suppressStep()` method)

### Step 6: Add System Dependency Check

At startup (`app.module.ts` or `main.ts`), check for `antiword`. Log warning if missing (OLE2 conversion will fail gracefully with clear error).

### Step 7: Create Test Fixtures

```
test-data/
  format-detector/
    sample.doc       (OLE2 Word doc)
    sample.zip       (ZIP with embedded PDF)
    sample.pdf       (valid PDF)
    sample-image.pdf (scanned PDF)
  zip-bundle/
    H644.zip         (copy of real H644.zip)
    H664.zip
    H679.zip
```

**Note:** Use small representative files, not the real 88-page H357.doc.

---

## Files Likely to Change

| File | Change |
|------|--------|
| `src/converters/format-detector.service.ts` | **New** |
| `src/converters/zip-bundle.converter.ts` | **New** |
| `src/converters/ole-doc.converter.ts` | **New** |
| `src/workflows/queue.service.ts` | Update `convertResource()` routing |
| `src/workflows/workflow.service.ts` | Add `suppressStep()` |
| `src/app.module.ts` | Register new services, add antiword check |
| `tests/format-detector.service.test.ts` | **New** |
| `tests/zip-bundle.converter.test.ts` | **New** |
| `tests/ole-doc.converter.test.ts` | **New** |
| `tests/queue.service.test.ts` | Update for new format routing |
| `test-data/format-detector/*.doc` | **New fixture** |
| `test-data/format-detector/*.zip` | **New fixture** |

---

## Verification Steps

1. Run existing tests: `bun test` — all pass
2. Manually test the 9 affected RefNos:
   - H357 → should produce ~19k-word markdown from OLE2
   - H644 → should produce markdown from extracted `"(1) SFC Circular 2 Aug 11 - Eng.pdf"`
   - H692 → should be marked `SUPPRESSED` (not `FAILED`)
3. API verification:
   ```
   GET /circulars/H357  → workflow.status = "COMPLETED"
   GET /circulars/H644  → workflow.status = "COMPLETED"
   GET /circulars/H692  → workflow.status = "SUPPRESSED"
   ```
4. Verify markdown content is non-empty and meaningful (spot-check first 500 chars)

---

## Open Questions

1. **ZIP bundles — appendices:** Discard (Option B) or save separately (Option A)?
2. **antiword dependency:** Install in Dockerfile/setup script, or document as requirement?
3. **OCR for 9 scanned PDFs:** Is this in scope for this PR or a separate tracking issue?
4. **Suppression UI:** Should the API expose a `SUPPRESSED` status, or just leave as `FAILED` with a `suppressReason` field?

---

## Effort Estimate

- Format detector + ZIP converter + OLE2 converter + routing update: **~3-4 hours**
- Tests + fixtures: **~1-2 hours**
- Manual verification: **~30 min**

Total: **~5-6 hours** for full implementation.
