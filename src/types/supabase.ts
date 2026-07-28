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
    }
    Functions: {
      account_balance: { Args: { p_account_id: string }; Returns: number }
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
