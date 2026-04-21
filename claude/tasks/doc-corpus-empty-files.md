# SFC Corpus Fix - Team Audit Log

## Team Formation
- Team: corpus-fix
- Lead: team-lead
- Agents: implementer, reviewer, audit

## Phase 1: Research
**Completed:** 2026-04-21

Researchers identified 41 genuinely bad files across 3 root causes:
1. **29 consultation 0-byte files** — SFC API returns HTTP 200 with empty PDF buffer for pre-2002 consultations. `getConsultationPdf()` in `consultation.client.ts` line 85 has no size validation. A 0-byte `Buffer.from([])` is truthy in JS, passes the `if (pdfBuffer)` check in `queue.service.ts` line 585, and produces empty markdown.

2. **12 circular form-feed files** — Docling converts image-only (scanned) PDFs but outputs only form-feed (0x0c) characters as page separators. No content quality validation after Docling conversion, so garbage passes as valid output.

3. **H655.md false positive** — The word "placeholder" appears legitimately in SFC regulatory body text about OTC derivatives reporting. Not a pipeline failure. Scanner pattern `\bplaceholder\b` is overly broad.

## Phase 2: Implementation Plan
**Completed:** 2026-04-21

FIX-PLAN.md committed to `fix/corpus-empty-files` branch (commit 00f749fd). PR: https://github.com/yaukitdev1-cpu/sfc-fetch/pull/26

**4 Failure Types and Their Fixes:**

| # | Failure Type | Fix Location | Fix Action |
|---|-------------|---------------|------------|
| 1 | 29 consultation 0-byte | `consultation.client.ts` lines 72-86, 88-102 | Add `buffer.length === 0` check in `getConsultationPdf` and `getConclusionPdf` — return `null` so HTML fallback is used |
| 2 | 12 circular form-feeds | `queue.service.ts` lines 749-755 | Add post-Docling content validation: reject output with < 50 meaningful chars, fall through to pdftotext fallback |
| 3 | H655.md false positive | `scan.py` | Refine scanner pattern: only flag if placeholder is dominant content (>80% non-whitespace) |
| 4 | Scanner gap (0x0c) | `scan.py` | Add control-character dominance check (>50% control chars = dummy/garbage) |

## Phase 3: Implementation Status
**Completed:** 2026-04-21

| Task | Agent | Status |
|------|-------|--------|
| #1 Fix consultation.client.ts — add 0-byte buffer checks | implementer | ✅ COMPLETED |
| #2 Fix scan.py — add control-character dominance check | implementer | ✅ COMPLETED |
| #3 Write team log (this document) | audit | ✅ COMPLETED |
| #4 Fix queue.service.ts — add content validation after Docling/fallback | implementer | ✅ COMPLETED |
| #5 Fix content.service.ts — add sanity-check guard for small files | implementer | ✅ COMPLETED |
| #6 Review implementation completeness against FIX-PLAN.md | reviewer | ✅ COMPLETED |

**Appendix B Checklist (FIX-PLAN.md) — ALL COMPLETED:**
- [x] Fix `getConsultationPdf` in `src/sfc-clients/consultation.client.ts` — add 0-byte buffer check
- [x] Fix `getConclusionPdf` in `src/sfc-clients/consultation.client.ts` — add 0-byte buffer check
- [x] Add content validation after Docling in `src/workflows/queue.service.ts`
- [x] Add content validation after `basicPdfFallback` in `src/workflows/queue.service.ts`
- [x] Add control-character check in `claude/tasks/doc-corpus-verification/scan.py` (form-feed detection)
- [x] Add sanity-check in `src/services/content.service.ts` before writing small files
- [x] Update scanner pattern for H655 false positive
- [ ] Re-run download for 29 consultations (fix verifies HTML fallback) — **PENDING: jobs submitted to queue**
- [ ] Re-run convert for 12 circulars (fix uses pdftotext fallback) — **PENDING: jobs queued**
- [ ] Validate all files with validation queries above — **PENDING: re-processing required**

