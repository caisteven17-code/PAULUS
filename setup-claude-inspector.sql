-- =============================================================================
-- Create claude_inspector role with schema-only access (no data access)
-- =============================================================================
-- This role can ONLY read column names and table structure via information_schema
-- It CANNOT read any actual data from tables

-- 1. Create the role (if it doesn't exist)
-- Note: The password is already in your .env as RDS_CLAUDE_URL
CREATE ROLE claude_inspector WITH LOGIN PASSWORD 'Passworddiocese123';

-- 2. Grant USAGE on all schemas (required to see objects)
GRANT USAGE ON SCHEMA public TO claude_inspector;
GRANT USAGE ON SCHEMA diocese TO claude_inspector;
GRANT USAGE ON SCHEMA parishes TO claude_inspector;
GRANT USAGE ON SCHEMA schools TO claude_inspector;
GRANT USAGE ON SCHEMA seminaries TO claude_inspector;

-- 3. Grant SELECT on information_schema ONLY (schema inspection)
GRANT SELECT ON information_schema.tables TO claude_inspector;
GRANT SELECT ON information_schema.columns TO claude_inspector;
GRANT SELECT ON information_schema.table_constraints TO claude_inspector;
GRANT SELECT ON information_schema.key_column_usage TO claude_inspector;
GRANT SELECT ON information_schema.referential_constraints TO claude_inspector;
GRANT SELECT ON information_schema.schemata TO claude_inspector;

-- 4. Explicitly DENY SELECT on all actual data tables (belt and suspenders)
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM claude_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA diocese FROM claude_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA parishes FROM claude_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA schools FROM claude_inspector;
REVOKE SELECT ON ALL TABLES IN SCHEMA seminaries FROM claude_inspector;

-- 5. Verify the permissions are set correctly
-- You should see: SELECT only for information_schema tables
SELECT grantee, privilege_type, table_schema, table_name
FROM information_schema.role_table_grants
WHERE grantee = 'claude_inspector'
ORDER BY table_schema, table_name;
