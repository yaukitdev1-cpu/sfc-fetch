#!/usr/bin/env python3
"""
Comprehensive document validity scanner for sfc-fetch.

Read-only scan of sfc-fetch DB for invalid, broken, or inconsistent documents
across all 4 collections (circulars, guidelines, consultations, news) + queue.

Usage:
    python3 scripts/scan-invalid-docs.py                    # full scan, summary output
    python3 scripts/scan-invalid-docs.py --verbose           # list every finding
    python3 scripts/scan-invalid-docs.py --json              # machine-readable output
    python3 scripts/scan-invalid-docs.py --category circulars  # scan one collection only
    python3 scripts/scan-invalid-docs.py --deep              # content integrity (slower)
    python3 scripts/scan-invalid-docs.py --fix               # auto-fix DB/disk mismatches
    python3 scripts/scan-invalid-docs.py --hide-info         # suppress INFO-level findings

Exit codes:
    0 = no CRITICAL findings
    1 = at least one CRITICAL finding
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(REPO_ROOT, "data", "db", "sfc-db.json")
CONTENT_DIR = os.path.join(REPO_ROOT, "data", "content")

CATEGORIES = ["circulars", "guidelines", "consultations", "news"]

# Per-collection field that holds the reference number
REF_FIELD_MAP = {
    "circulars": "refNo",
    "guidelines": "refNo",
    "consultations": "cpRefNo",
    "news": "newsRefNo",
}

# Thresholds matching convertResource() logic
CRITICAL_MD_SIZE = 50   # Below this = broken content
WARNING_MD_SIZE = 200   # Below this = suspiciously small

# Queue orphans threshold
ORPHAN_WARN_THRESHOLD = 100

# Known legitimately short docs (e.g., supersession notices)
# These are flagged as WARNING by the < 200B threshold but are valid content
LEGITIMATELY_SHORT_DOCS = {
    "H114",  # Circular supersession notice (132B)
}


# ── Types ──────────────────────────────────────────────────────────────────────

class Severity(Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


@dataclass
class Finding:
    scan: str
    severity: Severity
    category: str  # collection name or "queue"
    refs: list  # affected refNos
    message: str
    count: int = 0

    def __post_init__(self):
        if not self.count:
            self.count = len(self.refs)


@dataclass
class ScanResult:
    timestamp: str
    collection_counts: dict
    queue_size: int
    findings: list = field(default_factory=list)

    @property
    def critical_count(self):
        return sum(1 for f in self.findings if f.severity == Severity.CRITICAL)

    @property
    def warning_count(self):
        return sum(1 for f in self.findings if f.severity == Severity.WARNING)

    @property
    def info_count(self):
        return sum(1 for f in self.findings if f.severity == Severity.INFO)


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_db() -> dict:
    """Load and validate sfc-db.json."""
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found", file=sys.stderr)
        sys.exit(2)
    with open(DB_PATH) as f:
        db = json.load(f)
    for cat in CATEGORIES:
        if cat not in db:
            print(f"Warning: collection '{cat}' missing from DB", file=sys.stderr)
            db[cat] = []
    if "queue" not in db:
        db["queue"] = []
    return db


def get_ref(doc: dict, category: str) -> str:
    """Extract the reference number from a document."""
    meta = doc.get("metadata", {})
    field_name = REF_FIELD_MAP.get(category, "refNo")
    return meta.get(field_name) or doc.get("_id", "?")


def md_full_path(md_path: str) -> str:
    """Convert relative markdownPath to absolute disk path."""
    return os.path.join(CONTENT_DIR, md_path)


# ── Scans ──────────────────────────────────────────────────────────────────────

def scan_broken_markdown(db: dict, category_filter: Optional[str] = None) -> list:
    """Check 1: COMPLETED docs with tiny or zero markdown content."""
    findings = []
    cats = [category_filter] if category_filter else CATEGORIES

    for cat in cats:
        critical_refs = []
        warning_refs = []

        for doc in db[cat]:
            wf = doc.get("workflow", {})
            if wf.get("status") != "COMPLETED":
                continue

            md_size = doc.get("content", {}).get("markdownSize", 0)
            ref = get_ref(doc, cat)

            # Skip known legitimately short docs
            if ref in LEGITIMATELY_SHORT_DOCS:
                continue

            if md_size < CRITICAL_MD_SIZE:
                critical_refs.append(f"{ref} ({md_size}B)")
            elif md_size < WARNING_MD_SIZE:
                warning_refs.append(f"{ref} ({md_size}B)")

        if critical_refs:
            findings.append(Finding(
                scan="broken_markdown",
                severity=Severity.CRITICAL,
                category=cat,
                refs=critical_refs,
                message=f"COMPLETED with < {CRITICAL_MD_SIZE}B markdown (broken content)",
            ))

        if warning_refs:
            findings.append(Finding(
                scan="broken_markdown",
                severity=Severity.WARNING,
                category=cat,
                refs=warning_refs,
                message=f"COMPLETED with < {WARNING_MD_SIZE}B markdown (suspiciously small)",
            ))

    return findings


def scan_missing_markdown_file(db: dict, category_filter: Optional[str] = None) -> list:
    """Check 2: markdownPath set in DB but file doesn't exist on disk."""
    findings = []
    cats = [category_filter] if category_filter else CATEGORIES

    for cat in cats:
        missing = []
        for doc in db[cat]:
            md_path = doc.get("content", {}).get("markdownPath")
            if md_path:
                full = md_full_path(md_path)
                if not os.path.exists(full):
                    missing.append(get_ref(doc, cat))

        if missing:
            findings.append(Finding(
                scan="missing_markdown_file",
                severity=Severity.CRITICAL,
                category=cat,
                refs=missing,
                message=f"markdownPath points to missing file on disk",
            ))

    return findings


