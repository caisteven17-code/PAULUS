"""IAFR (Integrated Arancel and Financial Report) cleaner — parish only.

Dual front-end (xlsx label-anchored / csv column-name), one shared
validation + account-code mapping core. Field labels and layout verified
directly against the real "2026 Integrated Arancel and Financial Report"
template (all twelve *_2026 sheets are structurally identical).

No DB access here by design — this module is pure extraction/validation so
it can be unit-tested without Supabase. Account-code -> account_title_id
resolution and all writes happen in app/routers/iafr.py.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from typing import Any

import openpyxl

FORMULA_ERROR_VALUES = {"#N/A", "#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#NULL!"}
KNOWN_TEMPLATE_TITLE = "2026 INTEGRATED ARANCEL & FINANCIAL REPORT (IAFR) FORM"

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
MONTH_NAME_TO_NUM = {name: i + 1 for i, name in enumerate(MONTH_NAMES)}
FULL_MONTH_TO_NUM = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}


@dataclass(frozen=True)
class FieldSpec:
    label: str
    label_col: str
    value_col: str
    account_code: str | None
    item_type: str
    section_code: str
    subsection_code: str
    kind: str = "money"  # "money" | "reconciliation"
    occurrence: int = 0  # which match of (label, label_col) to use, when the same text repeats


# ---------------------------------------------------------------------------
# FIELD_MAP — verified against January_2026 / June_2026 / December_2026.
# Field keys mirror the supplied script's naming so the mapping is auditable
# against the original, but every (label, column) pair below was read
# directly off the real workbook, not assumed from the script.
# ---------------------------------------------------------------------------

FIELD_MAP: dict[str, FieldSpec] = {
    # A.1 Sacraments — granular fees have no seeded aggregate account_code
    "baptism_infant": FieldSpec("Baptism (Infant)", "B", "O", None, "memo", "A", "A.1"),
    "baptism_adult": FieldSpec("Baptism (Adult)", "B", "O", None, "memo", "A", "A.1"),
    "wedding_with_mass": FieldSpec("Wedding with Mass", "B", "O", None, "memo", "A", "A.1"),
    "wedding_without_mass": FieldSpec("Wedding w/out Mass", "B", "O", None, "memo", "A", "A.1"),
    "funeral_mass": FieldSpec("Funeral Mass", "B", "O", None, "memo", "A", "A.1"),
    "funeral_blessings": FieldSpec("Funeral Blessings", "B", "O", None, "memo", "A", "A.1"),
    "certificates": FieldSpec("Certificates", "B", "O", None, "memo", "A", "A.1"),
    "marriage_banns": FieldSpec("Marriage Banns", "B", "O", None, "memo", "A", "A.1"),
    "permits": FieldSpec("Permits", "B", "O", None, "memo", "A", "A.1"),
    "sac_total_prescribed_amt": FieldSpec("TOTAL", "E", "I", None, "memo", "A", "A.1", kind="reconciliation"),
    "sac_total_over_above_amt": FieldSpec("TOTAL", "E", "M", None, "memo", "A", "A.1", kind="reconciliation"),
    "sac_grand_total_amt": FieldSpec("TOTAL", "E", "O", None, "memo", "A", "A.1", kind="reconciliation"),
    # A.2 Confirmation
    "confirmation_total_amt": FieldSpec("Confirmation", "C", "O", "B.02", "receipt", "B", "B.02"),
    # A.3 Mass Intentions
    "mass_intentions_total_receipts": FieldSpec(
        "Total Receipts (Mass Intentions)", "D", "O", None, "memo", "B", "B.01", kind="reconciliation"
    ),
    "mass_intentions_claimed": FieldSpec(
        "Less: Claimed by the Parish Priest", "D", "O", "B.01.01", "personal_contribution", "B", "B.01"
    ),
    "mass_intentions_unclaimed": FieldSpec(
        "Total Unclaimed Mass Intentions (treated as Other Parish Fund Receipts)",
        "D", "O", "B.01.02", "memo", "B", "B.01",
    ),
    # B.1 Mass Collections
    "mass_coll_weekday": FieldSpec("-   Weekday Collections", "E", "M", "C.01", "receipt", "C", "B.1"),
    "mass_coll_sunday": FieldSpec("-   Sunday Collections", "E", "M", "C.02", "receipt", "C", "B.1"),
    "mass_coll_saturday_anticipated": FieldSpec(
        "-   Saturday Anticipated Mass Collections", "E", "M", "C.03", "receipt", "C", "B.1"
    ),
    # B.2 Other Collections (5% tax rate items)
    "coll_rentals": FieldSpec("-   Rentals (Parking, Stalls, etc.)", "E", "M", "D.02", "receipt", "D", "B.2"),
    "coll_mortuary_columbary": FieldSpec("-   Mortuary / Columbary", "E", "M", "D.02", "receipt", "D", "B.2"),
    "coll_kandilaan": FieldSpec("-   Kandilaan", "E", "M", "D.02", "receipt", "D", "B.2"),
    "coll_donation_boxes": FieldSpec("-   Donation Boxes", "E", "M", "D.02", "receipt", "D", "B.2"),
    "coll_envelopes": FieldSpec(
        "-   Envelopes (Weekdays & Sundays Collections)", "E", "M", "D.02", "receipt", "D", "B.2"
    ),
    "coll_other_sources": FieldSpec("-   Other Sources:", "E", "M", "D.02", "receipt", "D", "B.2", occurrence=0),
    # B.3 Other Receipts
    "receipts_donations": FieldSpec("-  Donations", "E", "M", "D.03", "receipt", "D", "B.3", occurrence=0),
    "receipts_interest_income": FieldSpec(
        "-  Interest Income from Bank Accounts", "E", "M", "D.04", "receipt", "D", "B.3"
    ),
    "receipts_subsidy_from_diocese": FieldSpec(
        "-  Subsidy from the Diocese", "E", "M", "D.05", "receipt", "D", "B.3"
    ),
    "receipts_special_collections": FieldSpec(
        "-  Special Collections (KINDLY ENCODE AMOUNT, see F.3)", "E", "M", "D.06", "receipt", "D", "B.3"
    ),
    "receipts_second_collections": FieldSpec(
        "-  Second Collections (KINDLY ENCODE AMOUNT)", "E", "M", "D.07", "receipt", "D", "B.3"
    ),
    "receipts_charge_over_above": FieldSpec(
        "-  Charge Over/Above (Excess Coll'ns - Net of Discount on Sacraments)",
        "E",
        "M",
        "B.3.06",
        "receipt",
        "B",
        "other_receipts",
    ),
    "receipts_other": FieldSpec("-  Other Receipts:", "E", "M", "D.08", "receipt", "D", "B.3", occurrence=0),
    # C.1 Priest Share — breakdown is memo, the form's own subtotal is the E.01 line item
    "priest_share_sacraments": FieldSpec("-  Sacraments (Priest Share)", "G", "M", None, "memo", "E", "C.1"),
    "priest_share_mass_intentions": FieldSpec("-  Mass Intentions (Priest Share)", "G", "M", None, "memo", "E", "C.1"),
    "priest_share_confirmation": FieldSpec("-  Confirmation (Priest Share)", "G", "M", None, "memo", "E", "C.1"),
    "priest_share_confirmation_minister": FieldSpec(
        "-  Confirmation (Minister-Priest)", "G", "M", None, "memo", "E", "C.1"
    ),
    "priest_share_others": FieldSpec("-  Others (Priest Share)", "G", "M", None, "memo", "E", "C.1"),
    "priest_share_total": FieldSpec("Priest Share", "C", "O", "E.01", "expense", "E", "C.1"),
    # C.2 Mass Stipend
    "stipend_parish_priest": FieldSpec("-  Parish Priest's Stipend/Share", "G", "M", None, "memo", "E", "C.2"),
    "stipend_parochial_vicar": FieldSpec("-  Parochial Vicar's Stipend", "G", "M", None, "memo", "E", "C.2"),
    "stipend_guest_priest": FieldSpec("-  Guest Priest's Stipend", "G", "M", None, "memo", "E", "C.2"),
    "stipend_total": FieldSpec("Mass Stipend", "C", "O", "E.02", "expense", "E", "C.2"),
    # C.3 Other Pastoral Expenses
    "other_pastoral_confirmation_minister": FieldSpec(
        "-  Confirmation (Minister-Others)", "G", "M", None, "memo", "E", "C.3"
    ),
    "other_pastoral_total": FieldSpec("Other Pastoral Expenses", "C", "O", "E.03", "expense", "E", "C.3"),
    # D.1 Salaries, Wages, Benefits
    "salary_employees": FieldSpec("-  Salaries & Wages - Employees", "G", "M", None, "memo", "E", "D.1"),
    "salary_remuneration_clergy": FieldSpec(
        "-  Remuneration-Priests/Deacons/Nuns", "G", "M", None, "memo", "E", "D.1"
    ),
    "salary_other_compensation": FieldSpec(
        "-  Other Compensations/Allowances", "G", "M", None, "memo", "E", "D.1"
    ),
    "salary_13th_month": FieldSpec("-  13th Month & Bonuses", "G", "M", None, "memo", "E", "D.1"),
    "salary_total": FieldSpec("Salaries,Wages, Benefits", "C", "O", "E.04", "expense", "E", "D.1"),
    # D.2 Government Contributions — no form subtotal, each contributes to E.05 directly
    "contrib_sss": FieldSpec("-  SSS Contributions", "G", "M", "E.05", "expense", "E", "D.2"),
    "contrib_hdmf_pagibig": FieldSpec("-  HDMF (Pag-ibig) Contributions", "G", "M", "E.05", "expense", "E", "D.2"),
    "contrib_phic_philhealth": FieldSpec("-  PHIC (Philhealth) Contributions", "G", "M", "E.05", "expense", "E", "D.2"),
    # D.3 Utilities — no form subtotal
    "utilities_electric": FieldSpec("-  Electric Bill", "G", "M", "E.06", "expense", "E", "D.3"),
    "utilities_water": FieldSpec("-  Water Bill", "G", "M", "E.06", "expense", "E", "D.3"),
    # D.4 Postage & Communications — no form subtotal
    "comm_telephone": FieldSpec("-  Telephone Bill", "G", "M", "E.07", "expense", "E", "D.4"),
    "comm_cable": FieldSpec("-  Cable Bill", "G", "M", "E.07", "expense", "E", "D.4"),
    "comm_internet": FieldSpec("-  Internet Bill", "G", "M", "E.07", "expense", "E", "D.4"),
    "comm_mailing": FieldSpec("-  Mailing Expenses", "G", "M", "E.07", "expense", "E", "D.4"),
    # D.5 Other Parish / Rectory Expenses — fixed items, no form subtotal (continuation block handled separately)
    "expense_food_groceries": FieldSpec("-  Food & Groceries", "G", "M", "E.08", "expense", "E", "D.5"),
    "expense_meetings_representations": FieldSpec(
        "-  Meetings and Representations", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    "expense_gasoline": FieldSpec("-  Gasoline Expenses", "G", "M", "E.08", "expense", "E", "D.5"),
    "expense_transportation": FieldSpec(
        "-  Transportation & Related Expenses", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    "expense_office_supplies": FieldSpec("-  Office Expenses & Supplies", "G", "M", "E.08", "expense", "E", "D.5"),
    "expense_security": FieldSpec("-  Security Services", "G", "M", "E.08", "expense", "E", "D.5"),
    "expense_liturgical_paraphernalia": FieldSpec(
        "-  Liturgical Paraphernalia", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    "expense_parish_real_properties": FieldSpec("-  Parish Real Properties", "G", "M", "E.08", "expense", "E", "D.5"),
    "expense_repairs_maintenance": FieldSpec(
        "-  Repairs & Maintenance Expenses", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    "expense_charitable_contributions": FieldSpec(
        "-  Charitable Contributions", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    "expense_subscriptions_newspapers": FieldSpec(
        "-  Subscriptions & Newspapers", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    "expense_hospital_medicine": FieldSpec(
        "-  Hospital and Medicine Expenses", "G", "M", "E.08", "expense", "E", "D.5"
    ),
    # E.1 Construction Receipts — breakdown is memo, form subtotal is the E.09 line item.
    # "-  Donations" / "-  Other Receipts:" also appear under B.3 — occurrence=1 picks the second
    # (E.1) hit, scoped by section order rather than a hardcoded row number.
    "constr_receipts_donations": FieldSpec("-  Donations", "E", "M", None, "memo", "E", "E.1", occurrence=1),
    "constr_receipts_bank_borrowings": FieldSpec("-  Borrowings from Banks", "E", "M", None, "memo", "E", "E.1"),
    "constr_receipts_parish_borrowings": FieldSpec(
        "-  Borrowings from Other Parishes", "E", "M", None, "memo", "E", "E.1", occurrence=0
    ),
    "constr_receipts_other": FieldSpec("-  Other Receipts:", "E", "M", None, "memo", "E", "E.1", occurrence=1),
    "constr_receipts_total": FieldSpec("Receipts", "C", "O", "E.09", "receipt", "E", "E.1"),
    # E.2 Construction Expenses
    "constr_labor_materials": FieldSpec("-  Labor and Materials", "E", "M", None, "memo", "E", "E.2"),
    "constr_bank_borrowings_payment": FieldSpec(
        "-  Payment of Borrowings from Banks", "E", "M", None, "memo", "E", "E.2"
    ),
    "constr_parish_borrowings_payment": FieldSpec(
        "-  Payment of Borrowings from Other Parishes", "E", "M", None, "memo", "E", "E.2", occurrence=1
    ),
    "constr_other": FieldSpec("-  Other Expenses:", "E", "M", None, "memo", "E", "E.2", occurrence=1),
    "constr_expenses_total": FieldSpec("Expenses", "C", "O", "E.10", "expense", "E", "E.2"),
    # F.1 Remittance to Diocese
    "remit_sacraments_diocese": FieldSpec("-  Sacraments (Diocese Share)", "G", "M", "F.01", "remittance", "F", "F.1"),
    "remit_confirmation_diocese_fund": FieldSpec(
        "-  Confirmation (Diocese Fund)", "G", "M", "F.01", "remittance", "F", "F.1"
    ),
    "remit_confirmation_pension_fund": FieldSpec(
        "-  Confirmation (Pension Fund)", "G", "M", "F.01", "remittance", "F", "F.1"
    ),
    "remit_progressive_tax": FieldSpec(
        "-  Progressive Tax Coll. (Diocese Share)", "G", "M", "F.01", "remittance", "F", "F.1"
    ),
    "remit_5pct_tax": FieldSpec("-  5% Tax Collections (Diocese Share)", "G", "M", "F.01", "remittance", "F", "F.1"),
    # F.2 Bishop's Fund Share — breakdown is memo, form subtotal is the F.02 line item
    "bishop_share_confirmation": FieldSpec(
        "-  Confirmation (Bishop's Share)", "G", "M", None, "memo", "F", "F.2"
    ),
    "bishop_share_confirmation_minister": FieldSpec(
        "-  Confirmation (Minister-Bishop)", "G", "M", None, "memo", "F", "F.2"
    ),
    "bishop_share_others": FieldSpec("-  Others (Bishop Share)", "G", "M", None, "memo", "F", "F.2"),
    "bishop_share_total": FieldSpec("Bishop's Fund Share", "C", "O", "F.02", "remittance", "F", "F.2"),
}

# Page-level totals and the Personal Contributions block — each label is unique
# sheet-wide, so these are looked up directly without section scoping.
STANDALONE_FIELDS: dict[str, FieldSpec] = {
    "total_receipts": FieldSpec(
        "TOTAL PASTORAL AND PARISH FUND RECEIPTS", "G", "P", None, "memo", "B", "", kind="reconciliation"
    ),
    "total_expenses": FieldSpec(
        "TOTAL PASTORAL AND PARISH FUND EXPENSES", "G", "P", None, "memo", "E", "", kind="reconciliation"
    ),
    "pastoral_parish_fund_net": FieldSpec(
        "PASTORAL & PARISH FUND TOTAL NET RECEIPTS (DEFICIT)", "G", "P", None, "memo", "B", "", kind="reconciliation"
    ),
    "construction_fund_net": FieldSpec(
        "CONSTRUCTION FUND (NET RECEIPTS)", "G", "P", None, "memo", "E", "", kind="reconciliation"
    ),
    "beginning_balance": FieldSpec(
        "Add: Beginning Balance (Previous Month's Ending Balance)", "G", "P", None, "balance", "A", "", kind="reconciliation"
    ),
    "ending_balance_before_remit": FieldSpec(
        "ENDING CASH BALANCE FOR THE MONTH (before remittance)", "G", "P", None, "balance", "E", "", kind="reconciliation"
    ),
    "ending_balance_after_remit": FieldSpec(
        "ENDING CASH BALANCE FOR THE MONTH (after remittance)", "G", "P", None, "balance", "F", "", kind="reconciliation"
    ),
    "personal_contrib_cbcp_pension": FieldSpec(
        "CBCP Pension (1k)", "O", "Q", None, "personal_contribution", "F", "F.3"
    ),
    "personal_contrib_phf": FieldSpec(
        "PHF (2,500, inc. tithes)", "O", "Q", None, "personal_contribution", "F", "F.3"
    ),
    "personal_contrib_monthly_clergy_assembly": FieldSpec(
        "Monthly Clergy Assembly", "O", "Q", None, "personal_contribution", "F", "F.3"
    ),
    "personal_contrib_btq": FieldSpec("BTQ", "O", "Q", None, "personal_contribution", "F", "F.3"),
}

# Count fields (headcounts, never inserted as line items) and the
# decomposition/subtotal fields above are intentionally excluded from both
# maps — they're audit-trail-only (the source file in Storage) or
# reconciliation-only (handled via `kind="reconciliation"`).

OTHER_EXPENSES_BLOCK = {
    "anchor_text": "-  Other Expenses:",
    "anchor_col": "E",
    "anchor_occurrence": 0,  # D.5's block; E.2's "-  Other Expenses:" is occurrence=1, handled as `constr_other`
    "label_col": "G",
    "value_col": "M",
    "continuation_rows": 3,
    "account_code": "E.08",
    "item_type": "expense",
    "section_code": "E",
    "subsection_code": "D.5",
    "fallback_label": "Other Expense (unlabeled)",
}

SPECIAL_COLLECTIONS_BLOCK = {
    "section_anchor_text": "Special Collections",
    "section_anchor_col": "C",
    "other_anchor_text": "Other Collections",
    "other_anchor_col": "E",
    "named_label_col": "G",
    "amount_col": "M",
    "continuation_label_col": "G",
    "continuation_rows": 5,  # inclusive of the "Other Collections" anchor row itself
    "account_code": "F.03",
    "item_type": "remittance",
    "section_code": "F",
    "subsection_code": "F.3",
}


# ---------------------------------------------------------------------------
# Numeric / text normalization
# ---------------------------------------------------------------------------


def _safe_numeric(raw: Any) -> tuple[float, bool]:
    """Returns (value, had_error). had_error=True means the cell held a
    formula-error sentinel (#N/A etc) or unparseable text — caller decides
    whether that's a validation blocker."""
    if raw is None:
        return 0.0, False
    if isinstance(raw, (int, float)):
        return float(raw), False

    text = str(raw).strip()
    if text == "":
        return 0.0, False
    if text.upper() in FORMULA_ERROR_VALUES:
        return 0.0, True

    cleaned = text.replace("₱", "").replace("PHP", "").replace(",", "").strip()
    negative = False
    if cleaned.startswith("(") and cleaned.endswith(")"):
        negative = True
        cleaned = cleaned[1:-1].strip()
    cleaned = cleaned.replace("%", "").strip()

    try:
        value = float(cleaned)
    except ValueError:
        return 0.0, True

    return (-value if negative else value), False


def _parse_month_year(sheet_name: str) -> tuple[str, int] | None:
    match = re.match(r"^([A-Za-z]+)[ _](\d{4})(?:\s*\(\d+\))?$", sheet_name.strip())
    if not match:
        return None
    month_text, year_text = match.group(1).lower(), match.group(2)
    month_num = FULL_MONTH_TO_NUM.get(month_text)
    if month_num is None:
        return None
    return MONTH_NAMES[month_num - 1], int(year_text)


def _normalize_month(raw: Any) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if text.isdigit():
        num = int(text)
        if 1 <= num <= 12:
            return MONTH_NAMES[num - 1]
        return None
    lowered = text.lower()
    if lowered in FULL_MONTH_TO_NUM:
        return MONTH_NAMES[FULL_MONTH_TO_NUM[lowered] - 1]
    for abbrev in MONTH_NAMES:
        if lowered == abbrev.lower():
            return abbrev
    return None


# ---------------------------------------------------------------------------
# xlsx front-end — label-anchored, not fixed-cell
# ---------------------------------------------------------------------------


def _col_letters(ws) -> list[str]:
    max_col = min(ws.max_column or 20, 26)
    return [openpyxl.utils.get_column_letter(i) for i in range(1, max_col + 1)]


def _find_label_rows(ws, text: str, col: str, max_row: int) -> list[int]:
    rows = []
    for row in range(1, max_row + 1):
        value = ws[f"{col}{row}"].value
        if value is not None and str(value).strip() == text:
            rows.append(row)
    return rows


def _extract_parish_name(ws) -> str:
    raw = ws["A4"].value
    text = str(raw).strip() if raw is not None else ""
    if text.lower().startswith("(please indicate"):
        return ""
    return text


def _check_template_version(ws) -> str | None:
    raw = ws["A2"].value
    title = str(raw).strip() if raw is not None else ""
    return title if title and title != KNOWN_TEMPLATE_TITLE else None


def extract_row_xlsx(ws, max_row: int = 140) -> dict[str, Any]:
    fields: dict[str, float] = {}
    field_errors: list[str] = []
    line_item_overrides: dict[str, dict[str, Any]] = {}

    for key, spec in {**FIELD_MAP, **STANDALONE_FIELDS}.items():
        rows = _find_label_rows(ws, spec.label, spec.label_col, max_row)
        if spec.occurrence >= len(rows):
            fields[key] = 0.0
            continue
        row_num = rows[spec.occurrence]
        value, had_error = _safe_numeric(ws[f"{spec.value_col}{row_num}"].value)
        fields[key] = value
        if had_error:
            field_errors.append(key)
        line_item_overrides[key] = {"source_row_number": row_num, "source_label": spec.label}

    other_expenses = _extract_other_expenses_xlsx(ws)
    special_collections = _extract_special_collections_xlsx(ws)

    return {
        "fields": fields,
        "field_errors": field_errors,
        "line_item_meta": line_item_overrides,
        "other_expenses": other_expenses,
        "special_collections": special_collections,
        "parish_name": _extract_parish_name(ws),
        "template_version_mismatch": _check_template_version(ws),
    }


def _extract_other_expenses_xlsx(ws) -> list[dict[str, Any]]:
    cfg = OTHER_EXPENSES_BLOCK
    rows = _find_label_rows(ws, cfg["anchor_text"], cfg["anchor_col"], 140)
    if cfg["anchor_occurrence"] >= len(rows):
        return []
    anchor_row = rows[cfg["anchor_occurrence"]]

    items = []
    for offset in range(0, cfg["continuation_rows"] + 1):
        row_num = anchor_row + offset
        amount, had_error = _safe_numeric(ws[f"{cfg['value_col']}{row_num}"].value)
        label_raw = ws[f"{cfg['label_col']}{row_num}"].value
        label = str(label_raw).strip() if label_raw else ""
        if amount == 0 and not had_error and not label:
            continue
        items.append(
            {
                "item_label": label or cfg["fallback_label"],
                "amount": amount,
                "had_error": had_error,
                "source_row_number": row_num,
            }
        )
    return items


def _extract_special_collections_xlsx(ws) -> list[dict[str, Any]]:
    cfg = SPECIAL_COLLECTIONS_BLOCK
    section_rows = _find_label_rows(ws, cfg["section_anchor_text"], cfg["section_anchor_col"], 140)
    other_rows = _find_label_rows(ws, cfg["other_anchor_text"], cfg["other_anchor_col"], 140)
    if not section_rows or not other_rows:
        return []
    section_row = section_rows[0]
    other_anchor_row = other_rows[0]

    items = []
    # Named ORDO-calendar collections: between the section header and the
    # "Other Collections" continuation anchor. Count varies month to month.
    for row_num in range(section_row + 1, other_anchor_row):
        label_raw = ws[f"{cfg['named_label_col']}{row_num}"].value
        label = str(label_raw).strip() if label_raw else ""
        amount, had_error = _safe_numeric(ws[f"{cfg['amount_col']}{row_num}"].value)
        if not label and amount == 0 and not had_error:
            continue
        items.append(
            {
                "item_label": label or cfg["other_anchor_text"],
                "amount": amount,
                "had_error": had_error,
                "source_row_number": row_num,
            }
        )

    # Parish-typed "Other Collections" continuation rows
    for offset in range(0, cfg["continuation_rows"]):
        row_num = other_anchor_row + offset
        label_raw = ws[f"{cfg['continuation_label_col']}{row_num}"].value
        label = str(label_raw).strip() if label_raw else ""
        amount, had_error = _safe_numeric(ws[f"{cfg['amount_col']}{row_num}"].value)
        if amount == 0 and not had_error and not label:
            continue
        items.append(
            {
                "item_label": label or cfg["other_anchor_text"],
                "amount": amount,
                "had_error": had_error,
                "source_row_number": row_num,
            }
        )
    return items


# ---------------------------------------------------------------------------
# csv front-end — column-name lookup
# ---------------------------------------------------------------------------

CSV_REQUIRED_COLUMNS = ["parish_name", "month", "year"]
CSV_OTHER_EXPENSE_SLOTS = 4
CSV_SPECIAL_COLLECTION_SLOTS = 8


def _csv_known_columns() -> set[str]:
    known = set(CSV_REQUIRED_COLUMNS) | {"template_version"}
    known |= set(FIELD_MAP.keys()) | set(STANDALONE_FIELDS.keys())
    for i in range(1, CSV_OTHER_EXPENSE_SLOTS + 1):
        known.add(f"expense_other_{i}")
        known.add(f"expense_other_{i}_label")
    for i in range(1, CSV_SPECIAL_COLLECTION_SLOTS + 1):
        known.add(f"special_coll_{i}")
        known.add(f"special_coll_{i}_label")
    for extra in ("constr_receipts_other", "constr_other", "coll_other_sources", "receipts_other"):
        known.add(f"{extra}_label")
    return known


def extract_row_csv(csv_row: dict[str, str]) -> dict[str, Any]:
    fields: dict[str, float] = {}
    field_errors: list[str] = []

    for key, spec in {**FIELD_MAP, **STANDALONE_FIELDS}.items():
        if spec.kind == "reconciliation" and key not in csv_row:
            fields[key] = 0.0
            continue
        raw = csv_row.get(key)
        value, had_error = _safe_numeric(raw)
        fields[key] = value
        if had_error:
            field_errors.append(key)

    other_expenses = []
    for i in range(1, CSV_OTHER_EXPENSE_SLOTS + 1):
        amount, had_error = _safe_numeric(csv_row.get(f"expense_other_{i}"))
        label = (csv_row.get(f"expense_other_{i}_label") or "").strip()
        if amount == 0 and not had_error and not label:
            continue
        other_expenses.append(
            {"item_label": label or OTHER_EXPENSES_BLOCK["fallback_label"], "amount": amount, "had_error": had_error}
        )

    special_collections = []
    for i in range(1, CSV_SPECIAL_COLLECTION_SLOTS + 1):
        amount, had_error = _safe_numeric(csv_row.get(f"special_coll_{i}"))
        label = (csv_row.get(f"special_coll_{i}_label") or "").strip()
        if amount == 0 and not had_error and not label:
            continue
        special_collections.append(
            {"item_label": label or "Special Collection", "amount": amount, "had_error": had_error}
        )

    parish_name = (csv_row.get("parish_name") or "").strip()
    month = _normalize_month(csv_row.get("month")) or ""
    year_raw = (csv_row.get("year") or "").strip()
    template_version = (csv_row.get("template_version") or "").strip()

    unknown_columns = [c for c in csv_row.keys() if c not in _csv_known_columns()]

    return {
        "fields": fields,
        "field_errors": field_errors,
        "other_expenses": other_expenses,
        "special_collections": special_collections,
        "parish_name": parish_name,
        "month_raw": month,
        "year_raw": year_raw,
        "template_version_mismatch": (
            template_version if template_version and template_version != KNOWN_TEMPLATE_TITLE else None
        ),
        "unknown_columns": unknown_columns,
        "missing_required_columns": [c for c in CSV_REQUIRED_COLUMNS if not (csv_row.get(c) or "").strip()],
    }


# ---------------------------------------------------------------------------
# Shared core — line items, validation, reconciliation
# ---------------------------------------------------------------------------

RECEIPT_SECTION_CODES = {"B", "C", "D"}
PASTORAL_EXPENSE_SUBSECTIONS = ("C.1", "C.2", "C.3", "D.1", "D.2", "D.3", "D.4", "D.5")
CONSTRUCTION_SUBSECTIONS = ("E.1", "E.2")
SANE_YEAR_RANGE = (2020, 2035)


def build_line_items(extracted: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    fields = extracted["fields"]
    line_item_meta = extracted.get("line_item_meta", {})

    for key, spec in {**FIELD_MAP, **STANDALONE_FIELDS}.items():
        if spec.kind == "reconciliation":
            continue
        amount = fields.get(key, 0.0)
        if amount == 0:
            continue
        meta = line_item_meta.get(key, {})
        items.append(
            {
                "field_key": key,
                "account_code": spec.account_code,
                "item_label": spec.label.lstrip("- ").rstrip(":").strip() or spec.label,
                "item_type": spec.item_type,
                "amount": amount,
                "section_code": spec.section_code,
                "subsection_code": spec.subsection_code,
                "source_row_number": meta.get("source_row_number"),
                "source_label": meta.get("source_label", spec.label),
            }
        )

    for entry in extracted.get("other_expenses", []):
        items.append(
            {
                "field_key": "expense_other",
                "account_code": OTHER_EXPENSES_BLOCK["account_code"],
                "item_label": entry["item_label"],
                "item_type": OTHER_EXPENSES_BLOCK["item_type"],
                "amount": entry["amount"],
                "section_code": OTHER_EXPENSES_BLOCK["section_code"],
                "subsection_code": OTHER_EXPENSES_BLOCK["subsection_code"],
                "source_row_number": entry.get("source_row_number"),
                "source_label": entry["item_label"],
            }
        )

    for entry in extracted.get("special_collections", []):
        items.append(
            {
                "field_key": "special_collection",
                "account_code": SPECIAL_COLLECTIONS_BLOCK["account_code"],
                "item_label": entry["item_label"],
                "item_type": SPECIAL_COLLECTIONS_BLOCK["item_type"],
                "amount": entry["amount"],
                "section_code": SPECIAL_COLLECTIONS_BLOCK["section_code"],
                "subsection_code": SPECIAL_COLLECTIONS_BLOCK["subsection_code"],
                "source_row_number": entry.get("source_row_number"),
                "source_label": entry["item_label"],
            }
        )

    return items


def build_reconciliation_checks(extracted: dict[str, Any], line_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields = extracted["fields"]
    checks = []

    def add_check(name: str, expected: float, actual: float, scope: str = "operational"):
        diff = round(expected - actual, 2)
        status = "passed" if abs(diff) < 1.0 else "warning"
        checks.append(
            {
                "check_name": name,
                "check_scope": scope,
                "expected_amount": round(expected, 2),
                "actual_amount": round(actual, 2),
                "difference_amount": diff,
                "status": status,
            }
        )

    add_check(
        "MASS_INTENTIONS_RECONCILIATION",
        fields.get("mass_intentions_total_receipts", 0.0),
        fields.get("mass_intentions_claimed", 0.0) + fields.get("mass_intentions_unclaimed", 0.0),
    )

    sacrament_keys = [
        "baptism_infant", "baptism_adult", "wedding_with_mass", "wedding_without_mass",
        "funeral_mass", "funeral_blessings", "certificates", "marriage_banns", "permits",
    ]
    add_check(
        "SACRAMENTS_GRANULAR_RECONCILIATION",
        fields.get("sac_grand_total_amt", 0.0),
        sum(fields.get(k, 0.0) for k in sacrament_keys),
    )

    special_collections_actual = sum(i["amount"] for i in extracted.get("special_collections", []))
    add_check(
        "SPECIAL_COLLECTIONS_RECONCILIATION",
        fields.get("receipts_special_collections", 0.0),
        special_collections_actual,
    )

    actual_receipts = sum(
        fields.get(key, 0.0)
        for key, spec in FIELD_MAP.items()
        if spec.kind == "money"
        and spec.item_type in ("receipt", "personal_contribution")
        and spec.section_code in RECEIPT_SECTION_CODES
    )
    add_check("RECEIPTS_TOTAL_RECONCILIATION", fields.get("total_receipts", 0.0), actual_receipts)

    actual_expenses = sum(
        fields.get(key, 0.0)
        for key, spec in FIELD_MAP.items()
        if spec.kind == "money" and spec.item_type == "expense" and spec.subsection_code in PASTORAL_EXPENSE_SUBSECTIONS
    ) + sum(i["amount"] for i in extracted.get("other_expenses", []))
    add_check("EXPENSES_TOTAL_RECONCILIATION", fields.get("total_expenses", 0.0), actual_expenses)

    actual_construction_net = sum(
        fields.get(key, 0.0)
        for key, spec in FIELD_MAP.items()
        if spec.kind == "money" and spec.subsection_code in CONSTRUCTION_SUBSECTIONS and spec.item_type == "receipt"
    ) - sum(
        fields.get(key, 0.0)
        for key, spec in FIELD_MAP.items()
        if spec.kind == "money" and spec.subsection_code in CONSTRUCTION_SUBSECTIONS and spec.item_type == "expense"
    )
    add_check("CONSTRUCTION_FUND_RECONCILIATION", fields.get("construction_fund_net", 0.0), actual_construction_net)

    return checks


def validate(extracted: dict[str, Any], expected_parish_name: str | None = None) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []

    def add(error_type: str, severity: str, message: str, field_name: str | None = None, row: int | None = None):
        errors.append(
            {
                "error_type": error_type,
                "severity": severity,
                "field_name": field_name,
                "error_message": message,
                "source_row_number": row,
            }
        )

    parish_name = (extracted.get("parish_name") or "").strip()
    fields = extracted.get("fields", {})
    money_fields = {k: v for k, v in fields.items() if FIELD_MAP.get(k, STANDALONE_FIELDS.get(k)) and (FIELD_MAP.get(k) or STANDALONE_FIELDS.get(k)).kind == "money"}
    all_zero = all(v == 0 for v in money_fields.values()) if money_fields else True

    if not parish_name and all_zero:
        add("missing_required", "blocker", "Uploaded file is empty or unreadable — no parish name and no financial data found.")
        return errors

    if not parish_name:
        add("missing_required", "blocker", "Parish name is missing from the submission.", field_name="parish_name")

    if all_zero:
        add("out_of_range", "warning", "Every financial field in this submission is zero.")

    if expected_parish_name and parish_name:
        normalized_expected = expected_parish_name.strip().lower()
        normalized_actual = parish_name.strip().lower()
        if normalized_expected not in normalized_actual and normalized_actual not in normalized_expected:
            add(
                "out_of_range", "warning",
                f"Parish name on the form ('{parish_name}') does not match the submitting institution ('{expected_parish_name}').",
                field_name="parish_name",
            )

    for key in extracted.get("field_errors", []):
        add("invalid_type", "error", f"Field '{key}' contains a non-numeric or formula-error value.", field_name=key)

    for entry in extracted.get("other_expenses", []) + extracted.get("special_collections", []):
        if entry.get("had_error"):
            add("invalid_type", "error", f"'{entry['item_label']}' contains a non-numeric or formula-error value.")

    negative_check_types = ("receipt", "expense", "remittance")
    for key, spec in {**FIELD_MAP, **STANDALONE_FIELDS}.items():
        if spec.kind != "money" or spec.item_type not in negative_check_types:
            continue
        if fields.get(key, 0.0) < 0:
            add("out_of_range", "warning", f"'{spec.label}' is negative, which is unusual for this field.", field_name=key)

    version_mismatch = extracted.get("template_version_mismatch")
    if version_mismatch:
        add(
            "out_of_range", "warning",
            f"Unrecognized template version/title ('{version_mismatch}') — totals were not verified against the known 2026 layout.",
        )

    for col in extracted.get("unknown_columns", []):
        add("unknown_account", "info", f"Unrecognized column '{col}' was ignored.", field_name=col)

    for col in extracted.get("missing_required_columns", []):
        add("missing_required", "blocker", f"Required column '{col}' is missing or empty.", field_name=col)

    return errors


def validate_period(month: str | None, year: int | None) -> list[dict[str, Any]]:
    errors = []
    if not month or month not in MONTH_NAMES:
        errors.append(
            {
                "error_type": "out_of_range",
                "severity": "error",
                "field_name": "month",
                "error_message": f"Could not parse a valid month from the submission ('{month}').",
                "source_row_number": None,
            }
        )
    if year is None or not (SANE_YEAR_RANGE[0] <= year <= SANE_YEAR_RANGE[1]):
        errors.append(
            {
                "error_type": "out_of_range",
                "severity": "error",
                "field_name": "year",
                "error_message": f"Reporting year '{year}' is outside the expected range {SANE_YEAR_RANGE}.",
                "source_row_number": None,
            }
        )
    return errors


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def clean_submission(
    file_bytes: bytes,
    filename: str,
    target_month: int,
    target_year: int,
    expected_parish_name: str | None = None,
) -> dict[str, Any]:
    """Entry point used by the FastAPI router. target_month/target_year select
    which sheet (xlsx) or row (csv) to process — everything else in the file
    is ignored per the one-month-per-upload decision."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if extension == "xlsx":
        extracted, month, year = _process_xlsx(file_bytes, target_month, target_year)
    elif extension == "csv":
        extracted, month, year = _process_csv(file_bytes, target_month, target_year)
    else:
        return {
            "validation_status": "failed",
            "parish_name": None,
            "month": None,
            "year": None,
            "line_items": [],
            "validation_errors": [
                {
                    "error_type": "invalid_type",
                    "severity": "blocker",
                    "field_name": "file",
                    "error_message": f"Unsupported file extension '.{extension}'. Upload an .xlsx or .csv file.",
                    "source_row_number": None,
                }
            ],
            "reconciliation_checks": [],
            "beginning_balance": 0.0,
        }

    if extracted is None:
        return {
            "validation_status": "failed",
            "parish_name": None,
            "month": MONTH_NAMES[target_month - 1] if 1 <= target_month <= 12 else None,
            "year": target_year,
            "line_items": [],
            "validation_errors": [
                {
                    "error_type": "missing_required",
                    "severity": "blocker",
                    "field_name": None,
                    "error_message": (
                        f"No sheet/row found for the selected reporting period "
                        f"({MONTH_NAMES[target_month - 1] if 1 <= target_month <= 12 else target_month} {target_year})."
                    ),
                    "source_row_number": None,
                }
            ],
            "reconciliation_checks": [],
            "beginning_balance": 0.0,
        }

    line_items = build_line_items(extracted)
    reconciliation_checks = build_reconciliation_checks(extracted, line_items)
    validation_errors = validate(extracted, expected_parish_name) + validate_period(month, year)

    has_blocker = any(e["severity"] == "blocker" for e in validation_errors)
    has_error_or_warning = any(e["severity"] in ("error", "warning") for e in validation_errors)
    validation_status = "failed" if has_blocker else "warning" if has_error_or_warning else "passed"

    return {
        "validation_status": validation_status,
        "parish_name": extracted.get("parish_name"),
        "month": month,
        "year": year,
        "line_items": line_items,
        "validation_errors": validation_errors,
        "reconciliation_checks": reconciliation_checks,
        "beginning_balance": extracted["fields"].get("beginning_balance", 0.0),
    }


def _process_xlsx(file_bytes: bytes, target_month: int, target_year: int):
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    target_sheet = None
    for sheet_name in wb.sheetnames:
        parsed = _parse_month_year(sheet_name)
        if parsed and MONTH_NAME_TO_NUM[parsed[0]] == target_month and parsed[1] == target_year:
            target_sheet = sheet_name
            break
    if target_sheet is None:
        return None, None, None

    ws = wb[target_sheet]
    extracted = extract_row_xlsx(ws)
    return extracted, MONTH_NAMES[target_month - 1], target_year


def _process_csv(file_bytes: bytes, target_month: int, target_year: int):
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    target_month_name = MONTH_NAMES[target_month - 1]

    for row in reader:
        row_month = _normalize_month(row.get("month"))
        row_year_raw = (row.get("year") or "").strip()
        row_year = int(row_year_raw) if row_year_raw.isdigit() else None
        if row_month == target_month_name and row_year == target_year:
            extracted = extract_row_csv(row)
            return extracted, row_month, row_year

    return None, None, None

