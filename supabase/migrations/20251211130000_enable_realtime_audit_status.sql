-- Enable realtime updates for audit_status table
-- This allows the Scanner page to receive live progress updates

-- Enable full row replication for realtime
ALTER TABLE audit_status REPLICA IDENTITY FULL;

-- Add to supabase realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE audit_status;

-- Add comment for documentation
COMMENT ON TABLE audit_status IS 'Tracks real-time progress and status of background audit processing with realtime updates enabled';
