-- Update tier CHECK constraint to include 'supabase_deep_dive'
ALTER TABLE public.audits DROP CONSTRAINT IF EXISTS audits_tier_check;
ALTER TABLE public.audits ADD CONSTRAINT audits_tier_check CHECK (tier IN ('shape', 'conventions', 'performance', 'security', 'supabase_deep_dive'));
