-- ============================================

-- Email Notification Templates Table for scai.co

-- ============================================

-- This table stores reusable email templates

-- ============================================

CREATE TABLE IF NOT EXISTS public.email_notification_templates (

    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

    name text UNIQUE NOT NULL,

    subject text NOT NULL,

    body_html text NOT NULL,

    body_text text,

    from_email text NOT NULL,

    description text,

    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL

);

-- Add index for template name lookups

CREATE INDEX IF NOT EXISTS idx_email_templates_name ON public.email_notification_templates(name);

-- Enable Row Level Security

ALTER TABLE public.email_notification_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for service role access

CREATE POLICY "Allow service role full access" ON public.email_notification_templates

    FOR ALL

    USING (true)

    WITH CHECK (true);

-- Add table and column comments

COMMENT ON TABLE public.email_notification_templates IS 'Reusable email templates for automated notifications';

COMMENT ON COLUMN public.email_notification_templates.name IS 'Unique template identifier (e.g., welcome_email, password_reset)';

COMMENT ON COLUMN public.email_notification_templates.subject IS 'Email subject line (supports template variables like {{name}})';

COMMENT ON COLUMN public.email_notification_templates.body_html IS 'HTML version of email body (supports template variables)';

COMMENT ON COLUMN public.email_notification_templates.body_text IS 'Plain text version of email body (optional fallback)';

COMMENT ON COLUMN public.email_notification_templates.from_email IS 'From email address (e.g., noreply@scai.co, support@scai.co)';

-- ============================================

-- Table created successfully!

-- You can now add your email templates

-- ============================================
