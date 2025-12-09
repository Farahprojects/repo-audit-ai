-- Create audit_status table for tracking background audit processing
-- This enables real-time progress updates and background job management

CREATE TABLE audit_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Core identifiers
    preflight_id UUID NOT NULL REFERENCES preflights(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

    -- Progress data
    logs JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of log messages
    current_step TEXT, -- Current processing step description
    report_data JSONB, -- Final audit report when completed

    -- Error handling
    error_message TEXT,
    error_details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    -- Metadata
    tier TEXT NOT NULL,
    estimated_duration_seconds INTEGER,
    actual_duration_seconds INTEGER,

    -- Uniqueness constraint (one status per preflight)
    UNIQUE(preflight_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_audit_status_user_id ON audit_status(user_id);
CREATE INDEX idx_audit_status_preflight_id ON audit_status(preflight_id);
CREATE INDEX idx_audit_status_status ON audit_status(status);
CREATE INDEX idx_audit_status_created_at ON audit_status(created_at);
CREATE INDEX idx_audit_status_updated_at ON audit_status(updated_at);

-- Enable RLS
ALTER TABLE audit_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own audit status" ON audit_status
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own audit status" ON audit_status
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own audit status" ON audit_status
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all audit status" ON audit_status
    FOR ALL USING (auth.role() = 'service_role');

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_audit_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_audit_status_updated_at
    BEFORE UPDATE ON audit_status
    FOR EACH ROW
    EXECUTE FUNCTION update_audit_status_updated_at();

-- Function to clean up old completed audit status records (keep for 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_status()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_status
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE audit_status IS 'Tracks real-time progress and status of background audit processing';
COMMENT ON COLUMN audit_status.logs IS 'Array of progress log messages for real-time updates';
COMMENT ON COLUMN audit_status.report_data IS 'Complete audit report stored as JSONB when processing completes';
