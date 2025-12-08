-- Add estimated_tokens column to audits table for dynamic pricing

ALTER TABLE public.audits ADD COLUMN estimated_tokens integer;
