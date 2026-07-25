-- Repair for installations that applied migration 210 before explicit grants
-- were included. Safe to run repeatedly.
GRANT USAGE ON SCHEMA diocese TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE diocese.announcement_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE diocese.announcement_attachments TO service_role;
