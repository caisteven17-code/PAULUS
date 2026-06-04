-- Run this only if `parishes.iafr_account_mapping` already exists.

DROP TRIGGER IF EXISTS set_updated_at_parish_account_mapping ON parishes.iafr_account_mapping;
DROP TABLE IF EXISTS parishes.iafr_account_mapping;
