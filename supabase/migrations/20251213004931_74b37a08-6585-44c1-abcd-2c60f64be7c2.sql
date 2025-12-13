-- Allow users to read their own audit chunks via the audit_complete_data relationship
CREATE POLICY "Users can read own audit chunks" ON audit_results_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audit_complete_data a
      WHERE a.id = audit_results_chunks.audit_id
      AND a.user_id = (SELECT auth.uid())
    )
  );