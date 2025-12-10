-- Fix security warnings: Add SET search_path = public to trigger functions
-- This resolves the function_search_path_mutable warnings from Supabase linter

-- Update the preflights updated_at trigger function
CREATE OR REPLACE FUNCTION update_preflights_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the audit_status updated_at trigger function
CREATE OR REPLACE FUNCTION update_audit_status_updated_at()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
