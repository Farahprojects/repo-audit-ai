-- Create audit_status table that orchestrator depends on
-- This must be created before chunking infrastructure

CREATE TABLE IF NOT EXISTS audit_status (
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

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_audit_status_user_id ON audit_status(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_status_preflight_id ON audit_status(preflight_id);
CREATE INDEX IF NOT EXISTS idx_audit_status_status ON audit_status(status);
CREATE INDEX IF NOT EXISTS idx_audit_status_created_at ON audit_status(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_status_updated_at ON audit_status(updated_at);

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

-- Add results_chunked column to audits table (required for chunking trigger)
ALTER TABLE audits ADD COLUMN IF NOT EXISTS results_chunked BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON TABLE audit_status IS 'Tracks real-time progress and status of background audit processing';
COMMENT ON COLUMN audit_status.logs IS 'Array of progress log messages for real-time updates';
COMMENT ON COLUMN audit_status.report_data IS 'Complete audit report stored as JSONB when processing completes';
COMMENT ON COLUMN audits.results_chunked IS 'Indicates if audit results are stored in chunks rather than directly in the audits table';
