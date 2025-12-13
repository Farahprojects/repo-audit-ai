-- Add missing column
ALTER TABLE preflights ADD COLUMN installation_id INTEGER;
CREATE INDEX idx_preflights_installation ON preflights(repo_url, installation_id);