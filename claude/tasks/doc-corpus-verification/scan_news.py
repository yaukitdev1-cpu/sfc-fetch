#!/usr/bin/env python3
import os
import json
from pathlib import Path

BASE_DIR = Path("/home/openclaw/.openclaw/workspace/sfc-fetch/data/content/news/markdown")

# Boilerplate/placeholder detection patterns
DUMMY_PATTERNS = [
    "lorem ipsum", "Lorem ipsum", "LOREM IPSUM",
    "TODO", "todo", "[TODO]", "{TODO}",
    "Example", "example", "EXAMPLE",
    "Sample", "sample", "SAMPLE",
    "placeholder", "Placeholder", "PLACEHOLDER",
    "TBD", "tbd",
    "XXX", "xxx",
    "FIXME", "fixme",
    "PLACEHOLDER",
    "insert text here", "Insert text here",
    "your content here", "Your content here",
]

def is_dummy_content(content):
    """Check if content is boilerplate/placeholder."""
    content_lower = content.lower()

    for pattern in DUMMY_PATTERNS:
        if pattern.lower() in content_lower:
            return True

    # Check for very short generic content
    lines = [l.strip() for l in content.strip().split('\n') if l.strip()]

    # If very few lines and they look generic, likely dummy
    if len(lines) <= 3:
        generic_words = ["title", "date", "author", "category", "tag", "summary", "description", "content", "body", "text"]
        first_lines_text = ' '.join(lines[:3]).lower()
        if all(any(gw in first_lines_text for gw in generic_words) for _ in lines):
            # Check if it's just field labels without actual content
            has_colon = any(':' in l for l in lines)
            if has_colon and len(content.strip()) < 200:
                return True

    return False

def classify_file(filepath):
    """Classify a single file as empty, dummy, or valid."""
    try:
        size = os.path.getsize(filepath)
    except OSError:
        return {"size_bytes": 0, "classification": "empty", "reason": "file not accessible"}

    if size == 0:
        return {"size_bytes": 0, "classification": "empty", "reason": "file is 0 bytes"}

    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception as e:
        return {"size_bytes": size, "classification": "empty", "reason": f"read error: {str(e)}"}

    # Check if content is only whitespace/newlines
    stripped = content.strip()
    if not stripped:
        return {"size_bytes": size, "classification": "empty", "reason": "content is only whitespace/newlines"}

    # Check for dummy/placeholder content
    if is_dummy_content(content):
        return {"size_bytes": size, "classification": "dummy", "reason": "boilerplate or placeholder text detected"}

    # Check for valid news content
    # Valid should have specific characteristics: dates, events, proper sentences
    lines = [l.strip() for l in stripped.split('\n') if l.strip()]

    # Must have at least some non-empty lines
    if len(lines) < 2:
        return {"size_bytes": size, "classification": "dummy", "reason": "insufficient content (less than 2 lines)"}

    # Check for meaningful text indicators
    avg_line_len = sum(len(l) for l in lines) / max(len(lines), 1)

    # If average line length is very short (< 5 chars), likely dummy
    if avg_line_len < 5 and len(lines) < 5:
        return {"size_bytes": size, "classification": "dummy", "reason": "lines too short to be meaningful content"}

    # Content looks valid - has proper sentences, not just labels
    has_sentences = any(len(l) > 20 and any(c in l for c in '.!?') for l in lines)
    has_specific_info = any(c.isdigit() for c in content)  # dates, numbers

    if has_sentences or has_specific_info:
        return {"size_bytes": size, "classification": "valid", "reason": "meaningful news content with specific information"}
    else:
        return {"size_bytes": size, "classification": "valid", "reason": "content appears to be valid news entry"}

def main():
    results = []
    years = sorted([d.name for d in BASE_DIR.iterdir() if d.is_dir() and d.name.isdigit()])

    total = 0
    for year in years:
        year_dir = BASE_DIR / year
        md_files = sorted(year_dir.glob("*.md"))
        total += len(md_files)

        print(f"Processing {year}: {len(md_files)} files...")

        for md_file in md_files:
            rel_path = f"{year}/{md_file.name}"
            classification = classify_file(md_file)
            classification["path"] = rel_path
            results.append(classification)

    print(f"\nTotal files: {total}")

    # Write results
    output_path = "/home/openclaw/.openclaw/workspace/sfc-fetch/claude/tasks/doc-corpus-verification/news-scan.json"
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

    # Print summary
    empty = sum(1 for r in results if r['classification'] == 'empty')
    dummy = sum(1 for r in results if r['classification'] == 'dummy')
    valid = sum(1 for r in results if r['classification'] == 'valid')

    print(f"Empty: {empty}")
    print(f"Dummy: {dummy}")
    print(f"Valid: {valid}")
    print(f"Output: {output_path}")

if __name__ == "__main__":
    main()