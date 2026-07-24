export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_roles: {
        Row: {
          created_at: string
          is_active: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      audience_rules: {
        Row: {
          accepts_days: boolean
          accepts_reference_id: boolean
          category: string
          created_at: string
          description: string
          is_active: boolean
          key: string
          label: string
        }
        Insert: {
          accepts_days?: boolean
          accepts_reference_id?: boolean
          category?: string
          created_at?: string
          description: string
          is_active?: boolean
          key: string
          label: string
        }
        Update: {
          accepts_days?: boolean
          accepts_reference_id?: boolean
          category?: string
          created_at?: string
          description?: string
          is_active?: boolean
          key?: string
          label?: string
        }
        Relationships: []
      }
      audiences: {
        Row: {
          branch_id: string | null
          channel: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          match_mode: string
          name: string
          purpose: string
          rules: Json
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_mode?: string
          name: string
          purpose?: string
          rules?: Json
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          match_mode?: string
          name?: string
          purpose?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiences_purpose_fkey"
            columns: ["purpose"]
            isOneToOne: false
            referencedRelation: "consent_purposes"
            referencedColumns: ["key"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          metadata: Json
          summary: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          metadata?: Json
          summary?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          metadata?: Json
          summary?: string | null
        }
        Relationships: []
      }
      automation_run_items: {
        Row: {
          created_at: string
          detail: Json
          id: string
          outcome: string
          person_id: string | null
          reason: string
          run_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          outcome: string
          person_id?: string | null
          reason: string
          run_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          outcome?: string
          person_id?: string | null
          reason?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_run_items_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          actions_taken: number
          automation_id: string
          candidates_found: number
          failures: number
          finished_at: string | null
          id: string
          skipped: number
          started_at: string
          status: string
          summary: string | null
          triggered_by: string
        }
        Insert: {
          actions_taken?: number
          automation_id: string
          candidates_found?: number
          failures?: number
          finished_at?: string | null
          id?: string
          skipped?: number
          started_at?: string
          status?: string
          summary?: string | null
          triggered_by?: string
        }
        Update: {
          actions_taken?: number
          automation_id?: string
          candidates_found?: number
          failures?: number
          finished_at?: string | null
          id?: string
          skipped?: number
          started_at?: string
          status?: string
          summary?: string | null
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "hospitality_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          opened_on: string | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          opened_on?: string | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          opened_on?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_metrics: {
        Row: {
          description: string
          display_order: number
          drill_down_path: string
          healthy_above: number | null
          higher_is_better: boolean
          is_active: boolean
          key: string
          label: string
          unit: string
        }
        Insert: {
          description: string
          display_order?: number
          drill_down_path: string
          healthy_above?: number | null
          higher_is_better?: boolean
          is_active?: boolean
          key: string
          label: string
          unit?: string
        }
        Update: {
          description?: string
          display_order?: number
          drill_down_path?: string
          healthy_above?: number | null
          higher_is_better?: boolean
          is_active?: boolean
          key?: string
          label?: string
          unit?: string
        }
        Relationships: []
      }
      communication_campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audience_id: string | null
          audience_snapshot: Json
          branch_id: string | null
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hoped_outcome: string | null
          id: string
          name: string
          purpose: string
          rationale_why_message: string | null
          rationale_why_now: string | null
          rationale_why_them: string | null
          scheduled_at: string | null
          segment_id: string | null
          started_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audience_id?: string | null
          audience_snapshot?: Json
          branch_id?: string | null
          channel: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hoped_outcome?: string | null
          id?: string
          name: string
          purpose?: string
          rationale_why_message?: string | null
          rationale_why_now?: string | null
          rationale_why_them?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audience_id?: string | null
          audience_snapshot?: Json
          branch_id?: string | null
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hoped_outcome?: string | null
          id?: string
          name?: string
          purpose?: string
          rationale_why_message?: string | null
          rationale_why_now?: string | null
          rationale_why_them?: string | null
          scheduled_at?: string | null
          segment_id?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_campaigns_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_campaigns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "saved_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_channel_preferences: {
        Row: {
          channel: string
          consent_source: string | null
          consent_text: string | null
          consented_at: string | null
          metadata: Json
          opted_out_at: string | null
          person_id: string
          preferred: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel: string
          consent_source?: string | null
          consent_text?: string | null
          consented_at?: string | null
          metadata?: Json
          opted_out_at?: string | null
          person_id: string
          preferred?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          consent_source?: string | null
          consent_text?: string | null
          consented_at?: string | null
          metadata?: Json
          opted_out_at?: string | null
          person_id?: string
          preferred?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_channel_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_delivery_events: {
        Row: {
          event_at: string
          event_type: string
          id: number
          message_id: string | null
          payload: Json
          provider: string | null
          provider_event_id: string | null
        }
        Insert: {
          event_at?: string
          event_type: string
          id?: number
          message_id?: string | null
          payload?: Json
          provider?: string | null
          provider_event_id?: string | null
        }
        Update: {
          event_at?: string
          event_type?: string
          id?: number
          message_id?: string | null
          payload?: Json
          provider?: string | null
          provider_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_delivery_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "communication_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_frequency_limits: {
        Row: {
          channel: string
          id: string
          is_active: boolean
          max_messages: number
          message_type: string
          period_hours: number
        }
        Insert: {
          channel: string
          id?: string
          is_active?: boolean
          max_messages: number
          message_type?: string
          period_hours: number
        }
        Update: {
          channel?: string
          id?: string
          is_active?: boolean
          max_messages?: number
          message_type?: string
          period_hours?: number
        }
        Relationships: []
      }
      communication_messages: {
        Row: {
          body_text: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          direction: string
          id: string
          metadata: Json
          person_id: string | null
          provider: string | null
          provider_message_id: string | null
          recipient_id: string | null
          status: string
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body_text?: string | null
          campaign_id?: string | null
          channel: string
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          person_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body_text?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          person_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_outcomes"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "communication_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "communication_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "communication_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_provider_configs: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_active: boolean
          provider: string
          public_config: Json
          secret_reference: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          is_active?: boolean
          provider: string
          public_config?: Json
          secret_reference?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          public_config?: Json
          secret_reference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      communication_recipients: {
        Row: {
          campaign_id: string | null
          channel: string
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          destination: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          person_id: string | null
          personalization: Json
          queued_at: string | null
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          channel: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          destination?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          person_id?: string | null
          personalization?: Json
          queued_at?: string | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          destination?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          person_id?: string | null
          personalization?: Json
          queued_at?: string | null
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_outcomes"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "communication_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "communication_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_recipients_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_suppressions: {
        Row: {
          channel: string
          destination: string | null
          expires_at: string | null
          id: string
          person_id: string | null
          reason: string
          source: string | null
          suppressed_at: string
        }
        Insert: {
          channel: string
          destination?: string | null
          expires_at?: string | null
          id?: string
          person_id?: string | null
          reason: string
          source?: string | null
          suppressed_at?: string
        }
        Update: {
          channel?: string
          destination?: string | null
          expires_at?: string | null
          id?: string
          person_id?: string | null
          reason?: string
          source?: string | null
          suppressed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_suppressions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          body_html: string | null
          body_text: string
          category: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          language_code: string
          name: string
          provider_template_id: string | null
          provider_template_status: string | null
          subject: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body_html?: string | null
          body_text: string
          category?: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          name: string
          provider_template_id?: string | null
          provider_template_status?: string | null
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_html?: string | null
          body_text?: string
          category?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          name?: string
          provider_template_id?: string | null
          provider_template_status?: string | null
          subject?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      communities: {
        Row: {
          branch_id: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          meeting_frequency: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          meeting_frequency?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          meeting_frequency?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      community_memberships: {
        Row: {
          community_id: string
          joined_at: string | null
          left_at: string | null
          metadata: Json
          person_id: string
          role: string
        }
        Insert: {
          community_id: string
          joined_at?: string | null
          left_at?: string | null
          metadata?: Json
          person_id: string
          role?: string
        }
        Update: {
          community_id?: string
          joined_at?: string | null
          left_at?: string | null
          metadata?: Json
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_memberships_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_health"
            referencedColumns: ["community_id"]
          },
          {
            foreignKeyName: "community_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_purposes: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
          requires_explicit_opt_in: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
          requires_explicit_opt_in?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          requires_explicit_opt_in?: boolean
        }
        Relationships: []
      }
      consents: {
        Row: {
          captured_at: string
          channel: string | null
          evidence: Json
          granted: boolean
          id: string
          person_id: string
          purpose: string
          source: string
        }
        Insert: {
          captured_at?: string
          channel?: string | null
          evidence?: Json
          granted: boolean
          id?: string
          person_id: string
          purpose: string
          source: string
        }
        Update: {
          captured_at?: string
          channel?: string | null
          evidence?: Json
          granted?: boolean
          id?: string
          person_id?: string
          purpose?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          message: string | null
          person_id: string | null
          rating: number | null
          resolution_notes: string | null
          resolution_status: string
          resolved_at: string | null
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          feedback_type?: string
          id?: string
          message?: string | null
          person_id?: string | null
          rating?: number | null
          resolution_notes?: string | null
          resolution_status?: string
          resolved_at?: string | null
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          message?: string | null
          person_id?: string | null
          rating?: number | null
          resolution_notes?: string | null
          resolution_status?: string
          resolved_at?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "arrivals_today"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "customer_feedback_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_health: {
        Row: {
          average_ticket: number
          calculated_at: string
          churn_risk: number
          community_score: number
          engagement_score: number
          first_visit_at: string | null
          frequency_score: number
          health_score: number
          last_visit_at: string | null
          lifetime_value: number
          loyalty_score: number
          metadata: Json
          monetary_score: number
          person_id: string
          preferred_visit_day: string | null
          preferred_visit_time: string | null
          recency_score: number
          referral_count: number
          referral_score: number
          referred_revenue: number
          relationship_score: number
          total_visits: number
        }
        Insert: {
          average_ticket?: number
          calculated_at?: string
          churn_risk?: number
          community_score?: number
          engagement_score?: number
          first_visit_at?: string | null
          frequency_score?: number
          health_score?: number
          last_visit_at?: string | null
          lifetime_value?: number
          loyalty_score?: number
          metadata?: Json
          monetary_score?: number
          person_id: string
          preferred_visit_day?: string | null
          preferred_visit_time?: string | null
          recency_score?: number
          referral_count?: number
          referral_score?: number
          referred_revenue?: number
          relationship_score?: number
          total_visits?: number
        }
        Update: {
          average_ticket?: number
          calculated_at?: string
          churn_risk?: number
          community_score?: number
          engagement_score?: number
          first_visit_at?: string | null
          frequency_score?: number
          health_score?: number
          last_visit_at?: string | null
          lifetime_value?: number
          loyalty_score?: number
          metadata?: Json
          monetary_score?: number
          person_id?: string
          preferred_visit_day?: string | null
          preferred_visit_time?: string | null
          recency_score?: number
          referral_count?: number
          referral_score?: number
          referred_revenue?: number
          relationship_score?: number
          total_visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_health_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_health_history: {
        Row: {
          calculated_at: string
          churn_risk: number | null
          engagement_score: number | null
          health_score: number
          id: string
          lifetime_value: number | null
          person_id: string
        }
        Insert: {
          calculated_at?: string
          churn_risk?: number | null
          engagement_score?: number | null
          health_score: number
          id?: string
          lifetime_value?: number | null
          person_id: string
        }
        Update: {
          calculated_at?: string
          churn_risk?: number | null
          engagement_score?: number | null
          health_score?: number
          id?: string
          lifetime_value?: number | null
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_health_history_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_hospitality_profiles: {
        Row: {
          accessibility_needs: string | null
          allergies: string[]
          children_notes: string | null
          coffee_preferences: Json
          conversation_preferences: string | null
          dietary_restrictions: string[]
          do_not_mention: string | null
          food_preferences: Json
          languages: string[]
          person_id: string
          preferred_table: string | null
          preferred_visit_time: string | null
          preferred_zone: string | null
          staff_summary: string | null
          typical_visit_context: string | null
          updated_at: string
          work_style: string | null
        }
        Insert: {
          accessibility_needs?: string | null
          allergies?: string[]
          children_notes?: string | null
          coffee_preferences?: Json
          conversation_preferences?: string | null
          dietary_restrictions?: string[]
          do_not_mention?: string | null
          food_preferences?: Json
          languages?: string[]
          person_id: string
          preferred_table?: string | null
          preferred_visit_time?: string | null
          preferred_zone?: string | null
          staff_summary?: string | null
          typical_visit_context?: string | null
          updated_at?: string
          work_style?: string | null
        }
        Update: {
          accessibility_needs?: string | null
          allergies?: string[]
          children_notes?: string | null
          coffee_preferences?: Json
          conversation_preferences?: string | null
          dietary_restrictions?: string[]
          do_not_mention?: string | null
          food_preferences?: Json
          languages?: string[]
          person_id?: string
          preferred_table?: string | null
          preferred_visit_time?: string | null
          preferred_zone?: string | null
          staff_summary?: string | null
          typical_visit_context?: string | null
          updated_at?: string
          work_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_hospitality_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_milestones: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          milestone_type: string
          occurred_at: string
          person_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          milestone_type: string
          occurred_at?: string
          person_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          milestone_type?: string
          occurred_at?: string
          person_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_milestones_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          person_id: string
          visibility: Database["public"]["Enums"]["note_visibility"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          person_id: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          person_id?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_preferences: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          is_sensitive: boolean
          person_id: string
          preference_type: string
          preference_value: string
          source: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_sensitive?: boolean
          person_id: string
          preference_type: string
          preference_value: string
          source?: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          is_sensitive?: boolean
          person_id?: string
          preference_type?: string
          preference_value?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_subscriptions: {
        Row: {
          benefits: Json
          created_at: string
          ends_at: string | null
          id: string
          notes: string | null
          person_id: string
          price: number | null
          renewal_frequency: string | null
          started_at: string
          status: string
          subscription_type: string
        }
        Insert: {
          benefits?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          person_id: string
          price?: number | null
          renewal_frequency?: string | null
          started_at?: string
          status?: string
          subscription_type: string
        }
        Update: {
          benefits?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          person_id?: string
          price?: number | null
          renewal_frequency?: string | null
          started_at?: string
          status?: string
          subscription_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_subscriptions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          person_id: string | null
          priority: string
          status: string
          task_type: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          person_id?: string | null
          priority?: string
          status?: string
          task_type?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          person_id?: string | null
          priority?: string
          status?: string
          task_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tasks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_timeline: {
        Row: {
          colour: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          importance: number
          metadata: Json
          occurred_at: string
          person_id: string
          reference_id: string | null
          reference_table: string | null
          source: Database["public"]["Enums"]["timeline_source"]
          title: string
        }
        Insert: {
          colour?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          importance?: number
          metadata?: Json
          occurred_at?: string
          person_id: string
          reference_id?: string | null
          reference_table?: string | null
          source: Database["public"]["Enums"]["timeline_source"]
          title: string
        }
        Update: {
          colour?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          importance?: number
          metadata?: Json
          occurred_at?: string
          person_id?: string
          reference_id?: string | null
          reference_table?: string | null
          source?: Database["public"]["Enums"]["timeline_source"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_timeline_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          attended_at: string | null
          event_id: string
          guest_count: number
          invited_at: string | null
          metadata: Json
          notes: string | null
          person_id: string
          registered_at: string
          status: Database["public"]["Enums"]["event_registration_status"]
        }
        Insert: {
          attended_at?: string | null
          event_id: string
          guest_count?: number
          invited_at?: string | null
          metadata?: Json
          notes?: string | null
          person_id: string
          registered_at?: string
          status?: Database["public"]["Enums"]["event_registration_status"]
        }
        Update: {
          attended_at?: string | null
          event_id?: string
          guest_count?: number
          invited_at?: string | null
          metadata?: Json
          notes?: string | null
          person_id?: string
          registered_at?: string
          status?: Database["public"]["Enums"]["event_registration_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          branch_id: string | null
          capacity: number | null
          community_id: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: string
          host_notes: string | null
          id: string
          location: string | null
          metadata: Json
          name: string
          price: number
          registration_deadline: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          capacity?: number | null
          community_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          host_notes?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          name: string
          price?: number
          registration_deadline?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          capacity?: number | null
          community_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          host_notes?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          name?: string
          price?: number
          registration_deadline?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_health"
            referencedColumns: ["community_id"]
          },
        ]
      }
      external_identities: {
        Row: {
          created_at: string
          external_id: string
          id: string
          metadata: Json
          outlet_external_id: string | null
          person_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          metadata?: Json
          outlet_external_id?: string | null
          person_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          metadata?: Json
          outlet_external_id?: string | null
          person_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_identities_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          code: string
          expires_at: string | null
          id: string
          issued_at: string
          notes: string | null
          original_value: number
          owner_person_id: string | null
          purchaser_person_id: string | null
          remaining_value: number
          status: string
        }
        Insert: {
          code: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          original_value: number
          owner_person_id?: string | null
          purchaser_person_id?: string | null
          remaining_value: number
          status?: string
        }
        Update: {
          code?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          original_value?: number
          owner_person_id?: string | null
          purchaser_person_id?: string | null
          remaining_value?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_purchaser_person_id_fkey"
            columns: ["purchaser_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_automations: {
        Row: {
          branch_id: string | null
          channel: string
          created_at: string
          delay_days: number
          explanation: string
          id: string
          is_active: boolean
          key: string
          last_run_at: string | null
          name: string
          purpose: string
          run_interval_hours: number
          template_id: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          channel?: string
          created_at?: string
          delay_days?: number
          explanation: string
          id?: string
          is_active?: boolean
          key: string
          last_run_at?: string | null
          name: string
          purpose?: string
          run_interval_hours?: number
          template_id?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          channel?: string
          created_at?: string
          delay_days?: number
          explanation?: string
          id?: string
          is_active?: boolean
          key?: string
          last_run_at?: string | null
          name?: string
          purpose?: string
          run_interval_hours?: number
          template_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_automations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_automations_purpose_fkey"
            columns: ["purpose"]
            isOneToOne: false
            referencedRelation: "consent_purposes"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "hospitality_automations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitality_signals: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          key: string
          label: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          key: string
          label: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          key?: string
          label?: string
          weight?: number
        }
        Relationships: []
      }
      hospitality_tasks: {
        Row: {
          assigned_to: string | null
          branch_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          detail: string | null
          due_on: string
          id: string
          person_id: string | null
          priority: number
          source: string
          status: string
          task_type: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string
          id?: string
          person_id?: string | null
          priority?: number
          source?: string
          status?: string
          task_type: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string
          id?: string
          person_id?: string | null
          priority?: number
          source?: string
          status?: string
          task_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospitality_tasks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospitality_tasks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      household_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          country: string | null
          created_at: string
          household_id: string
          id: string
          is_primary: boolean
          label: string
          latitude: number | null
          longitude: number | null
          metadata: Json
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          household_id: string
          id?: string
          is_primary?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          household_id?: string
          id?: string
          is_primary?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_addresses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          household_role: string
          is_primary: boolean
          is_primary_contact: boolean
          joined_at: string | null
          left_at: string | null
          notes: string | null
          person_id: string
          relationship: string | null
        }
        Insert: {
          household_id: string
          household_role?: string
          is_primary?: boolean
          is_primary_contact?: boolean
          joined_at?: string | null
          left_at?: string | null
          notes?: string | null
          person_id: string
          relationship?: string | null
        }
        Update: {
          household_id?: string
          household_role?: string
          is_primary?: boolean
          is_primary_contact?: boolean
          joined_at?: string | null
          left_at?: string | null
          notes?: string | null
          person_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      household_preferences: {
        Row: {
          allergies: string | null
          celebration_notes: string | null
          dietary_notes: string | null
          favourite_area: string | null
          favourite_table: string | null
          household_id: string
          lighting_preferences: string | null
          metadata: Json
          music_preferences: string | null
          preferred_temperature: string | null
          preferred_visit_time: string | null
          seating_notes: string | null
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          celebration_notes?: string | null
          dietary_notes?: string | null
          favourite_area?: string | null
          favourite_table?: string | null
          household_id: string
          lighting_preferences?: string | null
          metadata?: Json
          music_preferences?: string | null
          preferred_temperature?: string | null
          preferred_visit_time?: string | null
          seating_notes?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          celebration_notes?: string | null
          dietary_notes?: string | null
          favourite_area?: string | null
          favourite_table?: string | null
          household_id?: string
          lighting_preferences?: string | null
          metadata?: Json
          music_preferences?: string | null
          preferred_temperature?: string | null
          preferred_visit_time?: string | null
          seating_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          address: string | null
          address_line: string | null
          city: string | null
          country: string | null
          created_at: string
          household_name: string
          household_type: string | null
          id: string
          is_active: boolean
          locality: string | null
          metadata: Json
          notes: string | null
          postal_code: string | null
          primary_contact_id: string | null
          primary_person_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_line?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          household_name: string
          household_type?: string | null
          id?: string
          is_active?: boolean
          locality?: string | null
          metadata?: Json
          notes?: string | null
          postal_code?: string | null
          primary_contact_id?: string | null
          primary_person_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_line?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          household_name?: string
          household_type?: string | null
          id?: string
          is_active?: boolean
          locality?: string | null
          metadata?: Json
          notes?: string | null
          postal_code?: string | null
          primary_contact_id?: string | null
          primary_person_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "households_primary_person_id_fkey"
            columns: ["primary_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      import_run_items: {
        Row: {
          created_at: string
          external_id: string
          id: string
          outcome: string
          payload: Json
          person_id: string | null
          reason: string
          run_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          outcome: string
          payload?: Json
          person_id?: string | null
          reason: string
          run_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          outcome?: string
          payload?: Json
          person_id?: string | null
          reason?: string
          run_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_run_items_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_run_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "arrivals_today"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "import_run_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          adapter_key: string
          branch_id: string | null
          finished_at: string | null
          guests_matched: number
          guests_unmatched: number
          id: string
          orders_failed: number
          orders_imported: number
          orders_seen: number
          orders_skipped: number
          started_at: string
          status: string
          summary: string | null
          triggered_by: string | null
        }
        Insert: {
          adapter_key: string
          branch_id?: string | null
          finished_at?: string | null
          guests_matched?: number
          guests_unmatched?: number
          id?: string
          orders_failed?: number
          orders_imported?: number
          orders_seen?: number
          orders_skipped?: number
          started_at?: string
          status?: string
          summary?: string | null
          triggered_by?: string | null
        }
        Update: {
          adapter_key?: string
          branch_id?: string | null
          finished_at?: string | null
          guests_matched?: number
          guests_unmatched?: number
          id?: string
          orders_failed?: number
          orders_imported?: number
          orders_seen?: number
          orders_skipped?: number
          started_at?: string
          status?: string
          summary?: string | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      important_dates: {
        Row: {
          created_at: string
          date_type: string
          date_value: string
          id: string
          label: string | null
          notes: string | null
          person_id: string
          recurring_annually: boolean
        }
        Insert: {
          created_at?: string
          date_type: string
          date_value: string
          id?: string
          label?: string | null
          notes?: string | null
          person_id: string
          recurring_annually?: boolean
        }
        Update: {
          created_at?: string
          date_type?: string
          date_value?: string
          id?: string
          label?: string | null
          notes?: string | null
          person_id?: string
          recurring_annually?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "important_dates_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_adapters: {
        Row: {
          branch_id: string | null
          capabilities: string[]
          created_at: string
          description: string | null
          health_status: string
          is_enabled: boolean
          key: string
          label: string
          last_checked_at: string | null
          last_error: string | null
          required_env: string[]
          updated_at: string
          vendor: string
        }
        Insert: {
          branch_id?: string | null
          capabilities?: string[]
          created_at?: string
          description?: string | null
          health_status?: string
          is_enabled?: boolean
          key: string
          label: string
          last_checked_at?: string | null
          last_error?: string | null
          required_env?: string[]
          updated_at?: string
          vendor: string
        }
        Update: {
          branch_id?: string | null
          capabilities?: string[]
          created_at?: string
          description?: string | null
          health_status?: string
          is_enabled?: boolean
          key?: string
          label?: string
          last_checked_at?: string | null
          last_error?: string | null
          required_env?: string[]
          updated_at?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_adapters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_capabilities: {
        Row: {
          description: string
          key: string
          label: string
        }
        Insert: {
          description: string
          key: string
          label: string
        }
        Update: {
          description?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      integration_errors: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string
          external_record_id: string | null
          id: string
          payload: Json | null
          provider: string
          sync_run_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message: string
          external_record_id?: string | null
          id?: string
          payload?: Json | null
          provider: string
          sync_run_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string
          external_record_id?: string | null
          id?: string
          payload?: Json | null
          provider?: string
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_errors_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_runs: {
        Row: {
          cursor_value: string | null
          error_summary: string | null
          finished_at: string | null
          id: string
          metadata: Json
          provider: string
          records_created: number
          records_failed: number
          records_received: number
          records_updated: number
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          sync_type: string
        }
        Insert: {
          cursor_value?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          provider: string
          records_created?: number
          records_failed?: number
          records_received?: number
          records_updated?: number
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          sync_type: string
        }
        Update: {
          cursor_value?: string | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          records_created?: number
          records_failed?: number
          records_received?: number
          records_updated?: number
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          sync_type?: string
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          external_id: string | null
          external_provider: string | null
          joined_at: string
          last_activity_at: string | null
          lifetime_points: number
          person_id: string
          points_balance: number
          tier: string
          updated_at: string
          wallet_balance: number
        }
        Insert: {
          external_id?: string | null
          external_provider?: string | null
          joined_at?: string
          last_activity_at?: string | null
          lifetime_points?: number
          person_id: string
          points_balance?: number
          tier?: string
          updated_at?: string
          wallet_balance?: number
        }
        Update: {
          external_id?: string | null
          external_provider?: string | null
          joined_at?: string
          last_activity_at?: string | null
          lifetime_points?: number
          person_id?: string
          points_balance?: number
          tier?: string
          updated_at?: string
          wallet_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          person_id: string
          points: number
          source_id: string | null
          source_type: string | null
          transaction_type: string
          wallet_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          person_id: string
          points?: number
          source_id?: string | null
          source_type?: string | null
          transaction_type: string
          wallet_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          person_id?: string
          points?: number
          source_id?: string | null
          source_type?: string | null
          transaction_type?: string
          wallet_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          is_required: boolean
          item_text: string
          role_scope: string
          sort_order: number
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          item_text: string
          role_scope?: string
          sort_order?: number
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          is_required?: boolean
          item_text?: string
          role_scope?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "operational_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_checklists: {
        Row: {
          checklist_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          checklist_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      operational_run_items: {
        Row: {
          checklist_item_id: string
          completed_at: string | null
          completed_by: string | null
          is_complete: boolean
          notes: string | null
          run_id: string
        }
        Insert: {
          checklist_item_id: string
          completed_at?: string | null
          completed_by?: string | null
          is_complete?: boolean
          notes?: string | null
          run_id: string
        }
        Update: {
          checklist_item_id?: string
          completed_at?: string | null
          completed_by?: string | null
          is_complete?: boolean
          notes?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_run_items_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "operational_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "operational_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_runs: {
        Row: {
          business_date: string
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          id: string
          notes: string | null
          shift_name: string | null
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          business_date?: string
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          notes?: string | null
          shift_name?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          business_date?: string
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          notes?: string | null
          shift_name?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_runs_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "operational_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          category: string | null
          external_item_id: string | null
          id: string
          item_name: string
          metadata: Json
          modifiers: Json
          quantity: number
          unit_price: number | null
          visit_id: string
        }
        Insert: {
          category?: string | null
          external_item_id?: string | null
          id?: string
          item_name: string
          metadata?: Json
          modifiers?: Json
          quantity?: number
          unit_price?: number | null
          visit_id: string
        }
        Update: {
          category?: string | null
          external_item_id?: string | null
          id?: string
          item_name?: string
          metadata?: Json
          modifiers?: Json
          quantity?: number
          unit_price?: number | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "arrivals_today"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "order_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          anniversary_date: string | null
          company: string | null
          created_at: string
          customer_status: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          home_branch_id: string | null
          id: string
          is_active: boolean
          last_name: string | null
          occupation: string | null
          person_type: Database["public"]["Enums"]["person_type"]
          phone: string | null
          preferred_name: string | null
          private_notes: string | null
          staff_notes: string | null
          updated_at: string
        }
        Insert: {
          anniversary_date?: string | null
          company?: string | null
          created_at?: string
          customer_status?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          home_branch_id?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          occupation?: string | null
          person_type?: Database["public"]["Enums"]["person_type"]
          phone?: string | null
          preferred_name?: string | null
          private_notes?: string | null
          staff_notes?: string | null
          updated_at?: string
        }
        Update: {
          anniversary_date?: string | null
          company?: string | null
          created_at?: string
          customer_status?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          home_branch_id?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          occupation?: string | null
          person_type?: Database["public"]["Enums"]["person_type"]
          phone?: string | null
          preferred_name?: string | null
          private_notes?: string | null
          staff_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_home_branch_id_fkey"
            columns: ["home_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      person_relationships: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          person_id: string
          related_person_id: string
          relationship_type: string
          relationship_type_id: string | null
          strength: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          person_id: string
          related_person_id: string
          relationship_type: string
          relationship_type_id?: string | null
          strength?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          person_id?: string
          related_person_id?: string
          relationship_type?: string
          relationship_type_id?: string | null
          strength?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_relationships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_relationships_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["id"]
          },
        ]
      }
      person_tags: {
        Row: {
          created_at: string
          person_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          person_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          person_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_tags_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_species: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pet_visit_history: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          pet_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          pet_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          pet_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_visit_history_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_visit_history_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "arrivals_today"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "pet_visit_history_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          adoption_date: string | null
          birth_date: string | null
          birthday: string | null
          breed: string | null
          colour: string | null
          created_at: string
          emergency_contact: string | null
          favourite_seat: string | null
          favourite_treat: string | null
          gender: string | null
          household_id: string | null
          id: string
          is_active: boolean
          medical_notes: string | null
          metadata: Json
          name: string
          notes: string | null
          person_id: string
          profile_photo_url: string | null
          species: string | null
          species_id: string | null
          temperament: string | null
          updated_at: string
        }
        Insert: {
          adoption_date?: string | null
          birth_date?: string | null
          birthday?: string | null
          breed?: string | null
          colour?: string | null
          created_at?: string
          emergency_contact?: string | null
          favourite_seat?: string | null
          favourite_treat?: string | null
          gender?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean
          medical_notes?: string | null
          metadata?: Json
          name: string
          notes?: string | null
          person_id: string
          profile_photo_url?: string | null
          species?: string | null
          species_id?: string | null
          temperament?: string | null
          updated_at?: string
        }
        Update: {
          adoption_date?: string | null
          birth_date?: string | null
          birthday?: string | null
          breed?: string | null
          colour?: string | null
          created_at?: string
          emergency_contact?: string | null
          favourite_seat?: string | null
          favourite_treat?: string | null
          gender?: string | null
          household_id?: string | null
          id?: string
          is_active?: boolean
          medical_notes?: string | null
          metadata?: Json
          name?: string
          notes?: string | null
          person_id?: string
          profile_photo_url?: string | null
          species?: string | null
          species_id?: string | null
          temperament?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "pet_species"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_menu_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          price: number
          sku: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          price?: number
          sku?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          price?: number
          sku?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_order_lines: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_name: string
          line_total: number
          menu_item_id: string | null
          modifiers: Json
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_name: string
          line_total?: number
          menu_item_id?: string | null
          modifiers?: Json
          order_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_name?: string
          line_total?: number
          menu_item_id?: string | null
          modifiers?: Json
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_order_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "pos_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_orders: {
        Row: {
          amount_tendered: number | null
          change_due: number | null
          client_order_id: string
          created_at: string
          created_by: string | null
          customer_name: string | null
          discount_amount: number
          id: string
          notes: string | null
          order_number: number
          outlet_id: string | null
          payment_method: string | null
          person_id: string | null
          placed_at: string
          source: string
          status: Database["public"]["Enums"]["pos_order_status"]
          subtotal: number
          tax_amount: number
          total: number
        }
        Insert: {
          amount_tendered?: number | null
          change_due?: number | null
          client_order_id: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          order_number?: number
          outlet_id?: string | null
          payment_method?: string | null
          person_id?: string | null
          placed_at?: string
          source?: string
          status?: Database["public"]["Enums"]["pos_order_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
        }
        Update: {
          amount_tendered?: number | null
          change_due?: number | null
          client_order_id?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          order_number?: number
          outlet_id?: string | null
          payment_method?: string | null
          person_id?: string | null
          placed_at?: string
          source?: string
          status?: Database["public"]["Enums"]["pos_order_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_orders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount: number
          amount_tendered: number | null
          change_due: number | null
          created_at: string
          id: string
          method: string
          order_id: string
          reference: string | null
        }
        Insert: {
          amount?: number
          amount_tendered?: number | null
          change_due?: number | null
          created_at?: string
          id?: string
          method?: string
          order_id: string
          reference?: string | null
        }
        Update: {
          amount?: number
          amount_tendered?: number | null
          change_due?: number | null
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_types: {
        Row: {
          category: string
          default_priority: number
          description: string
          is_active: boolean
          key: string
          label: string
        }
        Insert: {
          category: string
          default_priority?: number
          description: string
          is_active?: boolean
          key: string
          label: string
        }
        Update: {
          category?: string
          default_priority?: number
          description?: string
          is_active?: boolean
          key?: string
          label?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          id: string
          notes: string | null
          referred_at: string
          referred_person_id: string
          referrer_person_id: string
          source_context: string | null
        }
        Insert: {
          id?: string
          notes?: string | null
          referred_at?: string
          referred_person_id: string
          referrer_person_id: string
          source_context?: string | null
        }
        Update: {
          id?: string
          notes?: string | null
          referred_at?: string
          referred_person_id?: string
          referrer_person_id?: string
          source_context?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_person_id_fkey"
            columns: ["referred_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_person_id_fkey"
            columns: ["referrer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
          id: string
          is_bidirectional: boolean
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          id?: string
          is_bidirectional?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          id?: string
          is_bidirectional?: boolean
        }
        Relationships: []
      }
      saved_segments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filter_definition: Json
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter_definition?: Json
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filter_definition?: Json
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      segment_memberships: {
        Row: {
          added_at: string
          added_by: string | null
          person_id: string
          segment_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          person_id: string
          segment_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          person_id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segment_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segment_memberships_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "saved_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_handovers: {
        Row: {
          created_at: string
          created_by: string | null
          guests_to_watch: string | null
          id: string
          notes: string
          shift_date: string
          shift_label: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guests_to_watch?: string | null
          id?: string
          notes: string
          shift_date?: string
          shift_label?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guests_to_watch?: string | null
          id?: string
          notes?: string
          shift_date?: string
          shift_label?: string
        }
        Relationships: []
      }
      staff_branches: {
        Row: {
          branch_id: string
          created_at: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      system_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          area: string
          context: Json
          created_at: string
          detail: string | null
          dispatched_at: string | null
          id: string
          occurred_at: string
          person_id: string | null
          severity: string
          summary: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          area: string
          context?: Json
          created_at?: string
          detail?: string | null
          dispatched_at?: string | null
          id?: string
          occurred_at?: string
          person_id?: string | null
          severity?: string
          summary: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          area?: string
          context?: Json
          created_at?: string
          detail?: string | null
          dispatched_at?: string | null
          id?: string
          occurred_at?: string
          person_id?: string | null
          severity?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_incidents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      timeline_entries: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          person_id: string
          source_id: string | null
          source_type: string
          summary: string | null
          title: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          person_id: string
          source_id?: string | null
          source_type?: string
          summary?: string | null
          title: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          person_id?: string
          source_id?: string | null
          source_type?: string
          summary?: string | null
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          item_name: string
          metadata: Json
          notes: string | null
          quantity: number
          total_amount: number
          unit_price: number
          visit_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_name: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          total_amount?: number
          unit_price?: number
          visit_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_name?: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          total_amount?: number
          unit_price?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "arrivals_today"
            referencedColumns: ["visit_id"]
          },
          {
            foreignKeyName: "visit_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          customer_mood: string | null
          discount_amount: number
          external_order_id: string | null
          gross_amount: number | null
          id: string
          is_first_visit: boolean
          metadata: Json
          net_amount: number | null
          order_reference: string | null
          outlet_id: string | null
          party_size: number
          payment_method: string | null
          person_id: string
          satisfaction_score: number | null
          seating_area: string | null
          source: string
          staff_notes: string | null
          table_reference: string | null
          tax_amount: number
          updated_at: string
          visit_context: string | null
          visit_type: string
          visited_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_mood?: string | null
          discount_amount?: number
          external_order_id?: string | null
          gross_amount?: number | null
          id?: string
          is_first_visit?: boolean
          metadata?: Json
          net_amount?: number | null
          order_reference?: string | null
          outlet_id?: string | null
          party_size?: number
          payment_method?: string | null
          person_id: string
          satisfaction_score?: number | null
          seating_area?: string | null
          source?: string
          staff_notes?: string | null
          table_reference?: string | null
          tax_amount?: number
          updated_at?: string
          visit_context?: string | null
          visit_type?: string
          visited_at: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_mood?: string | null
          discount_amount?: number
          external_order_id?: string | null
          gross_amount?: number | null
          id?: string
          is_first_visit?: boolean
          metadata?: Json
          net_amount?: number | null
          order_reference?: string | null
          outlet_id?: string | null
          party_size?: number
          payment_method?: string | null
          person_id?: string
          satisfaction_score?: number | null
          seating_area?: string | null
          source?: string
          staff_notes?: string | null
          table_reference?: string | null
          tax_amount?: number
          updated_at?: string
          visit_context?: string | null
          visit_type?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      arrivals_today: {
        Row: {
          greeting_name: string | null
          is_new_guest: boolean | null
          last_name: string | null
          party_size: number | null
          person_id: string | null
          staff_notes: string | null
          total_visits: number | null
          visit_id: string | null
          visited_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_outcomes: {
        Row: {
          campaign_id: string | null
          delivered: number | null
          event_attendance: number | null
          name: string | null
          reached: number | null
          referrals_generated: number | null
          started_at: string | null
          status: string | null
          visits_generated: number | null
        }
        Relationships: []
      }
      community_health: {
        Row: {
          active_members: number | null
          category: string | null
          community_id: string | null
          events_last_quarter: number | null
          former_members: number | null
          joined_last_quarter: number | null
          last_event_at: string | null
          name: string | null
          next_event_at: string | null
        }
        Relationships: []
      }
      customer_item_history: {
        Row: {
          category: string | null
          item_key: string | null
          item_name: string | null
          last_ordered_at: string | null
          person_id: string | null
          total_quantity: number | null
          visit_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance_summary: {
        Row: {
          attended_count: number | null
          capacity: number | null
          capacity_used_percent: number | null
          community_id: string | null
          event_id: string | null
          expected_headcount: number | null
          interested_count: number | null
          name: string | null
          no_show_count: number | null
          registered_count: number | null
          starts_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "community_health"
            referencedColumns: ["community_id"]
          },
        ]
      }
      operational_rhythm: {
        Row: {
          average_spend: number | null
          day_of_week: number | null
          guest_count: number | null
          hour_of_day: number | null
          visit_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adapter_for_capability: {
        Args: { capability: string; target_branch_id?: string }
        Returns: string
      }
      add_customer_timeline_event: {
        Args: {
          p_description?: string
          p_importance?: number
          p_metadata?: Json
          p_person_id: string
          p_reference_id?: string
          p_reference_table?: string
          p_source: Database["public"]["Enums"]["timeline_source"]
          p_title: string
        }
        Returns: string
      }
      advance_campaign_status: {
        Args: {
          actor?: string
          next_status: string
          target_campaign_id: string
        }
        Returns: string
      }
      apply_loyalty_transaction: {
        Args: {
          target_description?: string
          target_person_id: string
          target_points?: number
          target_source_id?: string
          target_source_type?: string
          target_type: string
          target_wallet?: number
        }
        Returns: string
      }
      arrival_context: { Args: { target_person_id: string }; Returns: Json }
      audience_rule_members: {
        Args: {
          days?: number
          reference_id?: string
          reference_text?: string
          rule_key: string
        }
        Returns: {
          person_id: string
        }[]
      }
      automation_candidates: {
        Args: { target_automation_id: string }
        Returns: {
          person_id: string
          reason: string
        }[]
      }
      branch_period_facts: {
        Args: {
          period_days?: number
          reference_time?: string
          target_branch_id?: string
        }
        Returns: {
          average_spend: number
          branch_id: string
          branch_name: string
          guests: number
          revenue: number
          visits: number
        }[]
      }
      business_period_facts: {
        Args: { period_days?: number; reference_time?: string }
        Returns: {
          current_value: number
          metric_key: string
          previous_value: number
        }[]
      }
      claim_first_admin: { Args: never; Returns: string }
      conversion_stories: {
        Args: { max_results?: number }
        Returns: {
          communities_joined: number
          days_to_regular: number
          events_attended: number
          first_name: string
          hospitality_actions: number
          last_name: string
          person_id: string
          preferred_name: string
          total_visits: number
        }[]
      }
      crm_dashboard_signals: { Args: never; Returns: Json }
      crm_global_search: {
        Args: { search_term: string }
        Returns: {
          href: string
          rank_score: number
          result_id: string
          result_type: string
          subtitle: string
          title: string
        }[]
      }
      current_app_role: { Args: never; Returns: string }
      current_branch_id: { Args: never; Returns: string }
      customer_taste_profile: {
        Args: { target_person_id: string }
        Returns: Json
      }
      drifting_regulars: {
        Args: { max_results?: number }
        Returns: {
          average_gap_days: number
          days_since_visit: number
          first_name: string
          last_name: string
          lifetime_value: number
          overdue_ratio: number
          person_id: string
          preferred_name: string
          reason: string
        }[]
      }
      evaluate_audience: {
        Args: {
          audience_rules_json: Json
          match_mode?: string
          target_channel?: string
          target_purpose?: string
        }
        Returns: {
          first_name: string
          last_name: string
          matched_rules: string[]
          person_id: string
          preferred_name: string
        }[]
      }
      event_invitation_candidates: {
        Args: { max_results?: number; target_event_id: string }
        Returns: {
          first_name: string
          last_name: string
          person_id: string
          preferred_name: string
          reasons: string[]
          score: number
        }[]
      }
      executive_kpis: {
        Args: { period_days?: number; reference_time?: string }
        Returns: {
          change_percent: number
          description: string
          drill_down_path: string
          explanation: string
          key: string
          label: string
          needs_attention: boolean
          previous_value: number
          recommended_action: string
          unit: string
          value: number
        }[]
      }
      expected_guests_today: {
        Args: { max_results?: number; reference_time?: string }
        Returns: {
          first_name: string
          last_name: string
          likelihood: number
          person_id: string
          preferred_name: string
          reasons: string[]
        }[]
      }
      explain_audience: {
        Args: {
          audience_rules_json: Json
          match_mode?: string
          target_channel?: string
          target_purpose?: string
        }
        Returns: Json
      }
      forecast_demand: {
        Args: { days_ahead?: number; reference_time?: string }
        Returns: {
          day_of_week: number
          expected_guests: number
          expected_revenue: number
          expected_visits: number
          forecast_date: string
          method: string
          sample_weeks: number
        }[]
      }
      generate_daily_hospitality_tasks: {
        Args: { target_date?: string }
        Returns: number
      }
      has_consent: {
        Args: {
          target_channel: string
          target_person_id: string
          target_purpose?: string
        }
        Returns: boolean
      }
      hospitality_recommendations: {
        Args: { max_results?: number; target_person_id?: string }
        Returns: {
          category: string
          confidence: number
          evidence: Json
          first_name: string
          label: string
          last_name: string
          person_id: string
          preferred_name: string
          priority: number
          recommendation_key: string
          suggested_action: string
          why: string
        }[]
      }
      hospitality_score: {
        Args: { reference_time?: string; target_person_id: string }
        Returns: Json
      }
      hospitality_signal_strengths: {
        Args: { reference_time?: string; target_person_id: string }
        Returns: {
          label: string
          signal_key: string
          strength: number
          weight: number
        }[]
      }
      import_orders: {
        Args: {
          actor?: string
          adapter: string
          orders: Json
          target_branch_id?: string
        }
        Returns: string
      }
      match_guest_detail: {
        Args: { contact_email?: string; contact_phone?: string }
        Returns: {
          candidate_count: number
          candidate_ids: string[]
          person_id: string
        }[]
      }
      match_guest_for_import: {
        Args: { contact_email?: string; contact_phone?: string }
        Returns: string
      }
      next_best_action: { Args: { target_person_id: string }; Returns: Json }
      platform_overview: { Args: never; Returns: Json }
      pos_checkout: { Args: { payload: Json }; Returns: Json }
      quick_add_guest: {
        Args: {
          contact_email?: string
          contact_phone?: string
          guest_count?: number
          guest_name: string
        }
        Returns: Json
      }
      recalculate_customer_health: {
        Args: { target_person_id?: string }
        Returns: number
      }
      record_adapter_health: {
        Args: {
          adapter_key: string
          error_message?: string
          is_healthy: boolean
        }
        Returns: undefined
      }
      record_arrival: {
        Args: {
          arrival_note?: string
          guest_count?: number
          target_person_id: string
        }
        Returns: Json
      }
      record_event_attendance: {
        Args: {
          did_attend: boolean
          target_event_id: string
          target_person_id: string
        }
        Returns: undefined
      }
      record_incident: {
        Args: {
          incident_area: string
          incident_context?: Json
          incident_detail?: string
          incident_severity?: string
          incident_summary: string
          subject_person_id?: string
        }
        Returns: string
      }
      refresh_customer_health: {
        Args: { p_person_id: string }
        Returns: undefined
      }
      run_automation: {
        Args: { target_automation_id: string; triggered_by?: string }
        Returns: string
      }
      run_due_automations: { Args: { triggered_by?: string }; Returns: number }
      system_health_checks: {
        Args: never
        Returns: {
          check_key: string
          detail: string
          drill_down_path: string
          label: string
          recommended_action: string
          status: string
        }[]
      }
      upcoming_important_dates: {
        Args: { days_ahead?: number }
        Returns: {
          customer_name: string
          date_type: string
          days_until: number
          important_date_id: string
          label: string
          next_occurrence: string
          original_date: string
          person_id: string
        }[]
      }
      visible_branch_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      event_registration_status:
        | "interested"
        | "registered"
        | "attended"
        | "cancelled"
        | "no_show"
      note_visibility: "barista" | "manager" | "private"
      person_type: "customer" | "staff" | "partner" | "vendor" | "other"
      pos_order_status: "open" | "completed" | "voided"
      sync_status: "started" | "succeeded" | "partially_succeeded" | "failed"
      timeline_source:
        | "visit"
        | "order"
        | "event"
        | "community"
        | "feedback"
        | "communication"
        | "note"
        | "referral"
        | "loyalty"
        | "manual"
        | "system"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      event_registration_status: [
        "interested",
        "registered",
        "attended",
        "cancelled",
        "no_show",
      ],
      note_visibility: ["barista", "manager", "private"],
      person_type: ["customer", "staff", "partner", "vendor", "other"],
      pos_order_status: ["open", "completed", "voided"],
      sync_status: ["started", "succeeded", "partially_succeeded", "failed"],
      timeline_source: [
        "visit",
        "order",
        "event",
        "community",
        "feedback",
        "communication",
        "note",
        "referral",
        "loyalty",
        "manual",
        "system",
      ],
    },
  },
} as const

