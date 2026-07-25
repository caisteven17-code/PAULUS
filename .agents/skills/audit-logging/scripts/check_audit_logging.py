#!/usr/bin/env python3
"""Heuristic audit-log checker for sensitive mutation code.

Usage:
  python scripts/check_audit_logging.py path/to/file.ts [more files...]

This is intentionally conservative. It flags files that appear to perform a
sensitive mutation without any obvious audit-log call in the same file.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

MUTATION_RE = re.compile(
    r"\b(insert|update|delete|upsert|create|approve|reject|assign|permission|role|donation|expense|submission|financial)\b",
    re.IGNORECASE,
)

AUDIT_RE = re.compile(
    r"\b(auditLog|audit_log|auditLogs|audit_logs|recordAudit|logAudit|diocese\.audit_logs)\b",
    re.IGNORECASE,
)

SUPPORTED = {".ts", ".tsx", ".js", ".jsx", ".py"}


def main(argv: list[str]) -> int:
    if not argv:
        print("usage: check_audit_logging.py <files...>", file=sys.stderr)
        return 2

    flagged: list[str] = []
    for raw in argv:
        path = Path(raw)
        if not path.exists() or path.suffix not in SUPPORTED:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if MUTATION_RE.search(text) and not AUDIT_RE.search(text):
            flagged.append(str(path))

    if flagged:
        print("Potential sensitive mutations without obvious audit logging:")
        for path in flagged:
            print(f"- {path}")
        return 1

    print("No obvious audit-logging gaps found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
