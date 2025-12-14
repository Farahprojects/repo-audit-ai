


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."acquire_audit_job"("p_worker_id" "text", "p_lock_duration" interval DEFAULT '00:05:00'::interval) RETURNS TABLE("job_id" "uuid", "preflight_id" "uuid", "user_id" "uuid", "tier" "text", "input_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        UPDATE audit_jobs
        SET 
            status = 'processing',
            worker_id = p_worker_id,
            locked_until = NOW() + p_lock_duration,
            started_at = COALESCE(started_at, NOW()),
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = (
            SELECT aj.id
            FROM audit_jobs aj
            WHERE aj.status = 'pending'
              AND aj.scheduled_at <= NOW()
              AND aj.attempts < aj.max_attempts
            ORDER BY aj.priority DESC, aj.scheduled_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        RETURNING audit_jobs.id, audit_jobs.preflight_id, audit_jobs.user_id, audit_jobs.tier, audit_jobs.input_data
    )
    SELECT * FROM claimed;
END;
$$;


ALTER FUNCTION "public"."acquire_audit_job"("p_worker_id" "text", "p_lock_duration" interval) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."acquire_audit_job"("p_worker_id" "text", "p_lock_duration" interval) IS 'Atomically claim a pending job for processing. Returns NULL if no jobs available.';



CREATE OR REPLACE FUNCTION "public"."acquire_audit_jobs_batch"("p_worker_id" "text", "p_batch_size" integer DEFAULT 5, "p_lock_duration" interval DEFAULT '00:10:00'::interval) RETURNS TABLE("job_id" "uuid", "preflight_id" "uuid", "user_id" "uuid", "tier" "text", "input_data" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        UPDATE audit_jobs
        SET 
            status = 'processing',
            worker_id = p_worker_id,
            locked_until = NOW() + p_lock_duration,
            started_at = COALESCE(started_at, NOW()),
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id IN (
            SELECT aj.id
            FROM audit_jobs aj
            WHERE aj.status = 'pending'
              AND aj.scheduled_at <= NOW()
              AND aj.attempts < aj.max_attempts
            ORDER BY aj.priority DESC, aj.scheduled_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT p_batch_size
        )
        RETURNING audit_jobs.id, audit_jobs.preflight_id, audit_jobs.user_id, audit_jobs.tier, audit_jobs.input_data
    )
    SELECT * FROM claimed;
END;
$$;


ALTER FUNCTION "public"."acquire_audit_jobs_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lock_duration" interval) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."acquire_audit_jobs_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lock_duration" interval) IS 'Atomically claim multiple pending jobs for batch processing.';