def scan_missing_raw_file(db: dict, category_filter: Optional[str] = None) -> list:
    """Check 3: rawFilePath set but file deleted on disk."""
    findings = []
    cats = [category_filter] if category_filter else CATEGORIES

    for cat in cats:
        completed_missing = []
        incomplete_missing = []

        for doc in db[cat]:
            raw_path = doc.get("source", {}).get("rawFilePath")
            if not raw_path:
                continue
            if os.path.exists(raw_path):
                continue

            status = doc.get("workflow", {}).get("status", "")
            ref = get_ref(doc, cat)

            if status == "COMPLETED":
                completed_missing.append(ref)
            else:
                incomplete_missing.append(ref)

        # COMPLETED + missing raw is normal (cleanupRawFile deletes after conversion)
        if completed_missing:
            findings.append(Finding(
                scan="missing_raw_file",
                severity=Severity.INFO,
                category=cat,
                refs=completed_missing,
                message="COMPLETED docs with cleaned-up raw files (normal behavior)",
            ))

        # Not-completed + missing raw is a problem — needs re-download
        if incomplete_missing:
            findings.append(Finding(
                scan="missing_raw_file",
                severity=Severity.WARNING,
                category=cat,
                refs=incomplete_missing,
                message="Not COMPLETED but raw file missing (needs re-download)",
            ))

    return findings


def scan_failed_docs(db: dict, category_filter: Optional[str] = None) -> list:
    """Check 4: Docs stuck in FAILED status."""
    findings = []
    cats = [category_filter] if category_filter else CATEGORIES

    # Expected failure reasons (not actual bugs)
    expected_failures = [
        "No English content available",
        "placeholder HTML detected",
    ]

    for cat in cats:
        failed = []
        for doc in db[cat]:
            if doc.get("workflow", {}).get("status") == "FAILED":
                ref = get_ref(doc, cat)
                err = doc.get("workflow", {}).get("error", "")
                
                # Skip expected failures (e.g., no English content)
                if any(expected in err for expected in expected_failures):
                    continue
                
                # Truncate long errors for summary
                err_short = err[:100] + "..." if len(err) > 100 else err
                failed.append(f"{ref}: {err_short}")

        if failed:
            findings.append(Finding(
                scan="failed_docs",
                severity=Severity.CRITICAL,
                category=cat,
                refs=failed,
                message="Documents stuck in FAILED status",
            ))

    return findings


