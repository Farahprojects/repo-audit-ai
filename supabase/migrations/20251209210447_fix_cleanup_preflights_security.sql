-- Fix cleanup_expired_preflights function syntax and security
-- The previous definition had incorrect syntax for SECURITY DEFINER with SET search_path

CREATE OR REPLACE FUNCTION cleanup_expired_preflights()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM preflights
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$function$;
