# Diocese of San Pablo — Model Training Guide

## Folder Structure

```
testing/
  README.md                          ← you are here
  utils.py                           ← shared data loader (do not run directly)
  parishes_financial_records_2023.csv ← parsed dataset from sample.xlsx
  model_*.py                         ← one file per model (20 total)
  models/                            ← saved .joblib files go here after training
```

---

## Step 1 — Install Dependencies

Run this once before anything else:

```bash
pip install pandas numpy scikit-learn statsmodels xgboost prophet shap ruptures pulp joblib scipy
```

> **Note:** `prophet` requires `pystan` or `cmdstan`. If the install fails, try:
> ```bash
> pip install prophet --no-build-isolation
> ```

---

## Step 2 — Fill In the Dataset

Open `parishes_financial_records_2023.csv` and fill in the financial columns.
All numeric columns are currently empty because the source Excel (`sample.xlsx`) was a blank template.

**Columns to fill per parish per month:**

| Column | What it means |
|---|---|
| `sacraments_arancel` | Arancel (Confirmation included) |
| `sacraments_parish_share` | Parish share of sacraments |
| `sacraments_over_above` | Over/above (Confirmation included) |
| `collections_mass` | Mass collections |
| `collections_other` | Other collections (95%) |
| `collections_other_receipts` | Other receipts |
| `total_receipts` | Sum of all receipts |
| `expenses_pastoral` | Pastoral expenses (Mass Stipend) — **leave blank for now, not in dataset yet** |
| `expenses_parish` | Parish expenses — **leave blank for now, not in dataset yet** |
| `total_expenses` | Sum of expenses |
| `net_receipts_deficit` | total_receipts minus total_expenses |
| `mass_intentions_not_claimed` | Mass intentions not claimed by priest |
| `mass_intentions_claimed` | Mass intentions claimed by priest |
| `special_collections` | Special collections |
| `pastoral_parish_fund_total_net_receipts` | Final net receipts / deficit |

> **Missing months:** 65 parishes only have December data. Rows for missing months can be left as-is (blank). The models handle gaps via lag features and per-parish grouping.

---

## Step 3 — Run the Models

Each model is a standalone Python file. Run them in the order below.
Models marked **[needs data]** will print `[SKIP]` until Step 2 is done.
Models marked **[runs now]** work on the current empty dataset.

### Descriptive Analytics (run first — describe what happened)

```bash
python model_time_series_decomposition.py   # [needs data] trend + seasonality per parish
python model_isolation_forest.py            # [runs now]   flag anomalous months
python model_rule_based_segmentation.py     # [needs data] assign parishes to clusters A/B/C/D
```

### Diagnostic Analytics (run after descriptive)

```bash
python model_multiple_linear_regression.py  # [needs data] root-cause regression with p-values
python model_change_point_detection.py      # [needs data] detect regime shifts
python model_shap.py                        # [needs data] feature importance (run AFTER xgboost)
```

> `model_shap.py` requires `model_xgboost.py` to be trained first.

### Predictive Analytics (run after descriptive + diagnostic)

```bash
python model_prophet.py                     # [needs data] monthly collection forecast
python model_sarima.py                      # [needs data] auto-selected ARIMA forecast
python model_sarimax.py                     # [needs data] ARIMA + exogenous variables
python model_holt_winters.py                # [needs data] triple exponential smoothing
python model_exponential_smoothing.py       # [needs data] simple/double smoothing
python model_xgboost.py                     # [needs data] gradient boosted forecast + classifier
python model_markov_chain.py                # [needs data] financial state transitions
python model_bsts.py                        # [needs data] Bayesian structural time series
python model_bocpd.py                       # [needs data] Bayesian change point detection
python model_logistic_regression.py         # [needs data] project success/failure prediction
```

> Champion model selection: compare WAPE across Prophet, SARIMA, SARIMAX, Holt-Winters, BSTS,
> XGBoost. The one with the lowest WAPE becomes the Financial Forecast champion.
> Target threshold: **WAPE ≤ 15%**. Models print `[!]` if they exceed this.

### Prescriptive Analytics (run last — requires predictive outputs)

