-- Add extra_data JSONB column to store rich LLM analysis data
ALTER TABLE public.audits ADD COLUMN extra_data jsonb;