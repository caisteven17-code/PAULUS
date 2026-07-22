"""Canonical translation for isolated 2026 IAFR submission tests."""

from __future__ import annotations

from typing import Any

CANONICAL_FIELD_MAP: dict[str, tuple[str, str, str]] = {
    "mass_intentions_claimed": ("A.3.02", "A", "mass_intentions"),
    "mass_intentions_unclaimed": ("A.3.03", "A", "mass_intentions"),
    "mass_coll_weekday": ("B.1.01", "B", "mass_collections"),
    "mass_coll_sunday": ("B.1.02", "B", "mass_collections"),
    "mass_coll_saturday_anticipated": ("B.1.03", "B", "mass_collections"),
    "coll_rentals": ("B.2.01", "B", "other_collections"),
    "coll_mortuary_columbary": ("B.2.02", "B", "other_collections"),
    "coll_kandilaan": ("B.2.03", "B", "other_collections"),
    "coll_donation_boxes": ("B.2.04", "B", "other_collections"),
    "coll_envelopes": ("B.2.05", "B", "other_collections"),
    "coll_other_sources": ("B.2.06", "B", "other_collections"),
    "receipts_donations": ("B.3.01", "B", "other_receipts"),
    "receipts_interest_income": ("B.3.02", "B", "other_receipts"),
    "receipts_subsidy_from_diocese": ("B.3.03", "B", "other_receipts"),
    "receipts_special_collections": ("B.3.04", "B", "other_receipts"),
    "receipts_second_collections": ("B.3.05", "B", "other_receipts"),
    "receipts_charge_over_above": ("B.3.06", "B", "other_receipts"),
    "receipts_other": ("B.3.07", "B", "other_receipts"),
    "priest_share_sacraments": ("C.1.01", "C", "priest_share"),
    "priest_share_mass_intentions": ("C.1.02", "C", "priest_share"),
    "priest_share_confirmation": ("C.1.03", "C", "priest_share"),
    "priest_share_confirmation_minister": ("C.1.04", "C", "priest_share"),
    "priest_share_others": ("C.1.05", "C", "priest_share"),
    "stipend_parish_priest": ("C.2.01", "C", "mass_stipend"),
    "stipend_parochial_vicar": ("C.2.02", "C", "mass_stipend"),
    "stipend_guest_priest": ("C.2.03", "C", "mass_stipend"),
    "other_pastoral_confirmation_minister": ("C.3.01", "C", "other_pastoral_expenses"),
    "salary_employees": ("D.1.01", "D", "salaries_wages_benefits"),
    "salary_remuneration_clergy": ("D.1.02", "D", "salaries_wages_benefits"),
    "salary_other_compensation": ("D.1.03", "D", "salaries_wages_benefits"),
    "salary_13th_month": ("D.1.04", "D", "salaries_wages_benefits"),
    "contrib_sss": ("D.2.01", "D", "government_contributions"),
    "contrib_hdmf_pagibig": ("D.2.02", "D", "government_contributions"),
    "contrib_phic_philhealth": ("D.2.03", "D", "government_contributions"),
    "utilities_electric": ("D.3.01", "D", "utilities"),
    "utilities_water": ("D.3.02", "D", "utilities"),
    "comm_telephone": ("D.4.01", "D", "postage_communications"),
    "comm_cable": ("D.4.02", "D", "postage_communications"),
    "comm_internet": ("D.4.03", "D", "postage_communications"),
    "comm_mailing": ("D.4.04", "D", "postage_communications"),
    "expense_food_groceries": ("D.5.01", "D", "other_parish_rectory_expenses"),
    "expense_meetings_representations": ("D.5.02", "D", "other_parish_rectory_expenses"),
    "expense_gasoline": ("D.5.03", "D", "other_parish_rectory_expenses"),
    "expense_transportation": ("D.5.04", "D", "other_parish_rectory_expenses"),
    "expense_office_supplies": ("D.5.05", "D", "other_parish_rectory_expenses"),
    "expense_security": ("D.5.06", "D", "other_parish_rectory_expenses"),
    "expense_liturgical_paraphernalia": ("D.5.07", "D", "other_parish_rectory_expenses"),
    "expense_parish_real_properties": ("D.5.08", "D", "other_parish_rectory_expenses"),
    "expense_repairs_maintenance": ("D.5.09", "D", "other_parish_rectory_expenses"),
    "expense_charitable_contributions": ("D.5.10", "D", "other_parish_rectory_expenses"),
    "expense_subscriptions_newspapers": ("D.5.11", "D", "other_parish_rectory_expenses"),
    "expense_hospital_medicine": ("D.5.12", "D", "other_parish_rectory_expenses"),
    "expense_other": ("D.5.13", "D", "other_parish_rectory_expenses"),
    "constr_receipts_donations": ("E.1.01", "E", "construction_receipts"),
    "constr_receipts_bank_borrowings": ("E.1.02", "E", "construction_receipts"),
    "constr_receipts_parish_borrowings": ("E.1.03", "E", "construction_receipts"),
    "constr_receipts_other": ("E.1.04", "E", "construction_receipts"),
    "constr_labor_materials": ("E.2.01", "E", "construction_expenses"),
    "constr_bank_borrowings_payment": ("E.2.02", "E", "construction_expenses"),
    "constr_parish_borrowings_payment": ("E.2.03", "E", "construction_expenses"),
    "constr_other": ("E.2.04", "E", "construction_expenses"),
    "remit_sacraments_diocese": ("F.1.01", "F", "remittance_to_diocese"),
    "remit_confirmation_diocese_fund": ("F.1.02", "F", "remittance_to_diocese"),
    "remit_confirmation_pension_fund": ("F.1.03", "F", "remittance_to_diocese"),
    "remit_progressive_tax": ("F.1.04", "F", "remittance_to_diocese"),
    "remit_5pct_tax": ("F.1.05", "F", "remittance_to_diocese"),
    "bishop_share_confirmation": ("F.2.01", "F", "bishops_fund_share"),
    "bishop_share_confirmation_minister": ("F.2.02", "F", "bishops_fund_share"),
    "bishop_share_others": ("F.2.03", "F", "bishops_fund_share"),
    "special_collection": ("F.3.01", "F", "special_collections"),
}

