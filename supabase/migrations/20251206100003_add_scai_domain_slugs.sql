-- Add scai.co to domain_slugs table

-- This enables email processing for scai.co domain

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
    true,
    true,
    true,
    true,
    true
)
ON CONFLICT (domain) DO UPDATE
SET
    noreply = true,
    support = true,
    hello = true,
    contact = true,
    info = true;

-- Verify the entry
SELECT * FROM public.domain_slugs WHERE domain = 'scai.co';
