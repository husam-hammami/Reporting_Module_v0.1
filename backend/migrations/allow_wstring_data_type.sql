-- Allow WSTRING in tags.data_type (Siemens WString / Unicode at DB offset).
-- Existing constraint name from create_tags_tables.sql: chk_data_type

ALTER TABLE tags DROP CONSTRAINT IF EXISTS chk_data_type;
ALTER TABLE tags ADD CONSTRAINT chk_data_type
    CHECK (data_type IN ('BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'WSTRING'));
