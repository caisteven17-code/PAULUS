"""Static enforcement for PAULUS hybrid-database ownership boundaries."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEATHER_SCRIPTS = (
    "summary_metrics_table.py",
    "sot_selection.py",
    "sot_selection_v2.py",
    "sot_plus_2_validators.py",
    "severe_via_rain_test.py",
    "rerun_wind_confidence.py",
    "rerun_temp_confidence.py",
    "confidence_matrix.py",
    "lineage_consensus_report.py",
    "consensus_vs_baseline.py",
)


def main() -> int:
    failures: list[str] = []

    calendar = (ROOT / "src/backend/src/services/liturgical-calendar.service.ts").read_text(encoding="utf-8")
    if "SupabaseService" not in calendar or "AnalyticsDbService" in calendar or "analyticsDb" in calendar:
        failures.append("calendar review CRUD is not Supabase-only")

    for relative in WEATHER_SCRIPTS:
        source = (ROOT / "src/analytics" / relative).read_text(encoding="utf-8")
        if "app.services.weather_repository import get_table" not in source:
            failures.append(f"{relative} does not use the AWS weather repository")
        if "app.services.supabase_client import get_table" in source:
            failures.append(f"{relative} still imports the Supabase weather reader")

    evaluation = (ROOT / "src/analytics/scripts/evaluate_financial_models.py").read_text(encoding="utf-8")
    if 'get_weather_table("reference", "weather_monthly_summary")' not in evaluation:
        failures.append("financial-model weather features are not routed to AWS")

    health = (ROOT / "src/analytics/app/services/health_scoring.py").read_text(encoding="utf-8")
    if "_write_snapshot_supabase" in health:
        failures.append("health scoring still contains a Supabase analytics writer")

    worker = (ROOT / "src/analytics/app/services/warehouse_worker.py").read_text(encoding="utf-8")
    if "run_record_sync" in worker:
        failures.append("warehouse worker can still invoke the AWS operational mirror")

    if failures:
        print("Database ownership audit FAILED")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print("Database ownership audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