def scan_stale_queue(db: dict) -> list:
    """Check 5: Orphaned / stale queue entries."""
    findings = []
    queue = db.get("queue", [])

    if not queue:
        return findings

    # Build lookup: (category, refNo) -> document
    doc_lookup = {}
    for cat in CATEGORIES:
        for doc in db[cat]:
            ref = get_ref(doc, cat)
            doc_lookup[(cat, ref)] = doc

    orphaned_in_progress = []
    stale_pending = []
    ref_not_found = []

    for entry in queue:
        cat = entry.get("category", "")
        ref = entry.get("refNo", "")
        status = entry.get("status", "")
        action = entry.get("action", "")

        doc = doc_lookup.get((cat, ref))

        if doc is None:
            # Queue entry references a doc not in any collection
            ref_not_found.append(f"{cat}/{ref} ({action}/{status})")
            continue

        wf_status = doc.get("workflow", {}).get("status", "")
        has_md = bool(doc.get("content", {}).get("markdownPath"))

        if status == "in_progress":
            if wf_status in ("COMPLETED", "FAILED"):
                orphaned_in_progress.append(f"{cat}/{ref} (doc={wf_status})")

        elif status == "pending":
            if wf_status == "COMPLETED" and action in ("discover", "convert"):
                stale_pending.append(f"{cat}/{ref} ({action})")
            elif has_md and action == "convert":
                stale_pending.append(f"{cat}/{ref} (convert, already has md)")

    if orphaned_in_progress:
        findings.append(Finding(
            scan="stale_queue",
            severity=Severity.WARNING,
            category="queue",
            refs=orphaned_in_progress,
            message="in_progress queue entries but doc is already COMPLETED/FAILED (orphaned)",
        ))

    if stale_pending:
        findings.append(Finding(
            scan="stale_queue",
            severity=Severity.WARNING,
            category="queue",
            refs=stale_pending,
            message="pending queue entries for docs already COMPLETED or with markdown",
        ))

    if ref_not_found:
        findings.append(Finding(
            scan="stale_queue",
            severity=Severity.CRITICAL,
            category="queue",
            refs=ref_not_found,
            message="Queue entries referencing non-existent documents",
        ))

    return findings


def scan_workflow_anomalies(db: dict, category_filter: Optional[str] = None) -> list:
    """Check 6: Unexpected state combinations."""
    findings = []
    cats = [category_filter] if category_filter else CATEGORIES

    for cat in cats:
        no_timestamp = []
        zero_md_completed = []

        for doc in db[cat]:
            wf = doc.get("workflow", {})
            status = wf.get("status", "")
            ref = get_ref(doc, cat)

            if status == "COMPLETED":
                if not wf.get("completedAt"):
                    no_timestamp.append(ref)

                md_size = doc.get("content", {}).get("markdownSize", 0)
                # Skip known legitimately short docs from zero-markdown check
                if md_size == 0 and ref not in LEGITIMATELY_SHORT_DOCS:
                    zero_md_completed.append(ref)

        if no_timestamp:
            findings.append(Finding(
                scan="workflow_anomalies",
                severity=Severity.WARNING,
                category=cat,
                refs=no_timestamp,
                message="COMPLETED but missing completedAt timestamp",
            ))

        if zero_md_completed:
            findings.append(Finding(
                scan="workflow_anomalies",
                severity=Severity.WARNING,
                category=cat,
                refs=zero_md_completed,
                message="COMPLETED but markdownSize is 0",
            ))

    return findings


