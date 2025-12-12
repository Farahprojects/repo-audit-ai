-- Test delete policies for user data
-- This migration adds DELETE policies for audits, preflights, and audit_jobs tables

-- Allow users to delete their own audits
CREATE POLICY "Users can delete their own audits"
  ON audits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to delete their own preflights
CREATE POLICY "Users can delete their own preflights"
  ON preflights FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to delete their own audit jobs
CREATE POLICY "Users can delete their own audit jobs"
  ON audit_jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to delete their own audit status records
CREATE POLICY "Users can delete their own audit status"
  ON audit_status FOR DELETE
  TO authenticated
  USING (auth.uid() = (select preflights.user_id from preflights where preflights.id = audit_status.preflight_id));

-- Allow users to delete their own audit result chunks
CREATE POLICY "Users can delete their own audit result chunks"
  ON audit_results_chunks FOR DELETE
  TO authenticated
  USING (auth.uid() = (select audits.user_id from audits where audits.id = audit_results_chunks.audit_id));