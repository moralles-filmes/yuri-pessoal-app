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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          bank: string | null
          color: string | null
          created_at: string
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          notes: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank?: string | null
          color?: string | null
          created_at?: string
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank?: string | null
          color?: string | null
          created_at?: string
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          agent_id: string
          archived_at: string | null
          created_at: string
          id: string
          is_favorite: boolean
          last_message_at: string | null
          status: string
          summary: string | null
          summary_version: number | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string
          archived_at?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          last_message_at?: string | null
          status?: string
          summary?: string | null
          summary_version?: number | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          created_at?: string
          id?: string
          is_favorite?: boolean
          last_message_at?: string | null
          status?: string
          summary?: string | null
          summary_version?: number | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          content_type: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          run_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          content_type?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          run_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          content_type?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          run_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_owner_fk"
            columns: ["conversation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_messages_run_owner_fk"
            columns: ["run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ai_provider_configs: {
        Row: {
          advanced_model: string | null
          created_at: string
          daily_limit: number | null
          default_model: string | null
          display_name: string | null
          economy_model: string | null
          enabled: boolean
          fallback_allowed: boolean
          fallback_order: string[]
          id: string
          max_retries: number
          monthly_limit: number | null
          notes: string | null
          provider: string
          timeout_ms: number
          updated_at: string
          user_id: string
          vision_model: string | null
        }
        Insert: {
          advanced_model?: string | null
          created_at?: string
          daily_limit?: number | null
          default_model?: string | null
          display_name?: string | null
          economy_model?: string | null
          enabled?: boolean
          fallback_allowed?: boolean
          fallback_order?: string[]
          id?: string
          max_retries?: number
          monthly_limit?: number | null
          notes?: string | null
          provider: string
          timeout_ms?: number
          updated_at?: string
          user_id: string
          vision_model?: string | null
        }
        Update: {
          advanced_model?: string | null
          created_at?: string
          daily_limit?: number | null
          default_model?: string | null
          display_name?: string | null
          economy_model?: string | null
          enabled?: boolean
          fallback_allowed?: boolean
          fallback_order?: string[]
          id?: string
          max_retries?: number
          monthly_limit?: number | null
          notes?: string | null
          provider?: string
          timeout_ms?: number
          updated_at?: string
          user_id?: string
          vision_model?: string | null
        }
        Relationships: []
      }
      ai_provider_credentials: {
        Row: {
          algorithm_version: number
          auth_tag: string
          ciphertext: string
          created_at: string
          dek_auth_tag: string
          dek_iv: string
          id: string
          iv: string
          key_version: number
          last_four: string | null
          last_validated_at: string | null
          provider: string
          status: string
          test_count: number
          test_window_started_at: string | null
          updated_at: string
          user_id: string
          wrapped_dek: string
        }
        Insert: {
          algorithm_version?: number
          auth_tag: string
          ciphertext: string
          created_at?: string
          dek_auth_tag: string
          dek_iv: string
          id: string
          iv: string
          key_version: number
          last_four?: string | null
          last_validated_at?: string | null
          provider: string
          status?: string
          test_count?: number
          test_window_started_at?: string | null
          updated_at?: string
          user_id: string
          wrapped_dek: string
        }
        Update: {
          algorithm_version?: number
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          dek_auth_tag?: string
          dek_iv?: string
          id?: string
          iv?: string
          key_version?: number
          last_four?: string | null
          last_validated_at?: string | null
          provider?: string
          status?: string
          test_count?: number
          test_window_started_at?: string | null
          updated_at?: string
          user_id?: string
          wrapped_dek?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_credentials_config_fk"
            columns: ["user_id", "provider"]
            isOneToOne: false
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["user_id", "provider"]
          },
        ]
      }
      ai_run_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          id: string
          kind: string
          run_id: string
          started_at: string
          status: string
          step_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          kind: string
          run_id: string
          started_at?: string
          status?: string
          step_index: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          kind?: string
          run_id?: string
          started_at?: string
          status?: string
          step_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_steps_run_owner_fk"
            columns: ["run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          agent_id: string
          assistant_message_id: string | null
          attempt_count: number
          cancel_reason: string | null
          completed_at: string | null
          completed_model: string | null
          completed_provider: string | null
          conversation_id: string
          correlation_id: string
          created_at: string
          error_code: string | null
          error_message_sanitized: string | null
          fallback_count: number
          id: string
          last_heartbeat_at: string
          lease_expires_at: string
          prompt_version: string
          reservation_currency: string
          reservation_expires_at: string
          reservation_rate_version: string
          reserved_cost: number
          selected_model: string
          selected_provider: string
          started_at: string
          status: string
          total_latency_ms: number | null
          updated_at: string
          user_id: string
          user_message_id: string | null
        }
        Insert: {
          agent_id: string
          assistant_message_id?: string | null
          attempt_count?: number
          cancel_reason?: string | null
          completed_at?: string | null
          completed_model?: string | null
          completed_provider?: string | null
          conversation_id: string
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_message_sanitized?: string | null
          fallback_count?: number
          id?: string
          last_heartbeat_at?: string
          lease_expires_at?: string
          prompt_version: string
          reservation_currency?: string
          reservation_expires_at: string
          reservation_rate_version: string
          reserved_cost: number
          selected_model: string
          selected_provider: string
          started_at?: string
          status?: string
          total_latency_ms?: number | null
          updated_at?: string
          user_id: string
          user_message_id?: string | null
        }
        Update: {
          agent_id?: string
          assistant_message_id?: string | null
          attempt_count?: number
          cancel_reason?: string | null
          completed_at?: string | null
          completed_model?: string | null
          completed_provider?: string | null
          conversation_id?: string
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_message_sanitized?: string | null
          fallback_count?: number
          id?: string
          last_heartbeat_at?: string
          lease_expires_at?: string
          prompt_version?: string
          reservation_currency?: string
          reservation_expires_at?: string
          reservation_rate_version?: string
          reserved_cost?: number
          selected_model?: string
          selected_provider?: string
          started_at?: string
          status?: string
          total_latency_ms?: number | null
          updated_at?: string
          user_id?: string
          user_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_assistant_message_owner_fk"
            columns: ["assistant_message_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_runs_conversation_owner_fk"
            columns: ["conversation_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_runs_user_message_owner_fk"
            columns: ["user_message_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ai_tool_calls: {
        Row: {
          arguments_sanitized: Json
          created_at: string
          duration_ms: number | null
          id: string
          provider_call_id: string | null
          records_read: number | null
          refs: Json
          rejection_reason: string | null
          run_id: string
          status: string
          step_id: string
          tool_name: string
          tool_version: string
          user_id: string
        }
        Insert: {
          arguments_sanitized?: Json
          created_at?: string
          duration_ms?: number | null
          id?: string
          provider_call_id?: string | null
          records_read?: number | null
          refs?: Json
          rejection_reason?: string | null
          run_id: string
          status: string
          step_id: string
          tool_name: string
          tool_version: string
          user_id: string
        }
        Update: {
          arguments_sanitized?: Json
          created_at?: string
          duration_ms?: number | null
          id?: string
          provider_call_id?: string | null
          records_read?: number | null
          refs?: Json
          rejection_reason?: string | null
          run_id?: string
          status?: string
          step_id?: string
          tool_name?: string
          tool_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_calls_run_owner_fk"
            columns: ["run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "ai_tool_calls_step_owner_fk"
            columns: ["step_id", "run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_run_steps"
            referencedColumns: ["id", "run_id", "user_id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          agent_id: string | null
          attempt_index: number
          attempt_type: string
          cached_input_tokens: number | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          currency: string
          error_code: string | null
          estimated_cost: number | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_id: string
          output_tokens: number | null
          pricing_version: string
          provider: string
          provider_request_id: string | null
          rate_snapshot: Json
          run_id: string
          started_at: string
          status: string
          usage_availability: Json
          user_id: string
          was_fallback: boolean
        }
        Insert: {
          agent_id?: string | null
          attempt_index: number
          attempt_type: string
          cached_input_tokens?: number | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          currency?: string
          error_code?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id: string
          output_tokens?: number | null
          pricing_version: string
          provider: string
          provider_request_id?: string | null
          rate_snapshot: Json
          run_id: string
          started_at?: string
          status?: string
          usage_availability?: Json
          user_id: string
          was_fallback?: boolean
        }
        Update: {
          agent_id?: string | null
          attempt_index?: number
          attempt_type?: string
          cached_input_tokens?: number | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          currency?: string
          error_code?: string | null
          estimated_cost?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string
          output_tokens?: number | null
          pricing_version?: string
          provider?: string
          provider_request_id?: string | null
          rate_snapshot?: Json
          run_id?: string
          started_at?: string
          status?: string
          usage_availability?: Json
          user_id?: string
          was_fallback?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_run_owner_fk"
            columns: ["run_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      ai_user_preferences: {
        Row: {
          allow_body: boolean
          allow_calendar: boolean
          allow_cross_module: boolean
          allow_external_search: boolean
          allow_fallback: boolean
          allow_files: boolean
          allow_finance: boolean
          allow_habits: boolean
          allow_memory: boolean
          allow_nutrition: boolean
          allow_studies: boolean
          allow_tasks: boolean
          allow_todo: boolean
          allow_training: boolean
          budget_alert_level_reached: number
          budget_block_on_limit: boolean
          confirmation_mode: string
          created_at: string
          daily_budget: number | null
          default_model: string | null
          default_provider: string | null
          id: string
          monthly_budget: number | null
          rate_limit_per_hour: number
          rate_limit_per_minute: number
          reservation_margin: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_body?: boolean
          allow_calendar?: boolean
          allow_cross_module?: boolean
          allow_external_search?: boolean
          allow_fallback?: boolean
          allow_files?: boolean
          allow_finance?: boolean
          allow_habits?: boolean
          allow_memory?: boolean
          allow_nutrition?: boolean
          allow_studies?: boolean
          allow_tasks?: boolean
          allow_todo?: boolean
          allow_training?: boolean
          budget_alert_level_reached?: number
          budget_block_on_limit?: boolean
          confirmation_mode?: string
          created_at?: string
          daily_budget?: number | null
          default_model?: string | null
          default_provider?: string | null
          id?: string
          monthly_budget?: number | null
          rate_limit_per_hour?: number
          rate_limit_per_minute?: number
          reservation_margin?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_body?: boolean
          allow_calendar?: boolean
          allow_cross_module?: boolean
          allow_external_search?: boolean
          allow_fallback?: boolean
          allow_files?: boolean
          allow_finance?: boolean
          allow_habits?: boolean
          allow_memory?: boolean
          allow_nutrition?: boolean
          allow_studies?: boolean
          allow_tasks?: boolean
          allow_todo?: boolean
          allow_training?: boolean
          budget_alert_level_reached?: number
          budget_block_on_limit?: boolean
          confirmation_mode?: string
          created_at?: string
          daily_budget?: number | null
          default_model?: string | null
          default_provider?: string | null
          id?: string
          monthly_budget?: number | null
          rate_limit_per_hour?: number
          rate_limit_per_minute?: number
          reservation_margin?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          bucket_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bills: {
        Row: {
          account_id: string | null
          amount: number
          category_id: string | null
          created_at: string
          due_day: number
          frequency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          notify_days_before: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          due_day: number
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          notify_days_before?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          due_day?: number
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          notify_days_before?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurement_goals: {
        Row: {
          created_at: string
          direction: string
          id: string
          note: string | null
          start_value: number | null
          starts_on: string
          status: string
          target_date: string | null
          target_value: number
          type_id: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          note?: string | null
          start_value?: number | null
          starts_on: string
          status?: string
          target_date?: string | null
          target_value: number
          type_id: string
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          note?: string | null
          start_value?: number | null
          starts_on?: string
          status?: string
          target_date?: string | null
          target_value?: number
          type_id?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "body_measurement_goals_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "body_measurement_types"
            referencedColumns: ["id"]
          },
        ]
      }
      body_measurement_types: {
        Row: {
          category: string
          created_at: string
          decimals: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          note: string | null
          position: number
          side: string | null
          slug: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          decimals?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          note?: string | null
          position?: number
          side?: string | null
          slug: string
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          decimals?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          note?: string | null
          position?: number
          side?: string | null
          slug?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          measured_at: string | null
          measured_on: string
          note: string | null
          source: string
          type_id: string
          unit: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          measured_at?: string | null
          measured_on: string
          note?: string | null
          source?: string
          type_id: string
          unit: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          measured_at?: string | null
          measured_on?: string
          note?: string | null
          source?: string
          type_id?: string
          unit?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_measurements_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "body_measurement_types"
            referencedColumns: ["id"]
          },
        ]
      }
      body_progress_photos: {
        Row: {
          angle: string
          attachment_id: string
          created_at: string
          id: string
          note: string | null
          position: number
          taken_on: string
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          angle?: string
          attachment_id: string
          created_at?: string
          id?: string
          note?: string | null
          position?: number
          taken_on: string
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          angle?: string
          attachment_id?: string
          created_at?: string
          id?: string
          note?: string | null
          position?: number
          taken_on?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_progress_photos_attachment_owner_fkey"
            columns: ["attachment_id", "user_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          color: string | null
          created_at: string
          description: string | null
          end_at: string
          etag: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          location: string | null
          origin: string
          recurrence_freq: string | null
          recurrence_interval: number
          recurrence_until: string | null
          reminder_minutes: number | null
          start_at: string
          synced_at: string | null
          task_id: string | null
          tipo: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          end_at: string
          etag?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          origin?: string
          recurrence_freq?: string | null
          recurrence_interval?: number
          recurrence_until?: string | null
          reminder_minutes?: number | null
          start_at: string
          synced_at?: string | null
          task_id?: string | null
          tipo?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          end_at?: string
          etag?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          origin?: string
          recurrence_freq?: string | null
          recurrence_interval?: number
          recurrence_until?: string | null
          reminder_minutes?: number | null
          start_at?: string
          synced_at?: string | null
          task_id?: string | null
          tipo?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      card_statements: {
        Row: {
          card_id: string
          competencia: string
          created_at: string
          data_fechamento: string
          data_vencimento: string
          id: string
          observacoes: string | null
          pago_conta_id: string | null
          pago_em: string | null
          pago_transacao_id: string | null
          status: string
          total_calculado: number
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          competencia: string
          created_at?: string
          data_fechamento: string
          data_vencimento: string
          id?: string
          observacoes?: string | null
          pago_conta_id?: string | null
          pago_em?: string | null
          pago_transacao_id?: string | null
          status?: string
          total_calculado?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          competencia?: string
          created_at?: string
          data_fechamento?: string
          data_vencimento?: string
          id?: string
          observacoes?: string | null
          pago_conta_id?: string | null
          pago_em?: string | null
          pago_transacao_id?: string | null
          status?: string
          total_calculado?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_statements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_pago_conta_id_fkey"
            columns: ["pago_conta_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_pago_conta_id_fkey"
            columns: ["pago_conta_id"]
            isOneToOne: false
            referencedRelation: "accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_pago_transacao_id_fkey"
            columns: ["pago_transacao_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          ativo: boolean
          banco: string
          bandeira: string
          cor: string
          created_at: string
          dia_fechamento: number
          dia_vencimento: number
          id: string
          limite_total: number
          nome: string
          observacoes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          banco: string
          bandeira: string
          cor?: string
          created_at?: string
          dia_fechamento: number
          dia_vencimento: number
          id?: string
          limite_total?: number
          nome: string
          observacoes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          banco?: string
          bandeira?: string
          cor?: string
          created_at?: string
          dia_fechamento?: number
          dia_vencimento?: number
          id?: string
          limite_total?: number
          nome?: string
          observacoes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_integrations: {
        Row: {
          access_token: string
          calendar_id: string
          created_at: string
          google_email: string | null
          id: string
          last_synced_at: string | null
          refresh_token: string | null
          scope: string | null
          sync_token: string | null
          todo_sync_enabled: boolean
          token_expiry: string | null
          training_sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string
          created_at?: string
          google_email?: string | null
          id?: string
          last_synced_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          sync_token?: string | null
          todo_sync_enabled?: boolean
          token_expiry?: string | null
          training_sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string
          created_at?: string
          google_email?: string | null
          id?: string
          last_synced_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          sync_token?: string | null
          todo_sync_enabled?: boolean
          token_expiry?: string | null
          training_sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_logs: {
        Row: {
          created_at: string
          habit_id: string
          id: string
          is_done: boolean
          log_date: string
          notes: string | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          habit_id: string
          id?: string
          is_done?: boolean
          log_date: string
          notes?: string | null
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          habit_id?: string
          id?: string
          is_done?: boolean
          log_date?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          category: string
          color: string | null
          created_at: string
          description: string | null
          frequency: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          reminder_at: string | null
          target_value: number
          time_of_day: string | null
          unit: string
          updated_at: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          frequency?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          reminder_at?: string | null
          target_value?: number
          time_of_day?: string | null
          unit?: string
          updated_at?: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          description?: string | null
          frequency?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          reminder_at?: string | null
          target_value?: number
          time_of_day?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          account_id: string | null
          column_mapping: Json
          competencia_fatura: string | null
          created_at: string
          credit_card_id: string | null
          file_name: string
          formato: string
          id: string
          origem: string
          sinal_negativo_despesa: boolean
          status: string
          total_duplicadas: number
          total_ignoradas: number
          total_importadas: number
          total_linhas: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          column_mapping?: Json
          competencia_fatura?: string | null
          created_at?: string
          credit_card_id?: string | null
          file_name: string
          formato: string
          id?: string
          origem: string
          sinal_negativo_despesa?: boolean
          status?: string
          total_duplicadas?: number
          total_ignoradas?: number
          total_importadas?: number
          total_linhas?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          column_mapping?: Json
          competencia_fatura?: string | null
          created_at?: string
          credit_card_id?: string | null
          file_name?: string
          formato?: string
          id?: string
          origem?: string
          sinal_negativo_despesa?: boolean
          status?: string
          total_duplicadas?: number
          total_ignoradas?: number
          total_importadas?: number
          total_linhas?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          categoria_sugerida_id: string | null
          classificacao: string
          created_at: string
          data_norm: string | null
          descricao: string | null
          id: string
          identificador: string | null
          import_as: string
          import_batch_id: string
          linha_index: number
          motivo: string | null
          parcela: number | null
          parcelas_total: number | null
          raw: Json
          split_parts: Json
          status: string
          tipo: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
          valor: number | null
        }
        Insert: {
          categoria_sugerida_id?: string | null
          classificacao?: string
          created_at?: string
          data_norm?: string | null
          descricao?: string | null
          id?: string
          identificador?: string | null
          import_as?: string
          import_batch_id: string
          linha_index: number
          motivo?: string | null
          parcela?: number | null
          parcelas_total?: number | null
          raw?: Json
          split_parts?: Json
          status?: string
          tipo?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          valor?: number | null
        }
        Update: {
          categoria_sugerida_id?: string | null
          classificacao?: string
          created_at?: string
          data_norm?: string | null
          descricao?: string | null
          id?: string
          identificador?: string | null
          import_as?: string
          import_batch_id?: string
          linha_index?: number
          motivo?: string | null
          parcela?: number | null
          parcelas_total?: number | null
          raw?: Json
          split_parts?: Json
          status?: string
          tipo?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_categoria_sugerida_id_fkey"
            columns: ["categoria_sugerida_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          is_resolved: boolean
          link: string | null
          notify_at: string
          priority: string
          resolved_at: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          link?: string | null
          notify_at?: string
          priority?: string
          resolved_at?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          link?: string | null
          notify_at?: string
          priority?: string
          resolved_at?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_diary_entries: {
        Row: {
          base_quantity: number | null
          base_unit: string | null
          brand_snapshot: string | null
          carb_g: number | null
          change_kind: string
          changed_at: string | null
          created_at: string
          diary_meal_id: string
          energy_kcal: number | null
          entry_kind: string
          fat_g: number | null
          fiber_g: number | null
          food_id: string | null
          food_name_snapshot: string
          grams_equivalent: number | null
          id: string
          meal_template_id: string | null
          measure_label: string | null
          notes: string | null
          nutrients_snapshot: Json
          planned_item_id: string | null
          position: number
          preparation_state_snapshot: string | null
          protein_g: number | null
          quantity: number | null
          recipe_id: string | null
          source_food_code_snapshot: string | null
          source_id_snapshot: string | null
          source_name_snapshot: string | null
          source_version_snapshot: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_quantity?: number | null
          base_unit?: string | null
          brand_snapshot?: string | null
          carb_g?: number | null
          change_kind?: string
          changed_at?: string | null
          created_at?: string
          diary_meal_id: string
          energy_kcal?: number | null
          entry_kind?: string
          fat_g?: number | null
          fiber_g?: number | null
          food_id?: string | null
          food_name_snapshot: string
          grams_equivalent?: number | null
          id?: string
          meal_template_id?: string | null
          measure_label?: string | null
          notes?: string | null
          nutrients_snapshot?: Json
          planned_item_id?: string | null
          position?: number
          preparation_state_snapshot?: string | null
          protein_g?: number | null
          quantity?: number | null
          recipe_id?: string | null
          source_food_code_snapshot?: string | null
          source_id_snapshot?: string | null
          source_name_snapshot?: string | null
          source_version_snapshot?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_quantity?: number | null
          base_unit?: string | null
          brand_snapshot?: string | null
          carb_g?: number | null
          change_kind?: string
          changed_at?: string | null
          created_at?: string
          diary_meal_id?: string
          energy_kcal?: number | null
          entry_kind?: string
          fat_g?: number | null
          fiber_g?: number | null
          food_id?: string | null
          food_name_snapshot?: string
          grams_equivalent?: number | null
          id?: string
          meal_template_id?: string | null
          measure_label?: string | null
          notes?: string | null
          nutrients_snapshot?: Json
          planned_item_id?: string | null
          position?: number
          preparation_state_snapshot?: string | null
          protein_g?: number | null
          quantity?: number | null
          recipe_id?: string | null
          source_food_code_snapshot?: string | null
          source_id_snapshot?: string | null
          source_name_snapshot?: string | null
          source_version_snapshot?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_diary_entries_diary_meal_id_fkey"
            columns: ["diary_meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_diary_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_diary_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_diary_entries_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_diary_entries_meal_template_id_fkey"
            columns: ["meal_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_diary_entries_planned_item_id_fkey"
            columns: ["planned_item_id"]
            isOneToOne: false
            referencedRelation: "nutrition_planned_meal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_diary_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_diary_meals: {
        Row: {
          consumed_time: string | null
          created_at: string
          diary_date: string
          id: string
          meal_type_id: string
          notes: string | null
          planned_meal_id: string | null
          planned_time: string | null
          position: number
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          consumed_time?: string | null
          created_at?: string
          diary_date: string
          id?: string
          meal_type_id: string
          notes?: string | null
          planned_meal_id?: string | null
          planned_time?: string | null
          position?: number
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          consumed_time?: string | null
          created_at?: string
          diary_date?: string
          id?: string
          meal_type_id?: string
          notes?: string | null
          planned_meal_id?: string | null
          planned_time?: string | null
          position?: number
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_diary_meals_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_diary_meals_planned_meal_id_fkey"
            columns: ["planned_meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_planned_meals"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_food_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          parent_id: string | null
          position: number
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          parent_id?: string | null
          position?: number
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          position?: number
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_food_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_food_measures: {
        Row: {
          created_at: string
          food_id: string
          grams: number | null
          id: string
          is_default: boolean
          label: string
          milliliters: number | null
          position: number
          source_note: string | null
          unit_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          food_id: string
          grams?: number | null
          id?: string
          is_default?: boolean
          label: string
          milliliters?: number | null
          position?: number
          source_note?: string | null
          unit_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          food_id?: string
          grams?: number | null
          id?: string
          is_default?: boolean
          label?: string
          milliliters?: number | null
          position?: number
          source_note?: string | null
          unit_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_food_measures_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_measures_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_food_nutrients: {
        Row: {
          amount: number | null
          created_at: string
          food_id: string
          id: string
          method: string
          nutrient_code: string
          source_note: string | null
          updated_at: string
          user_id: string | null
          value_state: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          food_id: string
          id?: string
          method?: string
          nutrient_code: string
          source_note?: string | null
          updated_at?: string
          user_id?: string | null
          value_state?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          food_id?: string
          id?: string
          method?: string
          nutrient_code?: string
          source_note?: string | null
          updated_at?: string
          user_id?: string | null
          value_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_food_nutrients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_nutrients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_nutrients_nutrient_code_fkey"
            columns: ["nutrient_code"]
            isOneToOne: false
            referencedRelation: "nutrition_nutrients"
            referencedColumns: ["code"]
          },
        ]
      }
      nutrition_food_prefs: {
        Row: {
          archived_at: string | null
          category_override_id: string | null
          created_at: string
          custom_note: string | null
          food_id: string
          id: string
          is_favorite: boolean
          last_used_at: string | null
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category_override_id?: string | null
          created_at?: string
          custom_note?: string | null
          food_id: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          archived_at?: string | null
          category_override_id?: string | null
          created_at?: string
          custom_note?: string | null
          food_id?: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_food_prefs_category_override_id_fkey"
            columns: ["category_override_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_prefs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_prefs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_food_sources: {
        Row: {
          citation: string | null
          code: string
          created_at: string
          edition: string | null
          id: string
          is_official: boolean
          license_note: string | null
          name: string
          notes: string | null
          obtained_at: string | null
          publisher: string | null
          reference_url: string | null
          updated_at: string
          user_id: string | null
          version: string | null
        }
        Insert: {
          citation?: string | null
          code: string
          created_at?: string
          edition?: string | null
          id?: string
          is_official?: boolean
          license_note?: string | null
          name: string
          notes?: string | null
          obtained_at?: string | null
          publisher?: string | null
          reference_url?: string | null
          updated_at?: string
          user_id?: string | null
          version?: string | null
        }
        Update: {
          citation?: string | null
          code?: string
          created_at?: string
          edition?: string | null
          id?: string
          is_official?: boolean
          license_note?: string | null
          name?: string
          notes?: string | null
          obtained_at?: string | null
          publisher?: string | null
          reference_url?: string | null
          updated_at?: string
          user_id?: string | null
          version?: string | null
        }
        Relationships: []
      }
      nutrition_food_tag_links: {
        Row: {
          created_at: string
          food_id: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_food_tag_links_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_tag_links_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_food_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_food_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_foods: {
        Row: {
          alternative_name: string | null
          archived_at: string | null
          barcode: string | null
          base_quantity: number
          base_unit: string
          brand: string | null
          category_id: string | null
          created_at: string
          data_quality: string
          edible_portion_percent: number | null
          food_type: string
          id: string
          is_system_food: boolean
          is_verified: boolean
          last_verified_at: string | null
          name: string
          notes: string | null
          origin_food_id: string | null
          preparation_state: string
          source_food_code: string | null
          source_id: string | null
          source_version: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          alternative_name?: string | null
          archived_at?: string | null
          barcode?: string | null
          base_quantity?: number
          base_unit?: string
          brand?: string | null
          category_id?: string | null
          created_at?: string
          data_quality?: string
          edible_portion_percent?: number | null
          food_type?: string
          id?: string
          is_system_food?: boolean
          is_verified?: boolean
          last_verified_at?: string | null
          name: string
          notes?: string | null
          origin_food_id?: string | null
          preparation_state?: string
          source_food_code?: string | null
          source_id?: string | null
          source_version?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          alternative_name?: string | null
          archived_at?: string | null
          barcode?: string | null
          base_quantity?: number
          base_unit?: string
          brand?: string | null
          category_id?: string | null
          created_at?: string
          data_quality?: string
          edible_portion_percent?: number | null
          food_type?: string
          id?: string
          is_system_food?: boolean
          is_verified?: boolean
          last_verified_at?: string | null
          name?: string
          notes?: string | null
          origin_food_id?: string | null
          preparation_state?: string
          source_food_code?: string | null
          source_id?: string | null
          source_version?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_foods_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_foods_origin_food_id_fkey"
            columns: ["origin_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_foods_origin_food_id_fkey"
            columns: ["origin_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_foods_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_goal_items: {
        Row: {
          created_at: string
          day_kind: string | null
          id: string
          max_amount: number | null
          meal_type_id: string | null
          min_amount: number | null
          notes: string | null
          nutrient_code: string
          period_id: string
          target_amount: number | null
          target_percent: number | null
          updated_at: string
          user_id: string
          weekday: number | null
        }
        Insert: {
          created_at?: string
          day_kind?: string | null
          id?: string
          max_amount?: number | null
          meal_type_id?: string | null
          min_amount?: number | null
          notes?: string | null
          nutrient_code: string
          period_id: string
          target_amount?: number | null
          target_percent?: number | null
          updated_at?: string
          user_id: string
          weekday?: number | null
        }
        Update: {
          created_at?: string
          day_kind?: string | null
          id?: string
          max_amount?: number | null
          meal_type_id?: string | null
          min_amount?: number | null
          notes?: string | null
          nutrient_code?: string
          period_id?: string
          target_amount?: number | null
          target_percent?: number | null
          updated_at?: string
          user_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_goal_items_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_goal_items_nutrient_code_fkey"
            columns: ["nutrient_code"]
            isOneToOne: false
            referencedRelation: "nutrition_nutrients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "nutrition_goal_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "nutrition_goal_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_goal_periods: {
        Row: {
          created_at: string
          ends_on: string | null
          goal_type: string
          id: string
          is_active: boolean
          name: string | null
          notes: string | null
          reason: string | null
          starts_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          goal_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notes?: string | null
          reason?: string | null
          starts_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          goal_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          notes?: string | null
          reason?: string | null
          starts_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_import_batches: {
        Row: {
          created_at: string
          file_checksum: string | null
          file_name: string | null
          finished_at: string | null
          id: string
          report: Json
          rows_failed: number
          rows_imported: number
          rows_skipped: number
          rows_total: number
          source_id: string | null
          source_version: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          file_checksum?: string | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          report?: Json
          rows_failed?: number
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          source_id?: string | null
          source_version?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          file_checksum?: string | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          report?: Json
          rows_failed?: number
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          source_id?: string | null
          source_version?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_import_batches_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_market_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          position: number
          slug: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          position?: number
          slug?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          position?: number
          slug?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_meal_template_items: {
        Row: {
          created_at: string
          custom_label: string | null
          food_id: string | null
          id: string
          is_optional: boolean
          item_kind: string
          measure_id: string | null
          measure_label: string | null
          notes: string | null
          portion_unit: string | null
          position: number
          quantity: number | null
          recipe_id: string | null
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          id?: string
          is_optional?: boolean
          item_kind?: string
          measure_id?: string | null
          measure_label?: string | null
          notes?: string | null
          portion_unit?: string | null
          position?: number
          quantity?: number | null
          recipe_id?: string | null
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          id?: string
          is_optional?: boolean
          item_kind?: string
          measure_id?: string | null
          measure_label?: string | null
          notes?: string | null
          portion_unit?: string | null
          position?: number
          quantity?: number | null
          recipe_id?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meal_template_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_template_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_template_items_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_template_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_meal_templates: {
        Row: {
          archived_at: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_copy: boolean
          is_favorite: boolean
          last_used_at: string | null
          meal_type_id: string | null
          name: string
          notes: string | null
          origin_template_id: string | null
          suggested_time: string | null
          tags: string[]
          updated_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_copy?: boolean
          is_favorite?: boolean
          last_used_at?: string | null
          meal_type_id?: string | null
          name: string
          notes?: string | null
          origin_template_id?: string | null
          suggested_time?: string | null
          tags?: string[]
          updated_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_copy?: boolean
          is_favorite?: boolean
          last_used_at?: string | null
          meal_type_id?: string | null
          name?: string
          notes?: string | null
          origin_template_id?: string | null
          suggested_time?: string | null
          tags?: string[]
          updated_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_meal_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipe_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_templates_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_meal_templates_origin_template_id_fkey"
            columns: ["origin_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_meal_types: {
        Row: {
          color: string | null
          created_at: string
          default_time: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          default_time?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          default_time?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_nutrients: {
        Row: {
          code: string
          created_at: string
          is_core: boolean
          name: string
          nutrient_group: string
          position: number
          precision: number
          short_name: string | null
          unit: string
        }
        Insert: {
          code: string
          created_at?: string
          is_core?: boolean
          name: string
          nutrient_group: string
          position?: number
          precision?: number
          short_name?: string | null
          unit: string
        }
        Update: {
          code?: string
          created_at?: string
          is_core?: boolean
          name?: string
          nutrient_group?: string
          position?: number
          precision?: number
          short_name?: string | null
          unit?: string
        }
        Relationships: []
      }
      nutrition_pantry_items: {
        Row: {
          category_id: string | null
          created_at: string
          expires_on: string | null
          food_id: string | null
          id: string
          label: string
          min_quantity: number | null
          note: string | null
          quantity: number | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          expires_on?: string | null
          food_id?: string | null
          id?: string
          label: string
          min_quantity?: number | null
          note?: string | null
          quantity?: number | null
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          expires_on?: string | null
          food_id?: string | null
          id?: string
          label?: string
          min_quantity?: number | null
          note?: string | null
          quantity?: number | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_pantry_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nutrition_market_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_pantry_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_pantry_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plan_days: {
        Row: {
          created_at: string
          day_kind: string | null
          id: string
          label: string | null
          notes: string | null
          plan_id: string
          updated_at: string
          user_id: string
          week_index: number
          weekday: number
        }
        Insert: {
          created_at?: string
          day_kind?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          plan_id: string
          updated_at?: string
          user_id: string
          week_index?: number
          weekday: number
        }
        Update: {
          created_at?: string
          day_kind?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          plan_id?: string
          updated_at?: string
          user_id?: string
          week_index?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_plan_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_planned_meal_items: {
        Row: {
          created_at: string
          custom_label: string | null
          food_id: string | null
          id: string
          is_optional: boolean
          item_kind: string
          meal_template_id: string | null
          measure_id: string | null
          measure_label: string | null
          notes: string | null
          planned_meal_id: string
          portion_unit: string | null
          position: number
          quantity: number | null
          recipe_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          id?: string
          is_optional?: boolean
          item_kind?: string
          meal_template_id?: string | null
          measure_id?: string | null
          measure_label?: string | null
          notes?: string | null
          planned_meal_id: string
          portion_unit?: string | null
          position?: number
          quantity?: number | null
          recipe_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          id?: string
          is_optional?: boolean
          item_kind?: string
          meal_template_id?: string | null
          measure_id?: string | null
          measure_label?: string | null
          notes?: string | null
          planned_meal_id?: string
          portion_unit?: string | null
          position?: number
          quantity?: number | null
          recipe_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_planned_meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meal_items_meal_template_id_fkey"
            columns: ["meal_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meal_items_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meal_items_planned_meal_id_fkey"
            columns: ["planned_meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_planned_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meal_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_planned_meals: {
        Row: {
          created_at: string
          id: string
          meal_type_id: string
          notes: string | null
          plan_day_id: string | null
          plan_id: string | null
          planned_date: string | null
          planned_time: string | null
          position: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meal_type_id: string
          notes?: string | null
          plan_day_id?: string | null
          plan_id?: string | null
          planned_date?: string | null
          planned_time?: string | null
          position?: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meal_type_id?: string
          notes?: string | null
          plan_day_id?: string | null
          plan_id?: string | null
          planned_date?: string | null
          planned_time?: string | null
          position?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_planned_meals_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meals_plan_day_id_fkey"
            columns: ["plan_day_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plan_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_planned_meals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "nutrition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_plans: {
        Row: {
          anchor_date: string | null
          created_at: string
          cycle_weeks: number
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
          week_start_day: number
        }
        Insert: {
          anchor_date?: string | null
          created_at?: string
          cycle_weeks?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
          week_start_day?: number
        }
        Update: {
          anchor_date?: string | null
          created_at?: string
          cycle_weeks?: number
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          week_start_day?: number
        }
        Relationships: []
      }
      nutrition_profiles: {
        Row: {
          activity_level: string
          birth_date: string | null
          created_at: string
          goal_direction: string
          height_cm: number | null
          id: string
          notes: string | null
          restrictions: string[]
          sex: string
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          activity_level?: string
          birth_date?: string | null
          created_at?: string
          goal_direction?: string
          height_cm?: number | null
          id?: string
          notes?: string | null
          restrictions?: string[]
          sex?: string
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          activity_level?: string
          birth_date?: string | null
          created_at?: string
          goal_direction?: string
          height_cm?: number | null
          id?: string
          notes?: string | null
          restrictions?: string[]
          sex?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      nutrition_recipe_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_recipe_ingredients: {
        Row: {
          created_at: string
          custom_label: string | null
          food_id: string | null
          grams_equivalent: number | null
          id: string
          is_optional: boolean
          measure_id: string | null
          measure_label: string | null
          note: string | null
          position: number
          quantity: number | null
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          grams_equivalent?: number | null
          id?: string
          is_optional?: boolean
          measure_id?: string | null
          measure_label?: string | null
          note?: string | null
          position?: number
          quantity?: number | null
          recipe_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          grams_equivalent?: number | null
          id?: string
          is_optional?: boolean
          measure_id?: string | null
          measure_label?: string | null
          note?: string | null
          position?: number
          quantity?: number | null
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipe_ingredients_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipe_ingredients_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_recipes: {
        Row: {
          archived_at: string | null
          category_id: string | null
          cook_minutes: number | null
          created_at: string
          description: string | null
          id: string
          instructions: string | null
          is_copy: boolean
          is_favorite: boolean
          last_used_at: string | null
          name: string
          notes: string | null
          origin_recipe_id: string | null
          prep_minutes: number | null
          serving_label: string | null
          servings: number
          source: string | null
          tags: string[]
          total_weight_g: number | null
          updated_at: string
          use_count: number
          user_id: string
          yield_note: string | null
        }
        Insert: {
          archived_at?: string | null
          category_id?: string | null
          cook_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          is_copy?: boolean
          is_favorite?: boolean
          last_used_at?: string | null
          name: string
          notes?: string | null
          origin_recipe_id?: string | null
          prep_minutes?: number | null
          serving_label?: string | null
          servings?: number
          source?: string | null
          tags?: string[]
          total_weight_g?: number | null
          updated_at?: string
          use_count?: number
          user_id: string
          yield_note?: string | null
        }
        Update: {
          archived_at?: string | null
          category_id?: string | null
          cook_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          is_copy?: boolean
          is_favorite?: boolean
          last_used_at?: string | null
          name?: string
          notes?: string | null
          origin_recipe_id?: string | null
          prep_minutes?: number | null
          serving_label?: string | null
          servings?: number
          source?: string | null
          tags?: string[]
          total_weight_g?: number | null
          updated_at?: string
          use_count?: number
          user_id?: string
          yield_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_recipes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipe_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_recipes_origin_recipe_id_fkey"
            columns: ["origin_recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_shopping_list_items: {
        Row: {
          actual_price_cents: number | null
          brand: string | null
          category_id: string | null
          consolidation_key: string | null
          created_at: string
          estimated_price_cents: number | null
          food_id: string | null
          id: string
          is_manual: boolean
          label: string
          list_id: string
          note: string | null
          origins: Json
          position: number
          priority: string
          purchased_at: string | null
          quantity: number | null
          quantity_overridden: boolean
          recipe_id: string | null
          separate_reason: string | null
          status: string
          store: string | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_price_cents?: number | null
          brand?: string | null
          category_id?: string | null
          consolidation_key?: string | null
          created_at?: string
          estimated_price_cents?: number | null
          food_id?: string | null
          id?: string
          is_manual?: boolean
          label: string
          list_id: string
          note?: string | null
          origins?: Json
          position?: number
          priority?: string
          purchased_at?: string | null
          quantity?: number | null
          quantity_overridden?: boolean
          recipe_id?: string | null
          separate_reason?: string | null
          status?: string
          store?: string | null
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_price_cents?: number | null
          brand?: string | null
          category_id?: string | null
          consolidation_key?: string | null
          created_at?: string
          estimated_price_cents?: number | null
          food_id?: string | null
          id?: string
          is_manual?: boolean
          label?: string
          list_id?: string
          note?: string | null
          origins?: Json
          position?: number
          priority?: string
          purchased_at?: string | null
          quantity?: number | null
          quantity_overridden?: boolean
          recipe_id?: string | null
          separate_reason?: string | null
          status?: string
          store?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_shopping_list_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nutrition_market_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_shopping_list_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_shopping_list_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_shopping_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "nutrition_shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_shopping_list_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_shopping_lists: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          pantry_applied_at: string | null
          recurrence: string
          recurrence_key: string | null
          source_from: string | null
          source_kind: string
          source_to: string | null
          status: string
          store: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          pantry_applied_at?: string | null
          recurrence?: string
          recurrence_key?: string | null
          source_from?: string | null
          source_kind?: string
          source_to?: string | null
          status?: string
          store?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          pantry_applied_at?: string | null
          recurrence?: string
          recurrence_key?: string | null
          source_from?: string | null
          source_kind?: string
          source_to?: string | null
          status?: string
          store?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_substitution_groups: {
        Row: {
          base_measure_id: string | null
          base_measure_label: string | null
          base_portion_unit: string | null
          base_quantity: number | null
          created_at: string
          custom_label: string | null
          description: string | null
          food_id: string | null
          group_kind: string
          id: string
          is_active: boolean
          meal_template_id: string | null
          name: string
          notes: string | null
          position: number
          recipe_id: string | null
          restrictions: string[]
          tolerance_carb_percent: number | null
          tolerance_energy_percent: number | null
          tolerance_fat_percent: number | null
          tolerance_fiber_percent: number | null
          tolerance_protein_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_measure_id?: string | null
          base_measure_label?: string | null
          base_portion_unit?: string | null
          base_quantity?: number | null
          created_at?: string
          custom_label?: string | null
          description?: string | null
          food_id?: string | null
          group_kind?: string
          id?: string
          is_active?: boolean
          meal_template_id?: string | null
          name: string
          notes?: string | null
          position?: number
          recipe_id?: string | null
          restrictions?: string[]
          tolerance_carb_percent?: number | null
          tolerance_energy_percent?: number | null
          tolerance_fat_percent?: number | null
          tolerance_fiber_percent?: number | null
          tolerance_protein_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_measure_id?: string | null
          base_measure_label?: string | null
          base_portion_unit?: string | null
          base_quantity?: number | null
          created_at?: string
          custom_label?: string | null
          description?: string | null
          food_id?: string | null
          group_kind?: string
          id?: string
          is_active?: boolean
          meal_template_id?: string | null
          name?: string
          notes?: string | null
          position?: number
          recipe_id?: string | null
          restrictions?: string[]
          tolerance_carb_percent?: number | null
          tolerance_energy_percent?: number | null
          tolerance_fat_percent?: number | null
          tolerance_fiber_percent?: number | null
          tolerance_protein_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_substitution_groups_base_measure_id_fkey"
            columns: ["base_measure_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_groups_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_groups_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_groups_meal_template_id_fkey"
            columns: ["meal_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_groups_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_substitution_logs: {
        Row: {
          applied_on: string
          created_at: string
          delta_carb_g: number | null
          delta_energy_kcal: number | null
          delta_fat_g: number | null
          delta_fiber_g: number | null
          delta_protein_g: number | null
          diary_entry_id: string | null
          diary_meal_id: string | null
          diff_snapshot: Json
          group_id: string | null
          id: string
          option_id: string | null
          original_food_id: string | null
          original_label: string
          original_meal_template_id: string | null
          original_measure_label: string | null
          original_quantity: number | null
          original_recipe_id: string | null
          reason: string | null
          replacement_food_id: string | null
          replacement_label: string
          replacement_meal_template_id: string | null
          replacement_measure_label: string | null
          replacement_quantity: number | null
          replacement_recipe_id: string | null
          substitution_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_on: string
          created_at?: string
          delta_carb_g?: number | null
          delta_energy_kcal?: number | null
          delta_fat_g?: number | null
          delta_fiber_g?: number | null
          delta_protein_g?: number | null
          diary_entry_id?: string | null
          diary_meal_id?: string | null
          diff_snapshot?: Json
          group_id?: string | null
          id?: string
          option_id?: string | null
          original_food_id?: string | null
          original_label: string
          original_meal_template_id?: string | null
          original_measure_label?: string | null
          original_quantity?: number | null
          original_recipe_id?: string | null
          reason?: string | null
          replacement_food_id?: string | null
          replacement_label: string
          replacement_meal_template_id?: string | null
          replacement_measure_label?: string | null
          replacement_quantity?: number | null
          replacement_recipe_id?: string | null
          substitution_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_on?: string
          created_at?: string
          delta_carb_g?: number | null
          delta_energy_kcal?: number | null
          delta_fat_g?: number | null
          delta_fiber_g?: number | null
          delta_protein_g?: number | null
          diary_entry_id?: string | null
          diary_meal_id?: string | null
          diff_snapshot?: Json
          group_id?: string | null
          id?: string
          option_id?: string | null
          original_food_id?: string | null
          original_label?: string
          original_meal_template_id?: string | null
          original_measure_label?: string | null
          original_quantity?: number | null
          original_recipe_id?: string | null
          reason?: string | null
          replacement_food_id?: string | null
          replacement_label?: string
          replacement_meal_template_id?: string | null
          replacement_measure_label?: string | null
          replacement_quantity?: number | null
          replacement_recipe_id?: string | null
          substitution_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_substitution_logs_diary_entry_id_fkey"
            columns: ["diary_entry_id"]
            isOneToOne: false
            referencedRelation: "nutrition_diary_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_diary_meal_id_fkey"
            columns: ["diary_meal_id"]
            isOneToOne: false
            referencedRelation: "nutrition_diary_meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "nutrition_substitution_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "nutrition_substitution_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_original_food_id_fkey"
            columns: ["original_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_original_food_id_fkey"
            columns: ["original_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_original_meal_template_id_fkey"
            columns: ["original_meal_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_original_recipe_id_fkey"
            columns: ["original_recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_replacement_food_id_fkey"
            columns: ["replacement_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_replacement_food_id_fkey"
            columns: ["replacement_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_replacement_meal_template_id_fkey"
            columns: ["replacement_meal_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_logs_replacement_recipe_id_fkey"
            columns: ["replacement_recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_substitution_options: {
        Row: {
          created_at: string
          custom_label: string | null
          food_id: string | null
          group_id: string
          id: string
          is_active: boolean
          meal_template_id: string | null
          measure_id: string | null
          measure_label: string | null
          notes: string | null
          option_kind: string
          portion_unit: string | null
          position: number
          priority: number
          quantity: number | null
          recipe_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          group_id: string
          id?: string
          is_active?: boolean
          meal_template_id?: string | null
          measure_id?: string | null
          measure_label?: string | null
          notes?: string | null
          option_kind?: string
          portion_unit?: string | null
          position?: number
          priority?: number
          quantity?: number | null
          recipe_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_label?: string | null
          food_id?: string | null
          group_id?: string
          id?: string
          is_active?: boolean
          meal_template_id?: string | null
          measure_id?: string | null
          measure_label?: string | null
          notes?: string | null
          option_kind?: string
          portion_unit?: string | null
          position?: number
          priority?: number
          quantity?: number | null
          recipe_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_substitution_options_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_options_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "nutrition_substitution_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_options_meal_template_id_fkey"
            columns: ["meal_template_id"]
            isOneToOne: false
            referencedRelation: "nutrition_meal_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_options_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_measures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_substitution_options_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          ativo: boolean
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_archived: boolean
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receivables: {
        Row: {
          card_id: string | null
          created_at: string
          data_prevista: string | null
          id: string
          installment_id: string | null
          observacoes: string | null
          pago_em: string | null
          person_id: string
          shared_expense_id: string | null
          statement_id: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          data_prevista?: string | null
          id?: string
          installment_id?: string | null
          observacoes?: string | null
          pago_em?: string | null
          person_id: string
          shared_expense_id?: string | null
          statement_id?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          card_id?: string | null
          created_at?: string
          data_prevista?: string | null
          id?: string
          installment_id?: string | null
          observacoes?: string | null
          pago_em?: string | null
          person_id?: string
          shared_expense_id?: string | null
          statement_id?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "receivables_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "transaction_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_shared_expense_id_fkey"
            columns: ["shared_expense_id"]
            isOneToOne: false
            referencedRelation: "shared_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements_with_total"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          account_id: string | null
          amount: number
          anchor_date: string
          bill_id: string | null
          card_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          frequency: string
          generated_status: string
          id: string
          interval_count: number
          is_active: boolean
          last_generated_at: string | null
          next_due_date: string
          payment_method: string | null
          subcategory_id: string | null
          tags: string[]
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          anchor_date: string
          bill_id?: string | null
          card_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          frequency: string
          generated_status?: string
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_at?: string | null
          next_due_date: string
          payment_method?: string | null
          subcategory_id?: string | null
          tags?: string[]
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          anchor_date?: string
          bill_id?: string | null
          card_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          frequency?: string
          generated_status?: string
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_at?: string | null
          next_due_date?: string
          payment_method?: string | null
          subcategory_id?: string | null
          tags?: string[]
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_items: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          routine_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          routine_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          routine_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_items_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_logs: {
        Row: {
          completed_items: string[]
          created_at: string
          id: string
          is_done: boolean
          log_date: string
          notes: string | null
          routine_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_items?: string[]
          created_at?: string
          id?: string
          is_done?: boolean
          log_date: string
          notes?: string | null
          routine_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_items?: string[]
          created_at?: string
          id?: string
          is_done?: boolean
          log_date?: string
          notes?: string | null
          routine_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_logs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          frequency: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          time_of_day: string | null
          type: string
          updated_at: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          frequency?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          time_of_day?: string | null
          type?: string
          updated_at?: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          frequency?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          time_of_day?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      settings: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency: string
          dashboard_layout: Json
          date_format: string
          display_name: string | null
          id: string
          notification_prefs: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          dashboard_layout?: Json
          date_format?: string
          display_name?: string | null
          id?: string
          notification_prefs?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          dashboard_layout?: Json
          date_format?: string
          display_name?: string | null
          id?: string
          notification_prefs?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_expenses: {
        Row: {
          created_at: string
          id: string
          percentual: number | null
          person_id: string
          tipo_divisao: string
          transaction_id: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          percentual?: number | null
          person_id: string
          tipo_divisao: string
          transaction_id: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string
          id?: string
          percentual?: number | null
          person_id?: string
          tipo_divisao?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_expenses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      study_courses: {
        Row: {
          category: string
          cover_color: string | null
          created_at: string
          icon: string | null
          id: string
          is_language: boolean
          materials: Json
          notes: string | null
          platform: string | null
          position: number
          priority: string
          progress: number
          start_date: string | null
          status: string
          studied_minutes: number
          target_date: string | null
          title: string
          updated_at: string
          url: string | null
          user_id: string
          weekly_goal_minutes: number | null
          workload_minutes: number
        }
        Insert: {
          category?: string
          cover_color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_language?: boolean
          materials?: Json
          notes?: string | null
          platform?: string | null
          position?: number
          priority?: string
          progress?: number
          start_date?: string | null
          status?: string
          studied_minutes?: number
          target_date?: string | null
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
          weekly_goal_minutes?: number | null
          workload_minutes?: number
        }
        Update: {
          category?: string
          cover_color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_language?: boolean
          materials?: Json
          notes?: string | null
          platform?: string | null
          position?: number
          priority?: string
          progress?: number
          start_date?: string | null
          status?: string
          studied_minutes?: number
          target_date?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
          weekly_goal_minutes?: number | null
          workload_minutes?: number
        }
        Relationships: []
      }
      study_language_practice: {
        Row: {
          course_id: string
          created_at: string
          duration_minutes: number
          id: string
          notes: string | null
          practice_date: string
          skill: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          practice_date: string
          skill: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          practice_date?: string
          skill?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_language_practice_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "study_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      study_lessons: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          duration_minutes: number
          id: string
          is_done: boolean
          module_id: string
          notes: string | null
          position: number
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_done?: boolean
          module_id: string
          notes?: string | null
          position?: number
          title: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_done?: boolean
          module_id?: string
          notes?: string | null
          position?: number
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "study_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "study_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      study_modules: {
        Row: {
          course_id: string
          created_at: string
          id: string
          notes: string | null
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          notes?: string | null
          position?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "study_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          course_id: string
          created_at: string
          difficulty: string
          duration_minutes: number
          id: string
          lesson_id: string | null
          next_action: string | null
          session_date: string
          task_id: string | null
          updated_at: string
          user_id: string
          what_i_learned: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          difficulty?: string
          duration_minutes?: number
          id?: string
          lesson_id?: string | null
          next_action?: string | null
          session_date: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          what_i_learned?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          difficulty?: string
          duration_minutes?: number
          id?: string
          lesson_id?: string | null
          next_action?: string | null
          session_date?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          what_i_learned?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "study_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "study_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      study_vocabulary: {
        Row: {
          course_id: string
          created_at: string
          example: string | null
          id: string
          mastery: string
          next_review_date: string | null
          term: string
          translation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          example?: string | null
          id?: string
          mastery?: string
          next_review_date?: string | null
          term: string
          translation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          example?: string | null
          id?: string
          mastery?: string
          next_review_date?: string | null
          term?: string
          translation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_vocabulary_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "study_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          bucket_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          path: string
          size_bytes: number | null
          task_id: string
          user_id: string
        }
        Insert: {
          bucket_id?: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          path: string
          size_bytes?: number | null
          task_id: string
          user_id: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          path?: string
          size_bytes?: number | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          id: string
          is_done: boolean
          label: string
          position: number
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_done?: boolean
          label: string
          position?: number
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_done?: boolean
          label?: string
          position?: number
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          calendar_event_id: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          position: number
          priority: string
          project_id: string | null
          recurrence: Json | null
          reminder_at: string | null
          start_date: string | null
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          recurrence?: Json | null
          reminder_at?: string | null
          start_date?: string | null
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          recurrence?: Json | null
          reminder_at?: string | null
          start_date?: string | null
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_activity: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          new_data: Json | null
          previous_data: Json | null
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          previous_data?: Json | null
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_data?: Json | null
          previous_data?: Json | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_calendar_sync: {
        Row: {
          created_at: string
          external_calendar_id: string | null
          external_event_id: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          local_event_id: string | null
          provider: string
          sync_status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          local_event_id?: string | null
          provider?: string
          sync_status?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          local_event_id?: string | null
          provider?: string
          sync_status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_calendar_sync_local_event_id_fkey"
            columns: ["local_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_calendar_sync_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_completions: {
        Row: {
          completed_at: string
          completion_source: string
          created_at: string
          id: string
          scheduled_for: string
          task_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          completion_source?: string
          created_at?: string
          id?: string
          scheduled_for: string
          task_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          completion_source?: string
          created_at?: string
          id?: string
          scheduled_for?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_labels: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_preferences: {
        Row: {
          created_at: string
          group_by: string
          id: string
          scope: string
          show_completed: boolean
          sort_by: string
          sort_dir: string
          updated_at: string
          user_id: string
          view: string
        }
        Insert: {
          created_at?: string
          group_by?: string
          id?: string
          scope?: string
          show_completed?: boolean
          sort_by?: string
          sort_dir?: string
          updated_at?: string
          user_id: string
          view?: string
        }
        Update: {
          created_at?: string
          group_by?: string
          id?: string
          scope?: string
          show_completed?: boolean
          sort_by?: string
          sort_dir?: string
          updated_at?: string
          user_id?: string
          view?: string
        }
        Relationships: []
      }
      todo_projects: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          default_view: string
          description: string | null
          icon: string | null
          id: string
          is_favorite: boolean
          name: string
          parent_project_id: string | null
          position: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          default_view?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          parent_project_id?: string | null
          position?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          default_view?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          parent_project_id?: string | null
          position?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_projects_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "todo_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_recurrences: {
        Row: {
          business_day_rule: string | null
          created_at: string
          day_of_month: number | null
          days_of_week: number[] | null
          ends_on: string | null
          frequency: string
          id: string
          interval_count: number
          is_paused: boolean
          max_occurrences: number | null
          month_of_year: number | null
          occurrences_created: number
          recurrence_mode: string
          rule_json: Json | null
          starts_on: string | null
          task_id: string
          timezone: string
          updated_at: string
          user_id: string
          week_of_month: number | null
        }
        Insert: {
          business_day_rule?: string | null
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          ends_on?: string | null
          frequency: string
          id?: string
          interval_count?: number
          is_paused?: boolean
          max_occurrences?: number | null
          month_of_year?: number | null
          occurrences_created?: number
          recurrence_mode?: string
          rule_json?: Json | null
          starts_on?: string | null
          task_id: string
          timezone?: string
          updated_at?: string
          user_id: string
          week_of_month?: number | null
        }
        Update: {
          business_day_rule?: string | null
          created_at?: string
          day_of_month?: number | null
          days_of_week?: number[] | null
          ends_on?: string | null
          frequency?: string
          id?: string
          interval_count?: number
          is_paused?: boolean
          max_occurrences?: number | null
          month_of_year?: number | null
          occurrences_created?: number
          recurrence_mode?: string
          rule_json?: Json | null
          starts_on?: string | null
          task_id?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          week_of_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "todo_recurrences_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_reminders: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          offset_minutes: number | null
          remind_at: string
          sent_at: string | null
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          offset_minutes?: number | null
          remind_at: string
          sent_at?: string | null
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          offset_minutes?: number | null
          remind_at?: string
          sent_at?: string | null
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_saved_filters: {
        Row: {
          color: string
          created_at: string
          description: string | null
          filter_definition: Json
          icon: string | null
          id: string
          is_favorite: boolean
          name: string
          position: number
          show_in_nav: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          filter_definition?: Json
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          position?: number
          show_in_nav?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          filter_definition?: Json
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          position?: number
          show_in_nav?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_sections: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          project_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          project_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "todo_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_task_labels: {
        Row: {
          created_at: string
          label_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          label_id: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          label_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "todo_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todo_tasks: {
        Row: {
          archived_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          description: string | null
          duration_minutes: number | null
          external_reference: string | null
          id: string
          is_all_day: boolean
          parent_task_id: string | null
          position: number
          priority: number
          project_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          section_id: string | null
          series_id: string | null
          source: string
          status: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          external_reference?: string | null
          id?: string
          is_all_day?: boolean
          parent_task_id?: string | null
          position?: number
          priority?: number
          project_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          section_id?: string | null
          series_id?: string | null
          source?: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          external_reference?: string | null
          id?: string
          is_all_day?: boolean
          parent_task_id?: string | null
          position?: number
          priority?: number
          project_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          section_id?: string | null
          series_id?: string | null
          source?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "todo_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "todo_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todo_tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "todo_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      training_calendar_sync: {
        Row: {
          created_at: string
          external_calendar_id: string | null
          external_event_id: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          local_event_id: string | null
          provider: string
          scheduled_workout_id: string
          sync_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          local_event_id?: string | null
          provider?: string
          scheduled_workout_id: string
          sync_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          external_calendar_id?: string | null
          external_event_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          local_event_id?: string | null
          provider?: string
          scheduled_workout_id?: string
          sync_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_calendar_sync_local_event_id_fkey"
            columns: ["local_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_calendar_sync_owner_fk"
            columns: ["scheduled_workout_id", "user_id"]
            isOneToOne: false
            referencedRelation: "training_scheduled_workouts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "training_calendar_sync_scheduled_workout_id_fkey"
            columns: ["scheduled_workout_id"]
            isOneToOne: false
            referencedRelation: "training_scheduled_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_equipment: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          default_increment_kg: number | null
          id: string
          is_system: boolean
          name: string
          position: number
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          category?: string
          created_at?: string
          default_increment_kg?: number | null
          id?: string
          is_system?: boolean
          name: string
          position?: number
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          default_increment_kg?: number | null
          id?: string
          is_system?: boolean
          name?: string
          position?: number
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      training_exercise_alternatives: {
        Row: {
          alternative_exercise_id: string
          created_at: string
          exercise_id: string
          id: string
          note: string | null
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          alternative_exercise_id: string
          created_at?: string
          exercise_id: string
          id?: string
          note?: string | null
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          alternative_exercise_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          note?: string | null
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_exercise_alternatives_alternative_exercise_id_fkey"
            columns: ["alternative_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_exercise_alternatives_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      training_exercise_muscles: {
        Row: {
          created_at: string
          exercise_id: string
          id: string
          muscle_group_id: string
          position: number
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          exercise_id: string
          id?: string
          muscle_group_id: string
          position?: number
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          exercise_id?: string
          id?: string
          muscle_group_id?: string
          position?: number
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_exercise_muscles_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_exercise_muscles_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "training_muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      training_exercise_prefs: {
        Row: {
          archived_at: string | null
          created_at: string
          custom_increment_kg: number | null
          custom_name: string | null
          custom_rest_seconds: number | null
          exercise_id: string
          id: string
          is_favorite: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          custom_increment_kg?: number | null
          custom_name?: string | null
          custom_rest_seconds?: number | null
          exercise_id: string
          id?: string
          is_favorite?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          custom_increment_kg?: number | null
          custom_name?: string | null
          custom_rest_seconds?: number | null
          exercise_id?: string
          id?: string
          is_favorite?: boolean
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_exercise_prefs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      training_exercises: {
        Row: {
          alternative_name: string | null
          archived_at: string | null
          common_mistakes: string | null
          created_at: string
          default_increment_kg: number | null
          default_rest_seconds: number | null
          description: string | null
          equipment_id: string | null
          exercise_type: string
          id: string
          image_url: string | null
          instructions: string | null
          is_system_exercise: boolean
          is_verified: boolean
          laterality: string
          movement_pattern: string
          name: string
          notes: string | null
          origin_exercise_id: string | null
          primary_muscle_group_id: string
          source: string
          system_code: string | null
          tips: string | null
          tracking_type: string
          updated_at: string
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          alternative_name?: string | null
          archived_at?: string | null
          common_mistakes?: string | null
          created_at?: string
          default_increment_kg?: number | null
          default_rest_seconds?: number | null
          description?: string | null
          equipment_id?: string | null
          exercise_type?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_system_exercise?: boolean
          is_verified?: boolean
          laterality?: string
          movement_pattern?: string
          name: string
          notes?: string | null
          origin_exercise_id?: string | null
          primary_muscle_group_id: string
          source?: string
          system_code?: string | null
          tips?: string | null
          tracking_type?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          alternative_name?: string | null
          archived_at?: string | null
          common_mistakes?: string | null
          created_at?: string
          default_increment_kg?: number | null
          default_rest_seconds?: number | null
          description?: string | null
          equipment_id?: string | null
          exercise_type?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_system_exercise?: boolean
          is_verified?: boolean
          laterality?: string
          movement_pattern?: string
          name?: string
          notes?: string | null
          origin_exercise_id?: string | null
          primary_muscle_group_id?: string
          source?: string
          system_code?: string | null
          tips?: string | null
          tracking_type?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_exercises_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "training_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_exercises_origin_exercise_id_fkey"
            columns: ["origin_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_exercises_primary_muscle_group_id_fkey"
            columns: ["primary_muscle_group_id"]
            isOneToOne: false
            referencedRelation: "training_muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      training_goal_progress: {
        Row: {
          created_at: string
          entry_kind: string
          field: string | null
          goal_id: string
          id: string
          new_text: string | null
          new_value: number | null
          note: string | null
          previous_text: string | null
          previous_value: number | null
          recorded_on: string
          source: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          entry_kind: string
          field?: string | null
          goal_id: string
          id?: string
          new_text?: string | null
          new_value?: number | null
          note?: string | null
          previous_text?: string | null
          previous_value?: number | null
          recorded_on: string
          source?: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          entry_kind?: string
          field?: string | null
          goal_id?: string
          id?: string
          new_text?: string | null
          new_value?: number | null
          note?: string | null
          previous_text?: string | null
          previous_value?: number | null
          recorded_on?: string
          source?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_goal_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "training_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      training_goals: {
        Row: {
          body_measurement_type_id: string | null
          created_at: string
          description: string | null
          direction: string
          ends_on: string | null
          exercise_id: string | null
          goal_kind: string
          id: string
          metric: string
          milestones: Json
          muscle_group_id: string | null
          name: string
          notes: string | null
          period: string
          position: number
          program_id: string | null
          start_value: number | null
          starts_on: string
          status: string
          target_value: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_measurement_type_id?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          ends_on?: string | null
          exercise_id?: string | null
          goal_kind: string
          id?: string
          metric: string
          milestones?: Json
          muscle_group_id?: string | null
          name: string
          notes?: string | null
          period: string
          position?: number
          program_id?: string | null
          start_value?: number | null
          starts_on: string
          status?: string
          target_value: number
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body_measurement_type_id?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          ends_on?: string | null
          exercise_id?: string | null
          goal_kind?: string
          id?: string
          metric?: string
          milestones?: Json
          muscle_group_id?: string | null
          name?: string
          notes?: string | null
          period?: string
          position?: number
          program_id?: string | null
          start_value?: number | null
          starts_on?: string
          status?: string
          target_value?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_goals_body_measurement_type_id_fkey"
            columns: ["body_measurement_type_id"]
            isOneToOne: false
            referencedRelation: "body_measurement_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_goals_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_goals_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "training_muscle_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_goals_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_location_plates: {
        Row: {
          created_at: string
          id: string
          kind: string
          location_id: string
          notes: string | null
          quantity: number
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          location_id: string
          notes?: string | null
          quantity?: number
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          location_id?: string
          notes?: string | null
          quantity?: number
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_location_plates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "training_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_locations: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_muscle_groups: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          id: string
          is_system: boolean
          name: string
          parent_id: string | null
          position: number
          region: string
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          parent_id?: string | null
          position?: number
          region?: string
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          region?: string
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_muscle_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "training_muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      training_personal_records: {
        Row: {
          achieved_on: string
          created_at: string
          exercise_id: string | null
          exercise_name_snapshot: string | null
          id: string
          notes: string | null
          one_rm_formula: string | null
          previous_achieved_on: string | null
          previous_value: number | null
          record_key: string
          record_type: string
          reference_weight_kg: number | null
          reps: number | null
          scope: string
          session_id: string | null
          session_set_id: string | null
          unit: string
          updated_at: string
          user_id: string
          value: number
          weight_kg: number | null
        }
        Insert: {
          achieved_on: string
          created_at?: string
          exercise_id?: string | null
          exercise_name_snapshot?: string | null
          id?: string
          notes?: string | null
          one_rm_formula?: string | null
          previous_achieved_on?: string | null
          previous_value?: number | null
          record_key: string
          record_type: string
          reference_weight_kg?: number | null
          reps?: number | null
          scope?: string
          session_id?: string | null
          session_set_id?: string | null
          unit: string
          updated_at?: string
          user_id: string
          value: number
          weight_kg?: number | null
        }
        Update: {
          achieved_on?: string
          created_at?: string
          exercise_id?: string | null
          exercise_name_snapshot?: string | null
          id?: string
          notes?: string | null
          one_rm_formula?: string | null
          previous_achieved_on?: string | null
          previous_value?: number | null
          record_key?: string
          record_type?: string
          reference_weight_kg?: number | null
          reps?: number | null
          scope?: string
          session_id?: string | null
          session_set_id?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
          value?: number
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_personal_records_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_personal_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_personal_records_session_set_id_fkey"
            columns: ["session_set_id"]
            isOneToOne: false
            referencedRelation: "training_session_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      training_preferences: {
        Row: {
          auto_advance: string
          count_warmup_in_volume: boolean
          created_at: string
          default_increment_kg: number
          default_rest_seconds: number
          difficulty_scale: string
          habit_id: string | null
          id: string
          keep_screen_awake: boolean
          one_rm_formula: string
          progression_enabled: boolean
          rest_sound_enabled: boolean
          rest_vibration_enabled: boolean
          unilateral_volume_rule: string
          updated_at: string
          user_id: string
          week_starts_on: number
          weekly_workout_goal: number | null
          weight_unit: string
        }
        Insert: {
          auto_advance?: string
          count_warmup_in_volume?: boolean
          created_at?: string
          default_increment_kg?: number
          default_rest_seconds?: number
          difficulty_scale?: string
          habit_id?: string | null
          id?: string
          keep_screen_awake?: boolean
          one_rm_formula?: string
          progression_enabled?: boolean
          rest_sound_enabled?: boolean
          rest_vibration_enabled?: boolean
          unilateral_volume_rule?: string
          updated_at?: string
          user_id: string
          week_starts_on?: number
          weekly_workout_goal?: number | null
          weight_unit?: string
        }
        Update: {
          auto_advance?: string
          count_warmup_in_volume?: boolean
          created_at?: string
          default_increment_kg?: number
          default_rest_seconds?: number
          difficulty_scale?: string
          habit_id?: string | null
          id?: string
          keep_screen_awake?: boolean
          one_rm_formula?: string
          progression_enabled?: boolean
          rest_sound_enabled?: boolean
          rest_vibration_enabled?: boolean
          unilateral_volume_rule?: string
          updated_at?: string
          user_id?: string
          week_starts_on?: number
          weekly_workout_goal?: number | null
          weight_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_preferences_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_preferences_habit_owner_fk"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      training_program_workouts: {
        Row: {
          created_at: string
          id: string
          label: string | null
          notes: string | null
          position: number
          program_id: string
          suggested_weekdays: number[] | null
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          position?: number
          program_id: string
          suggested_weekdays?: number[] | null
          updated_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          notes?: string | null
          position?: number
          program_id?: string
          suggested_weekdays?: number[] | null
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_program_workouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_program_workouts_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "training_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_programs: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          description: string | null
          duration_weeks: number | null
          ends_on: string | null
          goal: string
          icon: string | null
          id: string
          is_active: boolean
          level: string
          name: string
          notes: string | null
          position: number
          starts_on: string | null
          status: string
          updated_at: string
          user_id: string
          weekly_frequency: number | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          duration_weeks?: number | null
          ends_on?: string | null
          goal?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          level?: string
          name: string
          notes?: string | null
          position?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
          user_id: string
          weekly_frequency?: number | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          duration_weeks?: number | null
          ends_on?: string | null
          goal?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          level?: string
          name?: string
          notes?: string | null
          position?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          weekly_frequency?: number | null
        }
        Relationships: []
      }
      training_progression_rules: {
        Row: {
          created_at: string
          exercise_id: string | null
          id: string
          increment_kg: number | null
          increment_mode: string
          increment_percent: number | null
          is_active: boolean
          max_difficulty: string | null
          max_rir: number | null
          max_rpe: number | null
          min_sessions: number
          muscle_group_id: string | null
          name: string
          notes: string | null
          position: number
          require_all_working_sets: boolean
          require_no_failure: boolean
          require_top_of_range: boolean
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercise_id?: string | null
          id?: string
          increment_kg?: number | null
          increment_mode?: string
          increment_percent?: number | null
          is_active?: boolean
          max_difficulty?: string | null
          max_rir?: number | null
          max_rpe?: number | null
          min_sessions?: number
          muscle_group_id?: string | null
          name: string
          notes?: string | null
          position?: number
          require_all_working_sets?: boolean
          require_no_failure?: boolean
          require_top_of_range?: boolean
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercise_id?: string | null
          id?: string
          increment_kg?: number | null
          increment_mode?: string
          increment_percent?: number | null
          is_active?: boolean
          max_difficulty?: string | null
          max_rir?: number | null
          max_rpe?: number | null
          min_sessions?: number
          muscle_group_id?: string | null
          name?: string
          notes?: string | null
          position?: number
          require_all_working_sets?: boolean
          require_no_failure?: boolean
          require_top_of_range?: boolean
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progression_rules_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progression_rules_muscle_group_id_fkey"
            columns: ["muscle_group_id"]
            isOneToOne: false
            referencedRelation: "training_muscle_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      training_progression_suggestions: {
        Row: {
          basis: Json
          created_at: string
          decided_at: string | null
          decision_notes: string | null
          dedupe_key: string
          exercise_id: string | null
          exercise_name_snapshot: string
          id: string
          kind: string
          previous_value: number | null
          reason: string
          rule_id: string | null
          status: string
          suggested_on: string
          suggested_value: number
          unit: string
          updated_at: string
          user_id: string
          workout_exercise_id: string | null
          workout_id: string | null
          workout_name_snapshot: string | null
        }
        Insert: {
          basis?: Json
          created_at?: string
          decided_at?: string | null
          decision_notes?: string | null
          dedupe_key: string
          exercise_id?: string | null
          exercise_name_snapshot: string
          id?: string
          kind?: string
          previous_value?: number | null
          reason: string
          rule_id?: string | null
          status?: string
          suggested_on: string
          suggested_value: number
          unit: string
          updated_at?: string
          user_id: string
          workout_exercise_id?: string | null
          workout_id?: string | null
          workout_name_snapshot?: string | null
        }
        Update: {
          basis?: Json
          created_at?: string
          decided_at?: string | null
          decision_notes?: string | null
          dedupe_key?: string
          exercise_id?: string | null
          exercise_name_snapshot?: string
          id?: string
          kind?: string
          previous_value?: number | null
          reason?: string
          rule_id?: string | null
          status?: string
          suggested_on?: string
          suggested_value?: number
          unit?: string
          updated_at?: string
          user_id?: string
          workout_exercise_id?: string | null
          workout_id?: string | null
          workout_name_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_progression_suggestions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progression_suggestions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "training_progression_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progression_suggestions_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_workout_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progression_suggestions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "training_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_scheduled_workouts: {
        Row: {
          created_at: string
          entry_kind: string
          id: string
          notes: string | null
          original_date: string | null
          planned_duration_minutes: number | null
          planned_time: string | null
          position: number
          program_id: string | null
          reschedule_reason: string | null
          scheduled_date: string
          skip_reason: string | null
          source: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
          workout_id: string | null
        }
        Insert: {
          created_at?: string
          entry_kind?: string
          id?: string
          notes?: string | null
          original_date?: string | null
          planned_duration_minutes?: number | null
          planned_time?: string | null
          position?: number
          program_id?: string | null
          reschedule_reason?: string | null
          scheduled_date: string
          skip_reason?: string | null
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workout_id?: string | null
        }
        Update: {
          created_at?: string
          entry_kind?: string
          id?: string
          notes?: string | null
          original_date?: string | null
          planned_duration_minutes?: number | null
          planned_time?: string | null
          position?: number
          program_id?: string | null
          reschedule_reason?: string | null
          scheduled_date?: string
          skip_reason?: string | null
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_scheduled_workouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_scheduled_workouts_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "training_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_events: {
        Row: {
          created_at: string
          description: string | null
          id: string
          kind: string
          occurred_at: string
          payload: Json
          session_exercise_id: string | null
          session_id: string
          session_set_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          occurred_at?: string
          payload?: Json
          session_exercise_id?: string | null
          session_id: string
          session_set_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          payload?: Json
          session_exercise_id?: string | null
          session_id?: string
          session_set_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_session_events_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_events_session_set_id_fkey"
            columns: ["session_set_id"]
            isOneToOne: false
            referencedRelation: "training_session_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_exercises: {
        Row: {
          counts_in_volume: boolean
          created_at: string
          ended_at: string | null
          equipment_snapshot: string | null
          executed_position: number
          exercise_id: string | null
          exercise_name_snapshot: string
          id: string
          increment_kg: number | null
          is_extra: boolean
          is_warmup: boolean
          laterality: string
          movement_pattern_snapshot: string | null
          muscle_group_snapshot: string | null
          notes: string | null
          planned_position: number
          replaced_session_exercise_id: string | null
          rest_seconds: number | null
          session_id: string
          skip_reason: string | null
          started_at: string | null
          status: string
          superset_group: string | null
          technique: string | null
          tracking_type: string
          updated_at: string
          user_id: string
          workout_exercise_id: string | null
        }
        Insert: {
          counts_in_volume?: boolean
          created_at?: string
          ended_at?: string | null
          equipment_snapshot?: string | null
          executed_position?: number
          exercise_id?: string | null
          exercise_name_snapshot: string
          id?: string
          increment_kg?: number | null
          is_extra?: boolean
          is_warmup?: boolean
          laterality?: string
          movement_pattern_snapshot?: string | null
          muscle_group_snapshot?: string | null
          notes?: string | null
          planned_position?: number
          replaced_session_exercise_id?: string | null
          rest_seconds?: number | null
          session_id: string
          skip_reason?: string | null
          started_at?: string | null
          status?: string
          superset_group?: string | null
          technique?: string | null
          tracking_type: string
          updated_at?: string
          user_id: string
          workout_exercise_id?: string | null
        }
        Update: {
          counts_in_volume?: boolean
          created_at?: string
          ended_at?: string | null
          equipment_snapshot?: string | null
          executed_position?: number
          exercise_id?: string | null
          exercise_name_snapshot?: string
          id?: string
          increment_kg?: number | null
          is_extra?: boolean
          is_warmup?: boolean
          laterality?: string
          movement_pattern_snapshot?: string | null
          muscle_group_snapshot?: string | null
          notes?: string | null
          planned_position?: number
          replaced_session_exercise_id?: string | null
          rest_seconds?: number | null
          session_id?: string
          skip_reason?: string | null
          started_at?: string | null
          status?: string
          superset_group?: string | null
          technique?: string | null
          tracking_type?: string
          updated_at?: string
          user_id?: string
          workout_exercise_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_exercises_replaced_session_exercise_id_fkey"
            columns: ["replaced_session_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_exercises_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_pauses: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          reason: string | null
          session_id: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          session_id: string
          started_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string | null
          session_id?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_session_pauses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_rests: {
        Row: {
          actual_seconds: number | null
          adjustment_seconds: number
          created_at: string
          end_kind: string | null
          ended_at: string | null
          id: string
          planned_seconds: number
          session_exercise_id: string | null
          session_id: string
          session_set_id: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_seconds?: number | null
          adjustment_seconds?: number
          created_at?: string
          end_kind?: string | null
          ended_at?: string | null
          id?: string
          planned_seconds?: number
          session_exercise_id?: string | null
          session_id: string
          session_set_id?: string | null
          started_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_seconds?: number | null
          adjustment_seconds?: number
          created_at?: string
          end_kind?: string | null
          ended_at?: string | null
          id?: string
          planned_seconds?: number
          session_exercise_id?: string | null
          session_id?: string
          session_set_id?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_session_rests_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_rests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_rests_session_set_id_fkey"
            columns: ["session_set_id"]
            isOneToOne: false
            referencedRelation: "training_session_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_sets: {
        Row: {
          additional_weight_kg: number | null
          assistance_weight_kg: number | null
          calories: number | null
          client_mutation_id: string
          completed_at: string | null
          counts_in_volume: boolean
          created_at: string
          difficulty: string | null
          distance_m: number | null
          duration_seconds: number | null
          id: string
          incline_percent: number | null
          is_personal_record: boolean
          is_warmup: boolean
          notes: string | null
          planned_additional_weight_kg: number | null
          planned_assistance_weight_kg: number | null
          planned_distance_m: number | null
          planned_duration_seconds: number | null
          planned_reps_max: number | null
          planned_reps_min: number | null
          planned_rest_seconds: number | null
          planned_rir: number | null
          planned_rpe: number | null
          planned_weight_kg: number | null
          reps: number | null
          reps_left: number | null
          reps_right: number | null
          resistance_level: number | null
          rir: number | null
          rpe: number | null
          session_exercise_id: string
          session_id: string
          set_number: number
          set_type: string
          status: string
          updated_at: string
          user_id: string
          weight_kg: number | null
          weight_left_kg: number | null
          weight_right_kg: number | null
        }
        Insert: {
          additional_weight_kg?: number | null
          assistance_weight_kg?: number | null
          calories?: number | null
          client_mutation_id: string
          completed_at?: string | null
          counts_in_volume?: boolean
          created_at?: string
          difficulty?: string | null
          distance_m?: number | null
          duration_seconds?: number | null
          id?: string
          incline_percent?: number | null
          is_personal_record?: boolean
          is_warmup?: boolean
          notes?: string | null
          planned_additional_weight_kg?: number | null
          planned_assistance_weight_kg?: number | null
          planned_distance_m?: number | null
          planned_duration_seconds?: number | null
          planned_reps_max?: number | null
          planned_reps_min?: number | null
          planned_rest_seconds?: number | null
          planned_rir?: number | null
          planned_rpe?: number | null
          planned_weight_kg?: number | null
          reps?: number | null
          reps_left?: number | null
          reps_right?: number | null
          resistance_level?: number | null
          rir?: number | null
          rpe?: number | null
          session_exercise_id: string
          session_id: string
          set_number: number
          set_type?: string
          status?: string
          updated_at?: string
          user_id: string
          weight_kg?: number | null
          weight_left_kg?: number | null
          weight_right_kg?: number | null
        }
        Update: {
          additional_weight_kg?: number | null
          assistance_weight_kg?: number | null
          calories?: number | null
          client_mutation_id?: string
          completed_at?: string | null
          counts_in_volume?: boolean
          created_at?: string
          difficulty?: string | null
          distance_m?: number | null
          duration_seconds?: number | null
          id?: string
          incline_percent?: number | null
          is_personal_record?: boolean
          is_warmup?: boolean
          notes?: string | null
          planned_additional_weight_kg?: number | null
          planned_assistance_weight_kg?: number | null
          planned_distance_m?: number | null
          planned_duration_seconds?: number | null
          planned_reps_max?: number | null
          planned_reps_min?: number | null
          planned_rest_seconds?: number | null
          planned_rir?: number | null
          planned_rpe?: number | null
          planned_weight_kg?: number | null
          reps?: number | null
          reps_left?: number | null
          reps_right?: number | null
          resistance_level?: number | null
          rir?: number | null
          rpe?: number | null
          session_exercise_id?: string
          session_id?: string
          set_number?: number
          set_type?: string
          status?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
          weight_left_kg?: number | null
          weight_right_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_session_sets_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_session_substitutions: {
        Row: {
          created_at: string
          id: string
          new_session_exercise_id: string | null
          occurred_at: string
          original_exercise_id: string | null
          original_name_snapshot: string
          original_session_exercise_id: string | null
          reason: string
          reason_notes: string | null
          session_id: string
          substitute_exercise_id: string | null
          substitute_name_snapshot: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_session_exercise_id?: string | null
          occurred_at?: string
          original_exercise_id?: string | null
          original_name_snapshot: string
          original_session_exercise_id?: string | null
          reason?: string
          reason_notes?: string | null
          session_id: string
          substitute_exercise_id?: string | null
          substitute_name_snapshot: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_session_exercise_id?: string | null
          occurred_at?: string
          original_exercise_id?: string | null
          original_name_snapshot?: string
          original_session_exercise_id?: string | null
          reason?: string
          reason_notes?: string | null
          session_id?: string
          substitute_exercise_id?: string | null
          substitute_name_snapshot?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_session_substitution_original_session_exercise_id_fkey"
            columns: ["original_session_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_substitutions_new_session_exercise_id_fkey"
            columns: ["new_session_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_session_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_substitutions_original_exercise_id_fkey"
            columns: ["original_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_substitutions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_session_substitutions_substitute_exercise_id_fkey"
            columns: ["substitute_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          active_seconds: number | null
          auto_advance: string
          body_weight_kg: number | null
          created_at: string
          default_rest_seconds: number
          ended_at: string | null
          energy_level: number | null
          felt_pain: boolean
          id: string
          keep_screen_awake: boolean
          location_id: string | null
          mood_level: number | null
          notes: string | null
          origin_kind: string
          pain_notes: string | null
          pause_total_seconds: number | null
          perceived_effort: number | null
          pre_notes: string | null
          program_id: string | null
          program_name_snapshot: string | null
          rating: number | null
          rest_total_seconds: number | null
          scheduled_workout_id: string | null
          session_date: string
          sleep_quality: number | null
          soreness_level: number | null
          sound_enabled: boolean
          started_at: string | null
          status: string
          total_seconds: number | null
          updated_at: string
          user_id: string
          vibration_enabled: boolean
          weight_unit: string
          workout_id: string | null
          workout_name_snapshot: string
          workout_short_name_snapshot: string | null
          workout_snapshot: Json
          workout_version: number | null
        }
        Insert: {
          active_seconds?: number | null
          auto_advance?: string
          body_weight_kg?: number | null
          created_at?: string
          default_rest_seconds?: number
          ended_at?: string | null
          energy_level?: number | null
          felt_pain?: boolean
          id?: string
          keep_screen_awake?: boolean
          location_id?: string | null
          mood_level?: number | null
          notes?: string | null
          origin_kind?: string
          pain_notes?: string | null
          pause_total_seconds?: number | null
          perceived_effort?: number | null
          pre_notes?: string | null
          program_id?: string | null
          program_name_snapshot?: string | null
          rating?: number | null
          rest_total_seconds?: number | null
          scheduled_workout_id?: string | null
          session_date: string
          sleep_quality?: number | null
          soreness_level?: number | null
          sound_enabled?: boolean
          started_at?: string | null
          status?: string
          total_seconds?: number | null
          updated_at?: string
          user_id: string
          vibration_enabled?: boolean
          weight_unit?: string
          workout_id?: string | null
          workout_name_snapshot: string
          workout_short_name_snapshot?: string | null
          workout_snapshot?: Json
          workout_version?: number | null
        }
        Update: {
          active_seconds?: number | null
          auto_advance?: string
          body_weight_kg?: number | null
          created_at?: string
          default_rest_seconds?: number
          ended_at?: string | null
          energy_level?: number | null
          felt_pain?: boolean
          id?: string
          keep_screen_awake?: boolean
          location_id?: string | null
          mood_level?: number | null
          notes?: string | null
          origin_kind?: string
          pain_notes?: string | null
          pause_total_seconds?: number | null
          perceived_effort?: number | null
          pre_notes?: string | null
          program_id?: string | null
          program_name_snapshot?: string | null
          rating?: number | null
          rest_total_seconds?: number | null
          scheduled_workout_id?: string | null
          session_date?: string
          sleep_quality?: number | null
          soreness_level?: number | null
          sound_enabled?: boolean
          started_at?: string | null
          status?: string
          total_seconds?: number | null
          updated_at?: string
          user_id?: string
          vibration_enabled?: boolean
          weight_unit?: string
          workout_id?: string | null
          workout_name_snapshot?: string
          workout_short_name_snapshot?: string | null
          workout_snapshot?: Json
          workout_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "training_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_scheduled_workout_id_fkey"
            columns: ["scheduled_workout_id"]
            isOneToOne: false
            referencedRelation: "training_scheduled_workouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "training_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_workout_alternatives: {
        Row: {
          alternative_exercise_id: string
          created_at: string
          id: string
          note: string | null
          position: number
          updated_at: string
          user_id: string
          workout_exercise_id: string
        }
        Insert: {
          alternative_exercise_id: string
          created_at?: string
          id?: string
          note?: string | null
          position?: number
          updated_at?: string
          user_id: string
          workout_exercise_id: string
        }
        Update: {
          alternative_exercise_id?: string
          created_at?: string
          id?: string
          note?: string | null
          position?: number
          updated_at?: string
          user_id?: string
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_workout_alternatives_alternative_exercise_id_fkey"
            columns: ["alternative_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_workout_alternatives_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      training_workout_exercises: {
        Row: {
          counts_in_volume: boolean
          created_at: string
          default_sets: number
          exercise_id: string
          id: string
          increment_kg: number | null
          is_warmup: boolean
          notes: string | null
          planned_additional_weight_kg: number | null
          planned_assistance_weight_kg: number | null
          planned_weight_kg: number | null
          position: number
          rest_seconds: number | null
          set_type: string
          superset_group: string | null
          target_distance_m: number | null
          target_duration_seconds: number | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_rir: number | null
          target_rpe: number | null
          technique: string | null
          tempo: string | null
          updated_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          counts_in_volume?: boolean
          created_at?: string
          default_sets?: number
          exercise_id: string
          id?: string
          increment_kg?: number | null
          is_warmup?: boolean
          notes?: string | null
          planned_additional_weight_kg?: number | null
          planned_assistance_weight_kg?: number | null
          planned_weight_kg?: number | null
          position?: number
          rest_seconds?: number | null
          set_type?: string
          superset_group?: string | null
          target_distance_m?: number | null
          target_duration_seconds?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rir?: number | null
          target_rpe?: number | null
          technique?: string | null
          tempo?: string | null
          updated_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          counts_in_volume?: boolean
          created_at?: string
          default_sets?: number
          exercise_id?: string
          id?: string
          increment_kg?: number | null
          is_warmup?: boolean
          notes?: string | null
          planned_additional_weight_kg?: number | null
          planned_assistance_weight_kg?: number | null
          planned_weight_kg?: number | null
          position?: number
          rest_seconds?: number | null
          set_type?: string
          superset_group?: string | null
          target_distance_m?: number | null
          target_duration_seconds?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rir?: number | null
          target_rpe?: number | null
          technique?: string | null
          tempo?: string | null
          updated_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "training_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "training_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      training_workout_sets: {
        Row: {
          counts_in_volume: boolean
          created_at: string
          id: string
          is_warmup: boolean
          notes: string | null
          planned_additional_weight_kg: number | null
          planned_assistance_weight_kg: number | null
          planned_weight_kg: number | null
          rest_seconds: number | null
          set_number: number
          set_type: string
          target_distance_m: number | null
          target_duration_seconds: number | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_rir: number | null
          target_rpe: number | null
          updated_at: string
          user_id: string
          workout_exercise_id: string
        }
        Insert: {
          counts_in_volume?: boolean
          created_at?: string
          id?: string
          is_warmup?: boolean
          notes?: string | null
          planned_additional_weight_kg?: number | null
          planned_assistance_weight_kg?: number | null
          planned_weight_kg?: number | null
          rest_seconds?: number | null
          set_number: number
          set_type?: string
          target_distance_m?: number | null
          target_duration_seconds?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rir?: number | null
          target_rpe?: number | null
          updated_at?: string
          user_id: string
          workout_exercise_id: string
        }
        Update: {
          counts_in_volume?: boolean
          created_at?: string
          id?: string
          is_warmup?: boolean
          notes?: string | null
          planned_additional_weight_kg?: number | null
          planned_assistance_weight_kg?: number | null
          planned_weight_kg?: number | null
          rest_seconds?: number | null
          set_number?: number
          set_type?: string
          target_distance_m?: number | null
          target_duration_seconds?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rir?: number | null
          target_rpe?: number | null
          updated_at?: string
          user_id?: string
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_workout_sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "training_workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      training_workouts: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          description: string | null
          estimated_minutes: number | null
          goal: string
          icon: string | null
          id: string
          is_favorite: boolean
          name: string
          notes: string | null
          position: number
          program_id: string | null
          short_name: string | null
          status: string
          superseded_by: string | null
          updated_at: string
          user_id: string
          version: number
          version_group_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          goal?: string
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          notes?: string | null
          position?: number
          program_id?: string | null
          short_name?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          user_id: string
          version?: number
          version_group_id?: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          goal?: string
          icon?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          notes?: string | null
          position?: number
          program_id?: string | null
          short_name?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          user_id?: string
          version?: number
          version_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_workouts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_workouts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "training_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_installments: {
        Row: {
          card_id: string | null
          created_at: string
          data_competencia: string | null
          id: string
          numero: number
          parent_transaction_id: string
          statement_id: string | null
          status: string
          total_parcelas: number
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          data_competencia?: string | null
          id?: string
          numero: number
          parent_transaction_id: string
          statement_id?: string | null
          status?: string
          total_parcelas: number
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          card_id?: string | null
          created_at?: string
          data_competencia?: string | null
          id?: string
          numero?: number
          parent_transaction_id?: string
          statement_id?: string | null
          status?: string
          total_parcelas?: number
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_installments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_installments_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_installments_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_installments_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements_with_total"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          card_id: string | null
          category_id: string | null
          classificacao: string
          competence_date: string
          created_at: string
          description: string | null
          id: string
          notes: string | null
          parcelado: boolean
          payment_method: string | null
          purchase_date: string
          qtd_parcelas: number | null
          recurring_id: string | null
          statement_id: string | null
          status: string
          subcategory_id: string | null
          tags: string[]
          transfer_account_id: string | null
          transfer_group_id: string | null
          type: string
          updated_at: string
          user_id: string
          valor_pessoal: number | null
          valor_total: number | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          card_id?: string | null
          category_id?: string | null
          classificacao?: string
          competence_date?: string
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          parcelado?: boolean
          payment_method?: string | null
          purchase_date?: string
          qtd_parcelas?: number | null
          recurring_id?: string | null
          statement_id?: string | null
          status?: string
          subcategory_id?: string | null
          tags?: string[]
          transfer_account_id?: string | null
          transfer_group_id?: string | null
          type: string
          updated_at?: string
          user_id: string
          valor_pessoal?: number | null
          valor_total?: number | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          card_id?: string | null
          category_id?: string | null
          classificacao?: string
          competence_date?: string
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          parcelado?: boolean
          payment_method?: string | null
          purchase_date?: string
          qtd_parcelas?: number | null
          recurring_id?: string | null
          statement_id?: string | null
          status?: string
          subcategory_id?: string | null
          tags?: string[]
          transfer_account_id?: string | null
          transfer_group_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          valor_pessoal?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts_with_balance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements_with_total"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_account_id_fkey"
            columns: ["transfer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts_with_balance"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      accounts_with_balance: {
        Row: {
          bank: string | null
          color: string | null
          created_at: string | null
          current_balance: number | null
          id: string | null
          initial_balance: number | null
          is_active: boolean | null
          name: string | null
          notes: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bank?: string | null
          color?: string | null
          created_at?: string | null
          current_balance?: never
          id?: string | null
          initial_balance?: number | null
          is_active?: boolean | null
          name?: string | null
          notes?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bank?: string | null
          color?: string | null
          created_at?: string | null
          current_balance?: never
          id?: string | null
          initial_balance?: number | null
          is_active?: boolean | null
          name?: string | null
          notes?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      card_statements_with_total: {
        Row: {
          card_id: string | null
          competencia: string | null
          created_at: string | null
          data_fechamento: string | null
          data_vencimento: string | null
          id: string | null
          itens: number | null
          observacoes: string | null
          pago_em: string | null
          status: string | null
          total_atual: number | null
          total_calculado: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_statements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_foods_view: {
        Row: {
          acucares_totais: number | null
          ag_saturados: number | null
          alternative_name: string | null
          archived_at: string | null
          barcode: string | null
          base_quantity: number | null
          base_unit: string | null
          brand: string | null
          carboidrato: number | null
          category_id: string | null
          created_at: string | null
          data_quality: string | null
          edible_portion_percent: number | null
          energia_kcal: number | null
          fibra: number | null
          food_type: string | null
          id: string | null
          is_system_food: boolean | null
          is_verified: boolean | null
          last_verified_at: string | null
          lipidios: number | null
          name: string | null
          notes: string | null
          nutrients_available: number | null
          origin_food_id: string | null
          preparation_state: string | null
          proteina: number | null
          sodio: number | null
          source_food_code: string | null
          source_id: string | null
          source_version: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_foods_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_foods_origin_food_id_fkey"
            columns: ["origin_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_foods_origin_food_id_fkey"
            columns: ["origin_food_id"]
            isOneToOne: false
            referencedRelation: "nutrition_foods_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_foods_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "nutrition_food_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_balance: { Args: { p_account_id: string }; Returns: number }
      ai_agent_is_allowed: { Args: { p_agent_id: string }; Returns: boolean }
      ai_begin_chat_run: {
        Args: {
          p_agent_id: string
          p_conversation_id: string
          p_prompt_version: string
          p_reservation_rate_version: string
          p_reservation_ttl_seconds?: number
          p_reserved_cost: number
          p_selected_model: string
          p_selected_provider: string
          p_title?: string
          p_user_text: string
        }
        Returns: {
          assistant_message_id: string
          conversation_id: string
          correlation_id: string
          run_id: string
          user_message_id: string
        }[]
      }
      ai_reconcile_abandoned_runs: {
        Args: { p_limit?: number }
        Returns: number
      }
      seed_default_categories: { Args: never; Returns: number }
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