```bash
python model_milp.py                        # [needs data] minimize disbursement / optimize budget
python model_data_envelopment_analysis.py   # [needs data] efficiency scoring per parish
python model_mlp.py                         # [needs data] neural net for performance improvement
python model_agent_based_simulation.py      # [runs now]   what-if scenario simulator
```

---

## Step 4 — Adding Project Data (for Project Success Rate Forecast)

`model_logistic_regression.py` and `model_mlp.py` (classification mode) need project columns.
Add these to the CSV from the `diocese.projects` database table:

| Column | What it means |
|---|---|
| `budget_vs_target_pct` | Amount raised / target × 100 |
| `fund_raising_progress_pct` | % of funding goal reached |
| `schedule_variance_days` | Days behind (positive) or ahead (negative) of deadline |
| `donor_count` | Number of unique donors |
| `project_success` | **Target label:** 1 = success, 0 = failure |

---

## Step 5 — Where Models Are Saved

After training, `.joblib` files appear in `models/`:

| File | Model |
|---|---|
| `prophet.joblib` | Prophet |
| `sarima.joblib` | SARIMA |
| `sarimax.joblib` | SARIMAX |
| `holt_winters.joblib` | Holt-Winters |
| `exponential_smoothing.joblib` | Exponential Smoothing |
| `xgboost_regression.joblib` | XGBoost (regression) |
| `xgboost_classifier_*.joblib` | XGBoost (classification) |
| `markov_chain.joblib` | Markov Chain |
| `bsts.joblib` | BSTS |
| `bocpd.joblib` | BOCPD |
| `logistic_regression.joblib` | Logistic Regression |
| `time_series_decomposition.joblib` | Decomposition results |
| `isolation_forest.joblib` | Isolation Forest |
| `rule_based_segmentation.joblib` | Parish cluster assignments |
| `multiple_linear_regression.joblib` | OLS regression + coefficients |
| `shap_values.joblib` | SHAP feature importance |
| `change_point_detection.joblib` | Change point results |
| `milp.joblib` | MILP allocation plan |
| `data_envelopment_analysis.joblib` | Efficiency scores |
| `mlp_regression.joblib` | MLP regressor |
| `mlp_classification.joblib` | MLP classifier |
| `agent_based_simulation.joblib` | Scenario results |
| `parish_label_encoder.joblib` | Parish name → integer ID mapping |

---

## KPI Reference (from pipeline diagram)

| KPI | Threshold | Model |
|---|---|---|
| WAPE | ≤ 15% | All forecasting models |
| Annual Collection Growth Rate | > −11.38% | Time Series Decomposition |
| Disbursement-to-Collection Ratio | ≤ 93.47% | Time Series Decomposition |
| Month-over-Month Collection Change | ≥ 9.84% | Time Series Decomposition |
| Net Receipt Deficit Rate | ≤ 46.83% | Time Series Decomposition |
| Diagnostic Precision | ≥ 85% | MLR + SHAP |
| Root-Cause Attribution Precision | ≥ 85% | SHAP |
| Cluster Purity | — | Rule-Based Segmentation |
| Rule Coverage Rate | 100% | Rule-Based Segmentation |
| Macro-F1 (cluster forecast) | — | XGBoost, Markov Chain |
| Balanced Accuracy | — | XGBoost, Markov Chain, Logistic Regression |
| Insight Actionability Rate | ≥ 70% | DEA |

---

## Troubleshooting

**All models print `[SKIP]`**
→ The CSV has no financial values yet. Complete Step 2.

**`ModuleNotFoundError: No module named 'prophet'`**
→ Run `pip install prophet` in the same Python environment.

**`ModuleNotFoundError: No module named 'ruptures'`**
→ Run `pip install ruptures` (needed by `model_change_point_detection.py`).

**`ModuleNotFoundError: No module named 'pulp'`**
→ Run `pip install pulp` (needed by `model_milp.py` and `model_data_envelopment_analysis.py`).

**SARIMA/SARIMAX is very slow**
→ Grid search over all (p,d,q)(P,D,Q) combinations takes time with many parishes.
   Reduce `P_RANGE` and `Q_RANGE` in `model_sarima.py` to `range(0,1)` for a quick test run.

**`model_shap.py` prints `[SKIP]`**
→ Run `python model_xgboost.py` first so the XGBoost artifact exists.
