import { createSupabaseClient } from '../_shared/utils.ts';

export class PreflightService {
  private supabase: any;

  constructor(supabase: any) {
    this.supabase = supabase;
  }

  async fetchPreflight(preflightId: string): Promise<any> {
    if (!preflightId) {
      return null;
    }

    const { data: fetchedPreflight, error: preflightError } = await this.supabase
      .from('preflights')
      .select('*')
      .eq('id', preflightId)
      .single();

    if (preflightError || !fetchedPreflight) {
      console.error(`❌ [PreflightService] Failed to fetch preflight:`, preflightError);
      throw new Error('Invalid or expired preflight ID');
    }

    return fetchedPreflight;
  }

  static extractFilesFromPreflight(preflightRecord: any): any[] | null {
    if (!preflightRecord) {
      return null;
    }
    return preflightRecord.repo_map;
  }
}
