-- Allow historical PUSHER imports to store Pastoral Fund Receipt line items.
-- The original line-item table only allowed B-F because older Section A values
-- were summarized directly. The IAFR canonical chart now stores sacrament
-- prescribed and over/above breakdowns as real A-section receipt accounts.

ALTER TABLE parishes.iafr_line_items
  DROP CONSTRAINT IF EXISTS iafr_line_items_section_code_check;

ALTER TABLE parishes.iafr_line_items
  ADD CONSTRAINT iafr_line_items_section_code_check
  CHECK (section_code IN ('A', 'B', 'C', 'D', 'E', 'F'));
