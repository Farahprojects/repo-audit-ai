-- Add owner_repo as the stable canonical key (e.g., "Farahprojects/repo-audit-ai")
ALTER TABLE repos ADD COLUMN IF NOT EXISTS owner_repo TEXT;

-- Create unique constraint on owner_repo (the canonical key)
ALTER TABLE repos ADD CONSTRAINT repos_owner_repo_unique UNIQUE (owner_repo);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_repos_owner_repo ON repos(owner_repo);