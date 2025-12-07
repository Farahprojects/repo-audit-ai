-- Add tier column to audits table to track which audit type was selected
ALTER TABLE public.audits ADD COLUMN tier TEXT NOT NULL DEFAULT 'shape' CHECK (tier IN ('shape', 'conventions', 'performance', 'security'));
