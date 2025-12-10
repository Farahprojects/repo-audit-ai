-- Fix Critical RLS Vulnerabilities: Drop overly permissive "Allow service role full access" policies
-- These policies use USING: true which allows ANY authenticated user to access all data

-- 1. Drop the problematic policy on email_messages
DROP POLICY IF EXISTS "Allow service role full access" ON email_messages;

-- 2. Drop the problematic policy on domain_slugs  
DROP POLICY IF EXISTS "Allow service role full access" ON domain_slugs;

-- 3. Drop the problematic policy on email_notification_templates
DROP POLICY IF EXISTS "Allow service role full access" ON email_notification_templates;

-- Note: The correct "Enable all access for service role" policies remain in place
-- which properly restrict access to service_role only using auth.role() = 'service_role'