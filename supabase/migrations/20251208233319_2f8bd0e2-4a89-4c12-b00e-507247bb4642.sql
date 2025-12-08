-- Add unique constraint for upsert operations on preflights table
-- This allows the edge function to use ON CONFLICT for authenticated users
CREATE UNIQUE INDEX IF NOT EXISTS preflights_repo_url_user_id_unique 
ON preflights (repo_url, user_id) 
WHERE user_id IS NOT NULL;

-- Also add a unique constraint for anonymous preflights (public repos)
CREATE UNIQUE INDEX IF NOT EXISTS preflights_repo_url_anonymous_unique 
ON preflights (repo_url) 
WHERE user_id IS NULL;