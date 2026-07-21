"""Report executable AWS migration references to operational diocese objects.

This is a static schema audit. It reads the AWS deployment manifest and SQL
files only; it never connects to Supabase or AWS and never reads database rows.

Usage:
    python scripts/audit_aws_operational_dependencies.py
    python scripts/audit_aws_operational_dependencies.py --fail-if-found
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUPABASE_DIR = ROOT / "supabase"
MANIFEST = SUPABASE_DIR / "aws_migrations" / "manifest.txt"

REFERENCE_PATTERN = re.compile(r"\bdiocese\.(?P<object>[a-z_][a-z0-9_]*)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Finding:
    migration: str
    line: int
    object_name: str
    sql: str


def manifest_entries() -> list[Path]:
    entries: list[Path] = []
    for raw_line in MANIFEST.read_text(encoding="utf-8").splitlines():
        entry = raw_line.strip()
        if not entry or entry.startswith("#"):
            continue
        path = SUPABASE_DIR / entry
        if path.suffix.lower() == ".sql":
            entries.append(path)
    return entries


def executable_sql_lines(path: Path):
    in_block_comment = False
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line
        output: list[str] = []
        index = 0
        while index < len(line):
            if in_block_comment:
                end = line.find("*/", index)
                if end == -1:
                    index = len(line)
                    continue
                in_block_comment = False
                index = end + 2
                continue

            block = line.find("/*", index)
            single = line.find("--", index)
            if single != -1 and (block == -1 or single < block):
                output.append(line[index:single])
                break
            if block != -1:
                output.append(line[index:block])
                in_block_comment = True
                index = block + 2
                continue
            output.append(line[index:])
            break

        executable = "".join(output).strip()
        if executable:
            yield line_number, executable


def audit() -> list[Finding]:
    findings: list[Finding] = []
    for path in manifest_entries():
        for line_number, sql in executable_sql_lines(path):
            for match in REFERENCE_PATTERN.finditer(sql):
                findings.append(
                    Finding(
                        migration=path.relative_to(ROOT).as_posix(),
                        line=line_number,
                        object_name=match.group("object").lower(),
                        sql=sql,
                    )
                )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fail-if-found",
        action="store_true",
        help="Return a failing exit code while operational references remain.",
    )
    args = parser.parse_args()

    findings = audit()
    grouped: dict[str, int] = {}
    for finding in findings:
        grouped[finding.object_name] = grouped.get(finding.object_name, 0) + 1
        print(
            f"{finding.migration}:{finding.line}: "
            f"diocese.{finding.object_name}: {finding.sql}"
        )

    print("\nAWS operational dependency summary")
    if not grouped:
        print("  clean: no executable diocese.* references in the AWS manifest")
    else:
        for object_name, count in sorted(grouped.items()):
            print(f"  diocese.{object_name}: {count} reference(s)")
        print(f"  total: {len(findings)} reference(s)")

    return 1 if findings and args.fail_if_found else 0


if __name__ == "__main__":
    raise SystemExit(main())

