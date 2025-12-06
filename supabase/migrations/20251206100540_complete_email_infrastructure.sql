-- ============================================

-- Complete Email Infrastructure Setup for scai.co

-- ============================================

-- This script creates all necessary tables and configuration

-- for scai.co email system integration with VPS

-- ============================================

-- ============================================

-- 1. Email Messages Table

-- ============================================

-- Stores all inbound and outbound email messages

CREATE TABLE IF NOT EXISTS public.email_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    from_email text NOT NULL,
    to_email text NOT NULL,
    subject text,
    body text,
    direction text NOT NULL CHECK (direction IN ('inbound', 'outgoing')),
    raw_headers jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for better query performance

CREATE INDEX IF NOT EXISTS idx_email_messages_from_email ON public.email_messages(from_email);

CREATE INDEX IF NOT EXISTS idx_email_messages_to_email ON public.email_messages(to_email);

CREATE INDEX IF NOT EXISTS idx_email_messages_direction ON public.email_messages(direction);

CREATE INDEX IF NOT EXISTS idx_email_messages_created_at ON public.email_messages(created_at DESC);

-- Enable Row Level Security

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your auth requirements)

-- Example: Allow service role to do everything

CREATE POLICY "Allow service role full access" ON public.email_messages
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.email_messages IS 'Stores all email messages sent and received via VPS';

COMMENT ON COLUMN public.email_messages.direction IS 'Direction of email: inbound (received) or outgoing (sent)';

COMMENT ON COLUMN public.email_messages.raw_headers IS 'VPS response data and additional metadata';

-- ============================================

-- 2. Verification Codes Table

-- ============================================

-- Stores temporary verification codes for email verification

CREATE TABLE IF NOT EXISTS public.verification_codes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON public.verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON public.verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON public.verification_codes(expires_at);

-- Enable Row Level Security
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can only access their own codes
CREATE POLICY "Users can view their own verification codes" ON public.verification_codes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own verification codes" ON public.verification_codes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own verification codes" ON public.verification_codes
    FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.verification_codes IS 'Temporary verification codes for email verification';
COMMENT ON COLUMN public.verification_codes.code IS '6-digit verification code';
COMMENT ON COLUMN public.verification_codes.expires_at IS 'When the code expires (typically 5 minutes)';

-- ============================================

-- 3. Domain Slugs Table

-- ============================================

-- Controls which email addresses are valid for each domain

CREATE TABLE IF NOT EXISTS public.domain_slugs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    domain text UNIQUE NOT NULL,
    noreply boolean DEFAULT false,
    support boolean DEFAULT false,
    hello boolean DEFAULT false,
    contact boolean DEFAULT false,
    info boolean DEFAULT false,
    help boolean DEFAULT false,
    marketing boolean DEFAULT false,
    admin boolean DEFAULT false,
    legal boolean DEFAULT false,
    billing boolean DEFAULT false,
    hr boolean DEFAULT false,
    dev boolean DEFAULT false,
    media boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index for domain lookups

CREATE INDEX IF NOT EXISTS idx_domain_slugs_domain ON public.domain_slugs(domain);

-- Enable Row Level Security

ALTER TABLE public.domain_slugs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

CREATE POLICY "Allow service role full access" ON public.domain_slugs
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.domain_slugs IS 'Controls valid email address slugs for each domain';

COMMENT ON COLUMN public.domain_slugs.domain IS 'Domain name (e.g., scai.co)';

-- ============================================

-- 3. Insert scai.co Domain Configuration

-- ============================================

-- Enable email addresses for scai.co domain

INSERT INTO public.domain_slugs (
    domain,
    noreply,
    support,
    hello,
    contact,
    info
)
VALUES (
    'scai.co',
    true,  -- noreply@scai.co
    true,  -- support@scai.co
    true,  -- hello@scai.co
    true,  -- contact@scai.co
    true   -- info@scai.co
)
ON CONFLICT (domain) DO UPDATE
SET
    noreply = EXCLUDED.noreply,
    support = EXCLUDED.support,
    hello = EXCLUDED.hello,
    contact = EXCLUDED.contact,
    info = EXCLUDED.info,
    updated_at = timezone('utc'::text, now());

-- ============================================

-- 4. Email Notification Templates (Optional)

-- ============================================

-- If you want to store email templates

CREATE TABLE IF NOT EXISTS public.email_notification_templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text UNIQUE NOT NULL,
    template_type text NOT NULL,
    subject text NOT NULL,
    body_html text NOT NULL,
    body_text text,
    from_email text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security

ALTER TABLE public.email_notification_templates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

CREATE POLICY "Allow service role full access" ON public.email_notification_templates
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.email_notification_templates IS 'Reusable email templates for automated notifications';

-- ============================================

-- 5. Example Email Templates for scai.co

-- ============================================

INSERT INTO public.email_notification_templates (name, template_type, subject, body_html, body_text, from_email, description)

VALUES

(

    'welcome_email',

    'welcome',

    'Welcome to scai.co!',

    '<h1>Welcome!</h1><p>Thank you for joining scai.co. We''re excited to have you on board.</p>',

    'Welcome! Thank you for joining scai.co. We''re excited to have you on board.',

    'hello@scai.co',

    'Welcome email sent to new users'

),

(

    'password_reset',

    'password_reset',

    'Reset Your Password',

    '<h1>Password Reset Request</h1><p>Click the link below to reset your password:</p><p><a href="{{reset_link}}">Reset Password</a></p>',

    'Password Reset Request. Click the link to reset your password: {{reset_link}}',

    'noreply@scai.co',

    'Password reset email'

),

(

    'email_verification',

    'email_verification',

    'Verify Your Email Address',

    '<h1>Verify Your Email</h1><p>Your verification code is: <strong>{{verification_code}}</strong></p><p>This code will expire in 5 minutes.</p>',

    'Verify Your Email. Your verification code is: {{verification_code}}. This code will expire in 5 minutes.',

    'noreply@scai.co',

    'Email verification for new signups'

)

ON CONFLICT (name) DO NOTHING;

-- ============================================

-- 6. Verification Query

-- ============================================

-- Run this to verify everything is set up correctly

-- Check domain slugs
SELECT
    'domain_slugs' as table_name,
    domain,
    noreply,
    support,
    hello,
    contact,
    info
FROM public.domain_slugs
WHERE domain = 'scai.co';

-- Count email messages (should be 0 initially)
SELECT
    'email_messages' as table_name,
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
    COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing_count
FROM public.email_messages;

-- Count verification codes (should be 0 initially)
SELECT
    'verification_codes' as table_name,
    COUNT(*) as total_codes,
    COUNT(*) FILTER (WHERE expires_at > now()) as active_codes
FROM public.verification_codes;

-- List email templates
SELECT
    'email_templates' as table_name,
    name,
    template_type,
    subject,
    from_email
FROM public.email_notification_templates
ORDER BY name;

-- ============================================

-- Setup Complete!

-- ============================================

-- Available Email Addresses for scai.co:

-- - noreply@scai.co (automated emails)

-- - support@scai.co (customer support)

-- - hello@scai.co (general greetings)

-- - contact@scai.co (general contact)

-- - info@scai.co (information requests)

-- ============================================
