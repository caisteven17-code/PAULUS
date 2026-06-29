"""
Markov Chain
============
Tier  : Predictive Analytics
Uses  : Financial Forecast (transition between financial states)
        Pastoral Assignment Financial Trend Forecast (categorical state)
        Parish Cluster Forecast (cluster transition probability)
Target: Categorical (next-period state / cluster label)
KPI   : Transition Matrix Accuracy, Macro-F1, Balanced Accuracy, Brier Score

States are derived by discretising net_margin into health tiers:
  0 = Critical, 1 = At Risk, 2 = Stable, 3 = Healthy

Run: python model_markov_chain.py

INSTRUCTIONS
------------
Status  : [runs now] — state labels are computed automatically from net_margin
Step 1  : pip install pandas numpy joblib scikit-learn
Step 2  : Make sure 2023.xlsx, 2024.xlsx, and 2025.xlsx is in the same
          folder and has these columns filled in:
            parish_name, month_num,
            total_receipts_final, total_expenses_final
          (net_margin is computed automatically as receipts - expenses)
Step 3  : python model_markov_chain.py
Output  : models/markov_chain.joblib
          Contains: global transition matrix, per-parish matrices,
          state names, and state bin boundaries.
KPI tip : Macro-F1 and Balanced Accuracy are printed after training.
          Low scores (< 0.5) mean parishes jump states unpredictably —
          consider adding more months of data.
Note    : Parishes with fewer than 3 filled months are skipped.
          States: 0=Critical, 1=At Risk, 2=Stable, 3=Healthy
          (based on net_margin thresholds -15%, 0%, +15%).
"""

import os
import warnings
import pandas as pd
import numpy as np
import joblib
from sklearn.metrics import f1_score, balanced_accuracy_score

from utils import load_data, engineer_features, MODELS_DIR

warnings.filterwarnings("ignore")
from dashboard_graphs import export_model_dashboard_preview

STATE_BINS   = [-np.inf, -0.15, 0.0, 0.15, np.inf]
STATE_LABELS = [0, 1, 2, 3]          # Critical, At Risk, Stable, Healthy
STATE_NAMES  = {0:"Critical",1:"At Risk",2:"Stable",3:"Healthy"}
N_STATES     = len(STATE_LABELS)


def discretise(series: pd.Series) -> pd.Series:
    return pd.cut(series, bins=STATE_BINS, labels=STATE_LABELS).astype(float)


def build_transition_matrix(states: pd.Series) -> np.ndarray:
    """Estimate transition matrix from observed state sequence."""
    T = np.zeros((N_STATES, N_STATES))
    for s, ns in zip(states[:-1], states[1:]):
        if not (np.isnan(s) or np.isnan(ns)):
            T[int(s), int(ns)] += 1
    row_sums = T.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    return T / row_sums


def build_second_order_transition_tensor(states: pd.Series) -> np.ndarray:
    """Estimate P(X_t+1 | X_t-1, X_t) from an observed state sequence."""
    T = np.zeros((N_STATES, N_STATES, N_STATES))
    values = states.dropna().astype(int).tolist()
    for prior, current, next_state in zip(values[:-2], values[1:-1], values[2:]):
        T[prior, current, next_state] += 1

    row_sums = T.sum(axis=2, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        probabilities = np.divide(T, row_sums, where=row_sums != 0)
    probabilities[row_sums.repeat(N_STATES, axis=2) == 0] = 0
    return probabilities


def build_second_order_tensor_from_triples(triples: list[tuple[int, int, int]]) -> np.ndarray:
    T = np.zeros((N_STATES, N_STATES, N_STATES))
    for prior, current, next_state in triples:
        T[prior, current, next_state] += 1

    row_sums = T.sum(axis=2, keepdims=True)
    with np.errstate(divide="ignore", invalid="ignore"):
        probabilities = np.divide(T, row_sums, where=row_sums != 0)
    probabilities[row_sums.repeat(N_STATES, axis=2) == 0] = 0
    return probabilities


def predict_next_state(prior_state: int, current_state: int,
                       second_order_T: np.ndarray, fallback_T: np.ndarray) -> int:
    """Predict next state from second-order history, falling back to first order."""
    probs = second_order_T[prior_state, current_state]
    if probs.sum() == 0:
        probs = fallback_T[current_state]
    return int(np.argmax(probs))


def train(df: pd.DataFrame) -> None:
    df["state"] = discretise(df["net_margin"])

    all_transitions = []
    all_second_order = []
    per_parish_T = {}
    per_parish_T2 = {}

    for parish in df["parish_name"].unique():
        p = df[df["parish_name"] == parish].sort_values(["year", "month_num"])
        states = p["state"].dropna()
        if len(states) < 3:
            continue

        T = build_transition_matrix(states)
        T2 = build_second_order_transition_tensor(states)
        per_parish_T[parish] = T
        per_parish_T2[parish] = T2

        # Collect transition pairs for evaluation
        for s, ns in zip(states[:-1], states[1:]):
            if not (np.isnan(s) or np.isnan(ns)):
                all_transitions.append((int(s), int(ns)))

        state_values = states.astype(int).tolist()
        for prior, current, next_state in zip(state_values[:-2], state_values[1:-1], state_values[2:]):
            all_second_order.append((prior, current, next_state))

    if not all_transitions:
        print("[SKIP] Not enough state sequences -- need filled net_receipts data.")
        return

    # Global transition matrix (pooled across all parishes)
    global_states = pd.Series([t[0] for t in all_transitions] + [all_transitions[-1][1]])
    T_global = build_transition_matrix(global_states)
    T2_global = build_second_order_tensor_from_triples(all_second_order)

    print("Global Transition Matrix:")
    T_df = pd.DataFrame(T_global,
                        index=[STATE_NAMES[i] for i in range(N_STATES)],
                        columns=[STATE_NAMES[i] for i in range(N_STATES)])
    print(T_df.round(3).to_string())

    # Evaluate: predict next state from previous and current state.
    eval_transitions = all_second_order or [(t[0], t[0], t[1]) for t in all_transitions]
    y_true = [t[2] for t in eval_transitions]
    y_pred = [predict_next_state(t[0], t[1], T2_global, T_global) for t in eval_transitions]

    f1  = f1_score(y_true, y_pred, average="macro", zero_division=0)
    bal = balanced_accuracy_score(y_true, y_pred)
    print(f"\nMacro-F1:          {f1:.3f}")
    print(f"Balanced Accuracy: {bal:.3f}")

    out = os.path.join(MODELS_DIR, "markov_chain.joblib")
    joblib.dump({
        "T_global": T_global,
        "T2_global": T2_global,
        "T_per_parish": per_parish_T,
        "T2_per_parish": per_parish_T2,
        "state_names": STATE_NAMES,
        "state_bins": STATE_BINS,
    }, out)
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    print("Markov Chain -- Training\n")
    df = load_data()
    df = engineer_features(df)
    train(df)
    export_model_dashboard_preview("Markov Chain", df)
