import { supabase } from '../src/integrations/supabase/client';

export const deleteService = {
  /**
   * Delete a single audit and its related data
   * This includes audit_results_chunks and any other related records
   */
  async deleteAudit(auditId: string): Promise<void> {
    try {
      // Delete audit results chunks first (cascade should handle this, but being explicit)
      const { error: chunksError } = await supabase
        .from('audit_results_chunks')
        .delete()
        .eq('audit_id', auditId);

      if (chunksError) {
        console.warn('Failed to delete audit chunks:', chunksError);
        // Continue with audit deletion even if chunks fail
      }

      // Delete the audit record
      const { error: auditError } = await supabase
        .from('audit_complete_data')
        .delete()
        .eq('id', auditId);

      if (auditError) {
        throw new Error(`Failed to delete audit: ${auditError.message}`);
      }

      console.log(`Successfully deleted audit ${auditId}`);
    } catch (error) {
      console.error('Error deleting audit:', error);
      throw error;
    }
  },

  /**
   * Delete all audits for a specific repository (project)
   * This includes all audits, their chunks, related preflights, and audit jobs
   */
  async deleteProject(repoUrl: string): Promise<void> {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('No authenticated user found');
      }

      console.log(`🗑️ Starting delete project for user ${user.id}, repo: ${repoUrl}`);

      // First, get all preflight IDs for this repo and user
      const { data: preflights, error: fetchPreflightsError } = await supabase
        .from('preflights')
        .select('id')
        .eq('repo_url', repoUrl)
        .eq('user_id', user.id);

      if (fetchPreflightsError) {
        throw new Error(`Failed to fetch preflights for repo: ${fetchPreflightsError.message}`);
      }

      if (!preflights || preflights.length === 0) {
        console.log(`No preflights found for repo ${repoUrl}`);
        return;
      }

      const preflightIds = preflights.map(p => p.id);
      console.log(`Found ${preflightIds.length} preflights to delete: ${preflightIds.join(', ')}`);

      // Safety check: don't delete more than 10 preflights at once
      if (preflightIds.length > 10) {
        throw new Error(`Too many preflights to delete (${preflightIds.length}). This looks like an error.`);
      }

      // Get all audit IDs for this repo and user
      const { data: audits, error: fetchAuditsError } = await supabase
        .from('audit_complete_data')
        .select('id')
        .eq('repo_url', repoUrl)
        .eq('user_id', user.id);

      if (fetchAuditsError) {
        console.warn('Failed to fetch audits:', fetchAuditsError);
      }

      const auditIds = audits ? audits.map(audit => audit.id) : [];
      console.log(`Found ${auditIds.length} audits to delete: ${auditIds.join(', ')}`);

      // Safety check: don't delete more than 100 audits at once
      if (auditIds.length > 100) {
        throw new Error(`Too many audits to delete (${auditIds.length}). This looks like an error.`);
      }

      // Delete audit results chunks for user's audits only
      if (auditIds.length > 0) {
        const { error: chunksError } = await supabase
          .from('audit_results_chunks')
          .delete()
          .in('audit_id', auditIds);

        if (chunksError) {
          console.warn('Failed to delete audit chunks:', chunksError);
          // Continue with deletion
        }
      }

      // Delete audit jobs for this user and preflights
      const { error: jobsError } = await supabase
        .from('audit_jobs')
        .delete()
        .eq('user_id', user.id)
        .in('preflight_id', preflightIds);

      if (jobsError) {
        console.warn('Failed to delete audit jobs:', jobsError);
        // Continue with deletion
      }

      // Delete audit status records for this user and preflights
      const { error: statusError } = await supabase
        .from('audit_status')
        .delete()
        .eq('user_id', user.id)
        .in('preflight_id', preflightIds);

      if (statusError) {
        console.warn('Failed to delete audit status:', statusError);
        // Continue with deletion
      }

      // Delete all audits for this repo and user
      const { error: auditsError } = await supabase
        .from('audit_complete_data')
        .delete()
        .eq('repo_url', repoUrl)
        .eq('user_id', user.id);

      if (auditsError) {
        console.warn('Failed to delete audits:', auditsError);
        // Continue with deletion
      }

      // Delete preflights for this repo and user
      const { error: preflightError } = await supabase
        .from('preflights')
        .delete()
        .eq('repo_url', repoUrl)
        .eq('user_id', user.id);

      if (preflightError) {
        throw new Error(`Failed to delete preflights: ${preflightError.message}`);
      }

      console.log(`✅ Successfully deleted project ${repoUrl} (${auditIds.length} audits, ${preflightIds.length} preflights)`);
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  },

  /**
   * Delete user account and all associated data
   * This performs a full cascade deletion of all user data
   */
  async deleteUserAccount(): Promise<void> {
    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('No authenticated user found');
      }

      // Delete in reverse dependency order to avoid foreign key violations

      // 1. Delete audit-related data first
      const { data: audits, error: fetchAuditsError } = await supabase
        .from('audit_complete_data')
        .select('id')
        .eq('user_id', user.id);

      if (fetchAuditsError) {
        console.warn('Failed to fetch user audits:', fetchAuditsError);
      }

      if (audits && audits.length > 0) {
        const auditIds = audits.map(audit => audit.id);

        // Delete audit chunks
        await supabase
          .from('audit_results_chunks')
          .delete()
          .in('audit_id', auditIds);
      }

      // Get all preflights for this user to delete related jobs and status
      const { data: preflights, error: fetchPreflightsError } = await supabase
        .from('preflights')
        .select('id')
        .eq('user_id', user.id);

      if (preflights && preflights.length > 0) {
        const preflightIds = preflights.map(p => p.id);

        // Delete audit jobs for user's preflights
        await supabase
          .from('audit_jobs')
          .delete()
          .eq('user_id', user.id)
          .in('preflight_id', preflightIds);

        // Delete audit status for user's preflights
        await supabase
          .from('audit_status')
          .delete()
          .eq('user_id', user.id)
          .in('preflight_id', preflightIds);
      }

      // 2. Delete all audits
      const { error: auditsError } = await supabase
        .from('audit_complete_data')
        .delete()
        .eq('user_id', user.id);

      if (auditsError) {
        console.warn('Failed to delete user audits:', auditsError);
      }

      // 3. Delete preflights
      const { error: preflightsError } = await supabase
        .from('preflights')
        .delete()
        .eq('user_id', user.id);

      if (preflightsError) {
        console.warn('Failed to delete user preflights:', preflightsError);
      }

      // 4. Delete GitHub accounts
      const { error: githubError } = await supabase
        .from('github_accounts')
        .delete()
        .eq('user_id', user.id);

      if (githubError) {
        console.warn('Failed to delete GitHub accounts:', githubError);
      }

      // 5. Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (profileError) {
        console.warn('Failed to delete user profile:', profileError);
      }

      // 6. Finally, delete the auth user (this will cascade to everything else)
      const { error: authError } = await supabase.auth.admin.deleteUser(user.id);

      if (authError) {
        throw new Error(`Failed to delete auth user: ${authError.message}`);
      }

      console.log(`Successfully deleted user account ${user.id}`);
    } catch (error) {
      console.error('Error deleting user account:', error);
      throw error;
    }
  },
};
