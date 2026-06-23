#!/bin/bash
# Sync manually OCR'd markdown files back into sfc-fetch
# Usage: ./scripts/sync-manual-ocr.sh

set -e

REPO_DIR="/home/openclaw/.openclaw/workspace/sfc-fetch"
MANUAL_OCR_DIR="$REPO_DIR/manual-ocr"

cd "$REPO_DIR"

echo "Pulling latest from remote..."
cd "$MANUAL_OCR_DIR"
git pull

echo "Processing OCR'd markdown files..."
python3 << 'PYTHON_SCRIPT'
import json
import os
import glob
import hashlib
from datetime import datetime

db_path = 'data/db/sfc-db.json'
manual_ocr_dir = 'manual-ocr'
content_dir = 'data/content/circulars/markdown/2026'

# Load DB
with open(db_path) as f:
    db = json.load(f)

# Find all .md files in manual-ocr directory
md_files = glob.glob(os.path.join(manual_ocr_dir, '*.md'))
print(f"Found {len(md_files)} markdown files in manual-ocr/")

processed = 0
skipped = 0

for md_path in md_files:
    basename = os.path.basename(md_path)
    ref = basename.replace('.md', '')
    
    # Find the document in DB
    doc = next((d for d in db['circulars'] if d['_id'] == ref), None)
    if not doc:
        print(f"  SKIP {ref}: not found in DB")
        skipped += 1
        continue
    
    # Read markdown content
    with open(md_path, 'r') as f:
        content = f.read()
    
    meaningful_chars = len(content.replace(' ', '').replace('\n', '').replace('\t', ''))
    if meaningful_chars < 50:
        print(f"  SKIP {ref}: markdown too small ({meaningful_chars} chars)")
        skipped += 1
        continue
    
    # Save to content directory
    os.makedirs(content_dir, exist_ok=True)
    dest_path = os.path.join(content_dir, f'{ref}.md')
    with open(dest_path, 'w') as f:
        f.write(content)
    
    # Calculate hash
    md_hash = hashlib.sha256(content.encode()).hexdigest()
    
    # Update DB
    doc['content'] = {
        **doc.get('content', {}),
        'markdownPath': f'circulars/markdown/2026/{ref}.md',
        'markdownSize': len(content),
        'markdownHash': f'sha256:{md_hash}',
        'lastConverted': datetime.utcnow().isoformat() + 'Z',
        'manualOcr': True,
    }
    doc['workflow'] = {
        **doc.get('workflow', {}),
        'status': 'COMPLETED',
        'error': None,
        'needsManualOcr': False,
        'completedAt': datetime.utcnow().isoformat() + 'Z',
    }
    
    processed += 1
    print(f"  OK {ref}: {len(content)} chars -> {dest_path}")

# Save DB
with open(db_path, 'w') as f:
    json.dump(db, f, indent=2)

print(f"\nProcessed: {processed}, Skipped: {skipped}")
PYTHON_SCRIPT

echo "Done!"