SKIPPED_AGGREGATES = {
    "confirmation_total_amt",
    "priest_share_total",
    "stipend_total",
    "salary_total",
    "constr_receipts_total",
    "constr_expenses_total",
    "bishop_share_total",
}


def canonical_entries(clean_result: dict[str, Any]) -> list[dict[str, Any]]:
    """Translate cleaner line items into non-duplicated final canonical rows."""
    entries: list[dict[str, Any]] = []
    other_pastoral_total = 0.0
    other_pastoral_minister = 0.0

    for index, item in enumerate(clean_result.get("line_items", [])):
        field_key = item["field_key"]
        amount = round(float(item.get("amount") or 0), 2)
        if amount == 0 or field_key in SKIPPED_AGGREGATES:
            continue

        if field_key == "other_pastoral_total":
            other_pastoral_total = amount
            continue
        if field_key == "other_pastoral_confirmation_minister":
            other_pastoral_minister = amount

        if (item.get("account_code") or "").startswith("A.") and item["section_code"] == "A":
            mapping = (item["account_code"], "A", "sacrament_breakdown")
        else:
            mapping = CANONICAL_FIELD_MAP.get(field_key)
        if not mapping:
            continue

        account_code, section_code, subsection_code = mapping
        if field_key == "special_collection" and "other" in item["item_label"].lower():
            account_code = "F.3.02"

        entries.append(
            {
                "field_key": f"file.{field_key}.{index}",
                "section_code": section_code,
                "subsection_code": subsection_code,
                "canonical_account_code": account_code,
                "source_label": item["item_label"],
                "raw_value": str(item["amount"]),
                "cleaned_amount": amount,
                "source_metadata": {
                    "source_row_number": item.get("source_row_number"),
                    "source_label": item.get("source_label"),
                    "cleaner_field_key": field_key,
                    "form_version": "iafr_2026_v1",
                },
                "validation_status": "valid",
                "validation_messages": [],
            }
        )

    residual = round(other_pastoral_total - other_pastoral_minister, 2)
    if residual > 0:
        entries.append(
            {
                "field_key": "file.other_pastoral_residual",
                "section_code": "C",
                "subsection_code": "other_pastoral_expenses",
                "canonical_account_code": "C.3.02",
                "source_label": "Other Pastoral Expense",
                "raw_value": str(residual),
                "cleaned_amount": residual,
                "source_metadata": {"derived_from": ["other_pastoral_total", "other_pastoral_confirmation_minister"]},
                "validation_status": "valid",
                "validation_messages": [],
            }
        )

    return entries