def scan_content_integrity(db: dict, category_filter: Optional[str] = None) -> list:
    """Check 7: Markdown file size on disk vs DB size (slower — disk I/O)."""
    findings = []
    cats = [category_filter] if category_filter else CATEGORIES

    for cat in cats:
        mismatched = []

        for doc in db[cat]:
            md_path = doc.get("content", {}).get("markdownPath")
            db_size = doc.get("content", {}).get("markdownSize", 0)

            if not md_path or db_size == 0:
                continue

            full = md_full_path(md_path)
            if not os.path.exists(full):
                continue  # Already caught by scan_missing_markdown_file

            disk_size = os.path.getsize(full)
            if disk_size == 0 and db_size > 0:
                mismatched.append(f"{get_ref(doc, cat)} (disk=0B, db={db_size}B)")
            elif db_size > 0:
                diff_pct = abs(disk_size - db_size) / db_size * 100
                if diff_pct > 10:
                    mismatched.append(
                        f"{get_ref(doc, cat)} (disk={disk_size}B, db={db_size}B, Δ{diff_pct:.0f}%)"
                    )

        if mismatched:
            findings.append(Finding(
                scan="content_integrity",
                severity=Severity.WARNING,
                category=cat,
                refs=mismatched,
                message="Markdown file size on disk differs from DB by > 10%",
            ))

    return findings


def scan_queue_health(db: dict) -> list:
    """Check 8: Queue structure issues."""
    findings = []
    queue = db.get("queue", [])

    if not queue:
        return findings

    from collections import Counter

    status_counts = Counter(e.get("status") for e in queue)
    action_counts = Counter(e.get("action") for e in queue)

    in_progress = status_counts.get("in_progress", 0)
    pending = status_counts.get("pending", 0)

    if in_progress > ORPHAN_WARN_THRESHOLD:
        findings.append(Finding(
            scan="queue_health",
            severity=Severity.WARNING,
            category="queue",
            refs=[],
            message=(
                f"{in_progress} in_progress entries (threshold: {ORPHAN_WARN_THRESHOLD}). "
                f"Likely worker death or orphan accumulation. "
                f"Status distribution: {dict(status_counts)}"
            ),
            count=in_progress,
        ))

    return findings


# ── Reporting ──────────────────────────────────────────────────────────────────

def format_ref_list(refs: list, max_show: int = 10) -> str:
    """Format a list of refs, truncating if too many."""
    if len(refs) <= max_show:
        return ", ".join(refs)
    shown = ", ".join(refs[:max_show])
    return f"{shown} ... (+{len(refs) - max_show} more)"


def print_report(result: ScanResult, verbose: bool = False, hide_info: bool = False):
    """Print human-readable scan report."""
    print()
    print("━" * 60)
    print("  🔍 SFC-FETCH DOCUMENT SCAN")
    print(f"  {result.timestamp}")
    print("━" * 60)

    # Collection summary
    counts = ", ".join(f"{k}={v}" for k, v in result.collection_counts.items())
    print(f"\nCollections: {counts}")
    print(f"Queue: {result.queue_size} entries")

    if not result.findings:
        print("\n✅ All clear — no issues found.")
        print("━" * 60)
        return

    # Group by scan
    from collections import defaultdict
    by_scan = defaultdict(list)
    for f in result.findings:
        by_scan[f.scan].append(f)

    scan_labels = {
        "broken_markdown": "broken_markdown",
        "missing_markdown_file": "missing_markdown_file",
        "missing_raw_file": "missing_raw_file",
        "failed_docs": "failed_docs",
        "stale_queue": "stale_queue",
        "workflow_anomalies": "workflow_anomalies",
        "content_integrity": "content_integrity",
        "queue_health": "queue_health",
    }

    scan_order = [
        "broken_markdown", "missing_markdown_file", "missing_raw_file",
        "failed_docs", "stale_queue", "workflow_anomalies",
        "content_integrity", "queue_health",
    ]

    severity_icons = {
        Severity.CRITICAL: "🔴",
        Severity.WARNING: "🟡",
        Severity.INFO: "ℹ️ ",
    }

    for scan_name in scan_order:
        findings = by_scan.get(scan_name, [])
        if not findings:
            continue

        # Skip INFO-level if --hide-info
        if hide_info and all(f.severity == Severity.INFO for f in findings):
            continue

        label = scan_labels.get(scan_name, scan_name)
        print(f"\n── {label} {'─' * max(1, 50 - len(label))}")

        for f in findings:
            icon = severity_icons[f.severity]
            print(f"  {icon} {f.severity.value.upper()} ({f.count}): {f.message}")

            # Verbose: list all refs, but cap INFO-level at 20 (never useful to list 6000+)
            max_verbose = 20 if f.severity == Severity.INFO else None
            if verbose and f.refs:
                show_refs = f.refs[:max_verbose] if max_verbose else f.refs
                for ref in show_refs:
                    print(f"      • {ref}")
                if max_verbose and len(f.refs) > max_verbose:
                    print(f"      ... ({len(f.refs) - max_verbose} more, use --json for full list)")
            elif f.refs:
                print(f"      {format_ref_list(f.refs)}")

    # Summary (respect --hide-info)
    visible_findings = [f for f in result.findings if not (hide_info and f.severity == Severity.INFO)]
    crit = sum(1 for f in visible_findings if f.severity == Severity.CRITICAL)
    warn = sum(1 for f in visible_findings if f.severity == Severity.WARNING)
    info = sum(1 for f in visible_findings if f.severity == Severity.INFO)
    print()
    print("━" * 60)
    parts = []
    if crit:
        parts.append(f"{crit} critical")
    if warn:
        parts.append(f"{warn} warnings")
    if info:
        parts.append(f"{info} info")
    summary = ", ".join(parts) if parts else "all clear"
    print(f"  SUMMARY: {summary}")
    print("━" * 60)


