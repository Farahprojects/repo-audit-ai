export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string | null
          error_stack: string | null
          id: string
          input_data: Json | null
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          output_data: Json | null
          preflight_id: string
          priority: number
          scheduled_at: string | null
          started_at: string | null
          status: string
          tier: string
          updated_at: string | null
          user_id: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          error_stack?: string | null
          id?: string
          input_data?: Json | null
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          output_data?: Json | null
          preflight_id: string
          priority?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tier: string
          updated_at?: string | null
          user_id: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          error_stack?: string | null
          id?: string
          input_data?: Json | null
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          output_data?: Json | null
          preflight_id?: string
          priority?: number
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tier?: string
          updated_at?: string | null
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_jobs_preflight_id_fkey"
            columns: ["preflight_id"]
            isOneToOne: true
            referencedRelation: "preflights"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_results_chunks: {
        Row: {
          audit_id: string
          chunk_index: number
          chunk_type: string
          compressed: boolean | null
          created_at: string | null
          data: Json
          data_size_bytes: number | null
          id: string
        }
        Insert: {
          audit_id: string
          chunk_index?: number
          chunk_type: string
          compressed?: boolean | null
          created_at?: string | null
          data: Json
          data_size_bytes?: number | null
          id?: string
        }
        Update: {
          audit_id?: string
          chunk_index?: number
          chunk_type?: string
          compressed?: boolean | null
          created_at?: string | null
          data?: Json
          data_size_bytes?: number | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_results_chunks_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit_complete_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_results_chunks_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audit_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_results_chunks_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_status: {
        Row: {
          actual_duration_seconds: number | null
          completed_at: string | null
          created_at: string | null
          current_step: string | null
          error_details: Json | null
          error_message: string | null
          estimated_duration_seconds: number | null
          failed_at: string | null
          id: string
          job_id: string | null
          logs: Json
          plan_data: Json | null
          preflight_id: string
          progress: number
          report_data: Json | null
          started_at: string | null
          status: string
          tier: string
          token_usage: Json | null
          updated_at: string | null
          user_id: string
          worker_progress: Json | null
        }
        Insert: {
          actual_duration_seconds?: number | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          error_details?: Json | null
          error_message?: string | null
          estimated_duration_seconds?: number | null
          failed_at?: string | null
          id?: string
          job_id?: string | null
          logs?: Json
          plan_data?: Json | null
          preflight_id: string
          progress?: number
          report_data?: Json | null
          started_at?: string | null
          status?: string
          tier: string
          token_usage?: Json | null
          updated_at?: string | null
          user_id: string
          worker_progress?: Json | null
        }
        Update: {
          actual_duration_seconds?: number | null
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          error_details?: Json | null
          error_message?: string | null
          estimated_duration_seconds?: number | null
          failed_at?: string | null
          id?: string
          job_id?: string | null
          logs?: Json
          plan_data?: Json | null
          preflight_id?: string
          progress?: number
          report_data?: Json | null
          started_at?: string | null
          status?: string
          tier?: string
          token_usage?: Json | null
          updated_at?: string | null
          user_id?: string
          worker_progress?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_status_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "audit_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_status_preflight_id_fkey"
            columns: ["preflight_id"]
            isOneToOne: true
            referencedRelation: "preflights"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          created_at: string
          estimated_tokens: number | null
          extra_data: Json | null
          health_score: number | null
          id: string
          issues: Json | null
          repo_url: string
          results_chunked: boolean | null
          summary: string | null
          tier: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_tokens?: number | null
          extra_data?: Json | null
          health_score?: number | null
          id?: string
          issues?: Json | null
          repo_url: string
          results_chunked?: boolean | null
          summary?: string | null
          tier?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_tokens?: number | null
          extra_data?: Json | null
          health_score?: number | null
          id?: string
          issues?: Json | null
          repo_url?: string
          results_chunked?: boolean | null
          summary?: string | null
          tier?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_slugs: {
        Row: {
          admin: boolean | null
          billing: boolean | null
          contact: boolean | null
          created_at: string
          dev: boolean | null
          domain: string
          hello: boolean | null
          help: boolean | null
          hr: boolean | null
          id: string
          info: boolean | null
          legal: boolean | null
          marketing: boolean | null
          media: boolean | null
          noreply: boolean | null
          support: boolean | null
          updated_at: string
        }
        Insert: {
          admin?: boolean | null
          billing?: boolean | null
          contact?: boolean | null
          created_at?: string
          dev?: boolean | null
          domain: string
          hello?: boolean | null
          help?: boolean | null
          hr?: boolean | null
          id?: string
          info?: boolean | null
          legal?: boolean | null
          marketing?: boolean | null
          media?: boolean | null
          noreply?: boolean | null
          support?: boolean | null
          updated_at?: string
        }
        Update: {
          admin?: boolean | null
          billing?: boolean | null
          contact?: boolean | null
          created_at?: string
          dev?: boolean | null
          domain?: string
          hello?: boolean | null
          help?: boolean | null
          hr?: boolean | null
          id?: string
          info?: boolean | null
          legal?: boolean | null
          marketing?: boolean | null
          media?: boolean | null
          noreply?: boolean | null
          support?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      email_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          from_email: string
          id: string
          raw_headers: Json | null
          subject: string | null
          to_email: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          from_email: string
          id?: string
          raw_headers?: Json | null
          subject?: string | null
          to_email: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          id?: string
          raw_headers?: Json | null
          subject?: string | null
          to_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_notification_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          description: string | null
          from_email: string
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          description?: string | null
          from_email: string
          id?: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          description?: string | null
          from_email?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      github_accounts: {
        Row: {
          access_token_encrypted: string
          avatar_url: string | null
          created_at: string | null
          github_user_id: number
          html_url: string | null
          id: string
          login: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          avatar_url?: string | null
          created_at?: string | null
          github_user_id: number
          html_url?: string | null
          id?: string
          login: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          avatar_url?: string | null
          created_at?: string | null
          github_user_id?: number
          html_url?: string | null
          id?: string
          login?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          converted: boolean
          created_at: string
          email: string
          id: string
          repo_scanned: string | null
          tier_interest: string | null
        }
        Insert: {
          converted?: boolean
          created_at?: string
          email: string
          id?: string
          repo_scanned?: string | null
          tier_interest?: string | null
        }
        Update: {
          converted?: boolean
          created_at?: string
          email?: string
          id?: string
          repo_scanned?: string | null
          tier_interest?: string | null
        }
        Relationships: []
      }
      legal: {
        Row: {
          content: string
          created_at: string | null
          id: string
          last_updated: string | null
          title: string
          type: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          last_updated?: string | null
          title: string
          type: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          last_updated?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      oauth_csrf_states: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          state_token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          state_token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          state_token?: string
          user_id?: string
        }
        Relationships: []
      }
      preflights: {
        Row: {
          created_at: string | null
          default_branch: string | null
          expires_at: string | null
          fetch_strategy: string
          file_count: number | null
          file_groups: string[] | null
          fingerprint: Json | null
          github_account_id: string | null
          id: string
          is_private: boolean
          owner: string
          repo: string
          repo_map: Json
          repo_url: string
          stats: Json | null
          token_valid: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_branch?: string | null
          expires_at?: string | null
          fetch_strategy?: string
          file_count?: number | null
          file_groups?: string[] | null
          fingerprint?: Json | null
          github_account_id?: string | null
          id?: string
          is_private?: boolean
          owner: string
          repo: string
          repo_map?: Json
          repo_url: string
          stats?: Json | null
          token_valid?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_branch?: string | null
          expires_at?: string | null
          fetch_strategy?: string
          file_count?: number | null
          file_groups?: string[] | null
          fingerprint?: Json | null
          github_account_id?: string | null
          id?: string
          is_private?: boolean
          owner?: string
          repo?: string
          repo_map?: Json
          repo_url?: string
          stats?: Json | null
          token_valid?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preflights_github_account_id_fkey"
            columns: ["github_account_id"]
            isOneToOne: false
            referencedRelation: "github_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          credits: number
          email: string | null
          github_username: string | null
          id: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits?: number
          email?: string | null
          github_username?: string | null
          id: string
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          email?: string | null
          github_username?: string | null
          id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_prompts: {
        Row: {
          created_at: string
          credit_cost: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          prompt: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_cost?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          prompt: string
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_cost?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          prompt?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      audit_complete_data: {
        Row: {
          complete_data: Json | null
          created_at: string | null
          estimated_tokens: number | null
          extra_data: Json | null
          health_score: number | null
          id: string | null
          issues: Json | null
          repo_url: string | null
          results_chunked: boolean | null
          summary: string | null
          tier: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          complete_data?: never
          created_at?: string | null
          estimated_tokens?: number | null
          extra_data?: Json | null
          health_score?: number | null
          id?: string | null
          issues?: Json | null
          repo_url?: string | null
          results_chunked?: boolean | null
          summary?: string | null
          tier?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          complete_data?: never
          created_at?: string | null
          estimated_tokens?: number | null
          extra_data?: Json | null
          health_score?: number | null
          id?: string | null
          issues?: Json | null
          repo_url?: string | null
          results_chunked?: boolean | null
          summary?: string | null
          tier?: string | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_history: {
        Row: {
          created_at: string | null
          current_progress: number | null
          extra_data: Json | null
          fingerprint: Json | null
          health_score: number | null
          id: string | null
          issues: Json | null
          job_attempts: number | null
          job_last_error: string | null
          job_status: string | null
          owner: string | null
          progress_logs: Json | null
          repo: string | null
          repo_url: string | null
          stats: Json | null
          summary: string | null
          tier: string | null
          total_tokens: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acquire_audit_job: {
        Args: { p_lock_duration?: unknown; p_worker_id: string }
        Returns: {
          input_data: Json
          job_id: string
          preflight_id: string
          tier: string
          user_id: string
        }[]
      }
      acquire_audit_jobs_batch: {
        Args: {
          p_batch_size?: number
          p_lock_duration?: unknown
          p_worker_id: string
        }
        Returns: {
          input_data: Json
          job_id: string
          preflight_id: string
          tier: string
          user_id: string
        }[]
      }
      cancel_audit_job: {
        Args: { p_job_id: string; p_user_id: string }
        Returns: boolean
      }
      chunk_audit_results: {
        Args: { p_audit_id: string; p_extra_data?: Json; p_issues?: Json }
        Returns: number
      }
      cleanup_expired_oauth_csrf_states: { Args: never; Returns: number }
      cleanup_expired_preflights: { Args: never; Returns: number }
      cleanup_old_audit_jobs: { Args: { days_old?: number }; Returns: number }
      complete_audit_job: {
        Args: { p_job_id: string; p_output_data: Json }
        Returns: undefined
      }
      fail_audit_job: {
        Args: { p_error: string; p_error_stack?: string; p_job_id: string }
        Returns: undefined
      }
      get_audit_queue_stats: {
        Args: never
        Returns: {
          avg_processing_seconds: number
          completed_today: number
          failed_today: number
          oldest_pending_minutes: number
          pending_count: number
          processing_count: number
        }[]
      }
      get_complete_audit_data: { Args: { p_audit_id: string }; Returns: Json }
      get_user_active_audits: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          preflight_id: string
          progress: number
          repo_url: string
          status: string
          tier: string
        }[]
      }
      reconstruct_audit_results: { Args: { p_audit_id: string }; Returns: Json }
      recover_stale_audit_jobs: { Args: never; Returns: number }
      trigger_audit_job_processing: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
