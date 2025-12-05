import { RepoReport } from "../types";
import { supabase } from "../src/integrations/supabase/client";


export const generateAuditReport = async (repoName: string, stats: any, fileContents: {path: string, content: string}[]): Promise<RepoReport> => {

  // Call Supabase edge function instead of direct API
  const { data, error } = await supabase.functions.invoke('audit-runner', {
    body: {
      repoUrl: `https://github.com/${repoName}`, // Pass full repo URL
      files: fileContents
    }
  });

  if (error) {
    throw new Error(`Audit failed: ${error.message}`);
  }

  if (!data) {
    throw new Error('No audit data received from server');
  }

  return {
    repoName,
    stats,
    healthScore: data.healthScore,
    summary: data.summary,
    issues: data.issues
  };
};