def print_json_report(result: ScanResult, hide_info: bool = False):
    """Print machine-readable JSON report."""
    findings = result.findings
    if hide_info:
        findings = [f for f in findings if f.severity != Severity.INFO]

    crit = sum(1 for f in findings if f.severity == Severity.CRITICAL)
    warn = sum(1 for f in findings if f.severity == Severity.WARNING)
    info = sum(1 for f in findings if f.severity == Severity.INFO)

    output = {
        "timestamp": result.timestamp,
        "collections": result.collection_counts,
        "queue_size": result.queue_size,
        "summary": {
            "critical": crit,
            "warning": warn,
            "info": info,
        },
        "findings": [
            {
                "scan": f.scan,
                "severity": f.severity.value,
                "category": f.category,
                "count": f.count,
                "message": f.message,
                "refs": f.refs,
            }
            for f in findings
        ],
    }
    print(json.dumps(output, indent=2))


# ── Fix ────────────────────────────────────────────────────────────────────────

def fix_db_disk_sync(db: dict, category_filter: Optional[str] = None) -> tuple:
    """Sync DB markdownSize/markdownHash from actual files on disk.

    Root cause of desync: manual-ocr files placed on disk without running
    sync-manual-ocr.sh, or conversion pipeline wrote file but crashed before
    updating DB.

    Returns (fixed_count, fixed_refs) tuple.
    """
    import hashlib

    cats = [category_filter] if category_filter else CATEGORIES
    fixed = []

    for cat in cats:
        for doc in db[cat]:
            content = doc.get("content", {})
            md_path = content.get("markdownPath")
            db_size = content.get("markdownSize", 0)

            if not md_path:
                continue

            full = md_full_path(md_path)
            if not os.path.exists(full):
                continue

            disk_size = os.path.getsize(full)

            # Skip if already in sync (within 1 byte — exact match expected)
            if disk_size == db_size:
                continue

            # Skip if disk file is empty (don't overwrite good DB with bad disk)
            if disk_size == 0:
                continue

            # Direction matters:
            # - disk > DB: disk has more content (e.g. manual OCR replaced stub) → trust disk
            # - disk < DB: disk file may be truncated/corrupted → DON'T overwrite, skip
            if disk_size < db_size:
                continue

            # Read file and compute hash
            with open(full, "rb") as f:
                file_bytes = f.read()
            new_hash = "sha256:" + hashlib.sha256(file_bytes).hexdigest()

            ref = get_ref(doc, cat)
            old_size = db_size

            # Update DB
            doc["content"] = {
                **content,
                "markdownSize": disk_size,
                "markdownHash": new_hash,
                "lastConverted": datetime.utcnow().isoformat() + "Z",
            }

            fixed.append((ref, cat, old_size, disk_size))

    return len(fixed), fixed


