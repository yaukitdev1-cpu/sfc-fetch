#!/bin/bash
# Push PDFs needing manual OCR to remote repo
# Usage: ./scripts/push-manual-ocr.sh

set -e

REPO_DIR="/home/openclaw/.openclaw/workspace/sfc-fetch"
MANUAL_OCR_DIR="$REPO_DIR/manual-ocr"
REMOTE_REPO="git@github.com:yourusername/sfc-manual-ocr.git"  # Update this!

cd "$REPO_DIR"

# Create manual-ocr directory if it doesn't exist
mkdir -p "$MANUAL_OCR_DIR"

# Find all documents needing manual OCR across all categories
echo "Finding documents needing manual OCR..."
python3 << 'PYTHON_SCRIPT'
import json
import os
import shutil

db_path = 'data/db/sfc-db.json'
manual_ocr_dir = 'manual-ocr'

with open(db_path) as f:
    db = json.load(f)

categories = ['circulars', 'consultations', 'news', 'guidelines']
needs_ocr = []

for category in categories:
    docs = db.get(category, [])
    for doc in docs:
        wf = doc.get('workflow', {})
        # Check both status and needsManualOcr flag (status may be FAILED if failStep overrode it)
        if wf.get('status') == 'NEEDS_MANUAL_OCR' or wf.get('needsManualOcr') == True:
            ref = doc['_id']
            # Try multiple possible raw file locations
            raw_path = (
                doc.get('source', {}).get('rawFilePath') or
                doc.get('content', {}).get('rawFilePath') or
                ''
            )
            if raw_path and os.path.exists(raw_path):
                needs_ocr.append((ref, raw_path, category))
            else:
                # Try conventional path
                conventional = f'data/raw/{category}/{ref}.pdf'
                if os.path.exists(conventional):
                    needs_ocr.append((ref, conventional, category))
                else:
                    print(f"  WARN {category}/{ref}: no raw PDF found")

print(f"Found {len(needs_ocr)} documents needing manual OCR")

# Group by category for display
by_cat = {}
for ref, raw_path, category in needs_ocr:
    by_cat.setdefault(category, []).append((ref, raw_path))

for cat, items in sorted(by_cat.items()):
    print(f"\n  [{cat}] {len(items)} files:")
    for ref, raw_path in items:
        dest = os.path.join(manual_ocr_dir, f"{ref}.pdf")
        if not os.path.exists(dest):
            shutil.copy2(raw_path, dest)
            print(f"    Copied {ref}.pdf")
        else:
            print(f"    {ref}.pdf already exists")

# Create README with instructions
readme_path = os.path.join(manual_ocr_dir, 'README.md')
with open(readme_path, 'w') as f:
    f.write("""# Manual OCR Required

These PDFs are scanned images with no text layer. The automated conversion pipeline
could not extract meaningful text (Docling OCR timeout or insufficient content).

## Instructions

1. Use an OCR tool (e.g., Adobe Acrobat, Tesseract, or online OCR) to convert each PDF to text/markdown
2. Save the result as `<refno>.md` in this directory
3. Commit and push to the remote repo
4. Run `scripts/sync-manual-ocr.sh` on the server to import the results

## Files by Category

""")
    for cat, items in sorted(by_cat.items()):
        f.write(f"### {cat.title()} ({len(items)} files)\n\n")
        for ref, _ in items:
            f.write(f"- `{ref}.pdf`\n")
        f.write("\n")

print(f"\nManual OCR directory: {manual_ocr_dir}")
print(f"Total files: {len(needs_ocr)}")
PYTHON_SCRIPT

# Check if there are any files to commit
if [ -z "$(ls -A $MANUAL_OCR_DIR/*.pdf 2>/dev/null)" ]; then
    echo "No PDFs to push"
    exit 0
fi

# Initialize git repo if needed
if [ ! -d "$MANUAL_OCR_DIR/.git" ]; then
    echo "Initializing git repo in manual-ocr..."
    cd "$MANUAL_OCR_DIR"
    git init
    git remote add origin "$REMOTE_REPO" 2>/dev/null || true
    git add README.md *.pdf 2>/dev/null || true
    git commit -m "Initial commit: PDFs needing manual OCR"
    git push -u origin main 2>/dev/null || git push -u origin master
else
    echo "Committing changes to manual-ocr repo..."
    cd "$MANUAL_OCR_DIR"
    git add *.pdf README.md 2>/dev/null || true
    if ! git diff --cached --quiet; then
        git commit -m "Add PDFs needing manual OCR - $(date +%Y-%m-%d)"
        git push
    else
        echo "No changes to commit"
    fi
fi

echo "Done! Manual OCR files pushed to remote repo."
