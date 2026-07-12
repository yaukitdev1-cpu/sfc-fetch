#!/usr/bin/env python3
"""
Automated vision OCR for scanned PDFs using OpenRouter API.

Converts PDF pages to images, sends to vision model, extracts text.
Outputs markdown files to manual-ocr/ for sync-manual-ocr.sh to import.

Usage:
    python3 scripts/auto-ocr-vision.py                    # OCR all NEEDS_MANUAL_OCR docs
    python3 scripts/auto-ocr-vision.py 89CP1              # OCR specific ref
    python3 scripts/auto-ocr-vision.py --dry-run          # Show what would be done
    python3 scripts/auto-ocr-vision.py --model gpt-4o     # Use different model

Environment:
    OPENROUTER_API_KEY - Required for API access
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' module not found. Install with: pip install requests")
    sys.exit(1)

# Configuration
REPO_ROOT = Path(__file__).parent.parent
DB_PATH = REPO_ROOT / "data" / "db" / "sfc-db.json"
MANUAL_OCR_DIR = REPO_ROOT / "manual-ocr"
RAW_DIR = REPO_ROOT / "data" / "raw" / "consultations"

DEFAULT_MODEL = "minimax/minimax-m3"
IMAGE_DPI = 200  # Balance between quality and size
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def load_db():
    """Load sfc-fetch database."""
    with open(DB_PATH) as f:
        return json.load(f)


def get_needs_manual_ocr(db):
    """Get list of docs that need manual OCR."""
    results = []
    for doc in db.get("consultations", []):
        if doc.get("workflow", {}).get("status") == "NEEDS_MANUAL_OCR":
            ref = doc.get("_id") or doc.get("metadata", {}).get("cpRefNo")
            if ref:
                results.append(ref)
    return sorted(results)


def pdf_to_images(pdf_path, output_dir, dpi=IMAGE_DPI):
    """Convert PDF pages to PNG images using pdftoppm."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "pdftoppm",
        "-png",
        "-r", str(dpi),
        str(pdf_path),
        str(output_dir / "page")
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pdftoppm failed: {result.stderr}")

    images = sorted(output_dir.glob("page-*.png"))
    return images


