#!/usr/bin/env python3
import os
import json
import re

DIR = "/home/openclaw/.openclaw/workspace/sfc-fetch/data/content/circulars/markdown/2026"
OUT = "/home/openclaw/.openclaw/workspace/sfc-fetch/claude/tasks/doc-corpus-verification/circulars-scan.json"

# Patterns that indicate placeholder/boilerplate content (case-insensitive)
DUMMY_PATTERNS = [
    re.compile(r'\blorem ipsum\b'),
    re.compile(r'\btodo\b'),
    re.compile(r'\bexample\s{0,20}circular\b', re.I),
    re.compile(r'\bsample\s{0,20}circular\b', re.I),
    re.compile(r'\bsample\s{0,20}document\b', re.I),
    re.compile(r'\bsample\s{0,20}text\b', re.I),
    re.compile(r'\bplaceholder\b'),
    re.compile(r'^#\s*example\s*$', re.M | re.I),
    re.compile(r'^#\s*sample\s*$', re.M | re.I),
    re.compile(r'^#\s*todo\s*$', re.M | re.I),
    re.compile(r'\btest\s{0,10}content\b', re.I),
    re.compile(r'\bfake\s{0,10}data\b', re.I),
]

IMAGE_LINE_RE = re.compile(r'^!\[.*?\]\(data:image/.*?\)$')

def get_text_lines(content):
    """Extract non-image lines (visible text content)."""
    return [l for l in content.split('\n') if not IMAGE_LINE_RE.match(l.strip())]

def is_dummy_file(content: str) -> bool:
    """Check if file is dummy based on control character dominance.

    Returns True if more than 50% of non-whitespace characters are control characters.
    Control characters are ASCII 0x00-0x1f and 0x7f.
    """
    stripped = content.strip()
    if len(stripped) == 0:
        return True

    # Count control characters vs total non-whitespace characters
    control_chars = sum(1 for c in stripped if ord(c) < 32 or ord(c) == 127)
    non_ws_chars = sum(1 for c in stripped if not c.isspace())

    if non_ws_chars == 0:
        return True

    control_ratio = control_chars / non_ws_chars
    return control_ratio > 0.5

def classify(content: str):
    stripped = content.strip()
    if len(stripped) == 0:
        return "empty", "file is empty or whitespace only"

    # Check for control character dominance first (catches H655 and other form-feed issues)
    if is_dummy_file(content):
        return "dummy", "control character dominance detected (>50%)"

    text_lines = get_text_lines(content)
    visible_text = '\n'.join(text_lines).strip()

    if len(visible_text) == 0:
        return "dummy", "contains only image data, no readable text"

    # Check for placeholder/boilerplate patterns in visible text
    # Only flag if the placeholder dominates >80% of content
    non_space = re.sub(r'\s', '', visible_text)
    placeholder_count = non_space.lower().count('placeholder') * 10
    visible_len = len(non_space)
    if visible_len > 0 and placeholder_count / visible_len > 0.8:
        return "dummy", f"content dominated by placeholder text ('placeholder')"

    if len(visible_text) < 50:
        return "dummy", f"very short text content ({len(visible_text)} chars)"

    word_count = len(visible_text.split())
    return "valid", f"meaningful content ({word_count} words)"

results = []
files = sorted(os.listdir(DIR))

for fname in files:
    if not fname.endswith(".md"):
        continue
    fpath = os.path.join(DIR, fname)
    stat = os.stat(fpath)
    size = stat.st_size

    try:
        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        results.append({
            "path": fname,
            "size_bytes": size,
            "classification": "dummy",
            "reason": f"read error: {e}"
        })
        continue

    cls, reason = classify(content)
    results.append({
        "path": fname,
        "size_bytes": size,
        "classification": cls,
        "reason": reason
    })

with open(OUT, "w") as f:
    json.dump(results, f, indent=2)

empty_count = sum(1 for r in results if r["classification"] == "empty")
dummy_count = sum(1 for r in results if r["classification"] == "dummy")
valid_count = sum(1 for r in results if r["classification"] == "valid")
total = len(results)

print(f"Total: {total}, Empty: {empty_count}, Dummy: {dummy_count}, Valid: {valid_count}")
print(f"Output: {OUT}")