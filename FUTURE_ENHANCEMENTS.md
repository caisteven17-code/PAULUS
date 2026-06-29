# Future Enhancements

Deferred items from the IAFR cleaner integration (parish submission workflow), sequenced for later once there's a real, confirmed need to design against rather than a hypothetical one.

## 1. Admin-side template remapping when the diocese revises the IAFR form

A data-driven mapping table (`template_version`, `source_label`, `account_code`) plus a small admin review screen, so a non-developer can repoint labels at account codes when the form changes, instead of a developer editing `FIELD_MAP` in `src/analytics/app/services/iafr_cleaner.py`. Deferred because the diocese only said a format change is *possible*, not confirmed — building this now would mean designing it without a real second template to design against.

## 2. NLP/LLM-assisted suggestions on top of #1

When an admin uploads an unrecognized template version, use embedding/label-similarity matching to *suggest* likely account-code matches for new/renamed labels (admin still reviews and approves before anything goes live — AI never auto-applies a mapping that touches real money). Pure convenience layer on top of #1; only worth building if manual remapping turns out to be genuinely painful once #1 exists and gets used for real.

## 3. School FS / Seminary FS / Diocese cleaning logic

No field maps exist for these report types yet. The generic template storage plumbing (`report-templates` bucket, admin upload/download) is already in place for all four institution types, but the actual extraction/validation/account-mapping logic (equivalent to `iafr_cleaner.py`) would need to be built fresh for each, once their respective templates exist — not a variation of the IAFR cleaner, since IAFR is parish-specific by definition.

## 4. Bulk multi-month upload / historical backfill

Each submission currently represents exactly one reporting period (matching the existing single "Select Period" UI in `ParishDataSubmission.tsx`). Processing every valid month found in a multi-sheet/multi-row file in one go (useful for backfilling years of historical data at once) was considered and explicitly not built — would change what a "submission" means in the current UI.

## 5. `.xls` (legacy binary Excel) and `.pdf` upload support for parish

No parser exists for either format; not pursued since `.xlsx` and `.csv` already cover the real use cases.

## 6. Cross-reconciliation refinements (low-stakes, noted during the IAFR cleaner build)

- Whether `receipts_charge_over_above` (B.3) should additionally reconcile against the Sacraments section's own over/above subtotal (`sac_total_over_above_amt`) — that subtotal is already memo/reconciliation-only either way, so this is just a question of whether to wire up an extra cross-check, not a mapping correctness issue.
- Whether granular sacrament fees (baptism, wedding, funeral, certificates, marriage banns, permits) staying out of `financial_records.sacraments_total` is acceptable long-term, or needs a follow-up migration to add a seeded account code for them. The 26-code model's only sacrament-adjacent codes today are Mass Intentions (`B.01.01`/`B.01.02`) and Confirmation (`B.02`); granular sacrament fees are stored as memo line items for audit/drill-down but are not summed into any aggregate total.
