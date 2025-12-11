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
          logs: Json
          preflight_id: string
          progress: number
          report_data: Json | null
          started_at: string | null
          status: string
          tier: string
          updated_at: string | null
          user_id: string
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
          logs?: Json
          preflight_id: string
          progress?: number
          report_data?: Json | null
          started_at?: string | null
          status?: string
          tier: string
          updated_at?: string | null
          user_id: string
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
          logs?: Json
          preflight_id?: string
          progress?: number
          report_data?: Json | null
          started_at?: string | null
          status?: string
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
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
      reasoning_checkpoints: {
        Row: {
          context_snapshot: string | null
          created_at: string | null
          id: string
          last_successful_tool: string | null
          recovery_strategies: string[] | null
          session_id: string
          step_number: number
        }
        Insert: {
          context_snapshot?: string | null
          created_at?: string | null
          id?: string
          last_successful_tool?: string | null
          recovery_strategies?: string[] | null
          session_id: string
          step_number: number
        }
        Update: {
          context_snapshot?: string | null
          created_at?: string | null
          id?: string
          last_successful_tool?: string | null
          recovery_strategies?: string[] | null
          session_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "reasoning_checkpoints_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reasoning_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      reasoning_sessions: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          status: string | null
          task_description: string
          total_steps: number | null
          total_tokens: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          metadata?: Json | null
          status?: string | null
          task_description: string
          total_steps?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          status?: string | null
          task_description?: string
          total_steps?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reasoning_steps: {
        Row: {
          created_at: string | null
          id: string
          reasoning: string | null
          session_id: string
          step_number: number
          token_usage: number | null
          tool_called: string | null
          tool_input: Json | null
          tool_output: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          reasoning?: string | null
          session_id: string
          step_number: number
          token_usage?: number | null
          tool_called?: string | null
          tool_input?: Json | null
          tool_output?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          reasoning?: string | null
          session_id?: string
          step_number?: number
          token_usage?: number | null
          tool_called?: string | null
          tool_input?: Json | null
          tool_output?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "reasoning_steps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "reasoning_sessions"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Functions: {
      chunk_audit_results: {
        Args: { p_audit_id: string; p_extra_data?: Json; p_issues?: Json }
        Returns: number
      }
      cleanup_expired_oauth_csrf_states: { Args: never; Returns: number }
      cleanup_expired_preflights: { Args: never; Returns: number }
      cleanup_old_reasoning_sessions: {
        Args: { days_old?: number }
        Returns: number
      }
      get_complete_audit_data: { Args: { p_audit_id: string }; Returns: Json }
      reconstruct_audit_results: { Args: { p_audit_id: string }; Returns: Json }
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
