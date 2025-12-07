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
      audits: {
        Row: {
          created_at: string
          health_score: number | null
          id: string
          issues: Json | null
          repo_url: string
          summary: string | null
          tier: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          health_score?: number | null
          id?: string
          issues?: Json | null
          repo_url: string
          summary?: string | null
          tier: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          health_score?: number | null
          id?: string
          issues?: Json | null
          repo_url?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_oauth_csrf_states: { Args: never; Returns: number }
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
