# Manual OCR Required

These PDFs are scanned images with no text layer. The automated conversion pipeline
could not extract meaningful text, and no HTML fallback is available on SFC.

## Instructions

1. Use an OCR tool (e.g., Adobe Acrobat, Tesseract, or online OCR) to convert each PDF to markdown
2. Save the result as `<refno>.md` in this directory
3. Commit and push to the remote repo
4. Run `scripts/sync-manual-ocr.sh` to import the markdown files back into sfc-fetch

## Files

- `H692.pdf`
- `H686.pdf`
- `H592.pdf`
- `H480.pdf`
- `H398.pdf`
