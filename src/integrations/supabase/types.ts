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
      anonymous_engagements: {
        Row: {
          anon_token: string | null
          created_at: string
          event_type: string
          id: string
          profile_id: string | null
          project_id: string | null
        }
        Insert: {
          anon_token?: string | null
          created_at?: string
          event_type: string
          id?: string
          profile_id?: string | null
          project_id?: string | null
        }
        Update: {
          anon_token?: string | null
          created_at?: string
          event_type?: string
          id?: string
          profile_id?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_engagements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_engagements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_name: string | null
          avg_read_time_minutes: number | null
          content: string
          content_type: string | null
          conversion_count: number | null
          cover_image_url: string | null
          created_at: string | null
          cta_link: string | null
          cta_text: string | null
          cta_type: string | null
          featured: boolean | null
          id: string
          like_count: number | null
          meta_description: string | null
          meta_keywords: string[] | null
          published: boolean | null
          related_posts: string[] | null
          share_count: number | null
          slug: string
          tags: string[] | null
          title: string
          view_count: number | null
        }
        Insert: {
          author_name?: string | null
          avg_read_time_minutes?: number | null
          content: string
          content_type?: string | null
          conversion_count?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          cta_link?: string | null
          cta_text?: string | null
          cta_type?: string | null
          featured?: boolean | null
          id?: string
          like_count?: number | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          published?: boolean | null
          related_posts?: string[] | null
          share_count?: number | null
          slug: string
          tags?: string[] | null
          title: string
          view_count?: number | null
        }
        Update: {
          author_name?: string | null
          avg_read_time_minutes?: number | null
          content?: string
          content_type?: string | null
          conversion_count?: number | null
          cover_image_url?: string | null
          created_at?: string | null
          cta_link?: string | null
          cta_text?: string | null
          cta_type?: string | null
          featured?: boolean | null
          id?: string
          like_count?: number | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          published?: boolean | null
          related_posts?: string[] | null
          share_count?: number | null
          slug?: string
          tags?: string[] | null
          title?: string
          view_count?: number | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          like_count: number
          parent_id: string | null
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          like_count?: number
          parent_id?: string | null
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          like_count?: number
          parent_id?: string | null
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          name?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notification_templates: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          id: string
          subject: string
          template_type: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text: string
          created_at?: string
          id?: string
          subject: string
          template_type: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          id?: string
          subject?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      github_accounts: {
        Row: {
          access_token_encrypted: string
          avatar_url: string | null
          connected_at: string
          github_user_id: number
          html_url: string | null
          login: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          avatar_url?: string | null
          connected_at?: string
          github_user_id: number
          html_url?: string | null
          login: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          avatar_url?: string | null
          connected_at?: string
          github_user_id?: number
          html_url?: string | null
          login?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_implementations: {
        Row: {
          code: string
          created_at: string
          documentation: string
          id: string
          item_id: string
          platform: Database["public"]["Enums"]["app_platform"]
        }
        Insert: {
          code: string
          created_at?: string
          documentation: string
          id?: string
          item_id: string
          platform?: Database["public"]["Enums"]["app_platform"]
        }
        Update: {
          code?: string
          created_at?: string
          documentation?: string
          id?: string
          item_id?: string
          platform?: Database["public"]["Enums"]["app_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "function_implementations_function_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          author_id: string | null
          category: string | null
          created_at: string
          description: string
          downloads: number
          id: string
          image_url: string | null
          is_verified: boolean
          project_id: string | null
          tags: string[]
          title: string
          type: Database["public"]["Enums"]["item_type"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          created_at?: string
          description: string
          downloads?: number
          id?: string
          image_url?: string | null
          is_verified?: boolean
          project_id?: string | null
          tags?: string[]
          title: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          created_at?: string
          description?: string
          downloads?: number
          id?: string
          image_url?: string | null
          is_verified?: boolean
          project_id?: string | null
          tags?: string[]
          title?: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "edge_functions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content: string
          created_at: string
          document_type: string
          effective_date: string
          id: string
          is_active: boolean
          last_updated: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          document_type: string
          effective_date?: string
          id?: string
          is_active?: boolean
          last_updated?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          document_type?: string
          effective_date?: string
          id?: string
          is_active?: boolean
          last_updated?: string
          version?: number
        }
        Relationships: []
      }
      message_images: {
        Row: {
          created_at: string
          id: string
          message_id: string
          order: number
          storage_path: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          order: number
          storage_path: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          order?: number
          storage_path?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_images_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_csrf_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          state_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          state_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          state_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_csrf_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          domain_pending_verification: string | null
          domain_verification_token: string | null
          domain_verified: boolean | null
          domain_verified_at: string | null
          email: string | null
          email_verified: boolean | null
          email_verified_at: string | null
          follower_count: number
          following_count: number
          id: string
          is_onboarding_complete: boolean
          is_public: boolean
          is_verified: boolean | null
          language: string | null
          links: Json | null
          updated_at: string
          username: string | null
          verified_domain: string | null
          verified_email: string | null
          view_count: number
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          domain_pending_verification?: string | null
          domain_verification_token?: string | null
          domain_verified?: boolean | null
          domain_verified_at?: string | null
          email?: string | null
          email_verified?: boolean | null
          email_verified_at?: string | null
          follower_count?: number
          following_count?: number
          id: string
          is_onboarding_complete?: boolean
          is_public?: boolean
          is_verified?: boolean | null
          language?: string | null
          links?: Json | null
          updated_at?: string
          username?: string | null
          verified_domain?: string | null
          verified_email?: string | null
          view_count?: number
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          domain_pending_verification?: string | null
          domain_verification_token?: string | null
          domain_verified?: boolean | null
          domain_verified_at?: string | null
          email?: string | null
          email_verified?: boolean | null
          email_verified_at?: string | null
          follower_count?: number
          following_count?: number
          id?: string
          is_onboarding_complete?: boolean
          is_public?: boolean
          is_verified?: boolean | null
          language?: string | null
          links?: Json | null
          updated_at?: string
          username?: string | null
          verified_domain?: string | null
          verified_email?: string | null
          view_count?: number
          website_url?: string | null
        }
        Relationships: []
      }
      project_contributors: {
        Row: {
          avatar_url: string | null
          contribution: string | null
          created_at: string
          created_by: string | null
          display_name: string
          email: string | null
          github_username: string | null
          id: string
          project_id: string
          role: string
          source: string
          vbase_user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          contribution?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          email?: string | null
          github_username?: string | null
          id?: string
          project_id: string
          role?: string
          source?: string
          vbase_user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          contribution?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string | null
          github_username?: string | null
          id?: string
          project_id?: string
          role?: string
          source?: string
          vbase_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_contributors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributors_vbase_user_id_fkey"
            columns: ["vbase_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          comment_count: number
          completeness_score: number | null
          created_at: string
          description: string | null
          description_generated: string | null
          file_tree: Json | null
          github_url: string | null
          id: string
          intake_data: Json | null
          language: string | null
          last_pushed_at: string | null
          like_count: number
          name: string
          processing_error: string | null
          processing_status: string | null
          readme_content: string | null
          repo_name: string | null
          screenshot_url: string | null
          share_count: number
          stars_count: number | null
          summary_variations: Json | null
          tech_stack: Json | null
          updated_at: string
          user_id: string
          vbase_badge: boolean | null
          vbase_data: Json | null
          vbase_md: string | null
          vbase_verification_details: Json | null
          vbase_verification_status: string | null
          vbase_verified_at: string | null
          website_url: string
        }
        Insert: {
          comment_count?: number
          completeness_score?: number | null
          created_at?: string
          description?: string | null
          description_generated?: string | null
          file_tree?: Json | null
          github_url?: string | null
          id?: string
          intake_data?: Json | null
          language?: string | null
          last_pushed_at?: string | null
          like_count?: number
          name: string
          processing_error?: string | null
          processing_status?: string | null
          readme_content?: string | null
          repo_name?: string | null
          screenshot_url?: string | null
          share_count?: number
          stars_count?: number | null
          summary_variations?: Json | null
          tech_stack?: Json | null
          updated_at?: string
          user_id: string
          vbase_badge?: boolean | null
          vbase_data?: Json | null
          vbase_md?: string | null
          vbase_verification_details?: Json | null
          vbase_verification_status?: string | null
          vbase_verified_at?: string | null
          website_url: string
        }
        Update: {
          comment_count?: number
          completeness_score?: number | null
          created_at?: string
          description?: string | null
          description_generated?: string | null
          file_tree?: Json | null
          github_url?: string | null
          id?: string
          intake_data?: Json | null
          language?: string | null
          last_pushed_at?: string | null
          like_count?: number
          name?: string
          processing_error?: string | null
          processing_status?: string | null
          readme_content?: string | null
          repo_name?: string | null
          screenshot_url?: string | null
          share_count?: number
          stars_count?: number | null
          summary_variations?: Json | null
          tech_stack?: Json | null
          updated_at?: string
          user_id?: string
          vbase_badge?: boolean | null
          vbase_data?: Json | null
          vbase_md?: string | null
          vbase_verification_details?: Json | null
          vbase_verification_status?: string | null
          vbase_verified_at?: string | null
          website_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_functions_function_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_functions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_user_blocked: {
        Args: { blocked_id: string; blocker_id: string }
        Returns: boolean
      }
      get_comment_replies: {
        Args: { p_comment_id: string }
        Returns: {
          author_avatar_url: string
          author_username: string
          content: string
          created_at: string
          id: string
          like_count: number
          parent_id: string
          project_id: string
          updated_at: string
          user_id: string
        }[]
      }
      get_conversation_participants: {
        Args: { conversation_id: string }
        Returns: {
          avatar_url: string
          joined_at: string
          user_id: string
          username: string
        }[]
      }
      get_project_comments: {
        Args: { p_limit?: number; p_offset?: number; p_project_id: string }
        Returns: {
          author_avatar_url: string
          author_username: string
          content: string
          created_at: string
          id: string
          like_count: number
          parent_id: string
          project_id: string
          updated_at: string
          user_id: string
        }[]
      }
      get_safe_profile: {
        Args: { profile_row: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          domain_pending_verification: string | null
          domain_verification_token: string | null
          domain_verified: boolean | null
          domain_verified_at: string | null
          email: string | null
          email_verified: boolean | null
          email_verified_at: string | null
          follower_count: number
          following_count: number
          id: string
          is_onboarding_complete: boolean
          is_public: boolean
          is_verified: boolean | null
          language: string | null
          links: Json | null
          updated_at: string
          username: string | null
          verified_domain: string | null
          verified_email: string | null
          view_count: number
          website_url: string | null
        }
        SetofOptions: {
          from: "profiles"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      increment_downloads: { Args: { fn_id: string }; Returns: undefined }
      increment_function_downloads: {
        Args: { function_id_param: string }
        Returns: undefined
      }
      increment_item_downloads: {
        Args: { item_id_param: string }
        Returns: undefined
      }
      increment_profile_view: {
        Args: { anon_token_param?: string; profile_id_param: string }
        Returns: number
      }
      increment_project_like: {
        Args: { anon_token_param?: string; project_id_param: string }
        Returns: number
      }
      increment_project_share: {
        Args: { anon_token_param?: string; project_id_param: string }
        Returns: number
      }
      is_conversation_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      recalculate_follow_counts: {
        Args: never
        Returns: {
          new_follower_count: number
          new_following_count: number
          old_follower_count: number
          old_following_count: number
          profile_id: string
          username: string
        }[]
      }
      seed_item: {
        Args: {
          p_author_username?: string
          p_category: string
          p_description: string
          p_downloads?: number
          p_is_verified?: boolean
          p_project_id?: string
          p_title: string
          p_type?: Database["public"]["Enums"]["item_type"]
        }
        Returns: string
      }
      seed_item_implementation: {
        Args: {
          p_code: string
          p_documentation: string
          p_item_id: string
          p_platform: string
        }
        Returns: string
      }
    }
    Enums: {
      app_category:
        | "Auth"
        | "Payments"
        | "AI"
        | "Database"
        | "Storage"
        | "Utility"
        | "Rules"
        | "Prompts"
      app_platform:
        | "Supabase"
        | "Firebase"
        | "Cloudflare"
        | "Vercel"
        | "Universal"
        | "Other"
      item_type: "edge_function" | "system_prompt" | "schema" | "rule" | "post"
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
    Enums: {
      app_category: [
        "Auth",
        "Payments",
        "AI",
        "Database",
        "Storage",
        "Utility",
        "Rules",
        "Prompts",
      ],
      app_platform: [
        "Supabase",
        "Firebase",
        "Cloudflare",
        "Vercel",
        "Universal",
        "Other",
      ],
      item_type: ["edge_function", "system_prompt", "schema", "rule", "post"],
    },
  },
} as const
