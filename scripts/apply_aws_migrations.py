"""Deploy the schema in supabase/aws_migrations/manifest.txt to the AWS warehouse database.

Reads ANALYTICS_DB_URL from the repo root .env. Each file runs in its own
transaction so a failure stops the run without touching later files, and so a
prior successful file's changes are not rolled back by a later failure.

Usage: python scripts/apply_aws_migrations.py [--start-after <relative-path-substring>]
       python scripts/apply_aws_migrations.py --only <relative-path-substring>

--start-after resumes a run: it skips every manifest entry up to and including the
given file (matched by substring), so already-applied files (many of which use
plain CREATE TABLE / CREATE SCHEMA without IF NOT EXISTS) are not re-run.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / ".env"
SUPABASE_DIR = REPO_ROOT / "supabase"
MANIFEST_PATH = SUPABASE_DIR / "aws_migrations" / "manifest.txt"


def load_db_url() -> str:
    with open(ENV_PATH, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line.startswith("ANALYTICS_DB_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("ANALYTICS_DB_URL not found in .env")


def load_manifest() -> list[Path]:
    files = []
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            files.append(SUPABASE_DIR / line)
    return files


def main() -> None:
    try:
        import psycopg2 as postgres_driver
    except ModuleNotFoundError:
        import psycopg as postgres_driver

    db_url = load_db_url()
    files = load_manifest()

    if len(sys.argv) > 2 and sys.argv[1] == "--only":
        marker = sys.argv[2]
        matches = [path for path in files if marker in str(path)]
        if len(matches) != 1:
            sys.exit(
                f"--only marker '{marker}' matched {len(matches)} files; expected exactly one"
            )
        files = matches
        print(f"Deploying only: {files[0].relative_to(SUPABASE_DIR)}\n")
    elif len(sys.argv) > 2 and sys.argv[1] == "--start-after":
        marker = sys.argv[2]
        idx = next((i for i, p in enumerate(files) if marker in str(p)), None)
        if idx is None:
            sys.exit(f"--start-after marker '{marker}' not found in manifest")
        skipped, files = files[: idx + 1], files[idx + 1 :]
        print(
            f"Resuming: skipping {len(skipped)} already-applied file(s), ending with {skipped[-1].name}\n"
        )

    print(f"Deploying {len(files)} files to AWS warehouse database...\n")

    conn = postgres_driver.connect(db_url, connect_timeout=15)
    conn.autocommit = False

    applied = 0
    for path in files:
        rel = path.relative_to(SUPABASE_DIR)
        if not path.exists():
            conn.rollback()
            sys.exit(f"FAILED: {rel} — file not found")
        sql = path.read_text(encoding="utf-8")
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
            applied += 1
            print(f"  [{applied}/{len(files)}] OK   {rel}")
        except Exception as e:
            conn.rollback()
            print(f"  [{applied + 1}/{len(files)}] FAIL {rel}")
            print(f"\n{type(e).__name__}: {e}")
            conn.close()
            sys.exit(
                f"\nStopped after {applied} successful file(s). Fix the error above and re-run."
            )

    conn.close()
    print(f"\nAll {applied} files applied successfully.")


if __name__ == "__main__":
    main()
