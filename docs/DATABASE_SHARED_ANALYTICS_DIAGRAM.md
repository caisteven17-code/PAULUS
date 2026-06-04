# Diocese of San Pablo - Shared Analytics Schema Diagram

This document contains the Mermaid Entity-Relationship Diagram (ERD) for the **Shared Analytics Schema**. It shows common dimensions, the model run registry, and shared analytical facts used across parish, school, seminary, and priest assignment analytics.

To view this diagram visually inside VS Code, open the **Markdown Preview** by pressing `Ctrl + Shift + V`, or click the split-pane icon in the top-right corner.

---

## 1. Shared Analytics Schema Diagram

```mermaid
erDiagram
    %% SHARED DIMENSIONS
    dim_institutions {
        integer institution_key PK
        uuid institution_id
        text institution_name
        text entity_type "parish/school/seminary"
    }

    dim_date {
        integer date_key PK "YYYYMM"
        text month_name
        integer month_number
        text month_short
        integer year
        text quarter
        boolean academic_year_period
        boolean is_fiesta_season
    }

    dim_submission {
        integer submission_key PK
        uuid submission_batch_id
        uuid financial_record_id
        text source_file_name
        uuid submitted_by
        timestamptz submitted_at
        uuid verified_by
        timestamptz verified_at
        text status
        integer version_no
        boolean is_current_version
    }

    %% MODEL REGISTRY
    model_runs {
        uuid id PK
        text model_name
        text model_version
        text model_type "forecast/anomaly/health_score/assignment_recommendation/optimization"
        date input_start_date
        date input_end_date
        text run_status
        jsonb metrics
        timestamptz started_at
        timestamptz finished_at
        uuid created_by
    }

    %% SHARED FACTS
    fact_subsidy_allocations {
        uuid allocation_id PK
        integer institution_key FK "References dim_institutions.institution_key"
        uuid run_key
        numeric annual_deficit
        numeric recommended_subsidy
        numeric allocated_subsidy
        timestamptz run_at
    }

    %% RELATIONSHIPS
    fact_subsidy_allocations }|--|| dim_institutions : "institution_key"

```

---

## 2. Structural Breakdown

* **Core Dimensions (`dim_*`)**:
  * `dim_institutions`: Shared institution identity used by parish, school, seminary, and shared analytics.
  * `dim_date`: Shared monthly date dimension used by financial facts, model outputs, and assignment history.
  * `dim_submission`: Shared submission/version mapping for analytics records derived from uploaded or encoded reports.
* **Model Registry (`model_runs`)**: Tracks model executions for forecasting, anomaly detection, health scoring, priest assignment recommendations, and optimization.
* **Shared Facts (`fact_*`)**:
  * `fact_subsidy_allocations`: Stores subsidy optimization outputs.
* **Institution-Specific Model Outputs**: Forecasts, anomaly alerts, and health snapshots are stored in `parish_analytics`, `school_analytics`, and `seminary_analytics` so account-level outputs can reference the correct account dimension.
* **Priest Assignment Analytics**: Priest dimensions, assignment recommendations, and assignment history are stored in `priest_assignment_analytics` because that model uses parish and seminary inputs but has its own analytical purpose.

