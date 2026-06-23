#!/usr/bin/env python3
"""
Fix existing broken circulars by re-processing them through the new conversion logic.
This script:
1. Identifies circulars with broken/insufficient markdown
2. Re-downloads their raw PDFs (if missing)
3. Marks them for re-conversion
4. The sfc-fetch service will then process them with the new HTML fallback logic
"""

import json
import os
import sys

DB_PATH = 'data/db/sfc-db.json'
RAW_DIR = 'data/raw/circulars'

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found")
        sys.exit(1)
    
    with open(DB_PATH) as f:
        db = json.load(f)
    
    # Find circulars with broken markdown
    broken = []
    for doc in db['circulars']:
        ref = doc['_id']
        md_size = doc.get('content', {}).get('markdownSize', 0)
        workflow_status = doc.get('workflow', {}).get('status', '')
        
        # Check if markdown is broken (too small)
        if md_size < 100 and workflow_status == 'COMPLETED':
            broken.append(doc)
    
    print(f"Found {len(broken)} circulars with broken markdown (< 100 bytes)")
    
    if not broken:
        print("Nothing to fix!")
        return
    
    # Check which ones have raw PDFs on disk
    has_pdf = 0
    missing_pdf = 0
    for doc in broken:
        ref = doc['_id']
        pdf_path = os.path.join(RAW_DIR, f'{ref}.pdf')
        if os.path.exists(pdf_path):
            has_pdf += 1
            print(f"  {ref}: PDF exists ({os.path.getsize(pdf_path)} bytes)")
        else:
            missing_pdf += 1
            print(f"  {ref}: PDF missing - will need re-download")
    
    print(f"\nSummary: {has_pdf} have PDFs, {missing_pdf} need re-download")
    
    # Reset workflow status to trigger re-processing
    reset_count = 0
    for doc in broken:
        ref = doc['_id']
        
        # Check if raw PDF exists
        pdf_path = os.path.join(RAW_DIR, f'{ref}.pdf')
        has_raw = os.path.exists(pdf_path)
        
        if has_raw:
            # Reset to DISCOVERED so convert will be triggered
            doc['workflow']['status'] = 'DISCOVERED'
            doc['workflow']['error'] = None
            # Clear broken markdown
            if 'markdownPath' in doc.get('content', {}):
                del doc['content']['markdownPath']
            if 'markdownSize' in doc.get('content', {}):
                del doc['content']['markdownSize']
            if 'markdownHash' in doc.get('content', {}):
                del doc['content']['markdownHash']
            reset_count += 1
            print(f"  Reset {ref} to DISCOVERED (PDF exists)")
        else:
            # Need to re-download - set to PENDING so discover will run
            doc['workflow']['status'] = 'PENDING'
            doc['workflow']['error'] = None
            # Clear broken markdown
            if 'markdownPath' in doc.get('content', {}):
                del doc['content']['markdownPath']
            if 'markdownSize' in doc.get('content', {}):
                del doc['content']['markdownSize']
            if 'markdownHash' in doc.get('content', {}):
                del doc['content']['markdownHash']
            reset_count += 1
            print(f"  Reset {ref} to PENDING (needs re-download)")
    
    # Save DB
    with open(DB_PATH, 'w') as f:
        json.dump(db, f, indent=2)
    
    print(f"\nReset {reset_count} circulars for re-processing")
    print("Restart sfc-fetch to trigger re-processing:")
    print("  pm2 restart sfc-fetch")

if __name__ == '__main__':
    main()
