-- Convert audit_complete_data from view to table and add RLS policies for DELETE operations
-- This enables users to delete their own data while maintaining security

-- Convert audit_complete_data view to table
DROP VIEW IF EXISTS public.audit_complete_data;

CREATE TABLE public.audit_complete_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_url TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    health_score INTEGER,
    issues JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    extra_data JSONB,
    results_chunked BOOLEAN DEFAULT false,
    complete_data JSONB,
    estimated_tokens INTEGER,
    summary TEXT,
    total_tokens INTEGER
);

-- Copy any existing data from audits table (if it exists)
INSERT INTO public.audit_complete_data (
    id, repo_url, user_id, tier, health_score, issues, created_at, extra_data,
    results_chunked, estimated_tokens, summary, total_tokens
)
SELECT
    id, repo_url, user_id, tier, health_score, issues, created_at, extra_data,
    results_chunked, estimated_tokens, summary, total_tokens
FROM public.audits
WHERE NOT EXISTS (SELECT 1 FROM public.audit_complete_data WHERE id = audits.id);

-- Enable RLS on audit_complete_data
ALTER TABLE public.audit_complete_data ENABLE ROW LEVEL SECURITY;

-- Add comment explaining the table
COMMENT ON TABLE public.audit_complete_data IS 'Main audit data table. Stores complete audit records with reconstructed chunked results.';

-- Allow users to delete their own audits
CREATE POLICY "Users can delete their own audits"
  ON audit_complete_data FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to delete their own preflights
CREATE POLICY "Users can delete their own preflights"
  ON preflights FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to delete their own audit jobs
CREATE POLICY "Users can delete their own audit jobs"
  ON audit_jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to delete their own audit status records
CREATE POLICY "Users can delete their own audit status"
  ON audit_status FOR DELETE
  TO authenticated
  USING (auth.uid() = (select preflights.user_id from preflights where preflights.id = audit_status.preflight_id));

-- Allow users to delete their own audit result chunks
CREATE POLICY "Users can delete their own audit result chunks"
  ON audit_results_chunks FOR DELETE
  TO authenticated
  USING (auth.uid() = (select audit_complete_data.user_id from audit_complete_data where audit_complete_data.id = audit_results_chunks.audit_id));