**Note on Re-processing:** The 41 bad files (29 + 12) are orphaned — they are not tracked in the LowDB database and their raw files have been cleaned up. To recover them, the app must be run with the fixes applied and the queue must process discover+download+convert jobs for each affected document. A batch of 29 consultation discover jobs was submitted to the queue (15,271 jobs pending at time of submission). The fixes prevent NEW occurrences.

## Phase 4: Review
**Completed:** 2026-04-21

Reviewer verified all patches against FIX-PLAN.md Appendix B:

| Fix | File | Verification |
|-----|------|--------------|
| 0-byte check | `consultation.client.ts` lines 85-88, 105-108 | ✅ PASS |
| Post-Docling validation | `queue.service.ts` lines 750-755 | ✅ PASS |
| Post-fallback validation | `queue.service.ts` lines 759-764 | ✅ PASS |
| Sanity-check guard | `content.service.ts` lines 67-69 | ✅ PASS |
| is_dummy_file() | `scan.py` lines 31-49 | ✅ PASS |
| H655 false positive | `scan.py` lines 66-75 | ✅ PASS (Python syntax corrected by lead) |

TypeScript compiles clean (`npx tsc --noEmit` — no errors).

## Phase 5: Validation
**In Progress:** Awaiting re-processing completion

**Pre-recovery Validation (2026-04-21 13:57 UTC):**
```
Consultation 0-byte files:  29
Circular form-feed files:    12
Files with form-feeds:       186
```

**Post-recovery validation will update when queue completes processing.**

## Success Criteria
- [x] All 4 source files patched per FIX-PLAN.md Appendix B (6 items including optional)
- [ ] 29 consultation 0-byte files re-processed → valid content (jobs submitted to queue)
- [ ] 12 circular form-feed files re-processed → valid content (queue backlog prevents immediate reprocessing)
- [ ] All 3 validation queries return 0 (pending re-processing)
- [ ] FIX-PLAN.md updated (in progress)
- [x] Team formation log written

**Validation Queries (from FIX-PLAN.md):**
```bash
# Query 1: Zero-byte consultation markdown files
find /home/openclaw/.openclaw/workspace/sfc-fetch/data/content/consultations/markdown -name "*.md" -size 0 | wc -l
# Expected: 0

# Query 2: Form-feed-only circular markdown files
find /home/openclaw/.openclaw/workspace/sfc-fetch/data/content/circulars/markdown -name "*.md" -exec grep -L '[^[:space:][:cntrl:]]' {} \; 2>/dev/null | wc -l
# Expected: 0

# Query 3: Files with high form-feed content
grep -rl $'\x0c' /home/openclaw/.openclaw/workspace/sfc-fetch/data/content --include="*.md" | wc -l
# Expected: 0
```

## Success Criteria
- [ ] All 6 source files patched per FIX-PLAN.md Appendix B
- [ ] 29 consultation 0-byte files re-processed
- [ ] 12 circular form-feed files re-processed
- [ ] All 3 validation queries return 0
- [ ] FIX-PLAN.md updated
- [x] Team log written

## Affected Files (from FIX-PLAN.md Appendix A)

**29 Consultation 0-Byte Files** (in `data/content/consultations/markdown/2026/`):
```
00CP1.md, 00CP2.md, 00CP3.md, 00CP5.md, 00CP6.md, 00CP7.md,
01CP5.md, 01CP6.md, 01CP7.md, 01CP8.md, 01CP9.md, 01CP10.md, 01CP11.md, 01CP15.md,
89CP1.md, 90CP1.md, 91CP1.md, 91CP2.md, 92CP1.md, 92CP2.md,
93CP1.md, 94CP1.md, 96CP2.md, 96CP3.md, 97CP2.md,
98CP1.md, 98CP4.md, 98CP5.md, 99CP1.md
```

**12 Circular Form-Feed-Only Files** (in `data/content/circulars/markdown/`):
```
15EC3.md, 16EC59.md, 17EC55.md, 20EC62.md, 20EC64.md, 22EC3.md, 24EC53.md,
H398.md, H480.md, H592.md, H686.md, H692.md
```

**1 False Positive (NOT a failure):** H655.md — legitimate SFC regulatory text