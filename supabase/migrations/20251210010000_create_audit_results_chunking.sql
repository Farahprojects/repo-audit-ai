-- Implement audit result chunking for scalability
-- This prevents large JSONB objects from causing database performance issues

-- Create audit_results_chunks table for storing large audit data
CREATE TABLE audit_results_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Reference to the parent audit
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,

    -- Chunk metadata
    chunk_type TEXT NOT NULL CHECK (chunk_type IN ('issues', 'summary', 'metadata', 'raw_data')),
    chunk_index INTEGER NOT NULL DEFAULT 0, -- For ordering chunks of the same type

    -- Chunk data (limited size to prevent bloat)
    data JSONB NOT NULL,
    compressed BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    data_size_bytes INTEGER,

    -- Constraints
    UNIQUE(audit_id, chunk_type, chunk_index)
);

-- Indexes for efficient retrieval
CREATE INDEX idx_audit_results_chunks_audit_id ON audit_results_chunks(audit_id);
CREATE INDEX idx_audit_results_chunks_type ON audit_results_chunks(chunk_type);
CREATE INDEX idx_audit_results_chunks_created_at ON audit_results_chunks(created_at);
CREATE INDEX idx_audit_results_chunks_size ON audit_results_chunks(data_size_bytes);

-- Function to calculate data size
CREATE OR REPLACE FUNCTION calculate_chunk_data_size()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    NEW.data_size_bytes := pg_column_size(NEW.data);
    RETURN NEW;
END;
$$;

-- Trigger to automatically calculate data size
CREATE TRIGGER trigger_calculate_chunk_data_size
    BEFORE INSERT OR UPDATE ON audit_results_chunks
    FOR EACH ROW
    EXECUTE FUNCTION calculate_chunk_data_size();

-- Enable RLS
ALTER TABLE audit_results_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own audit result chunks" ON audit_results_chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM audits
            WHERE audits.id = audit_results_chunks.audit_id
            AND audits.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all audit result chunks" ON audit_results_chunks
    FOR ALL USING (auth.role() = 'service_role');

-- Function to automatically chunk large audit results
CREATE OR REPLACE FUNCTION chunk_audit_results(
    p_audit_id UUID,
    p_issues JSONB DEFAULT NULL,
    p_extra_data JSONB DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
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

-- Function to reconstruct audit results from chunks
CREATE OR REPLACE FUNCTION reconstruct_audit_results(p_audit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
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

-- Note: results_chunked column is now added in the dependency migration

-- Function to automatically handle chunking on audit insert/update
CREATE OR REPLACE FUNCTION handle_audit_chunking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
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

-- Create trigger for automatic chunking
CREATE TRIGGER trigger_audit_chunking
    BEFORE INSERT OR UPDATE ON audits
    FOR EACH ROW
    EXECUTE FUNCTION handle_audit_chunking();

-- Function to get complete audit data (handles both chunked and non-chunked)
CREATE OR REPLACE FUNCTION get_complete_audit_data(p_audit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
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

-- Create a view for easy access to complete audit data
CREATE VIEW audit_complete_data AS
SELECT
    a.*,
    CASE
        WHEN a.results_chunked THEN reconstruct_audit_results(a.id)
        ELSE jsonb_build_object('issues', COALESCE(a.issues, '[]'), 'extra_data', a.extra_data)
    END as complete_data
FROM audits a;

-- Grant appropriate permissions
GRANT SELECT ON audit_complete_data TO authenticated;
GRANT SELECT ON audit_results_chunks TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE audit_results_chunks IS 'Stores large audit results in chunks to prevent database bloat and improve performance';
COMMENT ON COLUMN audits.results_chunked IS 'Indicates if audit results are stored in chunks rather than directly in the audits table';
COMMENT ON FUNCTION chunk_audit_results IS 'Automatically chunks large audit results for better performance';
COMMENT ON FUNCTION reconstruct_audit_results IS 'Reconstructs complete audit data from chunks';
COMMENT ON FUNCTION get_complete_audit_data IS 'Gets complete audit data regardless of chunking status';
COMMENT ON VIEW audit_complete_data IS 'View providing easy access to complete audit data with automatic reconstruction';
