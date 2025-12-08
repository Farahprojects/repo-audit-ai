-- Fix 1: Update handle_new_user function with immutable search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$function$;

-- Fix 2: Update update_updated_at_column function with immutable search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Fix 3: Update cleanup_expired_oauth_csrf_states function with immutable search_path
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_csrf_states()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.oauth_csrf_states
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$function$;

-- Fix 4: Update RLS policies for email_messages to restrict to service_role only
DROP POLICY IF EXISTS "Enable all access for service role" ON public.email_messages;
CREATE POLICY "Enable all access for service role" ON public.email_messages
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix 5: Update RLS policies for domain_slugs to restrict to service_role only
DROP POLICY IF EXISTS "Enable all access for service role" ON public.domain_slugs;
CREATE POLICY "Enable all access for service role" ON public.domain_slugs
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Fix 6: Update RLS policies for email_notification_templates to restrict to service_role only
DROP POLICY IF EXISTS "Enable all access for service role" ON public.email_notification_templates;
CREATE POLICY "Enable all access for service role" ON public.email_notification_templates
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');