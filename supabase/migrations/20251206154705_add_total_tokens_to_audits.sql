-- Add total_tokens column to audits table

ALTER TABLE public.audits ADD COLUMN total_tokens integer;
