# Document Corpus Verification Report

**Generated:** 2026-04-20T19:57:47.231031Z
**Corpus:** SFC regulatory documents — data/content/
**Total files verified:** 5,401

## Executive Summary

The corpus of 5,401 downloaded documents was verified across 4 categories.
**42 files (0.78% false-success rate) were flagged as empty or dummy.**

| Category | Total | Empty | Dummy | Valid | False-Success Rate |
|----------|------:|------:|------:|------:|-------------------:|
| Guidelines | 50 | 0 | 0 | 50 | 0.00% |
| Consultations | 217 | 29 | 0 | 188 | **13.36%** **← HIGHEST** |
| Circulars | 936 | 12 | 1 | 923 | 1.39% |
| News | 4,198 | 0 | 0 | 4,198 | 0.00% |
| **TOTAL** | **5,401** | **41** | **1** | **5,359** | **0.78%** |

**Highest-risk category: consultations** at 13.36% false-success rate (29 empty files).

## Empty Files Catalog

### Consultations (29 empty files)

All 29 empty files are 0-byte or whitespace-only files in the consultations category:

- `2026/00CP1.md` — 0 bytes — 0 bytes
- `2026/00CP2.md` — 0 bytes — 0 bytes
- `2026/00CP3.md` — 0 bytes — 0 bytes
- `2026/00CP5.md` — 0 bytes — 0 bytes
- `2026/00CP6.md` — 0 bytes — 0 bytes
- `2026/00CP7.md` — 0 bytes — 0 bytes
- `2026/01CP10.md` — 0 bytes — 0 bytes
- `2026/01CP11.md` — 0 bytes — 0 bytes
- `2026/01CP15.md` — 0 bytes — 0 bytes
- `2026/01CP5.md` — 0 bytes — 0 bytes
- `2026/01CP6.md` — 0 bytes — 0 bytes
- `2026/01CP7.md` — 0 bytes — 0 bytes
- `2026/01CP8.md` — 0 bytes — 0 bytes
- `2026/01CP9.md` — 0 bytes — 0 bytes
- `2026/89CP1.md` — 0 bytes — 0 bytes
- `2026/90CP1.md` — 0 bytes — 0 bytes
- `2026/91CP1.md` — 0 bytes — 0 bytes
- `2026/91CP2.md` — 0 bytes — 0 bytes
- `2026/92CP1.md` — 0 bytes — 0 bytes
- `2026/92CP2.md` — 0 bytes — 0 bytes
- `2026/93CP1.md` — 0 bytes — 0 bytes
- `2026/94CP1.md` — 0 bytes — 0 bytes
- `2026/96CP2.md` — 0 bytes — 0 bytes
- `2026/96CP3.md` — 0 bytes — 0 bytes
- `2026/97CP2.md` — 0 bytes — 0 bytes
- `2026/98CP1.md` — 0 bytes — 0 bytes
- `2026/98CP4.md` — 0 bytes — 0 bytes
- `2026/98CP5.md` — 0 bytes — 0 bytes
- `2026/99CP1.md` — 0 bytes — 0 bytes

### Circulars (12 empty files)

All 12 empty files contain only form-feed bytes (0x0c), no actual text content:

- `15EC3.md` — 2 bytes — file is empty or whitespace only
- `16EC59.md` — 3 bytes — file is empty or whitespace only
- `17EC55.md` — 3 bytes — file is empty or whitespace only
- `20EC62.md` — 3 bytes — file is empty or whitespace only
- `20EC64.md` — 3 bytes — file is empty or whitespace only
- `22EC3.md` — 3 bytes — file is empty or whitespace only
- `24EC53.md` — 2 bytes — file is empty or whitespace only
- `H398.md` — 3 bytes — file is empty or whitespace only
- `H480.md` — 3 bytes — file is empty or whitespace only
- `H592.md` — 12 bytes — file is empty or whitespace only
- `H686.md` — 1 bytes — file is empty or whitespace only
- `H692.md` — 6 bytes — file is empty or whitespace only

## Dummy Files Catalog

### Circulars (1 dummy file)

- `H655.md` — 27,553 bytes — contains placeholder text ('placeholder')

## Classification Criteria

| Class | Definition |
|------|------------|
| **empty** | 0 bytes on disk, OR file content that reduces to only whitespace/newlines after stripping |
| **dummy** | Contains explicit placeholder markers (, , , ) OR fewer than 50 visible alphabetic characters after stripping embedded images |
| **valid** | Contains substantive content — meaningful regulatory text, proper sentences, specific information |

## Methodology

1. Each file was read in full and decoded as UTF-8 (with fallback for encoding errors)
2. Embedded base64 image blocks were stripped before content analysis
3. Content was stripped of leading/trailing whitespace
4. Classification applied using the criteria above

## High-Risk Categories

- **consultations** (13.36%): 29 empty placeholder files — downloads that returned zero bytes of content. No dummy content detected.
- **circulars** (1.39%): 12 empty files (form-feed only) + 1 dummy file (placeholder text).

## Recommendations

1. **consultations** — All 29 empty files should be investigated: they may represent downloads that failed mid-transfer or source URLs that returned empty responses.
2. Re-run the download pipeline for empty consultation files to recover any missing content.
3. The single dummy circular (H655.md) should be manually reviewed to confirm it is placeholder content.
