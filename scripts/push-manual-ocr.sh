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

# Find all circulars with NEEDS_MANUAL_OCR status
echo "Finding circulars needing manual OCR..."
python3 << 'PYTHON_SCRIPT'
import json
import os
import shutil

db_path = 'data/db/sfc-db.json'
manual_ocr_dir = 'manual-ocr'

with open(db_path) as f:
    db = json.load(f)

# Find circulars with NEEDS_MANUAL_OCR
needs_ocr = []
for doc in db['circulars']:
    if doc.get('workflow', {}).get('status') == 'NEEDS_MANUAL_OCR':
        ref = doc['_id']
        raw_path = doc.get('source', {}).get('rawFilePath', '')
        if raw_path and os.path.exists(raw_path):
            needs_ocr.append((ref, raw_path))

print(f"Found {len(needs_ocr)} circulars needing manual OCR")

# Copy PDFs to manual-ocr directory
for ref, raw_path in needs_ocr:
    dest = os.path.join(manual_ocr_dir, f"{ref}.pdf")
    if not os.path.exists(dest):
        shutil.copy2(raw_path, dest)
        print(f"  Copied {ref}.pdf")
    else:
        print(f"  {ref}.pdf already exists")

# Create README with instructions
readme_path = os.path.join(manual_ocr_dir, 'README.md')
with open(readme_path, 'w') as f:
    f.write("""# Manual OCR Required

These PDFs are scanned images with no text layer. The automated conversion pipeline
could not extract meaningful text.

## Instructions

1. Use an OCR tool (e.g., Adobe Acrobat, Tesseract, or online OCR) to convert each PDF to text/markdown
2. Save the result as `<refno>.md` in this directory
3. Commit and push to the remote repo
4. The main sfc-fetch repo will sync and process the markdown files

## Files

Each PDF needs manual OCR:
""")
    for ref, _ in needs_ocr:
        f.write(f"- `{ref}.pdf`\n")

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
