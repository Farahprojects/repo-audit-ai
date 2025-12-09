-- Create legal table for privacy and terms content
CREATE TABLE IF NOT EXISTS legal (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL UNIQUE CHECK (type IN ('privacy', 'terms')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE legal ENABLE ROW LEVEL SECURITY;

-- Allow public read access to legal documents
CREATE POLICY "Legal documents are publicly readable" ON legal
    FOR SELECT USING (true);

-- Allow service role to manage legal documents
CREATE POLICY "Service role can manage legal documents" ON legal
    FOR ALL USING (auth.role() = 'service_role');

-- Insert initial legal content
INSERT INTO legal (type, title, content) VALUES
(
    'privacy',
    'Privacy Policy',
    '## Privacy Policy

Last updated: December 2025

### Information We Collect

We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.

### How We Use Your Information

We use the information we collect to:
- Provide, maintain, and improve our services
- Process transactions and send related information
- Send you technical notices and support messages

### Information Sharing

We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.

### Data Security

We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

### Contact Us

If you have any questions about this Privacy Policy, please contact us.'
),
(
    'terms',
    'Terms of Service',
    '## Terms of Service

Last updated: December 2025

### Acceptance of Terms

By accessing and using SCAI, you accept and agree to be bound by the terms and provision of this agreement.

### Use License

Permission is granted to temporarily use SCAI for personal, non-commercial transitory viewing only.

### Disclaimer

The materials on SCAI are provided on an ''as is'' basis. SCAI makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.

### Limitations

In no event shall SCAI or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use SCAI.

### Contact Information

If you have any questions about these Terms of Service, please contact us.'
);

-- Add comment for documentation
COMMENT ON TABLE legal IS 'Legal documents including privacy policy and terms of service';