def encode_image(image_path):
    """Encode image to base64."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def ocr_page(image_path, model, page_num, total_pages, api_key):
    """Send image to vision model and extract text."""
    image_b64 = encode_image(image_path)

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_b64}"
                        }
                    },
                    {
                        "type": "text",
                        "text": (
                            f"Extract all text from this scanned document page "
                            f"(page {page_num}/{total_pages}). "
                            f"Preserve formatting, headings, and structure. "
                            f"Output as clean markdown. "
                            f"If the page is blank or unreadable, output '[PAGE UNREADABLE]'."
                        )
                    }
                ]
            }
        ],
        "max_tokens": 4000
    }

    auth_header = "Bearer " + api_key
    headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json"
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(
                OPENROUTER_URL,
                headers=headers,
                json=payload,
                timeout=120
            )
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                raise RuntimeError(f"API error: {data['error']}")

            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                raise RuntimeError(f"No content in response: {json.dumps(data)[:200]}")

            return content

        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                print(f"    Retry {attempt + 1}/{MAX_RETRIES}: {e}")
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                raise


def ocr_pdf(ref, model, api_key, dry_run=False):
    """OCR a single PDF and return markdown content."""
    pdf_path = RAW_DIR / f"{ref}.pdf"

    # Fallback: check manual-ocr/ directory (where scanned PDFs are stored)
    if not pdf_path.exists():
        alt_path = MANUAL_OCR_DIR / f"{ref}.pdf"
        if alt_path.exists():
            pdf_path = alt_path
        else:
            raise FileNotFoundError(f"PDF not found: checked {RAW_DIR / f'{ref}.pdf'} and {alt_path}")

    # Get page count
    result = subprocess.run(
        ["pdfinfo", str(pdf_path)],
        capture_output=True,
        text=True
    )
    pages = 0
    for line in result.stdout.split("\n"):
        if "Pages:" in line:
            pages = int(line.split(":")[1].strip())

    print(f"  {ref}: {pages} pages")

    if dry_run:
        return f"[DRY RUN] Would OCR {pages} pages from {pdf_path}"

    # Convert to images in temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"    Converting to images...")
        images = pdf_to_images(pdf_path, tmpdir)

        if len(images) != pages:
            print(f"    Warning: Expected {pages} pages, got {len(images)} images")

        # OCR each page
        page_texts = []
        for i, img_path in enumerate(images, 1):
            print(f"    OCR page {i}/{len(images)}...", end=" ", flush=True)
            text = ocr_page(img_path, model, i, len(images), api_key)
            page_texts.append(text)
            print(f"OK ({len(text)} chars)")

            # Small delay to avoid rate limiting
            if i < len(images):
                time.sleep(0.5)

    # Assemble markdown
    markdown = f"# {ref}\n\n"
    for i, text in enumerate(page_texts, 1):
        if "[PAGE UNREADABLE]" in text:
            markdown += f"\n---\n\n*Page {i}: [UNREADABLE]*\n\n"
        else:
            markdown += f"\n---\n\n{text}\n\n"

    return markdown


def save_markdown(ref, content):
    """Save markdown to manual-ocr directory."""
    MANUAL_OCR_DIR.mkdir(parents=True, exist_ok=True)
    output_path = MANUAL_OCR_DIR / f"{ref}.md"

    with open(output_path, "w") as f:
        f.write(content)

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Automated vision OCR for scanned PDFs")
    parser.add_argument("refs", nargs="*", help="Specific refNos to OCR (default: all NEEDS_MANUAL_OCR)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without OCR")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Vision model (default: {DEFAULT_MODEL})")
    parser.add_argument("--dpi", type=int, default=IMAGE_DPI, help=f"Image DPI (default: {IMAGE_DPI})")
    parser.add_argument("--key-file", default=str(REPO_ROOT / ".openrouter_key"), 
                        help=f"Path to file containing API key (default: {REPO_ROOT / '.openrouter_key'})")

    args = parser.parse_args()

    # Load DB
    db = load_db()

    # Get refs to process
    if args.refs:
        refs = args.refs
    else:
        refs = get_needs_manual_ocr(db)

    if not refs:
        print("No documents need manual OCR.")
        return

    print(f"Found {len(refs)} documents to OCR:")
    for ref in refs:
        print(f"  - {ref}")
    print()

    if args.dry_run:
        print("DRY RUN MODE - no actual OCR will be performed\n")

    # Get API key from file or environment
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        key_file = Path(args.key_file)
        if key_file.exists():
            with open(key_file) as f:
                api_key = f.read().strip()
        elif not args.dry_run:
            print(f"ERROR: API key not found. Set OPENROUTER_API_KEY or create {key_file}")
            sys.exit(1)

    # Process each PDF
    results = []
    for ref in refs:
        try:
            print(f"Processing {ref}...")
            markdown = ocr_pdf(ref, args.model, api_key, args.dry_run)

            if not args.dry_run:
                output_path = save_markdown(ref, markdown)
                print(f"  Saved to {output_path}")
                results.append((ref, "OK", str(output_path)))
            else:
                results.append((ref, "DRY RUN", markdown))

        except Exception as e:
            print(f"  ERROR: {e}")
            results.append((ref, "ERROR", str(e)))

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    ok_count = sum(1 for _, status, _ in results if status == "OK")
    err_count = sum(1 for _, status, _ in results if status == "ERROR")

    for ref, status, detail in results:
        print(f"  {ref}: {status}")
        if status == "ERROR":
            print(f"    {detail}")

    print()
    print(f"Completed: {ok_count}/{len(refs)}")
    if err_count > 0:
        print(f"Errors: {err_count}/{len(refs)}")

    if ok_count > 0 and not args.dry_run:
        print()
        print("Next steps:")
        print("  1. Review the generated .md files in manual-ocr/")
        print("  2. Run: ./scripts/sync-manual-ocr.sh")
        print("     (This will import them into the database)")


if __name__ == "__main__":
    main()