CREATE OR REPLACE FUNCTION "public"."calculate_chunk_data_size"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.data_size_bytes := pg_column_size(NEW.data);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_chunk_data_size"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_audit_job"("p_job_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'cancelled',
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_job_id
      AND user_id = p_user_id
      AND status IN ('pending', 'processing');
    
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    
    IF v_row_count > 0 THEN
        UPDATE audit_status
        SET 
            status = 'cancelled',
            updated_at = NOW()
        WHERE job_id = p_job_id;
    END IF;
    
    RETURN v_row_count > 0;
END;
$$;


ALTER FUNCTION "public"."cancel_audit_job"("p_job_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cancel_audit_job"("p_job_id" "uuid", "p_user_id" "uuid") IS 'Cancel a pending or processing job (user must own the job)';



CREATE OR REPLACE FUNCTION "public"."chunk_audit_results"("p_audit_id" "uuid", "p_issues" "jsonb" DEFAULT NULL::"jsonb", "p_extra_data" "jsonb" DEFAULT NULL::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_chunk_count INTEGER := 0;
    v_max_chunk_size INTEGER := 500 * 1024; -- 500KB per chunk
    v_issues_array JSONB[];
    v_chunk_data JSONB;
    v_chunk_index INTEGER;
    v_chunk_size INTEGER;
    v_batch_size INTEGER := 50;
BEGIN
    -- Delete existing chunks for this audit (for updates)
    DELETE FROM audit_results_chunks WHERE audit_id = p_audit_id;

    -- Chunk issues if provided
    IF p_issues IS NOT NULL AND jsonb_array_length(p_issues) > 0 THEN
        -- Convert issues to array for chunking
        SELECT array_agg(value) INTO v_issues_array
        FROM jsonb_array_elements(p_issues) AS value;

    -- Create chunks of issues with adaptive sizing
    v_chunk_index := 0;
    v_batch_size := 50;

    WHILE v_chunk_index * v_batch_size < array_length(v_issues_array, 1) LOOP
        -- Try to create a chunk with current batch size
        SELECT jsonb_agg(elem) INTO v_chunk_data
        FROM unnest(v_issues_array[v_chunk_index * v_batch_size + 1 : LEAST((v_chunk_index + 1) * v_batch_size, array_length(v_issues_array, 1))]) AS elem;

        IF v_chunk_data IS NOT NULL THEN
            v_chunk_size := pg_column_size(v_chunk_data);

            -- If chunk is too large, try smaller batches
            WHILE v_chunk_size >= v_max_chunk_size AND v_batch_size > 1 LOOP
                v_batch_size := GREATEST(1, v_batch_size / 2);

                SELECT jsonb_agg(elem) INTO v_chunk_data
                FROM unnest(v_issues_array[v_chunk_index * v_batch_size + 1 : LEAST((v_chunk_index + 1) * v_batch_size, array_length(v_issues_array, 1))]) AS elem;

                IF v_chunk_data IS NOT NULL THEN
                    v_chunk_size := pg_column_size(v_chunk_data);
                ELSE
                    v_chunk_size := 0;
                END IF;
            END LOOP;

            -- Insert the chunk if it's valid size
            IF v_chunk_data IS NOT NULL AND v_chunk_size < v_max_chunk_size THEN
                INSERT INTO audit_results_chunks (audit_id, chunk_type, chunk_index, data)
                VALUES (p_audit_id, 'issues', v_chunk_index, v_chunk_data);
                v_chunk_count := v_chunk_count + 1;
            ELSE
                -- If even single items are too large, we have a problem
                RAISE WARNING 'Unable to create chunk for audit % at index % - data too large', p_audit_id, v_chunk_index;
            END IF;
        END IF;

        v_chunk_index := v_chunk_index + 1;
    END LOOP;
    END IF;

    -- Store extra_data as metadata chunk if provided
    IF p_extra_data IS NOT NULL THEN
        INSERT INTO audit_results_chunks (audit_id, chunk_type, chunk_index, data)
        VALUES (p_audit_id, 'metadata', 0, p_extra_data);
        v_chunk_count := v_chunk_count + 1;
    END IF;

    RETURN v_chunk_count;
END;
$$;


ALTER FUNCTION "public"."chunk_audit_results"("p_audit_id" "uuid", "p_issues" "jsonb", "p_extra_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."chunk_audit_results"("p_audit_id" "uuid", "p_issues" "jsonb", "p_extra_data" "jsonb") IS 'Automatically chunks large audit results for better performance';



CREATE OR REPLACE FUNCTION "public"."cleanup_expired_file_cache"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE deleted_count INTEGER;
BEGIN
  DELETE FROM github_file_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_file_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_oauth_csrf_states"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.oauth_csrf_states
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_oauth_csrf_states"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_preflights"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM preflights
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_preflights"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_audit_jobs"("days_old" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_jobs
    WHERE status IN ('completed', 'failed', 'cancelled')
      AND completed_at < NOW() - (days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_audit_jobs"("days_old" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_repo_files"("days_retention" integer DEFAULT 7) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM repos
    WHERE last_accessed < (NOW() - (days_retention || ' days')::INTERVAL);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_repo_files"("days_retention" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_repos"("days_retention" integer DEFAULT 7) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM repos
    WHERE last_accessed < (NOW() - (days_retention || ' days')::INTERVAL);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_repos"("days_retention" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_audit_job"("p_job_id" "uuid", "p_output_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'completed',
        output_data = p_output_data,
        completed_at = NOW(),
        locked_until = NULL,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$;


ALTER FUNCTION "public"."complete_audit_job"("p_job_id" "uuid", "p_output_data" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_audit_job"("p_job_id" "uuid", "p_output_data" "jsonb") IS 'Mark a job as completed with output data.';



CREATE OR REPLACE FUNCTION "public"."complete_repository_import"("p_import_id" "uuid", "p_success" boolean, "p_file_count" integer DEFAULT 0, "p_total_size_bytes" bigint DEFAULT 0, "p_errors" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE repository_imports
    SET
        status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
        success = p_success,
        file_count = p_file_count,
        total_size_bytes = p_total_size_bytes,
        errors = p_errors,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_import_id;
END;
$$;


ALTER FUNCTION "public"."complete_repository_import"("p_import_id" "uuid", "p_success" boolean, "p_file_count" integer, "p_total_size_bytes" bigint, "p_errors" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_audit_job"("p_job_id" "uuid", "p_error" "text", "p_error_stack" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_attempts INTEGER;
    v_max_attempts INTEGER;
BEGIN
    SELECT attempts, max_attempts INTO v_attempts, v_max_attempts
    FROM audit_jobs WHERE id = p_job_id;
    
    IF v_attempts >= v_max_attempts THEN
        -- Final failure
        UPDATE audit_jobs
        SET 
            status = 'failed',
            last_error = p_error,
            error_stack = p_error_stack,
            completed_at = NOW(),
            locked_until = NULL,
            updated_at = NOW()
        WHERE id = p_job_id;
    ELSE
        -- Retry: reset to pending with exponential backoff
        UPDATE audit_jobs
        SET 
            status = 'pending',
            last_error = p_error,
            error_stack = p_error_stack,
            scheduled_at = NOW() + (POWER(2, v_attempts) || ' minutes')::INTERVAL,
            locked_until = NULL,
            worker_id = NULL,
            updated_at = NOW()
        WHERE id = p_job_id;
    END IF;
END;
$$;


ALTER FUNCTION "public"."fail_audit_job"("p_job_id" "uuid", "p_error" "text", "p_error_stack" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fail_audit_job"("p_job_id" "uuid", "p_error" "text", "p_error_stack" "text") IS 'Mark a job as failed. Will retry if under max_attempts.';



CREATE OR REPLACE FUNCTION "public"."get_audit_queue_stats"() RETURNS TABLE("pending_count" bigint, "processing_count" bigint, "completed_today" bigint, "failed_today" bigint, "avg_processing_seconds" numeric, "oldest_pending_minutes" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) AS completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND completed_at >= CURRENT_DATE) AS failed_today,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) AS avg_processing_seconds,
        MAX(EXTRACT(EPOCH FROM (NOW() - scheduled_at)) / 60) FILTER (WHERE status = 'pending') AS oldest_pending_minutes
    FROM audit_jobs;
$$;


ALTER FUNCTION "public"."get_audit_queue_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_audit_queue_stats"() IS 'Get current queue statistics for monitoring.';



CREATE OR REPLACE FUNCTION "public"."get_complete_audit_data"("p_audit_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_issues JSONB;
    v_extra_data JSONB;
    v_results_chunked BOOLEAN;
    v_result JSONB;
BEGIN
    -- Get the audit record fields we need
    SELECT issues, extra_data, results_chunked
    INTO v_issues, v_extra_data, v_results_chunked
    FROM audits
    WHERE id = p_audit_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- If chunked, reconstruct from chunks
    IF v_results_chunked THEN
        v_result := reconstruct_audit_results(p_audit_id);
    ELSE
        -- Return original format
        v_result := jsonb_build_object(
            'issues', COALESCE(v_issues, '[]'),
            'extra_data', v_extra_data
        );
    END IF;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_complete_audit_data"("p_audit_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_complete_audit_data"("p_audit_id" "uuid") IS 'Gets complete audit data regardless of chunking status';



CREATE OR REPLACE FUNCTION "public"."get_user_active_audits"("p_user_id" "uuid") RETURNS TABLE("preflight_id" "uuid", "repo_url" "text", "tier" "text", "status" "text", "progress" integer, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT 
        aj.preflight_id,
        p.repo_url,
        aj.tier,
        aj.status,
        COALESCE(ast.progress, 0) AS progress,
        aj.created_at
    FROM audit_jobs aj
    JOIN preflights p ON p.id = aj.preflight_id
    LEFT JOIN audit_status ast ON ast.preflight_id = aj.preflight_id
    WHERE aj.user_id = p_user_id
      AND aj.status IN ('pending', 'processing')
    ORDER BY aj.created_at DESC;
$$;


ALTER FUNCTION "public"."get_user_active_audits"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_active_audits"("p_user_id" "uuid") IS 'Get all active (pending/processing) audits for a user';



CREATE OR REPLACE FUNCTION "public"."handle_audit_chunking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_data_size INTEGER;
    v_chunk_count INTEGER;
BEGIN
    -- Check if issues data is large enough to warrant chunking
    IF NEW.issues IS NOT NULL THEN
        v_data_size := pg_column_size(NEW.issues);

        -- If issues are larger than 100KB, use chunking
        IF v_data_size > 100 * 1024 THEN
            -- Create chunks
            SELECT chunk_audit_results(NEW.id, NEW.issues, NEW.extra_data) INTO v_chunk_count;

            -- Clear the original data and mark as chunked
            NEW.issues := NULL;
            NEW.extra_data := NULL;
            NEW.results_chunked := true;
        ELSE
            NEW.results_chunked := false;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_audit_chunking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_audit_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Notify listeners that a new job is available
    PERFORM pg_notify('new_audit_job', json_build_object(
        'job_id', NEW.id,
        'preflight_id', NEW.preflight_id,
        'tier', NEW.tier,
        'priority', NEW.priority
    )::text);
    
    -- Also trigger immediate processing via pg_net
    PERFORM net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/audit-job-processor',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('trigger', 'insert', 'job_id', NEW.id)
    );
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't fail the insert if notification fails
    RAISE WARNING 'Failed to notify new audit job: %', SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_new_audit_job"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_new_audit_job"() IS 'Immediately triggers job processing when a new job is inserted';



CREATE OR REPLACE FUNCTION "public"."reconstruct_audit_results"("p_audit_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_result JSONB := '{}';
    v_issues JSONB := '[]';
    v_metadata JSONB;
BEGIN
    -- Reconstruct issues from chunks
    SELECT jsonb_agg(chunk_data.value)
    INTO v_issues
    FROM (
        SELECT jsonb_array_elements(data) AS value
        FROM audit_results_chunks
        WHERE audit_id = p_audit_id
        AND chunk_type = 'issues'
        ORDER BY chunk_index
    ) AS chunk_data;

    -- Get metadata
    SELECT data INTO v_metadata
    FROM audit_results_chunks
    WHERE audit_id = p_audit_id
    AND chunk_type = 'metadata'
    AND chunk_index = 0;

    -- Build result object
    v_result := jsonb_build_object('issues', COALESCE(v_issues, '[]'));

    IF v_metadata IS NOT NULL THEN
        v_result := v_result || v_metadata;
    END IF;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."reconstruct_audit_results"("p_audit_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reconstruct_audit_results"("p_audit_id" "uuid") IS 'Reconstructs complete audit data from chunks';



CREATE OR REPLACE FUNCTION "public"."recover_stale_audit_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    recovered_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'pending',
        worker_id = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE status = 'processing'
      AND locked_until < NOW();
    
    GET DIAGNOSTICS recovered_count = ROW_COUNT;
    RETURN recovered_count;
END;
$$;


ALTER FUNCTION "public"."recover_stale_audit_jobs"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recover_stale_audit_jobs"() IS 'Recover jobs that were locked but never completed (worker crashed).';



CREATE OR REPLACE FUNCTION "public"."reset_stuck_audit_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE audit_jobs
    SET 
        status = 'pending',
        attempts = 0,
        worker_id = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '15 minutes'
      AND attempts < max_attempts;
      
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."reset_stuck_audit_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_repository_import"("p_repo_id" "uuid", "p_branch" "text", "p_commit_sha" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_import_id UUID;
BEGIN
    INSERT INTO repository_imports (repo_id, branch, commit_sha, status, started_at)
    VALUES (p_repo_id, p_branch, p_commit_sha, 'in_progress', NOW())
    ON CONFLICT (repo_id, branch, commit_sha)
    DO UPDATE SET
        status = 'in_progress',
        started_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_import_id;

    RETURN v_import_id;
END;
$$;


ALTER FUNCTION "public"."start_repository_import"("p_repo_id" "uuid", "p_branch" "text", "p_commit_sha" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_repo"("p_repo_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE repos SET last_accessed = NOW() WHERE repo_id = p_repo_id;
END;
$$;


ALTER FUNCTION "public"."touch_repo"("p_repo_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_repo_file"("file_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE repos SET last_accessed = NOW() WHERE id = file_id;
END;
$$;


ALTER FUNCTION "public"."touch_repo_file"("file_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_audit_job_processing"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    pending_count INTEGER;
    request_id BIGINT;
BEGIN
    -- Check if there are pending jobs
    SELECT COUNT(*) INTO pending_count
    FROM audit_jobs
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
      AND attempts < max_attempts;
    
    IF pending_count > 0 THEN
        -- Trigger the job processor via HTTP
        -- This uses pg_net to make an async HTTP call
        SELECT net.http_post(
            url := current_setting('app.supabase_url') || '/functions/v1/audit-job-processor',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object('trigger', 'pg_cron', 'pending_count', pending_count)
        ) INTO request_id;
        
        RETURN pending_count;
    END IF;
    
    RETURN 0;
END;
$$;


ALTER FUNCTION "public"."trigger_audit_job_processing"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_audit_job_processing"() IS 'Triggers the audit-job-processor edge function via HTTP';



CREATE OR REPLACE FUNCTION "public"."trigger_instant_job_processing"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_request_id BIGINT;
BEGIN
    -- Get config, treating empty strings as NULL
    v_supabase_url := NULLIF(current_setting('app.supabase_url', true), '');
    v_service_key := NULLIF(current_setting('app.service_role_key', true), '');
    
    -- STRICT CHECK: Only trigger if BOTH settings are present
    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        -- Fire and forget via pg_net
        SELECT net.http_post(
            url := v_supabase_url || '/functions/v1/audit-job-processor',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || v_service_key,
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object(
                'trigger', 'instant_db_backup',
                'job_id', NEW.id
            )
        ) INTO v_request_id;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Absolutely never fail the INSERT
    RAISE WARNING 'Backup trigger error for job %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_instant_job_processing"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_audit_status_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_audit_status_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_preflights_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_preflights_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_repos_last_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_repos_last_updated"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_repository_imports_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_repository_imports_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_complete_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_url" "text" NOT NULL,
    "user_id" "uuid",
    "tier" "text" NOT NULL,
    "health_score" integer,
    "issues" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "extra_data" "jsonb",
    "results_chunked" boolean DEFAULT false,
    "complete_data" "jsonb",
    "estimated_tokens" integer,
    "summary" "text",
    "total_tokens" integer
);


ALTER TABLE "public"."audit_complete_data" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_complete_data" IS 'Main audit data table. Stores complete audit records with reconstructed chunked results.';



CREATE TABLE IF NOT EXISTS "public"."audit_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "preflight_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" integer DEFAULT 5 NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "scheduled_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "worker_id" "text",
    "locked_until" timestamp with time zone,
    "last_error" "text",
    "error_stack" "text",
    "input_data" "jsonb" DEFAULT '{}'::"jsonb",
    "output_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "audit_jobs_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 10))),
    CONSTRAINT "audit_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."audit_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_jobs" IS 'Queue for audit job processing. Replaces the old reasoning_sessions/steps/checkpoints tables.';



CREATE TABLE IF NOT EXISTS "public"."audit_results_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "audit_id" "uuid" NOT NULL,
    "chunk_type" "text" NOT NULL,
    "chunk_index" integer DEFAULT 0 NOT NULL,
    "data" "jsonb" NOT NULL,
    "compressed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "data_size_bytes" integer,
    CONSTRAINT "audit_results_chunks_chunk_type_check" CHECK (("chunk_type" = ANY (ARRAY['issues'::"text", 'summary'::"text", 'metadata'::"text", 'raw_data'::"text"])))
);


ALTER TABLE "public"."audit_results_chunks" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_results_chunks" IS 'Stores large audit results in chunks to prevent database bloat and improve performance';



CREATE TABLE IF NOT EXISTS "public"."audit_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "preflight_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "progress" integer DEFAULT 0 NOT NULL,
    "logs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "current_step" "text",
    "report_data" "jsonb",
    "error_message" "text",
    "error_details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "tier" "text" NOT NULL,
    "estimated_duration_seconds" integer,
    "actual_duration_seconds" integer,
    "job_id" "uuid",
    "worker_progress" "jsonb" DEFAULT '[]'::"jsonb",
    "plan_data" "jsonb",
    "token_usage" "jsonb" DEFAULT '{"planner": 0, "workers": 0, "coordinator": 0}'::"jsonb",
    CONSTRAINT "audit_status_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "audit_status_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."audit_status" REPLICA IDENTITY FULL;


ALTER TABLE "public"."audit_status" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_status" IS 'Tracks real-time progress and status of background audit processing';



COMMENT ON COLUMN "public"."audit_status"."logs" IS 'Array of progress log messages for real-time updates';



COMMENT ON COLUMN "public"."audit_status"."report_data" IS 'Complete audit report stored as JSONB when processing completes';



COMMENT ON COLUMN "public"."audit_status"."worker_progress" IS 'Array of {workerId, status, progress, startedAt, completedAt}';



COMMENT ON COLUMN "public"."audit_status"."plan_data" IS 'Cached planner output for debugging';



COMMENT ON COLUMN "public"."audit_status"."token_usage" IS 'Token usage breakdown by phase';



CREATE TABLE IF NOT EXISTS "public"."commits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "commit_sha" "text" NOT NULL,
    "branch" "text" NOT NULL,
    "message" "text",
    "author" "text",
    "author_email" "text",
    "committed_at" timestamp with time zone,
    "imported_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."commits" OWNER TO "postgres";


COMMENT ON TABLE "public"."commits" IS 'Commit metadata for imported repository states';



COMMENT ON COLUMN "public"."commits"."repo_id" IS 'Reference to preflights table (repository)';



COMMENT ON COLUMN "public"."commits"."commit_sha" IS 'Git commit SHA hash';



COMMENT ON COLUMN "public"."commits"."branch" IS 'Branch name this commit belongs to';



CREATE TABLE IF NOT EXISTS "public"."domain_slugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "domain" "text" NOT NULL,
    "noreply" boolean DEFAULT false,
    "support" boolean DEFAULT false,
    "hello" boolean DEFAULT false,
    "contact" boolean DEFAULT false,
    "info" boolean DEFAULT false,
    "help" boolean DEFAULT false,
    "marketing" boolean DEFAULT false,
    "admin" boolean DEFAULT false,
    "legal" boolean DEFAULT false,
    "billing" boolean DEFAULT false,
    "hr" boolean DEFAULT false,
    "dev" boolean DEFAULT false,
    "media" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."domain_slugs" OWNER TO "postgres";


COMMENT ON TABLE "public"."domain_slugs" IS 'Controls valid email address slugs for each domain';



COMMENT ON COLUMN "public"."domain_slugs"."domain" IS 'Domain name (e.g., scai.co)';



CREATE TABLE IF NOT EXISTS "public"."email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_email" "text" NOT NULL,
    "to_email" "text" NOT NULL,
    "subject" "text",
    "body" "text",
    "direction" "text" NOT NULL,
    "raw_headers" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "email_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outgoing'::"text"])))
);


ALTER TABLE "public"."email_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_messages" IS 'Stores all email messages sent and received via VPS';



COMMENT ON COLUMN "public"."email_messages"."direction" IS 'Direction of email: inbound (received) or outgoing (sent)';



COMMENT ON COLUMN "public"."email_messages"."raw_headers" IS 'VPS response data and additional metadata';



CREATE TABLE IF NOT EXISTS "public"."email_notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body_html" "text" NOT NULL,
    "body_text" "text",
    "from_email" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."email_notification_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_notification_templates" IS 'Reusable email templates for automated notifications';



CREATE TABLE IF NOT EXISTS "public"."github_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "github_user_id" bigint NOT NULL,
    "login" "text" NOT NULL,
    "avatar_url" "text",
    "html_url" "text",
    "access_token_encrypted" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."github_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "tier_interest" "text",
    "repo_scanned" "text",
    "converted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leads_tier_interest_check" CHECK (("tier_interest" = ANY (ARRAY['deep'::"text", 'ultra'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "legal_type_check" CHECK (("type" = ANY (ARRAY['privacy'::"text", 'terms'::"text"])))
);


ALTER TABLE "public"."legal" OWNER TO "postgres";


COMMENT ON TABLE "public"."legal" IS 'Legal documents including privacy policy and terms of service';



CREATE TABLE IF NOT EXISTS "public"."oauth_csrf_states" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "state_token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."oauth_csrf_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preflights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_url" "text" NOT NULL,
    "owner" "text" NOT NULL,
    "repo" "text" NOT NULL,
    "default_branch" "text" DEFAULT 'main'::"text",
    "repo_map" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "stats" "jsonb",
    "fingerprint" "jsonb",
    "is_private" boolean DEFAULT false NOT NULL,
    "fetch_strategy" "text" DEFAULT 'public'::"text" NOT NULL,
    "github_account_id" "uuid",
    "token_valid" boolean DEFAULT true,
    "user_id" "uuid",
    "file_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "file_groups" "text"[],
    "installation_id" integer,
    CONSTRAINT "preflights_fetch_strategy_check" CHECK (("fetch_strategy" = ANY (ARRAY['public'::"text", 'authenticated'::"text"])))
);


ALTER TABLE "public"."preflights" OWNER TO "postgres";


COMMENT ON TABLE "public"."preflights" IS 'Persistent repository metadata cache. Single source of truth for repo state before audits run.';



COMMENT ON COLUMN "public"."preflights"."repo_map" IS 'JSONB array of file entries: [{path, size, type, url}]';



COMMENT ON COLUMN "public"."preflights"."fetch_strategy" IS 'How to fetch files: "public" (no auth) or "authenticated" (requires token)';



COMMENT ON COLUMN "public"."preflights"."token_valid" IS 'Whether the associated GitHub token is still valid for this repo';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "credits" integer DEFAULT 1 NOT NULL,
    "tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "github_username" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'pro'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."repos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "repo_name" "text" NOT NULL,
    "branch" "text" DEFAULT 'main'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "archive_hash" "text" NOT NULL,
    "archive_size" integer DEFAULT 0 NOT NULL,
    "file_index" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "last_accessed" timestamp with time zone DEFAULT "now"(),
    "commit_sha" "text",
    "owner_repo" "text"
);


ALTER TABLE "public"."repos" OWNER TO "postgres";


COMMENT ON TABLE "public"."repos" IS 'Stores entire repositories as compressed archives. One row per repo.';



COMMENT ON COLUMN "public"."repos"."storage_path" IS 'Path to archive in repo_archives bucket';



COMMENT ON COLUMN "public"."repos"."file_index" IS 'JSONB index of files: {path: {size, hash, type, offset}}';



CREATE TABLE IF NOT EXISTS "public"."repository_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "repo_id" "uuid" NOT NULL,
    "branch" "text" NOT NULL,
    "commit_sha" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "file_count" integer DEFAULT 0,
    "total_size_bytes" bigint DEFAULT 0,
    "success" boolean DEFAULT false,
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "repository_imports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."repository_imports" OWNER TO "postgres";


COMMENT ON TABLE "public"."repository_imports" IS 'Tracks repository import operations and their results';



COMMENT ON COLUMN "public"."repository_imports"."repo_id" IS 'Reference to preflights table (repository)';



COMMENT ON COLUMN "public"."repository_imports"."branch" IS 'Branch being imported';



COMMENT ON COLUMN "public"."repository_imports"."commit_sha" IS 'Commit SHA being imported';



COMMENT ON COLUMN "public"."repository_imports"."status" IS 'Import status: pending, in_progress, completed, failed';



COMMENT ON COLUMN "public"."repository_imports"."success" IS 'Whether the import completed successfully';



COMMENT ON COLUMN "public"."repository_imports"."errors" IS 'Array of error messages encountered during import';



CREATE TABLE IF NOT EXISTS "public"."system_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tier" "text" NOT NULL,
    "name" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "description" "text",
    "credit_cost" integer DEFAULT 2 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verification_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "code" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."verification_codes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_complete_data"
    ADD CONSTRAINT "audit_complete_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_jobs"
    ADD CONSTRAINT "audit_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_jobs"
    ADD CONSTRAINT "audit_jobs_preflight_id_key" UNIQUE ("preflight_id");



ALTER TABLE ONLY "public"."audit_results_chunks"
    ADD CONSTRAINT "audit_results_chunks_audit_id_chunk_type_chunk_index_key" UNIQUE ("audit_id", "chunk_type", "chunk_index");



ALTER TABLE ONLY "public"."audit_results_chunks"
    ADD CONSTRAINT "audit_results_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_status"
    ADD CONSTRAINT "audit_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_status"
    ADD CONSTRAINT "audit_status_preflight_id_key" UNIQUE ("preflight_id");



ALTER TABLE ONLY "public"."commits"
    ADD CONSTRAINT "commits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commits"
    ADD CONSTRAINT "commits_repo_id_commit_sha_branch_key" UNIQUE ("repo_id", "commit_sha", "branch");



ALTER TABLE ONLY "public"."domain_slugs"
    ADD CONSTRAINT "domain_slugs_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."domain_slugs"
    ADD CONSTRAINT "domain_slugs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_notification_templates"
    ADD CONSTRAINT "email_notification_templates_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."email_notification_templates"
    ADD CONSTRAINT "email_notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."github_accounts"
    ADD CONSTRAINT "github_accounts_github_user_id_key" UNIQUE ("github_user_id");



ALTER TABLE ONLY "public"."github_accounts"
    ADD CONSTRAINT "github_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."github_accounts"
    ADD CONSTRAINT "github_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal"
    ADD CONSTRAINT "legal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal"
    ADD CONSTRAINT "legal_type_key" UNIQUE ("type");



ALTER TABLE ONLY "public"."oauth_csrf_states"
    ADD CONSTRAINT "oauth_csrf_states_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_csrf_states"
    ADD CONSTRAINT "oauth_csrf_states_state_token_key" UNIQUE ("state_token");



ALTER TABLE ONLY "public"."preflights"
    ADD CONSTRAINT "preflights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preflights"
    ADD CONSTRAINT "preflights_repo_url_user_id_key" UNIQUE ("repo_url", "user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_owner_repo_unique" UNIQUE ("owner_repo");



ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repository_imports"
    ADD CONSTRAINT "repository_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."repository_imports"
    ADD CONSTRAINT "repository_imports_repo_id_branch_commit_sha_key" UNIQUE ("repo_id", "branch", "commit_sha");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_prompts"
    ADD CONSTRAINT "system_prompts_tier_key" UNIQUE ("tier");



ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "unique_repo_archive" UNIQUE ("repo_id");



ALTER TABLE ONLY "public"."verification_codes"
    ADD CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_complete_data_user_id_fkey" ON "public"."audit_complete_data" USING "btree" ("user_id");



CREATE INDEX "idx_audit_jobs_locked_until" ON "public"."audit_jobs" USING "btree" ("locked_until") WHERE ("locked_until" IS NOT NULL);



CREATE INDEX "idx_audit_jobs_status_priority" ON "public"."audit_jobs" USING "btree" ("status", "priority" DESC, "scheduled_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_audit_jobs_user_id_fkey" ON "public"."audit_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_audit_status_job_id_fkey" ON "public"."audit_status" USING "btree" ("job_id");



CREATE INDEX "idx_audit_status_user_id" ON "public"."audit_status" USING "btree" ("user_id");



COMMENT ON INDEX "public"."idx_audit_status_user_id" IS 'FK index added for RLS performance (advisor recommendation)';



CREATE INDEX "idx_commits_branch" ON "public"."commits" USING "btree" ("branch");



CREATE INDEX "idx_commits_commit_sha" ON "public"."commits" USING "btree" ("commit_sha");



CREATE INDEX "idx_commits_imported_at" ON "public"."commits" USING "btree" ("imported_at" DESC);



CREATE INDEX "idx_commits_repo_id" ON "public"."commits" USING "btree" ("repo_id");



CREATE INDEX "idx_github_accounts_user_id" ON "public"."github_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_oauth_csrf_states_user_id_fkey" ON "public"."oauth_csrf_states" USING "btree" ("user_id");



CREATE INDEX "idx_preflights_github_account_id_fkey" ON "public"."preflights" USING "btree" ("github_account_id");



CREATE INDEX "idx_preflights_installation" ON "public"."preflights" USING "btree" ("repo_url", "installation_id");



CREATE UNIQUE INDEX "idx_preflights_repo_anonymous" ON "public"."preflights" USING "btree" ("repo_url") WHERE (("user_id" IS NULL) AND ("is_private" = false));



CREATE UNIQUE INDEX "idx_preflights_repo_user" ON "public"."preflights" USING "btree" ("repo_url", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_preflights_user_id_fkey" ON "public"."preflights" USING "btree" ("user_id");



CREATE INDEX "idx_repos_file_index" ON "public"."repos" USING "gin" ("file_index");



CREATE INDEX "idx_repos_last_accessed" ON "public"."repos" USING "btree" ("last_accessed");



CREATE INDEX "idx_repos_last_updated" ON "public"."repos" USING "btree" ("last_updated");



CREATE INDEX "idx_repos_owner_repo" ON "public"."repos" USING "btree" ("owner_repo");



CREATE INDEX "idx_repos_repo_id" ON "public"."repos" USING "btree" ("repo_id");



CREATE INDEX "idx_repository_imports_created_at" ON "public"."repository_imports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_repository_imports_repo_id" ON "public"."repository_imports" USING "btree" ("repo_id");



CREATE INDEX "idx_repository_imports_status" ON "public"."repository_imports" USING "btree" ("status");



CREATE INDEX "idx_verification_codes_user_id_fkey" ON "public"."verification_codes" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trigger_audit_jobs_updated_at" BEFORE UPDATE ON "public"."audit_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_audit_status_updated_at" BEFORE UPDATE ON "public"."audit_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_audit_status_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_calculate_chunk_data_size" BEFORE INSERT OR UPDATE ON "public"."audit_results_chunks" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_chunk_data_size"();



CREATE OR REPLACE TRIGGER "trigger_notify_new_audit_job" AFTER INSERT ON "public"."audit_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_audit_job"();



CREATE OR REPLACE TRIGGER "trigger_preflights_updated_at" BEFORE UPDATE ON "public"."preflights" FOR EACH ROW EXECUTE FUNCTION "public"."update_preflights_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_repos_last_updated" BEFORE UPDATE ON "public"."repos" FOR EACH ROW EXECUTE FUNCTION "public"."update_repos_last_updated"();



CREATE OR REPLACE TRIGGER "trigger_repository_imports_updated_at" BEFORE UPDATE ON "public"."repository_imports" FOR EACH ROW EXECUTE FUNCTION "public"."update_repository_imports_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_system_prompts_updated_at" BEFORE UPDATE ON "public"."system_prompts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."audit_complete_data"
    ADD CONSTRAINT "audit_complete_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_jobs"
    ADD CONSTRAINT "audit_jobs_preflight_id_fkey" FOREIGN KEY ("preflight_id") REFERENCES "public"."preflights"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_jobs"
    ADD CONSTRAINT "audit_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_status"
    ADD CONSTRAINT "audit_status_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."audit_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_status"
    ADD CONSTRAINT "audit_status_preflight_id_fkey" FOREIGN KEY ("preflight_id") REFERENCES "public"."preflights"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_status"
    ADD CONSTRAINT "audit_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commits"
    ADD CONSTRAINT "commits_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."preflights"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."github_accounts"
    ADD CONSTRAINT "github_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_csrf_states"
    ADD CONSTRAINT "oauth_csrf_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preflights"
    ADD CONSTRAINT "preflights_github_account_id_fkey" FOREIGN KEY ("github_account_id") REFERENCES "public"."github_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."preflights"
    ADD CONSTRAINT "preflights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."repos"
    ADD CONSTRAINT "repos_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."preflights"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."repository_imports"
    ADD CONSTRAINT "repository_imports_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "public"."preflights"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verification_codes"
    ADD CONSTRAINT "verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read active prompts" ON "public"."system_prompts" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can submit a lead" ON "public"."leads" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can update own repos" ON "public"."repos" FOR UPDATE USING (((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."preflights" "p"
  WHERE (("p"."id" = "repos"."repo_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Authenticated users can view accessible repos" ON "public"."repos" FOR SELECT USING (((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."preflights" "p"
  WHERE (("p"."id" = "repos"."repo_id") AND (("p"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("p"."user_id" IS NULL) AND ("p"."is_private" = false))))))));



CREATE POLICY "Service role can manage commits" ON "public"."commits" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage oauth_csrf_states" ON "public"."oauth_csrf_states" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "Service role can manage repository_imports" ON "public"."repository_imports" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access" ON "public"."repos" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to chunks" ON "public"."audit_results_chunks" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "Service role full access to repos" ON "public"."repos" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "Users can create their own verification codes" ON "public"."verification_codes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own verification codes" ON "public"."verification_codes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own audit chunks" ON "public"."audit_results_chunks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."audit_complete_data" "a"
  WHERE (("a"."id" = "audit_results_chunks"."audit_id") AND ("a"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view commits from accessible repos" ON "public"."commits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."preflights" "p"
  WHERE (("p"."id" = "commits"."repo_id") AND (("p"."user_id" = "auth"."uid"()) OR (("p"."user_id" IS NULL) AND ("p"."is_private" = false)))))));



CREATE POLICY "Users can view imports from accessible repos" ON "public"."repository_imports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."preflights" "p"
  WHERE (("p"."id" = "repository_imports"."repo_id") AND (("p"."user_id" = "auth"."uid"()) OR (("p"."user_id" IS NULL) AND ("p"."is_private" = false)))))));



CREATE POLICY "Users can view repos" ON "public"."repos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."preflights" "p"
  WHERE (("p"."id" = "repos"."repo_id") AND (("p"."user_id" = "auth"."uid"()) OR (("p"."user_id" IS NULL) AND ("p"."is_private" = false)))))));



CREATE POLICY "Users can view their own verification codes" ON "public"."verification_codes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."audit_complete_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_complete_data_access_policy" ON "public"."audit_complete_data" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."audit_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_jobs_access_policy" ON "public"."audit_jobs" USING (((( SELECT "auth"."role"() AS "role") = 'service_role'::"text") OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



ALTER TABLE "public"."audit_results_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_status" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_status_access_policy" ON "public"."audit_status" USING (((( SELECT "auth"."role"() AS "role") = 'service_role'::"text") OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



ALTER TABLE "public"."commits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."domain_slugs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "domain_slugs_service_access" ON "public"."domain_slugs" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



ALTER TABLE "public"."email_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_messages_service_access" ON "public"."email_messages" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



ALTER TABLE "public"."email_notification_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_notification_templates_service_access" ON "public"."email_notification_templates" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



ALTER TABLE "public"."github_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "github_accounts_access_policy" ON "public"."github_accounts" USING (((( SELECT "auth"."role"() AS "role") = 'service_role'::"text") OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legal_public_read" ON "public"."legal" FOR SELECT USING (true);



CREATE POLICY "legal_service_delete" ON "public"."legal" FOR DELETE USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "legal_service_insert" ON "public"."legal" FOR INSERT WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



CREATE POLICY "legal_service_update" ON "public"."legal" FOR UPDATE USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));



ALTER TABLE "public"."oauth_csrf_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preflights" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "preflights_access_policy" ON "public"."preflights" USING (((( SELECT "auth"."role"() AS "role") = 'service_role'::"text") OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_access_policy" ON "public"."profiles" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."repos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."repository_imports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verification_codes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."acquire_audit_job"("p_worker_id" "text", "p_lock_duration" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."acquire_audit_job"("p_worker_id" "text", "p_lock_duration" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_audit_job"("p_worker_id" "text", "p_lock_duration" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."acquire_audit_jobs_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lock_duration" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."acquire_audit_jobs_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lock_duration" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."acquire_audit_jobs_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lock_duration" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_chunk_data_size"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_chunk_data_size"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_chunk_data_size"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_audit_job"("p_job_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_audit_job"("p_job_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_audit_job"("p_job_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."chunk_audit_results"("p_audit_id" "uuid", "p_issues" "jsonb", "p_extra_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."chunk_audit_results"("p_audit_id" "uuid", "p_issues" "jsonb", "p_extra_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."chunk_audit_results"("p_audit_id" "uuid", "p_issues" "jsonb", "p_extra_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_file_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_file_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_file_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_csrf_states"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_csrf_states"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_oauth_csrf_states"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_preflights"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_preflights"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_preflights"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_audit_jobs"("days_old" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_jobs"("days_old" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_audit_jobs"("days_old" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_repo_files"("days_retention" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_repo_files"("days_retention" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_repo_files"("days_retention" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stale_repos"("days_retention" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stale_repos"("days_retention" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stale_repos"("days_retention" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_audit_job"("p_job_id" "uuid", "p_output_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_audit_job"("p_job_id" "uuid", "p_output_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_audit_job"("p_job_id" "uuid", "p_output_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_repository_import"("p_import_id" "uuid", "p_success" boolean, "p_file_count" integer, "p_total_size_bytes" bigint, "p_errors" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_repository_import"("p_import_id" "uuid", "p_success" boolean, "p_file_count" integer, "p_total_size_bytes" bigint, "p_errors" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_repository_import"("p_import_id" "uuid", "p_success" boolean, "p_file_count" integer, "p_total_size_bytes" bigint, "p_errors" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."fail_audit_job"("p_job_id" "uuid", "p_error" "text", "p_error_stack" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fail_audit_job"("p_job_id" "uuid", "p_error" "text", "p_error_stack" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail_audit_job"("p_job_id" "uuid", "p_error" "text", "p_error_stack" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_audit_queue_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_audit_queue_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_audit_queue_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_complete_audit_data"("p_audit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_complete_audit_data"("p_audit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_complete_audit_data"("p_audit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_active_audits"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_active_audits"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_active_audits"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_audit_chunking"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_audit_chunking"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_audit_chunking"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_audit_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_audit_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_audit_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reconstruct_audit_results"("p_audit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reconstruct_audit_results"("p_audit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconstruct_audit_results"("p_audit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recover_stale_audit_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."recover_stale_audit_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recover_stale_audit_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_stuck_audit_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_stuck_audit_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_stuck_audit_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."start_repository_import"("p_repo_id" "uuid", "p_branch" "text", "p_commit_sha" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."start_repository_import"("p_repo_id" "uuid", "p_branch" "text", "p_commit_sha" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_repository_import"("p_repo_id" "uuid", "p_branch" "text", "p_commit_sha" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_repo"("p_repo_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_repo"("p_repo_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_repo"("p_repo_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_repo_file"("file_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."touch_repo_file"("file_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_repo_file"("file_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_audit_job_processing"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_audit_job_processing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_audit_job_processing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_instant_job_processing"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_instant_job_processing"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_instant_job_processing"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_audit_status_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_audit_status_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_audit_status_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_preflights_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_preflights_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_preflights_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_repos_last_updated"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_repos_last_updated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_repos_last_updated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_repository_imports_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_repository_imports_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_repository_imports_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."audit_complete_data" TO "anon";
GRANT ALL ON TABLE "public"."audit_complete_data" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_complete_data" TO "service_role";



GRANT ALL ON TABLE "public"."audit_jobs" TO "anon";
GRANT ALL ON TABLE "public"."audit_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."audit_results_chunks" TO "anon";
GRANT ALL ON TABLE "public"."audit_results_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_results_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."audit_status" TO "anon";
GRANT ALL ON TABLE "public"."audit_status" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_status" TO "service_role";



GRANT ALL ON TABLE "public"."commits" TO "anon";
GRANT ALL ON TABLE "public"."commits" TO "authenticated";
GRANT ALL ON TABLE "public"."commits" TO "service_role";



GRANT ALL ON TABLE "public"."domain_slugs" TO "anon";
GRANT ALL ON TABLE "public"."domain_slugs" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_slugs" TO "service_role";



GRANT ALL ON TABLE "public"."email_messages" TO "anon";
GRANT ALL ON TABLE "public"."email_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."email_messages" TO "service_role";



GRANT ALL ON TABLE "public"."email_notification_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_notification_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_notification_templates" TO "service_role";



GRANT ALL ON TABLE "public"."github_accounts" TO "anon";
GRANT ALL ON TABLE "public"."github_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."github_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."legal" TO "anon";
GRANT ALL ON TABLE "public"."legal" TO "authenticated";
GRANT ALL ON TABLE "public"."legal" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_csrf_states" TO "anon";
GRANT ALL ON TABLE "public"."oauth_csrf_states" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_csrf_states" TO "service_role";



GRANT ALL ON TABLE "public"."preflights" TO "anon";
GRANT ALL ON TABLE "public"."preflights" TO "authenticated";
GRANT ALL ON TABLE "public"."preflights" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."repos" TO "anon";
GRANT ALL ON TABLE "public"."repos" TO "authenticated";
GRANT ALL ON TABLE "public"."repos" TO "service_role";



GRANT ALL ON TABLE "public"."repository_imports" TO "anon";
GRANT ALL ON TABLE "public"."repository_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."repository_imports" TO "service_role";



GRANT ALL ON TABLE "public"."system_prompts" TO "anon";
GRANT ALL ON TABLE "public"."system_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."system_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."verification_codes" TO "anon";
GRANT ALL ON TABLE "public"."verification_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."verification_codes" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







