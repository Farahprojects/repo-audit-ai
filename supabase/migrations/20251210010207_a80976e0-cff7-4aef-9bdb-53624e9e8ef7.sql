-- Fix: Recreate audit_complete_data view with SECURITY INVOKER to respect RLS policies
-- This prevents bypassing RLS on the underlying audits table

DROP VIEW IF EXISTS public.audit_complete_data;

CREATE VIEW public.audit_complete_data 
WITH (security_invoker = true) 
AS
SELECT 
  a.id,
  a.repo_url,
  a.user_id,
  a.tier,
  a.health_score,
  a.issues,
  a.created_at,
  a.extra_data,
  a.results_chunked,
  CASE 
    WHEN a.results_chunked THEN public.reconstruct_audit_results(a.id)
    ELSE jsonb_build_object('issues', COALESCE(a.issues, '[]'::jsonb), 'extra_data', a.extra_data)
  END as complete_data,
  a.estimated_tokens,
  a.summary,
  a.total_tokens
FROM public.audits a;

-- Add comment explaining the security consideration
COMMENT ON VIEW public.audit_complete_data IS 'View that reconstructs chunked audit results. Uses SECURITY INVOKER to respect RLS policies on the underlying audits table.';