def save_db(db: dict):
    """Save DB to disk."""
    with open(DB_PATH, "w") as f:
        json.dump(db, f, indent=2)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Comprehensive document validity scanner for sfc-fetch",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="List every affected ref (not just top 10)",
    )
    parser.add_argument(
        "--json", "-j", action="store_true",
        help="Machine-readable JSON output",
    )
    parser.add_argument(
        "--category", "-c", choices=CATEGORIES,
        help="Scan only one collection",
    )
    parser.add_argument(
        "--deep", "-d", action="store_true",
        help="Include content integrity check (slower — reads files from disk)",
    )
    parser.add_argument(
        "--hide-info", action="store_true",
        help="Suppress INFO-level findings (e.g. normal raw file cleanup)",
    )
    parser.add_argument(
        "--fix", action="store_true",
        help="Auto-fix DB/disk mismatches: sync markdownSize and hash from disk to DB",
    )

    args = parser.parse_args()

    # Load DB
    db = load_db()

    # ── Fix mode: sync DB from disk before scanning ──
    if args.fix:
        print("\n🔧 Running DB/disk sync fix...")
        # CRITICAL: Stop service first to prevent LowDB race condition
        # (service holds stale in-memory copy that overwrites our fix)
        import subprocess
        print("  ⏸  Stopping sfc-fetch service...")
        subprocess.run(["pm2", "stop", "sfc-fetch"], capture_output=True)
        import time; time.sleep(2)
        
        fixed_count, fixed_refs = fix_db_disk_sync(db, args.category)
        if fixed_count > 0:
            save_db(db)
            print(f"  ✅ Fixed {fixed_count} document(s):")
            for ref, cat, old_size, new_size in fixed_refs:
                print(f"      [{cat}] {ref}: {old_size}B → {new_size}B")
            print(f"  DB saved to {DB_PATH}")
            # Restart service so it loads the fixed DB
            print("  ▶️  Restarting sfc-fetch service...")
            subprocess.run(["pm2", "restart", "sfc-fetch"], capture_output=True)
            time.sleep(2)
            # Reload DB for clean scan
            db = load_db()
        else:
            print("  ✅ No mismatches found — DB is in sync with disk.")
            # Restart service even if no fix needed (it was stopped above)
            print("  ▶️  Restarting sfc-fetch service...")
            subprocess.run(["pm2", "restart", "sfc-fetch"], capture_output=True)
            time.sleep(2)

    # Build result
    result = ScanResult(
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        collection_counts={cat: len(db[cat]) for cat in CATEGORIES},
        queue_size=len(db.get("queue", [])),
    )

    # Run all scans
    cat_filter = args.category

    result.findings.extend(scan_broken_markdown(db, cat_filter))
    result.findings.extend(scan_missing_markdown_file(db, cat_filter))
    result.findings.extend(scan_missing_raw_file(db, cat_filter))
    result.findings.extend(scan_failed_docs(db, cat_filter))

    # Queue scans are global (not per-collection)
    if not cat_filter:
        result.findings.extend(scan_stale_queue(db))
        result.findings.extend(scan_queue_health(db))

    result.findings.extend(scan_workflow_anomalies(db, cat_filter))

    if args.deep or args.fix:
        result.findings.extend(scan_content_integrity(db, cat_filter))

    # Sort findings: CRITICAL first, then WARNING, then INFO
    severity_order = {Severity.CRITICAL: 0, Severity.WARNING: 1, Severity.INFO: 2}
    result.findings.sort(key=lambda f: severity_order[f.severity])

    # Output
    if args.json:
        print_json_report(result, args.hide_info)
    else:
        print_report(result, verbose=args.verbose, hide_info=args.hide_info)

    # Exit code
    sys.exit(1 if result.critical_count > 0 else 0)


if __name__ == "__main__":
    main()
