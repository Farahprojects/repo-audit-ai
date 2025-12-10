-- Migration: Create reasoning tables for Universal Orchestrator
-- Created: 2025-12-11

-- reasoning_sessions table for session metadata
CREATE TABLE IF NOT EXISTS reasoning_sessions (
  id TEXT PRIMARY KEY,
  task_description TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'paused')),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  total_steps INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  metadata JSONB
);

-- reasoning_steps table for orchestrator state persistence
CREATE TABLE IF NOT EXISTS reasoning_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES reasoning_sessions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  reasoning TEXT, -- <thinking> content
  tool_called TEXT, -- tool name if any
  tool_input JSONB, -- tool parameters
  tool_output JSONB, -- tool results
  token_usage INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- reasoning_checkpoints for recovery points
CREATE TABLE IF NOT EXISTS reasoning_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES reasoning_sessions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  context_snapshot TEXT, -- Compressed context summary
  last_successful_tool TEXT,
  recovery_strategies TEXT[], -- Alternative approaches if current fails
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE (session_id, step_number)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_reasoning_steps_session 
  ON reasoning_steps(session_id, step_number);

CREATE INDEX IF NOT EXISTS idx_reasoning_steps_created 
  ON reasoning_steps(created_at);

CREATE INDEX IF NOT EXISTS idx_reasoning_sessions_user 
  ON reasoning_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_reasoning_sessions_status 
  ON reasoning_sessions(status);

CREATE INDEX IF NOT EXISTS idx_reasoning_checkpoints_session 
  ON reasoning_checkpoints(session_id, step_number);

-- Enable RLS
ALTER TABLE reasoning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasoning_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE reasoning_checkpoints ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Sessions: Users can see their own sessions, service role can see all
CREATE POLICY "Users can view own sessions"
  ON reasoning_sessions FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert own sessions"
  ON reasoning_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can update own sessions"
  ON reasoning_sessions FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Steps: Users can see steps for their sessions
CREATE POLICY "Users can view own session steps"
  ON reasoning_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reasoning_sessions 
      WHERE reasoning_sessions.id = reasoning_steps.session_id 
      AND (reasoning_sessions.user_id = auth.uid() OR auth.role() = 'service_role')
    )
  );

CREATE POLICY "Service role can insert steps"
  ON reasoning_steps FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Checkpoints: Same as steps
CREATE POLICY "Users can view own session checkpoints"
  ON reasoning_checkpoints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reasoning_sessions 
      WHERE reasoning_sessions.id = reasoning_checkpoints.session_id 
      AND (reasoning_sessions.user_id = auth.uid() OR auth.role() = 'service_role')
    )
  );

CREATE POLICY "Service role can manage checkpoints"
  ON reasoning_checkpoints FOR ALL
  USING (auth.role() = 'service_role');

-- Function to clean up old sessions (optional, run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_reasoning_sessions(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM reasoning_sessions
  WHERE created_at < NOW() - (days_old || ' days')::INTERVAL
  AND status IN ('completed', 'failed');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for sessions (for live progress updates)
ALTER PUBLICATION supabase_realtime ADD TABLE reasoning_sessions;

COMMENT ON TABLE reasoning_sessions IS 'Universal Orchestrator reasoning sessions';
COMMENT ON TABLE reasoning_steps IS 'Individual reasoning steps within a session';
COMMENT ON TABLE reasoning_checkpoints IS 'Recovery checkpoints for session resumption';
