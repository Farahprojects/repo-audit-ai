-- Drop the partial indexes that don't work with upsert
DROP INDEX IF EXISTS preflights_repo_url_user_id_unique;
DROP INDEX IF EXISTS preflights_repo_url_anonymous_unique;

-- Create a simple unique constraint on repo_url + user_id (user_id can be null)
-- This allows upsert to work properly
ALTER TABLE preflights ADD CONSTRAINT preflights_repo_url_user_id_key UNIQUE (repo_url, user_id);