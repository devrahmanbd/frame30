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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          cart_token: string
          created_at: string
          currency_code: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          last_seen_at: string
          lines: Json
          merchant_id: string
          recovered_order_id: string | null
          recovery_sent_at: string | null
          status: Database["public"]["Enums"]["abandoned_cart_status"]
          subtotal_minor_int: number
          updated_at: string
        }
        Insert: {
          cart_token: string
          created_at?: string
          currency_code?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          last_seen_at?: string
          lines?: Json
          merchant_id: string
          recovered_order_id?: string | null
          recovery_sent_at?: string | null
          status?: Database["public"]["Enums"]["abandoned_cart_status"]
          subtotal_minor_int?: number
          updated_at?: string
        }
        Update: {
          cart_token?: string
          created_at?: string
          currency_code?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          last_seen_at?: string
          lines?: Json
          merchant_id?: string
          recovered_order_id?: string | null
          recovery_sent_at?: string | null
          status?: Database["public"]["Enums"]["abandoned_cart_status"]
          subtotal_minor_int?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_recovered_order_id_fkey"
            columns: ["recovered_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor: string | null
          changed: Json
          created_at: string
          id: number
          merchant_id: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor?: string | null
          changed?: Json
          created_at?: string
          id?: never
          merchant_id: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor?: string | null
          changed?: Json
          created_at?: string
          id?: never
          merchant_id?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          channel: Database["public"]["Enums"]["ai_channel"]
          created_at: string
          first_message_at: string
          id: string
          last_message_at: string
          merchant_id: string
          order_id: string | null
          order_number: string | null
          phone_hash: string | null
          rating: number | null
          status: Database["public"]["Enums"]["ai_conversation_status"]
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["ai_channel"]
          created_at?: string
          first_message_at?: string
          id?: string
          last_message_at?: string
          merchant_id: string
          order_id?: string | null
          order_number?: string | null
          phone_hash?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["ai_conversation_status"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["ai_channel"]
          created_at?: string
          first_message_at?: string
          id?: string
          last_message_at?: string
          merchant_id?: string
          order_id?: string | null
          order_number?: string | null
          phone_hash?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["ai_conversation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          flagged: boolean
          id: string
          merchant_id: string
          role: Database["public"]["Enums"]["ai_message_role"]
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          flagged?: boolean
          id?: string
          merchant_id: string
          role: Database["public"]["Enums"]["ai_message_role"]
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          flagged?: boolean
          id?: string
          merchant_id?: string
          role?: Database["public"]["Enums"]["ai_message_role"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_events: {
        Row: {
          action: string
          actor: string | null
          api_key_id: string | null
          created_at: string
          id: string
          merchant_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor?: string | null
          api_key_id?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor?: string | null
          api_key_id?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "api_key_events_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_key_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          env: Database["public"]["Enums"]["api_key_env"]
          id: string
          key_hash: string
          last_used_at: string | null
          merchant_id: string
          name: string
          prefix: string
          revoked_at: string | null
          scopes: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          env?: Database["public"]["Enums"]["api_key_env"]
          id?: string
          key_hash: string
          last_used_at?: string | null
          merchant_id: string
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          env?: Database["public"]["Enums"]["api_key_env"]
          id?: string
          key_hash?: string
          last_used_at?: string | null
          merchant_id?: string
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          merchant_id: string
          payload: Json
          resource_action: string
          resource_id: string | null
          resource_type: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          submitted_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          merchant_id: string
          payload?: Json
          resource_action: string
          resource_id?: string | null
          resource_type: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          merchant_id?: string
          payload?: Json
          resource_action?: string
          resource_id?: string | null
          resource_type?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          body: string
          canonical: string | null
          category_id: string | null
          cover_image_url: string | null
          cover_media_id: string | null
          created_at: string
          deleted_at: string | null
          excerpt: string | null
          id: string
          merchant_id: string
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          robots: string
          scheduled_for: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          title_en: string | null
          updated_at: string
          views: number
        }
        Insert: {
          body?: string
          canonical?: string | null
          category_id?: string | null
          cover_image_url?: string | null
          cover_media_id?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          merchant_id: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          robots?: string
          scheduled_for?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          title_en?: string | null
          updated_at?: string
          views?: number
        }
        Update: {
          body?: string
          canonical?: string | null
          category_id?: string | null
          cover_image_url?: string | null
          cover_media_id?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          merchant_id?: string
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          robots?: string
          scheduled_for?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          title_en?: string | null
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_events: {
        Row: {
          created_at: string
          detail: Json
          email_hash: string | null
          event: string
          id: string
          ip_hash: string | null
          outcome: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          email_hash?: string | null
          event: string
          id?: string
          ip_hash?: string | null
          outcome: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          email_hash?: string | null
          event?: string
          id?: string
          ip_hash?: string | null
          outcome?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_sessions: {
        Row: {
          aal: string | null
          created_at: string
          device: string | null
          id: string
          ip_hash: string | null
          last_seen_at: string
          revoked_at: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          aal?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          aal?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_dunning_attempts: {
        Row: {
          channel: string
          created_at: string
          id: string
          idempotency_key: string
          invoice_id: string
          merchant_id: string
          outcome: string
          stage: number
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          idempotency_key: string
          invoice_id: string
          merchant_id: string
          outcome?: string
          stage: number
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          merchant_id?: string
          outcome?: string
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_dunning_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_dunning_attempts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          actor: string | null
          created_at: string
          event_type: string
          id: string
          merchant_id: string
          payload: Json
        }
        Insert: {
          actor?: string | null
          created_at?: string
          event_type: string
          id?: string
          merchant_id: string
          payload?: Json
        }
        Update: {
          actor?: string | null
          created_at?: string
          event_type?: string
          id?: string
          merchant_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          merchant_id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          merchant_id: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          merchant_id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          merchant_id: string
          quantity: number
          variant_id: string
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          merchant_id: string
          quantity?: number
          variant_id: string
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          merchant_id?: string
          quantity?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "product_bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          error: string | null
          id: string
          merchant_id: string
          sent_at: string | null
          status: string
          subscriber_id: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          error?: string | null
          id?: string
          merchant_id: string
          sent_at?: string | null
          status?: string
          subscriber_id?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          error?: string | null
          id?: string
          merchant_id?: string
          sent_at?: string | null
          status?: string
          subscriber_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          body_template: string
          created_at: string
          deleted_at: string | null
          failed_count: number
          id: string
          merchant_id: string
          name: string
          scheduled_for: string | null
          segment_id: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_template?: string
          created_at?: string
          deleted_at?: string | null
          failed_count?: number
          id?: string
          merchant_id: string
          name: string
          scheduled_for?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          deleted_at?: string | null
          failed_count?: number
          id?: string
          merchant_id?: string
          name?: string
          scheduled_for?: string | null
          segment_id?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_shipments: {
        Row: {
          address_line: string | null
          attempt_count: number
          awb: string | null
          cancelled_at: string | null
          carrier_code: string
          carrier_id: string | null
          city: string | null
          cod_amount_minor_int: number
          created_at: string
          currency_code: string
          delivered_at: string | null
          id: string
          is_cod: boolean
          last_event_at: string | null
          merchant_id: string
          order_id: string | null
          pickup_slot_end: string | null
          pickup_slot_start: string | null
          pos_order_id: string | null
          pudo_point: string | null
          quote_id: string | null
          quote_stale: boolean
          rate_minor_int: number
          signature_text: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_token: string
          tracking_url: string | null
          updated_at: string
          weight_grams: number
          zone_id: string | null
        }
        Insert: {
          address_line?: string | null
          attempt_count?: number
          awb?: string | null
          cancelled_at?: string | null
          carrier_code: string
          carrier_id?: string | null
          city?: string | null
          cod_amount_minor_int?: number
          created_at?: string
          currency_code?: string
          delivered_at?: string | null
          id?: string
          is_cod?: boolean
          last_event_at?: string | null
          merchant_id: string
          order_id?: string | null
          pickup_slot_end?: string | null
          pickup_slot_start?: string | null
          pos_order_id?: string | null
          pudo_point?: string | null
          quote_id?: string | null
          quote_stale?: boolean
          rate_minor_int?: number
          signature_text?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_token?: string
          tracking_url?: string | null
          updated_at?: string
          weight_grams?: number
          zone_id?: string | null
        }
        Update: {
          address_line?: string | null
          attempt_count?: number
          awb?: string | null
          cancelled_at?: string | null
          carrier_code?: string
          carrier_id?: string | null
          city?: string | null
          cod_amount_minor_int?: number
          created_at?: string
          currency_code?: string
          delivered_at?: string | null
          id?: string
          is_cod?: boolean
          last_event_at?: string | null
          merchant_id?: string
          order_id?: string | null
          pickup_slot_end?: string | null
          pickup_slot_start?: string | null
          pos_order_id?: string | null
          pudo_point?: string | null
          quote_id?: string | null
          quote_stale?: boolean
          rate_minor_int?: number
          signature_text?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_token?: string
          tracking_url?: string | null
          updated_at?: string
          weight_grams?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_shipments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_shipments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_shipments_pos_order_id_fkey"
            columns: ["pos_order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_shipments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "shipment_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_shipments_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          adapter: string
          api_mode: string
          code: string
          config: Json
          created_at: string
          cutoff_hour: number
          deleted_at: string | null
          enabled: boolean
          id: string
          merchant_id: string
          name: string
          sort_order: number
          supports_pickup: boolean
          supports_pudo: boolean
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          adapter?: string
          api_mode?: string
          code: string
          config?: Json
          created_at?: string
          cutoff_hour?: number
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          merchant_id: string
          name: string
          sort_order?: number
          supports_pickup?: boolean
          supports_pudo?: boolean
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          adapter?: string
          api_mode?: string
          code?: string
          config?: Json
          created_at?: string
          cutoff_hour?: number
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          merchant_id?: string
          name?: string
          sort_order?: number
          supports_pickup?: boolean
          supports_pudo?: boolean
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_jobs: {
        Row: {
          applied_at: string | null
          applied_summary: Json | null
          created_at: string
          created_by: string | null
          diff: Json
          error: string | null
          file_name: string
          id: string
          merchant_id: string
          row_count: number
          source_hash: string
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_summary?: Json | null
          created_at?: string
          created_by?: string | null
          diff?: Json
          error?: string | null
          file_name?: string
          id?: string
          merchant_id: string
          row_count?: number
          source_hash: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_summary?: Json | null
          created_at?: string
          created_by?: string | null
          diff?: Json
          error?: string | null
          file_name?: string
          id?: string
          merchant_id?: string
          row_count?: number
          source_hash?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_jobs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          merchant_id: string
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          merchant_id: string
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          merchant_id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_intent_events: {
        Row: {
          created_at: string
          detail: Json
          from_status:
            | Database["public"]["Enums"]["charge_intent_status"]
            | null
          id: string
          intent_id: string
          merchant_id: string
          to_status: Database["public"]["Enums"]["charge_intent_status"]
        }
        Insert: {
          created_at?: string
          detail?: Json
          from_status?:
            | Database["public"]["Enums"]["charge_intent_status"]
            | null
          id?: string
          intent_id: string
          merchant_id: string
          to_status: Database["public"]["Enums"]["charge_intent_status"]
        }
        Update: {
          created_at?: string
          detail?: Json
          from_status?:
            | Database["public"]["Enums"]["charge_intent_status"]
            | null
          id?: string
          intent_id?: string
          merchant_id?: string
          to_status?: Database["public"]["Enums"]["charge_intent_status"]
        }
        Relationships: [
          {
            foreignKeyName: "charge_intent_events_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "charge_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_intent_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      charge_intents: {
        Row: {
          amount_minor_int: number
          attempt: number
          created_at: string
          currency_code: string
          expires_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider_reference: string | null
          return_nonce: string
          settled_at: string | null
          status: Database["public"]["Enums"]["charge_intent_status"]
          updated_at: string
        }
        Insert: {
          amount_minor_int: number
          attempt?: number
          created_at?: string
          currency_code?: string
          expires_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider_reference?: string | null
          return_nonce?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["charge_intent_status"]
          updated_at?: string
        }
        Update: {
          amount_minor_int?: number
          attempt?: number
          created_at?: string
          currency_code?: string
          expires_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          merchant_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          provider_reference?: string | null
          return_nonce?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["charge_intent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_intents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_reconciliations: {
        Row: {
          carrier_code: string | null
          cleared_at: string | null
          cleared_by: string | null
          collected_minor_int: number
          created_at: string
          currency_code: string
          expected_minor_int: number
          id: string
          merchant_id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["cod_recon_status"]
          updated_at: string
          variance_minor_int: number
        }
        Insert: {
          carrier_code?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          collected_minor_int: number
          created_at?: string
          currency_code?: string
          expected_minor_int: number
          id?: string
          merchant_id: string
          note?: string | null
          order_id: string
          status?: Database["public"]["Enums"]["cod_recon_status"]
          updated_at?: string
          variance_minor_int: number
        }
        Update: {
          carrier_code?: string | null
          cleared_at?: string | null
          cleared_by?: string | null
          collected_minor_int?: number
          created_at?: string
          currency_code?: string
          expected_minor_int?: number
          id?: string
          merchant_id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["cod_recon_status"]
          updated_at?: string
          variance_minor_int?: number
        }
        Relationships: [
          {
            foreignKeyName: "cod_reconciliations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_reconciliations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cod_settlements: {
        Row: {
          carrier_code: string
          created_at: string
          currency_code: string
          expected_minor_int: number
          id: string
          merchant_id: string
          note: string | null
          order_id: string | null
          reference: string | null
          reported_minor_int: number | null
          resolved_at: string | null
          resolved_by: string | null
          shipment_id: string
          state: Database["public"]["Enums"]["cod_settlement_state"]
          updated_at: string
        }
        Insert: {
          carrier_code: string
          created_at?: string
          currency_code?: string
          expected_minor_int?: number
          id?: string
          merchant_id: string
          note?: string | null
          order_id?: string | null
          reference?: string | null
          reported_minor_int?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          shipment_id: string
          state?: Database["public"]["Enums"]["cod_settlement_state"]
          updated_at?: string
        }
        Update: {
          carrier_code?: string
          created_at?: string
          currency_code?: string
          expected_minor_int?: number
          id?: string
          merchant_id?: string
          note?: string | null
          order_id?: string | null
          reference?: string | null
          reported_minor_int?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          shipment_id?: string
          state?: Database["public"]["Enums"]["cod_settlement_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cod_settlements_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_settlements_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "carrier_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          merchant_id: string
          position: number
          product_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          merchant_id: string
          position?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          merchant_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_published: boolean
          is_smart: boolean
          merchant_id: string
          name: string
          position: number
          rules: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          is_smart?: boolean
          merchant_id: string
          name: string
          position?: number
          rules?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          is_smart?: boolean
          merchant_id?: string
          name?: string
          position?: number
          rules?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_events: {
        Row: {
          actor: string | null
          channel: Database["public"]["Enums"]["consent_channel"]
          created_at: string
          customer_id: string | null
          granted: boolean
          id: string
          merchant_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          reason: string | null
          source: string
          subject_hash: string | null
          subscriber_id: string | null
        }
        Insert: {
          actor?: string | null
          channel: Database["public"]["Enums"]["consent_channel"]
          created_at?: string
          customer_id?: string | null
          granted: boolean
          id?: string
          merchant_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          reason?: string | null
          source: string
          subject_hash?: string | null
          subscriber_id?: string | null
        }
        Update: {
          actor?: string | null
          channel?: Database["public"]["Enums"]["consent_channel"]
          created_at?: string
          customer_id?: string | null
          granted?: boolean
          id?: string
          merchant_id?: string
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          reason?: string | null
          source?: string
          subject_hash?: string | null
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          amount_minor_int: number
          coupon_id: string
          created_at: string
          currency_code: string
          customer_key: string
          id: string
          merchant_id: string
          order_id: string | null
        }
        Insert: {
          amount_minor_int?: number
          coupon_id: string
          created_at?: string
          currency_code?: string
          customer_key: string
          id?: string
          merchant_id: string
          order_id?: string | null
        }
        Update: {
          amount_minor_int?: number
          coupon_id?: string
          created_at?: string
          currency_code?: string
          customer_key?: string
          id?: string
          merchant_id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          allow_combine: boolean
          amount_minor_int: number
          batch_label: string | null
          buy_quantity: number
          code: string
          created_at: string
          currency_code: string
          deleted_at: string | null
          expires_at: string | null
          get_quantity: number
          id: string
          max_discount_minor_int: number | null
          merchant_id: string
          min_subtotal_minor_int: number
          one_per_order: boolean
          per_customer_limit: number | null
          percent_off: number
          priority: number
          redeemed_count: number
          starts_at: string | null
          status: Database["public"]["Enums"]["coupon_status"]
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          allow_combine?: boolean
          amount_minor_int?: number
          batch_label?: string | null
          buy_quantity?: number
          code: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          expires_at?: string | null
          get_quantity?: number
          id?: string
          max_discount_minor_int?: number | null
          merchant_id: string
          min_subtotal_minor_int?: number
          one_per_order?: boolean
          per_customer_limit?: number | null
          percent_off?: number
          priority?: number
          redeemed_count?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"]
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          allow_combine?: boolean
          amount_minor_int?: number
          batch_label?: string | null
          buy_quantity?: number
          code?: string
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          expires_at?: string | null
          get_quantity?: number
          id?: string
          max_discount_minor_int?: number | null
          merchant_id?: string
          min_subtotal_minor_int?: number
          one_per_order?: boolean
          per_customer_limit?: number | null
          percent_off?: number
          priority?: number
          redeemed_count?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"]
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_labels: {
        Row: {
          created_at: string
          id: string
          label_url: string
          merchant_id: string
          printable: boolean
          shipment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label_url: string
          merchant_id: string
          printable?: boolean
          shipment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label_url?: string
          merchant_id?: string
          printable?: boolean
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_labels_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_labels_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "carrier_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_webhook_events: {
        Row: {
          attempts: number
          carrier_code: string
          event_id: string
          id: string
          merchant_id: string | null
          next_attempt_at: string | null
          payload: Json
          processed_at: string | null
          reason: string | null
          received_at: string
          shipment_id: string | null
          status: Database["public"]["Enums"]["courier_event_status"]
        }
        Insert: {
          attempts?: number
          carrier_code: string
          event_id: string
          id?: string
          merchant_id?: string | null
          next_attempt_at?: string | null
          payload?: Json
          processed_at?: string | null
          reason?: string | null
          received_at?: string
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["courier_event_status"]
        }
        Update: {
          attempts?: number
          carrier_code?: string
          event_id?: string
          id?: string
          merchant_id?: string | null
          next_attempt_at?: string | null
          payload?: Json
          processed_at?: string | null
          reason?: string | null
          received_at?: string
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["courier_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "courier_webhook_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_webhook_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "carrier_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_type: Database["public"]["Enums"]["address_type"]
          city: string
          created_at: string
          customer_id: string
          deleted_at: string | null
          district: string
          full_name: string
          id: string
          is_default: boolean
          label: string
          line1: string
          line2: string | null
          merchant_id: string
          phone: string
          postcode: string | null
          updated_at: string
        }
        Insert: {
          address_type?: Database["public"]["Enums"]["address_type"]
          city: string
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          district: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string
          line1: string
          line2?: string | null
          merchant_id: string
          phone: string
          postcode?: string | null
          updated_at?: string
        }
        Update: {
          address_type?: Database["public"]["Enums"]["address_type"]
          city?: string
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          district?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          line1?: string
          line2?: string | null
          merchant_id?: string
          phone?: string
          postcode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          channel: Database["public"]["Enums"]["consent_channel"]
          customer_id: string | null
          granted: boolean
          granted_at: string | null
          id: string
          merchant_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          session_token: string | null
          source: string
          subject_hash: string | null
          subscriber_id: string | null
          updated_at: string
          version: number
          withdrawn_at: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["consent_channel"]
          customer_id?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          merchant_id: string
          purpose: Database["public"]["Enums"]["consent_purpose"]
          session_token?: string | null
          source?: string
          subject_hash?: string | null
          subscriber_id?: string | null
          updated_at?: string
          version?: number
          withdrawn_at?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["consent_channel"]
          customer_id?: string | null
          granted?: boolean
          granted_at?: string | null
          id?: string
          merchant_id?: string
          purpose?: Database["public"]["Enums"]["consent_purpose"]
          session_token?: string | null
          source?: string
          subject_hash?: string | null
          subscriber_id?: string | null
          updated_at?: string
          version?: number
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wishlist_items: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          merchant_id: string
          product_variant_id: string
          stock_alert: boolean
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          merchant_id: string
          product_variant_id: string
          stock_alert?: boolean
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          merchant_id?: string
          product_variant_id?: string
          stock_alert?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "customer_wishlist_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wishlist_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wishlist_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_uid: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          locale: string
          merchant_id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          auth_uid: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          locale?: string
          merchant_id: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          auth_uid?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          locale?: string
          merchant_id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          carrier_event_id: string | null
          created_at: string
          event_type: string
          id: string
          merchant_id: string
          occurred_at: string
          payload: Json
          shipment_id: string
          source: string
        }
        Insert: {
          carrier_event_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          merchant_id: string
          occurred_at?: string
          payload?: Json
          shipment_id: string
          source?: string
        }
        Update: {
          carrier_event_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          merchant_id?: string
          occurred_at?: string
          payload?: Json
          shipment_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "carrier_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_assets: {
        Row: {
          content_type: string
          created_at: string
          deleted_at: string | null
          expiry_hours: number
          file_name: string
          id: string
          max_downloads: number
          merchant_id: string
          product_id: string
          size_bytes: number
          storage_path: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          expiry_hours?: number
          file_name: string
          id?: string
          max_downloads?: number
          merchant_id: string
          product_id: string
          size_bytes?: number
          storage_path: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          expiry_hours?: number
          file_name?: string
          id?: string
          max_downloads?: number
          merchant_id?: string
          product_id?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_assets_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_assets_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_grants: {
        Row: {
          asset_id: string
          created_at: string
          customer_id: string | null
          downloads_used: number
          expires_at: string
          id: string
          last_download_at: string | null
          max_downloads: number
          merchant_id: string
          order_id: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          customer_id?: string | null
          downloads_used?: number
          expires_at: string
          id?: string
          last_download_at?: string | null
          max_downloads?: number
          merchant_id: string
          order_id?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          customer_id?: string | null
          downloads_used?: number
          expires_at?: string
          id?: string
          last_download_at?: string | null
          max_downloads?: number
          merchant_id?: string
          order_id?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_grants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "digital_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_grants_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_grants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_grants_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_events: {
        Row: {
          actor: string | null
          created_at: string
          dispute_id: string
          from_status: Database["public"]["Enums"]["dispute_status"] | null
          id: string
          merchant_id: string
          note: string | null
          to_status: Database["public"]["Enums"]["dispute_status"]
        }
        Insert: {
          actor?: string | null
          created_at?: string
          dispute_id: string
          from_status?: Database["public"]["Enums"]["dispute_status"] | null
          id?: string
          merchant_id: string
          note?: string | null
          to_status: Database["public"]["Enums"]["dispute_status"]
        }
        Update: {
          actor?: string | null
          created_at?: string
          dispute_id?: string
          from_status?: Database["public"]["Enums"]["dispute_status"] | null
          id?: string
          merchant_id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["dispute_status"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_events_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount_minor_int: number
          created_at: string
          currency_code: string
          due_at: string | null
          evidence: string | null
          id: string
          merchant_id: string
          order_id: string
          provider: string | null
          provider_reference: string | null
          reason: string
          reference: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          due_at?: string | null
          evidence?: string | null
          id?: string
          merchant_id: string
          order_id: string
          provider?: string | null
          provider_reference?: string | null
          reason: string
          reference: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          due_at?: string | null
          evidence?: string | null
          id?: string
          merchant_id?: string
          order_id?: string
          provider?: string | null
          provider_reference?: string | null
          reason?: string
          reference?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          attempts: number
          created_at: string
          downloaded_at: string | null
          error: string | null
          expires_at: string | null
          filters: Json
          finished_at: string | null
          format: string
          id: string
          merchant_id: string
          object_type: Database["public"]["Enums"]["export_object_type"]
          range_end: string | null
          range_start: string | null
          requested_by: string | null
          schema_version: number
          signed_url: string | null
          signed_url_expires_at: string | null
          size_bytes: number
          started_at: string | null
          status: Database["public"]["Enums"]["export_job_status"]
          storage_path: string | null
          total_rows: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          downloaded_at?: string | null
          error?: string | null
          expires_at?: string | null
          filters?: Json
          finished_at?: string | null
          format?: string
          id?: string
          merchant_id: string
          object_type: Database["public"]["Enums"]["export_object_type"]
          range_end?: string | null
          range_start?: string | null
          requested_by?: string | null
          schema_version?: number
          signed_url?: string | null
          signed_url_expires_at?: string | null
          size_bytes?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_job_status"]
          storage_path?: string | null
          total_rows?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          downloaded_at?: string | null
          error?: string | null
          expires_at?: string | null
          filters?: Json
          finished_at?: string | null
          format?: string
          id?: string
          merchant_id?: string
          object_type?: Database["public"]["Enums"]["export_object_type"]
          range_end?: string | null
          range_start?: string | null
          requested_by?: string | null
          schema_version?: number
          signed_url?: string | null
          signed_url_expires_at?: string | null
          size_bytes?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_job_status"]
          storage_path?: string | null
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          consent_granted: boolean
          created_at: string
          form_id: string
          id: string
          merchant_id: string
          payload: Json
          status: string
        }
        Insert: {
          consent_granted?: boolean
          created_at?: string
          form_id: string
          id?: string
          merchant_id: string
          payload?: Json
          status?: string
        }
        Update: {
          consent_granted?: boolean
          created_at?: string
          form_id?: string
          id?: string
          merchant_id?: string
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "storefront_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_assessments: {
        Row: {
          action: string
          context: Json
          created_at: string
          decisive_code: string | null
          engine_version: number
          id: string
          merchant_id: string
          order_id: string | null
          score: number
          signals: Json
          subject_hash: string
        }
        Insert: {
          action?: string
          context?: Json
          created_at?: string
          decisive_code?: string | null
          engine_version?: number
          id?: string
          merchant_id: string
          order_id?: string | null
          score?: number
          signals?: Json
          subject_hash: string
        }
        Update: {
          action?: string
          context?: Json
          created_at?: string
          decisive_code?: string | null
          engine_version?: number
          id?: string
          merchant_id?: string
          order_id?: string | null
          score?: number
          signals?: Json
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_assessments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_assessments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_audit: {
        Row: {
          action: string
          actor: string | null
          case_id: string | null
          created_at: string
          id: string
          merchant_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fraud_audit_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "fraud_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_audit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_blacklist: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["fraud_blacklist_kind"]
          merchant_id: string
          reason: string | null
          updated_at: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["fraud_blacklist_kind"]
          merchant_id: string
          reason?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fraud_blacklist_kind"]
          merchant_id?: string
          reason?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_blacklist_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_cases: {
        Row: {
          amount_minor_int: number
          created_at: string
          currency_code: string
          customer_phone: string
          decision_at: string | null
          decision_by: string | null
          decision_note: string | null
          id: string
          merchant_id: string
          order_id: string | null
          order_number: string
          reason: Json
          risk_score: number
          signals: Json
          status: Database["public"]["Enums"]["fraud_case_status"]
          updated_at: string
        }
        Insert: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          customer_phone?: string
          decision_at?: string | null
          decision_by?: string | null
          decision_note?: string | null
          id?: string
          merchant_id: string
          order_id?: string | null
          order_number?: string
          reason?: Json
          risk_score?: number
          signals?: Json
          status?: Database["public"]["Enums"]["fraud_case_status"]
          updated_at?: string
        }
        Update: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          customer_phone?: string
          decision_at?: string | null
          decision_by?: string | null
          decision_note?: string | null
          id?: string
          merchant_id?: string
          order_id?: string | null
          order_number?: string
          reason?: Json
          risk_score?: number
          signals?: Json
          status?: Database["public"]["Enums"]["fraud_case_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_cases_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_cases_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_rules: {
        Row: {
          action: string
          code: string
          created_at: string
          deleted_at: string | null
          enabled: boolean
          id: string
          merchant_id: string
          params: Json
          precedence: number
          updated_at: string
        }
        Insert: {
          action?: string
          code: string
          created_at?: string
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          merchant_id: string
          params?: Json
          precedence?: number
          updated_at?: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          merchant_id?: string
          params?: Json
          precedence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfilment_items: {
        Row: {
          created_at: string
          fulfilment_id: string
          id: string
          merchant_id: string
          order_item_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          fulfilment_id: string
          id?: string
          merchant_id: string
          order_item_id: string
          quantity: number
        }
        Update: {
          created_at?: string
          fulfilment_id?: string
          id?: string
          merchant_id?: string
          order_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fulfilment_items_fulfilment_id_fkey"
            columns: ["fulfilment_id"]
            isOneToOne: false
            referencedRelation: "fulfilments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfilment_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfilment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfilments: {
        Row: {
          carrier_code: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          id: string
          idempotency_key: string
          location_id: string | null
          merchant_id: string
          order_id: string
          reference: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["fulfilment_status"]
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          carrier_code?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          idempotency_key: string
          location_id?: string | null
          merchant_id: string
          order_id: string
          reference: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["fulfilment_status"]
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          carrier_code?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          idempotency_key?: string
          location_id?: string | null
          merchant_id?: string
          order_id?: string
          reference?: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["fulfilment_status"]
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfilments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfilments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfilments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base_currency: string
          created_at: string
          effective_at: string
          id: string
          quote_currency: string
          rate_ppm: number
          source: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          effective_at?: string
          id?: string
          quote_currency: string
          rate_ppm: number
          source: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          effective_at?: string
          id?: string
          quote_currency?: string
          rate_ppm?: number
          source?: string
        }
        Relationships: []
      }
      gateway_accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          merchant_id: string
          provider: string
          sandbox: boolean
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          merchant_id: string
          provider: string
          sandbox?: boolean
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          merchant_id?: string
          provider?: string
          sandbox?: boolean
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_accounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_entries: {
        Row: {
          actor: string | null
          amount_minor_int: number
          balance_after_minor_int: number
          created_at: string
          currency_code: string
          gift_card_id: string
          id: string
          idempotency_key: string
          kind: string
          merchant_id: string
          order_id: string | null
        }
        Insert: {
          actor?: string | null
          amount_minor_int: number
          balance_after_minor_int: number
          created_at?: string
          currency_code?: string
          gift_card_id: string
          id?: string
          idempotency_key: string
          kind: string
          merchant_id: string
          order_id?: string | null
        }
        Update: {
          actor?: string | null
          amount_minor_int?: number
          balance_after_minor_int?: number
          created_at?: string
          currency_code?: string
          gift_card_id?: string
          id?: string
          idempotency_key?: string
          kind?: string
          merchant_id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_entries_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_entries_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance_minor_int: number
          code: string
          created_at: string
          currency_code: string
          expires_at: string | null
          id: string
          initial_minor_int: number
          issued_by: string | null
          merchant_id: string
          recipient_email: string | null
          recipient_phone: string | null
          status: Database["public"]["Enums"]["gift_card_status"]
          updated_at: string
        }
        Insert: {
          balance_minor_int: number
          code: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          initial_minor_int: number
          issued_by?: string | null
          merchant_id: string
          recipient_email?: string | null
          recipient_phone?: string | null
          status?: Database["public"]["Enums"]["gift_card_status"]
          updated_at?: string
        }
        Update: {
          balance_minor_int?: number
          code?: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          initial_minor_int?: number
          issued_by?: string | null
          merchant_id?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          status?: Database["public"]["Enums"]["gift_card_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_grants: {
        Row: {
          consent_at: string | null
          consent_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          merchant_id: string
          reason: string
          requested_at: string
          requested_by: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string
          use_count: number
        }
        Insert: {
          consent_at?: string | null
          consent_by?: string | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          merchant_id: string
          reason: string
          requested_at?: string
          requested_by: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string
          use_count?: number
        }
        Update: {
          consent_at?: string | null
          consent_by?: string | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          merchant_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_grants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          created_at: string
          id: string
          location_id: string
          low_stock_threshold: number | null
          merchant_id: string
          on_hand: number
          reserved: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          low_stock_threshold?: number | null
          merchant_id: string
          on_hand?: number
          reserved?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          low_stock_threshold?: number | null
          merchant_id?: string
          on_hand?: number
          reserved?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          active: boolean
          address_line: string | null
          city: string | null
          code: string
          created_at: string
          id: string
          is_default: boolean
          merchant_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address_line?: string | null
          city?: string | null
          code: string
          created_at?: string
          id?: string
          is_default?: boolean
          merchant_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address_line?: string | null
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          merchant_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          quantity?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          merchant_id: string
          note: string | null
          received_at: string | null
          reference: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_location_id: string
          id?: string
          merchant_id: string
          note?: string | null
          received_at?: string | null
          reference: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_location_id?: string
          id?: string
          merchant_id?: string
          note?: string | null
          received_at?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          idempotency_key: string
          invoice_number: string
          merchant_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          plan: Database["public"]["Enums"]["billing_plan"]
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor_int: number
          total_minor_int: number
          updated_at: string
          vat_minor_int: number
          vat_rate_basis_points: number
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key: string
          invoice_number: string
          merchant_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          plan: Database["public"]["Enums"]["billing_plan"]
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor_int?: number
          total_minor_int?: number
          updated_at?: string
          vat_minor_int?: number
          vat_rate_basis_points?: number
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key?: string
          invoice_number?: string
          merchant_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          plan?: Database["public"]["Enums"]["billing_plan"]
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor_int?: number
          total_minor_int?: number
          updated_at?: string
          vat_minor_int?: number
          vat_rate_basis_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      local_transactions: {
        Row: {
          attempts: number
          client_id: string
          created_at: string
          error: string | null
          id: string
          merchant_id: string
          payload: Json
          status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          client_id: string
          created_at?: string
          error?: string | null
          id?: string
          merchant_id: string
          payload?: Json
          status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          client_id?: string
          created_at?: string
          error?: string | null
          id?: string
          merchant_id?: string
          payload?: Json
          status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_installs: {
        Row: {
          created_at: string
          currency_code: string
          expires_at: string | null
          id: string
          idempotency_key: string
          is_trial: boolean
          kind: Database["public"]["Enums"]["market_kind"]
          listing_name: string
          listing_slug: string
          merchant_id: string
          previous_snapshot: Json
          price_minor_int: number
          started_at: string
          status: Database["public"]["Enums"]["market_install_status"]
          theme_id: string | null
          updated_at: string
          version: string
          widget_id: string | null
        }
        Insert: {
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          is_trial?: boolean
          kind: Database["public"]["Enums"]["market_kind"]
          listing_name?: string
          listing_slug?: string
          merchant_id: string
          previous_snapshot?: Json
          price_minor_int?: number
          started_at?: string
          status?: Database["public"]["Enums"]["market_install_status"]
          theme_id?: string | null
          updated_at?: string
          version?: string
          widget_id?: string | null
        }
        Update: {
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          is_trial?: boolean
          kind?: Database["public"]["Enums"]["market_kind"]
          listing_name?: string
          listing_slug?: string
          merchant_id?: string
          previous_snapshot?: Json
          price_minor_int?: number
          started_at?: string
          status?: Database["public"]["Enums"]["market_install_status"]
          theme_id?: string | null
          updated_at?: string
          version?: string
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_installs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_installs_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "marketplace_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_installs_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "marketplace_widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          install_id: string
          merchant_id: string
          moderation_status: string
          rating: number
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          install_id: string
          merchant_id: string
          moderation_status?: string
          rating: number
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          install_id?: string
          merchant_id?: string
          moderation_status?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_install_id_fkey"
            columns: ["install_id"]
            isOneToOne: true
            referencedRelation: "marketplace_installs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_themes: {
        Row: {
          category: string
          compatible_versions: Json
          created_at: string
          currency_code: string
          description: string | null
          id: string
          install_count: number
          manifest: Json
          name: string
          price_minor_int: number
          rating_count: number
          rating_sum: number
          seller_merchant_id: string
          slug: string
          status: Database["public"]["Enums"]["market_listing_status"]
          thumbnail_url: string | null
          trial_allowed: boolean
          updated_at: string
          vendor_name: string
          version: string
          version_history: Json
        }
        Insert: {
          category?: string
          compatible_versions?: Json
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          install_count?: number
          manifest?: Json
          name: string
          price_minor_int?: number
          rating_count?: number
          rating_sum?: number
          seller_merchant_id: string
          slug: string
          status?: Database["public"]["Enums"]["market_listing_status"]
          thumbnail_url?: string | null
          trial_allowed?: boolean
          updated_at?: string
          vendor_name?: string
          version?: string
          version_history?: Json
        }
        Update: {
          category?: string
          compatible_versions?: Json
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          install_count?: number
          manifest?: Json
          name?: string
          price_minor_int?: number
          rating_count?: number
          rating_sum?: number
          seller_merchant_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["market_listing_status"]
          thumbnail_url?: string | null
          trial_allowed?: boolean
          updated_at?: string
          vendor_name?: string
          version?: string
          version_history?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_themes_seller_merchant_id_fkey"
            columns: ["seller_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_widgets: {
        Row: {
          category: string
          compatible_versions: Json
          created_at: string
          currency_code: string
          description: string | null
          id: string
          install_count: number
          manifest: Json
          name: string
          price_minor_int: number
          rating_count: number
          rating_sum: number
          registry_id: string
          seller_merchant_id: string
          slug: string
          status: Database["public"]["Enums"]["market_listing_status"]
          thumbnail_url: string | null
          trial_allowed: boolean
          updated_at: string
          vendor_name: string
          version: string
          version_history: Json
        }
        Insert: {
          category?: string
          compatible_versions?: Json
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          install_count?: number
          manifest?: Json
          name: string
          price_minor_int?: number
          rating_count?: number
          rating_sum?: number
          registry_id?: string
          seller_merchant_id: string
          slug: string
          status?: Database["public"]["Enums"]["market_listing_status"]
          thumbnail_url?: string | null
          trial_allowed?: boolean
          updated_at?: string
          vendor_name?: string
          version?: string
          version_history?: Json
        }
        Update: {
          category?: string
          compatible_versions?: Json
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          install_count?: number
          manifest?: Json
          name?: string
          price_minor_int?: number
          rating_count?: number
          rating_sum?: number
          registry_id?: string
          seller_merchant_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["market_listing_status"]
          thumbnail_url?: string | null
          trial_allowed?: boolean
          updated_at?: string
          vendor_name?: string
          version?: string
          version_history?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_widgets_seller_merchant_id_fkey"
            columns: ["seller_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          content_type: string
          created_at: string
          deleted_at: string | null
          file_name: string
          id: string
          merchant_id: string
          size_bytes: number
          storage_path: string
          updated_at: string
          url: string
        }
        Insert: {
          alt_text?: string | null
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          file_name: string
          id?: string
          merchant_id: string
          size_bytes?: number
          storage_path: string
          updated_at?: string
          url: string
        }
        Update: {
          alt_text?: string | null
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          file_name?: string
          id?: string
          merchant_id?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_kyc: {
        Row: {
          bin_no: string | null
          contact_phone: string | null
          created_at: string
          document_paths: Json
          id: string
          legal_name: string | null
          merchant_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: Database["public"]["Enums"]["kyc_state"]
          submitted_at: string | null
          trade_license_no: string | null
          updated_at: string
        }
        Insert: {
          bin_no?: string | null
          contact_phone?: string | null
          created_at?: string
          document_paths?: Json
          id?: string
          legal_name?: string | null
          merchant_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: Database["public"]["Enums"]["kyc_state"]
          submitted_at?: string | null
          trade_license_no?: string | null
          updated_at?: string
        }
        Update: {
          bin_no?: string | null
          contact_phone?: string | null
          created_at?: string
          document_paths?: Json
          id?: string
          legal_name?: string | null
          merchant_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: Database["public"]["Enums"]["kyc_state"]
          submitted_at?: string | null
          trade_license_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_kyc_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          last_login_at: string | null
          merchant_id: string
          mfa_status: Database["public"]["Enums"]["staff_mfa_status"]
          role: Database["public"]["Enums"]["merchant_role"]
          role_id: string | null
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          last_login_at?: string | null
          merchant_id: string
          mfa_status?: Database["public"]["Enums"]["staff_mfa_status"]
          role?: Database["public"]["Enums"]["merchant_role"]
          role_id?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          last_login_at?: string | null
          merchant_id?: string
          mfa_status?: Database["public"]["Enums"]["staff_mfa_status"]
          role?: Database["public"]["Enums"]["merchant_role"]
          role_id?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_settings: {
        Row: {
          business_bin: string | null
          cod_enabled: boolean
          cod_surcharge_minor_int: number
          created_at: string
          free_shipping_threshold_minor_int: number | null
          low_stock_threshold: number
          merchant_id: string
          mfs_enabled: boolean
          notify_prefs: Json
          prices_include_vat: boolean
          setup_dismissed_at: string | null
          setup_steps: Json
          ship_address_line: string | null
          ship_city: string | null
          ship_postcode: string | null
          shipping_flat_minor_int: number
          support_email: string | null
          support_phone: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          business_bin?: string | null
          cod_enabled?: boolean
          cod_surcharge_minor_int?: number
          created_at?: string
          free_shipping_threshold_minor_int?: number | null
          low_stock_threshold?: number
          merchant_id: string
          mfs_enabled?: boolean
          notify_prefs?: Json
          prices_include_vat?: boolean
          setup_dismissed_at?: string | null
          setup_steps?: Json
          ship_address_line?: string | null
          ship_city?: string | null
          ship_postcode?: string | null
          shipping_flat_minor_int?: number
          support_email?: string | null
          support_phone?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          business_bin?: string | null
          cod_enabled?: boolean
          cod_surcharge_minor_int?: number
          created_at?: string
          free_shipping_threshold_minor_int?: number | null
          low_stock_threshold?: number
          merchant_id?: string
          mfs_enabled?: boolean
          notify_prefs?: Json
          prices_include_vat?: boolean
          setup_dismissed_at?: string | null
          setup_steps?: Json
          ship_address_line?: string | null
          ship_city?: string | null
          ship_postcode?: string | null
          shipping_flat_minor_int?: number
          support_email?: string | null
          support_phone?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_suspensions: {
        Row: {
          id: string
          merchant_id: string
          payments_frozen: boolean
          reason: string
          reinstate_note: string | null
          reinstated_at: string | null
          reinstated_by: string | null
          suspended_at: string
          suspended_by: string
        }
        Insert: {
          id?: string
          merchant_id: string
          payments_frozen?: boolean
          reason: string
          reinstate_note?: string | null
          reinstated_at?: string | null
          reinstated_by?: string | null
          suspended_at?: string
          suspended_by: string
        }
        Update: {
          id?: string
          merchant_id?: string
          payments_frozen?: boolean
          reason?: string
          reinstate_note?: string | null
          reinstated_at?: string | null
          reinstated_by?: string | null
          suspended_at?: string
          suspended_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_suspensions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          name: string
          slug: string
          status: Database["public"]["Enums"]["merchant_status"]
          updated_at: string
          vat_registration_no: string | null
        }
        Insert: {
          created_at?: string
          currency_code?: string
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          name: string
          slug: string
          status?: Database["public"]["Enums"]["merchant_status"]
          updated_at?: string
          vat_registration_no?: string | null
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["merchant_status"]
          updated_at?: string
          vat_registration_no?: string | null
        }
        Relationships: []
      }
      metafield_definitions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          key: string
          label: string
          merchant_id: string
          namespace: string
          owner_type: string
          updated_at: string
          validation: Json
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          key: string
          label: string
          merchant_id: string
          namespace?: string
          owner_type: string
          updated_at?: string
          validation?: Json
          value_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          key?: string
          label?: string
          merchant_id?: string
          namespace?: string
          owner_type?: string
          updated_at?: string
          validation?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "metafield_definitions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      metafields: {
        Row: {
          created_at: string
          id: string
          key: string
          merchant_id: string
          namespace: string
          owner_id: string | null
          owner_type: string
          updated_at: string
          value: Json
          value_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          merchant_id: string
          namespace?: string
          owner_id?: string | null
          owner_type: string
          updated_at?: string
          value?: Json
          value_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          merchant_id?: string
          namespace?: string
          owner_id?: string | null
          owner_type?: string
          updated_at?: string
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "metafields_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          body_bn: string
          body_en: string
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          href: string | null
          id: string
          kind: string
          merchant_id: string
          read_at: string | null
          read_by: string | null
          severity: Database["public"]["Enums"]["notification_severity"]
          title_bn: string
          title_en: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body_bn?: string
          body_en?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          href?: string | null
          id?: string
          kind: string
          merchant_id: string
          read_at?: string | null
          read_by?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title_bn: string
          title_en: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body_bn?: string
          body_en?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          href?: string | null
          id?: string
          kind?: string
          merchant_id?: string
          read_at?: string | null
          read_by?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title_bn?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_backup_runs: {
        Row: {
          artifact_ref: string | null
          checks: Json
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          kind: string
          notes: string | null
          rows_verified: number
          scope: string
          started_at: string
          status: string
        }
        Insert: {
          artifact_ref?: string | null
          checks?: Json
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          notes?: string | null
          rows_verified?: number
          scope?: string
          started_at?: string
          status?: string
        }
        Update: {
          artifact_ref?: string | null
          checks?: Json
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          rows_verified?: number
          scope?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      ops_incident_updates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          incident_id: string
          status: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          incident_id: string
          status: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          incident_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_incident_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "ops_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_incidents: {
        Row: {
          components: string[]
          created_at: string
          created_by: string | null
          id: string
          is_public: boolean
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          components?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          components?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_public?: boolean
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ops_retention_runs: {
        Row: {
          cutoff: string
          deleted_rows: number
          id: string
          ran_at: string
          table_name: string
        }
        Insert: {
          cutoff: string
          deleted_rows?: number
          id?: string
          ran_at?: string
          table_name: string
        }
        Update: {
          cutoff?: string
          deleted_rows?: number
          id?: string
          ran_at?: string
          table_name?: string
        }
        Relationships: []
      }
      ops_status_components: {
        Row: {
          key: string
          label: string
          position: number
          state: string
          updated_at: string
        }
        Insert: {
          key: string
          label: string
          position?: number
          state?: string
          updated_at?: string
        }
        Update: {
          key?: string
          label?: string
          position?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_amendments: {
        Row: {
          actor_id: string | null
          after_totals: Json
          before_totals: Json
          created_at: string
          currency_code: string
          delta_minor_int: number
          id: string
          merchant_id: string
          order_id: string
          reason: string
        }
        Insert: {
          actor_id?: string | null
          after_totals: Json
          before_totals: Json
          created_at?: string
          currency_code: string
          delta_minor_int: number
          id?: string
          merchant_id: string
          order_id: string
          reason: string
        }
        Update: {
          actor_id?: string | null
          after_totals?: Json
          before_totals?: Json
          created_at?: string
          currency_code?: string
          delta_minor_int?: number
          id?: string
          merchant_id?: string
          order_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_amendments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_amendments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          merchant_id: string
          note: string | null
          order_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          merchant_id: string
          note?: string | null
          order_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          merchant_id?: string
          note?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_invoices: {
        Row: {
          business_bin: string | null
          created_at: string
          currency_code: string
          discount_minor_int: number
          id: string
          invoice_number: string
          issued_at: string
          merchant_id: string
          order_id: string
          sequence_no: number
          sequence_year: number
          shipping_minor_int: number
          subtotal_minor_int: number
          total_minor_int: number
          vat_minor_int: number
          vat_rate_basis_points: number
        }
        Insert: {
          business_bin?: string | null
          created_at?: string
          currency_code?: string
          discount_minor_int?: number
          id?: string
          invoice_number: string
          issued_at?: string
          merchant_id: string
          order_id: string
          sequence_no: number
          sequence_year: number
          shipping_minor_int?: number
          subtotal_minor_int: number
          total_minor_int: number
          vat_minor_int?: number
          vat_rate_basis_points?: number
        }
        Update: {
          business_bin?: string | null
          created_at?: string
          currency_code?: string
          discount_minor_int?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          merchant_id?: string
          order_id?: string
          sequence_no?: number
          sequence_year?: number
          shipping_minor_int?: number
          subtotal_minor_int?: number
          total_minor_int?: number
          vat_minor_int?: number
          vat_rate_basis_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total_minor_int: number
          merchant_id: string
          order_id: string
          product_title: string
          quantity: number
          sku: string | null
          unit_price_minor_int: number
          variant_id: string | null
          variant_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_minor_int: number
          merchant_id: string
          order_id: string
          product_title: string
          quantity: number
          sku?: string | null
          unit_price_minor_int: number
          variant_id?: string | null
          variant_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total_minor_int?: number
          merchant_id?: string
          order_id?: string
          product_title?: string
          quantity?: number
          sku?: string | null
          unit_price_minor_int?: number
          variant_id?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_transitions: {
        Row: {
          from_status: Database["public"]["Enums"]["order_status"]
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          from_status: Database["public"]["Enums"]["order_status"]
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          from_status?: Database["public"]["Enums"]["order_status"]
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: []
      }
      orders: {
        Row: {
          access_token: string
          address_line: string
          city: string
          cod_surcharge_minor_int: number
          created_at: string
          currency_code: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string
          discount_minor_int: number
          id: string
          idempotency_key: string | null
          merchant_id: string
          note: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          postcode: string | null
          shipping_minor_int: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal_minor_int: number
          total_minor_int: number
          updated_at: string
          vat_minor_int: number
          vat_rate_basis_points: number
        }
        Insert: {
          access_token?: string
          address_line: string
          city: string
          cod_surcharge_minor_int?: number
          created_at?: string
          currency_code?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          discount_minor_int?: number
          id?: string
          idempotency_key?: string | null
          merchant_id: string
          note?: string | null
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          postcode?: string | null
          shipping_minor_int?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_minor_int?: number
          total_minor_int?: number
          updated_at?: string
          vat_minor_int?: number
          vat_rate_basis_points?: number
        }
        Update: {
          access_token?: string
          address_line?: string
          city?: string
          cod_surcharge_minor_int?: number
          created_at?: string
          currency_code?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          discount_minor_int?: number
          id?: string
          idempotency_key?: string | null
          merchant_id?: string
          note?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          postcode?: string | null
          shipping_minor_int?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_minor_int?: number
          total_minor_int?: number
          updated_at?: string
          vat_minor_int?: number
          vat_rate_basis_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor_int: number
          created_at: string
          currency_code: string
          id: string
          idempotency_key: string
          merchant_id: string
          order_id: string
          payment_provider: string
          payment_status: string
          provider_reference: string | null
          updated_at: string
        }
        Insert: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key: string
          merchant_id: string
          order_id: string
          payment_provider: string
          payment_status?: string
          provider_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key?: string
          merchant_id?: string
          order_id?: string
          payment_provider?: string
          payment_status?: string
          provider_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_definitions: {
        Row: {
          active: boolean
          created_at: string
          currency_code: string
          feature_flags: Json
          features: Json
          payment_methods_allowed: Json
          plan: Database["public"]["Enums"]["billing_plan"]
          price_minor_int: number | null
          products_limit: number
          sort_order: number
          staff_limit: number
          title_bn: string
          title_en: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency_code?: string
          feature_flags?: Json
          features?: Json
          payment_methods_allowed?: Json
          plan: Database["public"]["Enums"]["billing_plan"]
          price_minor_int?: number | null
          products_limit?: number
          sort_order?: number
          staff_limit?: number
          title_bn: string
          title_en: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency_code?: string
          feature_flags?: Json
          features?: Json
          payment_methods_allowed?: Json
          plan?: Database["public"]["Enums"]["billing_plan"]
          price_minor_int?: number | null
          products_limit?: number
          sort_order?: number
          staff_limit?: number
          title_bn?: string
          title_en?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_audit_log: {
        Row: {
          action: string
          actor: string | null
          after_data: Json
          before_data: Json
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          scope: string
        }
        Insert: {
          action: string
          actor?: string | null
          after_data?: Json
          before_data?: Json
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          scope?: string
        }
        Update: {
          action?: string
          actor?: string | null
          after_data?: Json
          before_data?: Json
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          scope?: string
        }
        Relationships: []
      }
      platform_flags: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      pos_orders: {
        Row: {
          address_line: string | null
          auth_code: string | null
          captured_at: string
          city: string | null
          client_id: string
          created_at: string
          currency_code: string
          customer_name: string | null
          customer_phone: string | null
          discount_minor_int: number
          id: string
          items: Json
          merchant_id: string
          order_id: string | null
          origin: Database["public"]["Enums"]["pos_origin"]
          payment_method: Database["public"]["Enums"]["pos_payment_method"]
          session_id: string | null
          status: Database["public"]["Enums"]["pos_order_status"]
          subtotal_minor_int: number
          total_minor_int: number
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          auth_code?: string | null
          captured_at?: string
          city?: string | null
          client_id: string
          created_at?: string
          currency_code?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_minor_int?: number
          id?: string
          items?: Json
          merchant_id: string
          order_id?: string | null
          origin?: Database["public"]["Enums"]["pos_origin"]
          payment_method?: Database["public"]["Enums"]["pos_payment_method"]
          session_id?: string | null
          status?: Database["public"]["Enums"]["pos_order_status"]
          subtotal_minor_int?: number
          total_minor_int?: number
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          auth_code?: string | null
          captured_at?: string
          city?: string | null
          client_id?: string
          created_at?: string
          currency_code?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_minor_int?: number
          id?: string
          items?: Json
          merchant_id?: string
          order_id?: string | null
          origin?: Database["public"]["Enums"]["pos_origin"]
          payment_method?: Database["public"]["Enums"]["pos_payment_method"]
          session_id?: string | null
          status?: Database["public"]["Enums"]["pos_order_status"]
          subtotal_minor_int?: number
          total_minor_int?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount_minor_int: number
          auth_code: string | null
          change_minor_int: number
          created_at: string
          currency_code: string
          id: string
          merchant_id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          pos_order_id: string
          tendered_minor_int: number
        }
        Insert: {
          amount_minor_int: number
          auth_code?: string | null
          change_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          merchant_id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          pos_order_id: string
          tendered_minor_int?: number
        }
        Update: {
          amount_minor_int?: number
          auth_code?: string | null
          change_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          merchant_id?: string
          method?: Database["public"]["Enums"]["pos_payment_method"]
          pos_order_id?: string
          tendered_minor_int?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_pos_order_id_fkey"
            columns: ["pos_order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_refunds: {
        Row: {
          amount_minor_int: number
          created_at: string
          currency_code: string
          id: string
          idempotency_key: string
          lines: Json
          merchant_id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          pos_order_id: string
          reason: string | null
          restock: boolean
          session_id: string | null
          staff_user_id: string | null
        }
        Insert: {
          amount_minor_int: number
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key: string
          lines?: Json
          merchant_id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          pos_order_id: string
          reason?: string | null
          restock?: boolean
          session_id?: string | null
          staff_user_id?: string | null
        }
        Update: {
          amount_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          idempotency_key?: string
          lines?: Json
          merchant_id?: string
          method?: Database["public"]["Enums"]["pos_payment_method"]
          pos_order_id?: string
          reason?: string | null
          restock?: boolean
          session_id?: string | null
          staff_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_refunds_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_refunds_pos_order_id_fkey"
            columns: ["pos_order_id"]
            isOneToOne: false
            referencedRelation: "pos_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_refunds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          actual_cash_minor_int: number | null
          close_time: string | null
          created_at: string
          currency_code: string
          expected_cash_minor_int: number
          id: string
          merchant_id: string
          note: string | null
          open_time: string
          shift_date: string
          shift_totals: Json
          staff_user_id: string
          starting_cash_minor_int: number
          status: Database["public"]["Enums"]["pos_session_status"]
          updated_at: string
          variance_minor_int: number | null
        }
        Insert: {
          actual_cash_minor_int?: number | null
          close_time?: string | null
          created_at?: string
          currency_code?: string
          expected_cash_minor_int?: number
          id?: string
          merchant_id: string
          note?: string | null
          open_time?: string
          shift_date?: string
          shift_totals?: Json
          staff_user_id: string
          starting_cash_minor_int?: number
          status?: Database["public"]["Enums"]["pos_session_status"]
          updated_at?: string
          variance_minor_int?: number | null
        }
        Update: {
          actual_cash_minor_int?: number | null
          close_time?: string | null
          created_at?: string
          currency_code?: string
          expected_cash_minor_int?: number
          id?: string
          merchant_id?: string
          note?: string | null
          open_time?: string
          shift_date?: string
          shift_totals?: Json
          staff_user_id?: string
          starting_cash_minor_int?: number
          status?: Database["public"]["Enums"]["pos_session_status"]
          updated_at?: string
          variance_minor_int?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bundles: {
        Row: {
          active: boolean
          created_at: string
          currency_code: string
          fixed_price_minor_int: number | null
          id: string
          merchant_id: string
          percent_off: number
          pricing_mode: string
          product_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency_code?: string
          fixed_price_minor_int?: number | null
          id?: string
          merchant_id: string
          percent_off?: number
          pricing_mode?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency_code?: string
          fixed_price_minor_int?: number | null
          id?: string
          merchant_id?: string
          percent_off?: number
          pricing_mode?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bundles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bundles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          author_name: string
          body: string
          created_at: string
          customer_id: string | null
          id: string
          merchant_id: string
          moderation_note: string | null
          product_id: string
          published_at: string | null
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at: string
          verified_purchase: boolean
        }
        Insert: {
          author_name?: string
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id: string
          moderation_note?: string | null
          product_id: string
          published_at?: string | null
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          verified_purchase?: boolean
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id?: string
          moderation_note?: string | null
          product_id?: string
          published_at?: string | null
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_amount_minor_int: number | null
          created_at: string
          currency_code: string
          deleted_at: string | null
          id: string
          merchant_id: string
          name: string
          position: number
          price_amount_minor_int: number
          product_id: string
          sku: string | null
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          compare_at_amount_minor_int?: number | null
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          id?: string
          merchant_id: string
          name?: string
          position?: number
          price_amount_minor_int?: number
          product_id: string
          sku?: string | null
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          compare_at_amount_minor_int?: number | null
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          id?: string
          merchant_id?: string
          name?: string
          position?: number
          price_amount_minor_int?: number
          product_id?: string
          sku?: string | null
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          merchant_id: string
          product_kind: Database["public"]["Enums"]["product_kind"]
          requires_shipping: boolean
          search_doc: unknown
          slug: string
          status: Database["public"]["Enums"]["catalog_status"]
          tags: string[]
          tax_category: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          merchant_id: string
          product_kind?: Database["public"]["Enums"]["product_kind"]
          requires_shipping?: boolean
          search_doc?: unknown
          slug: string
          status?: Database["public"]["Enums"]["catalog_status"]
          tags?: string[]
          tax_category?: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          merchant_id?: string
          product_kind?: Database["public"]["Enums"]["product_kind"]
          requires_shipping?: boolean
          search_doc?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["catalog_status"]
          tags?: string[]
          tax_category?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket: string
          hits: number
          subject: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          subject: string
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          subject?: string
          window_start?: string
        }
        Relationships: []
      }
      refund_status_transitions: {
        Row: {
          from_status: string
          to_status: string
        }
        Insert: {
          from_status: string
          to_status: string
        }
        Update: {
          from_status?: string
          to_status?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_minor_int: number
          attempt: number
          created_at: string
          currency_code: string
          failure_code: string | null
          id: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          order_id: string
          payment_provider: string | null
          provider_reference: string | null
          reason: string | null
          refund_key: string
          requested_by: string | null
          settled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor_int: number
          attempt?: number
          created_at?: string
          currency_code?: string
          failure_code?: string | null
          id?: string
          merchant_id: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          order_id: string
          payment_provider?: string | null
          provider_reference?: string | null
          reason?: string | null
          refund_key: string
          requested_by?: string | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor_int?: number
          attempt?: number
          created_at?: string
          currency_code?: string
          failure_code?: string | null
          id?: string
          merchant_id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          order_id?: string
          payment_provider?: string | null
          provider_reference?: string | null
          reason?: string | null
          refund_key?: string
          requested_by?: string | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      return_events: {
        Row: {
          actor: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["return_status"] | null
          id: string
          merchant_id: string
          reason: string | null
          return_id: string
          to_status: Database["public"]["Enums"]["return_status"]
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["return_status"] | null
          id?: string
          merchant_id: string
          reason?: string | null
          return_id: string
          to_status: Database["public"]["Enums"]["return_status"]
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["return_status"] | null
          id?: string
          merchant_id?: string
          reason?: string | null
          return_id?: string
          to_status?: Database["public"]["Enums"]["return_status"]
        }
        Relationships: [
          {
            foreignKeyName: "return_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_events_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          amount_minor_int: number
          created_at: string
          id: string
          merchant_id: string
          order_item_id: string
          quantity: number
          restock: boolean
          return_id: string
        }
        Insert: {
          amount_minor_int?: number
          created_at?: string
          id?: string
          merchant_id: string
          order_item_id: string
          quantity: number
          restock?: boolean
          return_id: string
        }
        Update: {
          amount_minor_int?: number
          created_at?: string
          id?: string
          merchant_id?: string
          order_item_id?: string
          quantity?: number
          restock?: boolean
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          created_at: string
          currency_code: string
          customer_note: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          merchant_id: string
          order_id: string
          reason: string
          reference: string
          refund_id: string | null
          refund_minor_int: number
          staff_note: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          customer_note?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          merchant_id: string
          order_id: string
          reason: string
          reference: string
          refund_id?: string | null
          refund_minor_int?: number
          staff_note?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          customer_note?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          merchant_id?: string
          order_id?: string
          reason?: string
          reference?: string
          refund_id?: string | null
          refund_minor_int?: number
          staff_note?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      review_replies: {
        Row: {
          body: string
          id: string
          merchant_id: string
          published_at: string
          review_id: string
          staff_user_id: string
        }
        Insert: {
          body: string
          id?: string
          merchant_id: string
          published_at?: string
          review_id: string
          staff_user_id: string
        }
        Update: {
          body?: string
          id?: string
          merchant_id?: string
          published_at?: string
          review_id?: string
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_replies_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          merchant_id: string
          name: string
          rule_field: string
          rule_operator: string
          rule_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          merchant_id: string
          name: string
          rule_field?: string
          rule_operator?: string
          rule_value?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          merchant_id?: string
          name?: string
          rule_field?: string
          rule_operator?: string
          rule_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_meta: {
        Row: {
          canonical: string | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["seo_entity_type"]
          faq: Json
          focus_keyword: string | null
          id: string
          merchant_id: string
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          robots_follow: boolean
          robots_index: boolean
          schema_type: string | null
          score: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          canonical?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["seo_entity_type"]
          faq?: Json
          focus_keyword?: string | null
          id?: string
          merchant_id: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          robots_follow?: boolean
          robots_index?: boolean
          schema_type?: string | null
          score?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          canonical?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["seo_entity_type"]
          faq?: Json
          focus_keyword?: string | null
          id?: string
          merchant_id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          robots_follow?: boolean
          robots_index?: boolean
          schema_type?: string | null
          score?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_meta_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_meta_audit: {
        Row: {
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["seo_entity_type"]
          id: string
          merchant_id: string
          reason: string | null
        }
        Insert: {
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: Database["public"]["Enums"]["seo_entity_type"]
          id?: string
          merchant_id: string
          reason?: string | null
        }
        Update: {
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["seo_entity_type"]
          id?: string
          merchant_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_meta_audit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offerings: {
        Row: {
          advance_booking_days: number
          buffer_minutes: number
          cancellation_hours: number
          capacity_per_slot: number
          created_at: string
          duration_minutes: number
          id: string
          location_kind: string
          merchant_id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          advance_booking_days?: number
          buffer_minutes?: number
          cancellation_hours?: number
          capacity_per_slot?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          location_kind?: string
          merchant_id: string
          product_id: string
          updated_at?: string
        }
        Update: {
          advance_booking_days?: number
          buffer_minutes?: number
          cancellation_hours?: number
          capacity_per_slot?: number
          created_at?: string
          duration_minutes?: number
          id?: string
          location_kind?: string
          merchant_id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offerings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offerings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_files: {
        Row: {
          created_at: string
          currency_code: string
          fee_minor_int: number
          file_date: string
          file_hash: string
          gross_minor_int: number
          id: string
          item_count: number
          matched_count: number
          merchant_id: string
          net_minor_int: number
          posted_at: string | null
          provider: string
          reject_reason: string | null
          status: Database["public"]["Enums"]["settlement_file_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          fee_minor_int?: number
          file_date: string
          file_hash: string
          gross_minor_int?: number
          id?: string
          item_count?: number
          matched_count?: number
          merchant_id: string
          net_minor_int?: number
          posted_at?: string | null
          provider: string
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["settlement_file_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          fee_minor_int?: number
          file_date?: string
          file_hash?: string
          gross_minor_int?: number
          id?: string
          item_count?: number
          matched_count?: number
          merchant_id?: string
          net_minor_int?: number
          posted_at?: string | null
          provider?: string
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["settlement_file_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_files_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_items: {
        Row: {
          created_at: string
          currency_code: string
          fee_minor_int: number
          file_id: string
          gross_minor_int: number
          id: string
          match_kind: string
          merchant_id: string
          net_minor_int: number
          order_id: string | null
          payment_id: string | null
          posted: boolean
          settlement_ref: string
        }
        Insert: {
          created_at?: string
          currency_code?: string
          fee_minor_int?: number
          file_id: string
          gross_minor_int: number
          id?: string
          match_kind?: string
          merchant_id: string
          net_minor_int: number
          order_id?: string | null
          payment_id?: string | null
          posted?: boolean
          settlement_ref: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          fee_minor_int?: number
          file_id?: string
          gross_minor_int?: number
          id?: string
          match_kind?: string
          merchant_id?: string
          net_minor_int?: number
          order_id?: string | null
          payment_id?: string | null
          posted?: boolean
          settlement_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_items_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "settlement_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_variance_alerts: {
        Row: {
          actual_minor_int: number
          created_at: string
          expected_minor_int: number
          file_id: string
          id: string
          item_id: string | null
          kind: string
          merchant_id: string
          resolution_note: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          actual_minor_int?: number
          created_at?: string
          expected_minor_int?: number
          file_id: string
          id?: string
          item_id?: string | null
          kind: string
          merchant_id: string
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          actual_minor_int?: number
          created_at?: string
          expected_minor_int?: number
          file_id?: string
          id?: string
          item_id?: string | null
          kind?: string
          merchant_id?: string
          resolution_note?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_variance_alerts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "settlement_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_variance_alerts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "settlement_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_variance_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_quotes: {
        Row: {
          amount_minor_int: number
          breakdown: Json
          carrier_code: string
          cod_fee_minor_int: number
          created_at: string
          currency_code: string
          id: string
          merchant_id: string
          order_id: string | null
          rule_id: string | null
          stale: boolean
          weight_grams: number
          zone_id: string | null
        }
        Insert: {
          amount_minor_int?: number
          breakdown?: Json
          carrier_code: string
          cod_fee_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          merchant_id: string
          order_id?: string | null
          rule_id?: string | null
          stale?: boolean
          weight_grams?: number
          zone_id?: string | null
        }
        Update: {
          amount_minor_int?: number
          breakdown?: Json
          carrier_code?: string
          cod_fee_minor_int?: number
          created_at?: string
          currency_code?: string
          id?: string
          merchant_id?: string
          order_id?: string | null
          rule_id?: string | null
          stale?: boolean
          weight_grams?: number
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_quotes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_quotes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_quotes_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "shipping_rate_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_quotes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_rate_rules: {
        Row: {
          base_minor_int: number
          carrier_code: string | null
          cod_fee_bp: number
          created_at: string
          currency_code: string
          enabled: boolean
          free_over_minor_int: number | null
          id: string
          max_weight_grams: number
          merchant_id: string
          min_weight_grams: number
          per_kg_minor_int: number
          priority: number
          updated_at: string
          zone_id: string
        }
        Insert: {
          base_minor_int?: number
          carrier_code?: string | null
          cod_fee_bp?: number
          created_at?: string
          currency_code?: string
          enabled?: boolean
          free_over_minor_int?: number | null
          id?: string
          max_weight_grams?: number
          merchant_id: string
          min_weight_grams?: number
          per_kg_minor_int?: number
          priority?: number
          updated_at?: string
          zone_id: string
        }
        Update: {
          base_minor_int?: number
          carrier_code?: string | null
          cod_fee_bp?: number
          created_at?: string
          currency_code?: string
          enabled?: boolean
          free_over_minor_int?: number | null
          id?: string
          max_weight_grams?: number
          merchant_id?: string
          min_weight_grams?: number
          per_kg_minor_int?: number
          priority?: number
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rate_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rate_rules_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          code: string
          created_at: string
          districts: string[]
          enabled: boolean
          id: string
          is_default: boolean
          merchant_id: string
          name_bn: string
          name_en: string
          priority: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          districts?: string[]
          enabled?: boolean
          id?: string
          is_default?: boolean
          merchant_id: string
          name_bn?: string
          name_en: string
          priority?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          districts?: string[]
          enabled?: boolean
          id?: string
          is_default?: boolean
          merchant_id?: string
          name_bn?: string
          name_en?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zones_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: number
          member_id: string | null
          merchant_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: never
          member_id?: string | null
          merchant_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: never
          member_id?: string | null
          merchant_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "staff_audit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          created_at: string
          grants: Json
          id: string
          is_fixed: boolean
          merchant_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grants?: Json
          id?: string
          is_fixed?: boolean
          merchant_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grants?: Json
          id?: string
          is_fixed?: boolean
          merchant_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      step_up_grants: {
        Row: {
          action: string
          created_at: string
          expires_at: string
          id: string
          merchant_id: string | null
          method: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          expires_at: string
          id?: string
          merchant_id?: string | null
          method: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          expires_at?: string
          id?: string
          merchant_id?: string | null
          method?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_up_grants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_holds: {
        Row: {
          checkout_token: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          merchant_id: string
          order_id: string | null
          quantity: number
          released_at: string | null
          variant_id: string
        }
        Insert: {
          checkout_token: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          merchant_id: string
          order_id?: string | null
          quantity: number
          released_at?: string | null
          variant_id: string
        }
        Update: {
          checkout_token?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          merchant_id?: string
          order_id?: string | null
          quantity?: number
          released_at?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_holds_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_holds_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_themes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string
          name: string
          published_version_id: string | null
          source_install_id: string | null
          source_listing_id: string | null
          source_listing_slug: string | null
          source_version: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id: string
          name: string
          published_version_id?: string | null
          source_install_id?: string | null
          source_listing_id?: string | null
          source_listing_slug?: string | null
          source_version?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          name?: string
          published_version_id?: string | null
          source_install_id?: string | null
          source_listing_id?: string | null
          source_listing_slug?: string | null
          source_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_themes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_themes_published_version_fk"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "theme_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_themes_source_install_id_fkey"
            columns: ["source_install_id"]
            isOneToOne: false
            referencedRelation: "marketplace_installs"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_forms: {
        Row: {
          consent_purpose: Database["public"]["Enums"]["consent_purpose"]
          created_at: string
          deleted_at: string | null
          description: string | null
          fields: Json
          id: string
          is_active: boolean
          merchant_id: string
          requires_consent: boolean
          slug: string
          success_message: string
          title: string
          updated_at: string
        }
        Insert: {
          consent_purpose?: Database["public"]["Enums"]["consent_purpose"]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          merchant_id: string
          requires_consent?: boolean
          slug: string
          success_message?: string
          title: string
          updated_at?: string
        }
        Update: {
          consent_purpose?: Database["public"]["Enums"]["consent_purpose"]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          merchant_id?: string
          requires_consent?: boolean
          slug?: string
          success_message?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_forms_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_pages: {
        Row: {
          body_markdown: string
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          excerpt: string | null
          id: string
          is_published: boolean
          merchant_id: string
          meta_description: string | null
          meta_title: string | null
          position: number
          published_at: string | null
          robots: string
          show_in_nav: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body_markdown?: string
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean
          merchant_id: string
          meta_description?: string | null
          meta_title?: string | null
          position?: number
          published_at?: string | null
          robots?: string
          show_in_nav?: boolean
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body_markdown?: string
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          id?: string
          is_published?: boolean
          merchant_id?: string
          meta_description?: string | null
          meta_title?: string | null
          position?: number
          published_at?: string | null
          robots?: string
          show_in_nav?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_pages_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          email_consent: boolean
          id: string
          merchant_id: string
          phone: string | null
          sms_consent: boolean
          source: string
          status: string
          tags: string[]
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_consent?: boolean
          id?: string
          merchant_id: string
          phone?: string | null
          sms_consent?: boolean
          source?: string
          status?: string
          tags?: string[]
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_consent?: boolean
          id?: string
          merchant_id?: string
          phone?: string | null
          sms_consent?: boolean
          source?: string
          status?: string
          tags?: string[]
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscribers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_terms: {
        Row: {
          billing_anchor_day: number | null
          created_at: string
          id: string
          interval_count: number
          interval_unit: string
          merchant_id: string
          minimum_cycles: number
          trial_days: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          billing_anchor_day?: number | null
          created_at?: string
          id?: string
          interval_count?: number
          interval_unit?: string
          merchant_id: string
          minimum_cycles?: number
          trial_days?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          billing_anchor_day?: number | null
          created_at?: string
          id?: string
          interval_count?: number
          interval_unit?: string
          merchant_id?: string
          minimum_cycles?: number
          trial_days?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_terms_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_terms_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          currency_code: string
          current_period_start: string
          dunning_stage: number
          grace_until: string | null
          id: string
          merchant_id: string
          next_billing_at: string | null
          past_due_since: string | null
          paused_at: string | null
          plan: Database["public"]["Enums"]["billing_plan"]
          scheduled_plan: Database["public"]["Enums"]["billing_plan"] | null
          scheduled_plan_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_fingerprint: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          currency_code?: string
          current_period_start?: string
          dunning_stage?: number
          grace_until?: string | null
          id?: string
          merchant_id: string
          next_billing_at?: string | null
          past_due_since?: string | null
          paused_at?: string | null
          plan?: Database["public"]["Enums"]["billing_plan"]
          scheduled_plan?: Database["public"]["Enums"]["billing_plan"] | null
          scheduled_plan_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_fingerprint?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          currency_code?: string
          current_period_start?: string
          dunning_stage?: number
          grace_until?: string | null
          id?: string
          merchant_id?: string
          next_billing_at?: string | null
          past_due_since?: string | null
          paused_at?: string | null
          plan?: Database["public"]["Enums"]["billing_plan"]
          scheduled_plan?: Database["public"]["Enums"]["billing_plan"] | null
          scheduled_plan_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_fingerprint?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_limits: {
        Row: {
          created_at: string
          merchant_id: string
          products_limit: number
          staff_limit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          merchant_id: string
          products_limit?: number
          staff_limit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          merchant_id?: string
          products_limit?: number
          staff_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_limits_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_purge_requests: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          failure: string | null
          id: string
          merchant_id: string
          reason: string
          requested_at: string
          requested_by: string
          row_counts: Json | null
          scheduled_for: string
          status: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          failure?: string | null
          id?: string
          merchant_id: string
          reason: string
          requested_at?: string
          requested_by: string
          row_counts?: Json | null
          scheduled_for?: string
          status?: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          failure?: string | null
          id?: string
          merchant_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          row_counts?: Json | null
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_purge_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_audit: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          merchant_id: string
          theme_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          merchant_id: string
          theme_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          merchant_id?: string
          theme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "theme_audit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_drafts: {
        Row: {
          merchant_id: string
          revision: number
          templates: Json
          theme_id: string
          tokens: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          merchant_id: string
          revision?: number
          templates?: Json
          theme_id: string
          tokens?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          merchant_id?: string
          revision?: number
          templates?: Json
          theme_id?: string
          tokens?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "theme_drafts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_drafts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: true
            referencedRelation: "store_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_registry: {
        Row: {
          active: boolean
          category: string
          created_at: string
          key: string
          name_bn: string
          name_en: string
          preset: Json
          sort_order: number
          summary_bn: string
          summary_en: string
          updated_at: string
          version: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          key: string
          name_bn: string
          name_en: string
          preset?: Json
          sort_order?: number
          summary_bn?: string
          summary_en?: string
          updated_at?: string
          version?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          key?: string
          name_bn?: string
          name_en?: string
          preset?: Json
          sort_order?: number
          summary_bn?: string
          summary_en?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      theme_schedules: {
        Row: {
          action: string
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          merchant_id: string
          run_at: string
          state: string
          theme_id: string
          version_id: string | null
        }
        Insert: {
          action: string
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          merchant_id: string
          run_at: string
          state?: string
          theme_id: string
          version_id?: string | null
        }
        Update: {
          action?: string
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          merchant_id?: string
          run_at?: string
          state?: string
          theme_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "theme_schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_schedules_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "store_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_schedules_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "theme_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_versions: {
        Row: {
          ast: Json
          checksum: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          merchant_id: string
          note: string | null
          published_at: string | null
          rollback_of: string | null
          source_registry_key: string | null
          source_registry_version: string | null
          status: string
          templates: Json
          theme_id: string
          tokens: Json
          version: number
        }
        Insert: {
          ast?: Json
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          merchant_id: string
          note?: string | null
          published_at?: string | null
          rollback_of?: string | null
          source_registry_key?: string | null
          source_registry_version?: string | null
          status?: string
          templates?: Json
          theme_id: string
          tokens?: Json
          version: number
        }
        Update: {
          ast?: Json
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          merchant_id?: string
          note?: string | null
          published_at?: string | null
          rollback_of?: string | null
          source_registry_key?: string | null
          source_registry_version?: string | null
          status?: string
          templates?: Json
          theme_id?: string
          tokens?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "theme_versions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_versions_rollback_of_fkey"
            columns: ["rollback_of"]
            isOneToOne: false
            referencedRelation: "theme_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_versions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "store_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_fingerprints: {
        Row: {
          blocked: boolean
          fingerprint: string
          first_seen_at: string
          last_seen_at: string
          merchant_count: number
        }
        Insert: {
          blocked?: boolean
          fingerprint: string
          first_seen_at?: string
          last_seen_at?: string
          merchant_count?: number
        }
        Update: {
          blocked?: boolean
          fingerprint?: string
          first_seen_at?: string
          last_seen_at?: string
          merchant_count?: number
        }
        Relationships: []
      }
      vat_rates: {
        Row: {
          category: string
          country_code: string
          created_at: string
          effective_year: number
          id: string
          rate_basis_points: number
        }
        Insert: {
          category?: string
          country_code?: string
          created_at?: string
          effective_year: number
          id?: string
          rate_basis_points: number
        }
        Update: {
          category?: string
          country_code?: string
          created_at?: string
          effective_year?: number
          id?: string
          rate_basis_points?: number
        }
        Relationships: []
      }
      wallet_ledger_entries: {
        Row: {
          counterparty_merchant_id: string | null
          created_at: string
          currency_code: string
          direction: string
          gross_minor_int: number
          id: string
          idempotency_key: string
          memo: string | null
          merchant_id: string
          platform_minor_int: number
          reference_id: string | null
          seller_minor_int: number
          source: string
        }
        Insert: {
          counterparty_merchant_id?: string | null
          created_at?: string
          currency_code?: string
          direction: string
          gross_minor_int?: number
          id?: string
          idempotency_key: string
          memo?: string | null
          merchant_id: string
          platform_minor_int?: number
          reference_id?: string | null
          seller_minor_int?: number
          source: string
        }
        Update: {
          counterparty_merchant_id?: string | null
          created_at?: string
          currency_code?: string
          direction?: string
          gross_minor_int?: number
          id?: string
          idempotency_key?: string
          memo?: string | null
          merchant_id?: string
          platform_minor_int?: number
          reference_id?: string | null
          seller_minor_int?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_entries_counterparty_merchant_id_fkey"
            columns: ["counterparty_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_entries_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          amount_minor_int: number | null
          attempt: number
          created_at: string
          currency_code: string
          event_type: string
          id: string
          merchant_id: string | null
          order_id: string | null
          payload: Json
          processed_at: string | null
          provider: string
          reason: string | null
          received_at: string
          redelivery_count: number
          result: Json
          status: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          amount_minor_int?: number | null
          attempt?: number
          created_at?: string
          currency_code?: string
          event_type: string
          id?: string
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          reason?: string | null
          received_at?: string
          redelivery_count?: number
          result?: Json
          status?: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          amount_minor_int?: number | null
          attempt?: number
          created_at?: string
          currency_code?: string
          event_type?: string
          id?: string
          merchant_id?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          reason?: string | null
          received_at?: string
          redelivery_count?: number
          result?: Json
          status?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_assignments: {
        Row: {
          assigned_at: string
          experiment_id: string
          id: string
          merchant_id: string
          subject_key: string
          variant_id: string
        }
        Insert: {
          assigned_at?: string
          experiment_id: string
          id?: string
          merchant_id: string
          subject_key: string
          variant_id: string
        }
        Update: {
          assigned_at?: string
          experiment_id?: string
          id?: string
          merchant_id?: string
          subject_key?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_assignments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "experiment_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_exposures: {
        Row: {
          day: string
          experiment_id: string
          hits: number
          id: string
          merchant_id: string
          metric: string
          value_minor_int: number
          variant_id: string
        }
        Insert: {
          day?: string
          experiment_id: string
          hits?: number
          id?: string
          merchant_id: string
          metric?: string
          value_minor_int?: number
          variant_id: string
        }
        Update: {
          day?: string
          experiment_id?: string
          hits?: number
          id?: string
          merchant_id?: string
          metric?: string
          value_minor_int?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_exposures_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_exposures_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_exposures_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "experiment_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_variants: {
        Row: {
          created_at: string
          experiment_id: string
          id: string
          is_control: boolean
          key: string
          merchant_id: string
          payload: Json
          weight_pct: number
        }
        Insert: {
          created_at?: string
          experiment_id: string
          id?: string
          is_control?: boolean
          key: string
          merchant_id: string
          payload?: Json
          weight_pct?: number
        }
        Update: {
          created_at?: string
          experiment_id?: string
          id?: string
          is_control?: boolean
          key?: string
          merchant_id?: string
          payload?: Json
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "experiment_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_variants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          hypothesis: string
          id: string
          key: string
          merchant_id: string
          name: string
          started_at: string | null
          status: string
          stopped_at: string | null
          surface: string
          traffic_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hypothesis?: string
          id?: string
          key: string
          merchant_id: string
          name?: string
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          surface?: string
          traffic_pct?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hypothesis?: string
          id?: string
          key?: string
          merchant_id?: string
          name?: string
          started_at?: string | null
          status?: string
          stopped_at?: string | null
          surface?: string
          traffic_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_view_events: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          merchant_id: string
          product_id: string
          session_key: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id: string
          product_id: string
          session_key: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id?: string
          product_id?: string
          session_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "storefront_view_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_view_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storefront_view_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandoned_cart_capture: {
        Args: {
          _cart_token: string
          _currency: string
          _email: string
          _lines: Json
          _merchant_id: string
          _name: string
          _phone: string
          _subtotal: number
        }
        Returns: string
      }
      abandoned_cart_mark_recovered: {
        Args: { _cart_token: string; _merchant_id: string; _order_id: string }
        Returns: undefined
      }
      approval_decide: {
        Args: {
          _comment: string
          _decision: Database["public"]["Enums"]["approval_status"]
          _request_id: string
        }
        Returns: Database["public"]["Enums"]["approval_status"]
      }
      approval_submit: {
        Args: {
          _merchant_id: string
          _payload: Json
          _resource_action: string
          _resource_id: string
          _resource_type: string
        }
        Returns: string
      }
      billing_plan_change: {
        Args: {
          _actor: string
          _merchant_id: string
          _target: Database["public"]["Enums"]["billing_plan"]
        }
        Returns: Json
      }
      billing_plan_preview: {
        Args: {
          _merchant_id: string
          _target: Database["public"]["Enums"]["billing_plan"]
        }
        Returns: Json
      }
      billing_sweep: { Args: never; Returns: Json }
      billing_trial_claim: {
        Args: { _actor?: string; _fingerprint: string; _merchant_id: string }
        Returns: Json
      }
      billing_vat_bp: { Args: never; Returns: number }
      catalog_import_apply: { Args: { _job_id: string }; Returns: Json }
      catalog_import_dry_run: {
        Args: {
          _file_name: string
          _merchant_id: string
          _rows: Json
          _source_hash: string
        }
        Returns: Json
      }
      charge_intent_advance: {
        Args: {
          _failure_code?: string
          _intent_id: string
          _provider_reference?: string
          _to: Database["public"]["Enums"]["charge_intent_status"]
        }
        Returns: {
          amount_minor_int: number
          attempt: number
          created_at: string
          currency_code: string
          expires_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider_reference: string | null
          return_nonce: string
          settled_at: string | null
          status: Database["public"]["Enums"]["charge_intent_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "charge_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      charge_intent_open: {
        Args: {
          _idempotency_key: string
          _order_id: string
          _ttl_seconds?: number
        }
        Returns: {
          amount_minor_int: number
          attempt: number
          created_at: string
          currency_code: string
          expires_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider_reference: string | null
          return_nonce: string
          settled_at: string | null
          status: Database["public"]["Enums"]["charge_intent_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "charge_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      charge_intent_sweep: { Args: never; Returns: number }
      check_entitlement: {
        Args: { _key: string; _merchant_id: string }
        Returns: Json
      }
      cod_clear_variance: {
        Args: { _note: string; _recon_id: string }
        Returns: {
          carrier_code: string | null
          cleared_at: string | null
          cleared_by: string | null
          collected_minor_int: number
          created_at: string
          currency_code: string
          expected_minor_int: number
          id: string
          merchant_id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["cod_recon_status"]
          updated_at: string
          variance_minor_int: number
        }
        SetofOptions: {
          from: "*"
          to: "cod_reconciliations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cod_reconcile:
        | {
            Args: {
              _carrier_code?: string
              _collected_minor: number
              _note?: string
              _order_id: string
            }
            Returns: {
              carrier_code: string | null
              cleared_at: string | null
              cleared_by: string | null
              collected_minor_int: number
              created_at: string
              currency_code: string
              expected_minor_int: number
              id: string
              merchant_id: string
              note: string | null
              order_id: string
              status: Database["public"]["Enums"]["cod_recon_status"]
              updated_at: string
              variance_minor_int: number
            }
            SetofOptions: {
              from: "*"
              to: "cod_reconciliations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _reference?: string
              _reported_minor_int: number
              _shipment_id: string
            }
            Returns: Json
          }
      collection_resolve: {
        Args: { _collection_id: string }
        Returns: string[]
      }
      consent_record: {
        Args: {
          _actor?: string
          _channel: Database["public"]["Enums"]["consent_channel"]
          _customer_id?: string
          _granted: boolean
          _merchant_id: string
          _purpose: Database["public"]["Enums"]["consent_purpose"]
          _reason?: string
          _session_token?: string
          _source: string
          _subject_hash?: string
          _subscriber_id?: string
        }
        Returns: Json
      }
      courier_apply_event: {
        Args: {
          _event_id: string
          _occurred_at: string
          _payload: Json
          _shipment_id: string
          _source: string
          _status: Database["public"]["Enums"]["shipment_status"]
        }
        Returns: Json
      }
      courier_dead_letter: {
        Args: {
          _carrier_code: string
          _event_id: string
          _payload: Json
          _reason: string
        }
        Returns: Json
      }
      courier_ingest_event: {
        Args: {
          _awb: string
          _carrier_code: string
          _event_id: string
          _occurred_at: string
          _payload: Json
          _status: Database["public"]["Enums"]["shipment_status"]
        }
        Returns: Json
      }
      courier_replay_event: {
        Args: { _id: string; _merchant_id: string }
        Returns: Json
      }
      courier_sweep: { Args: never; Returns: Json }
      create_store: {
        Args: {
          p_name: string
          p_plan: Database["public"]["Enums"]["billing_plan"]
          p_slug: string
        }
        Returns: string
      }
      customer_delete_address: {
        Args: { _address_id: string; _merchant_id: string }
        Returns: undefined
      }
      customer_order_detail: {
        Args: { _merchant_id: string; _order_id: string }
        Returns: Json
      }
      customer_overview: { Args: { _merchant_id: string }; Returns: Json }
      customer_save_address: {
        Args: {
          _address_id: string
          _address_type: Database["public"]["Enums"]["address_type"]
          _city: string
          _district: string
          _full_name: string
          _is_default: boolean
          _label: string
          _line1: string
          _line2: string
          _merchant_id: string
          _phone: string
          _postcode: string
        }
        Returns: string
      }
      customer_self: { Args: { _merchant_id: string }; Returns: string }
      customer_set_consent: {
        Args: {
          _channel: Database["public"]["Enums"]["consent_channel"]
          _granted: boolean
          _merchant_id: string
          _purpose: Database["public"]["Enums"]["consent_purpose"]
        }
        Returns: undefined
      }
      customer_toggle_wishlist: {
        Args: {
          _merchant_id: string
          _stock_alert?: boolean
          _variant_id: string
        }
        Returns: boolean
      }
      customer_upsert_self: {
        Args: {
          _email: string
          _locale?: string
          _merchant_id: string
          _name: string
          _phone: string
        }
        Returns: string
      }
      digital_grant_consume: { Args: { _token: string }; Returns: Json }
      digital_grant_issue: {
        Args: {
          _asset_id: string
          _customer_id: string
          _merchant_id: string
          _order_id: string
          _token: string
        }
        Returns: string
      }
      dispute_advance: {
        Args: {
          _dispute_id: string
          _note: string
          _to: Database["public"]["Enums"]["dispute_status"]
        }
        Returns: {
          amount_minor_int: number
          created_at: string
          currency_code: string
          due_at: string | null
          evidence: string | null
          id: string
          merchant_id: string
          order_id: string
          provider: string | null
          provider_reference: string | null
          reason: string
          reference: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "disputes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      form_submit: {
        Args: {
          _consent?: boolean
          _merchant_id: string
          _payload: Json
          _slug: string
        }
        Returns: string
      }
      fulfilment_create: {
        Args: {
          _idempotency_key: string
          _items: Json
          _location_id: string
          _order_id: string
        }
        Returns: {
          carrier_code: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          id: string
          idempotency_key: string
          location_id: string | null
          merchant_id: string
          order_id: string
          reference: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["fulfilment_status"]
          tracking_number: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "fulfilments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gateway_apply_webhook: {
        Args: {
          _amount_minor_int: number
          _attempt: number
          _currency_code: string
          _event_type: string
          _merchant_id: string
          _order_id: string
          _payload: Json
          _provider: string
          _webhook_id: string
        }
        Returns: Json
      }
      gift_card_issue: {
        Args: {
          _amount_minor: number
          _code: string
          _currency: string
          _email: string
          _expires_at: string
          _merchant_id: string
          _phone: string
        }
        Returns: {
          balance_minor_int: number
          code: string
          created_at: string
          currency_code: string
          expires_at: string | null
          id: string
          initial_minor_int: number
          issued_by: string | null
          merchant_id: string
          recipient_email: string | null
          recipient_phone: string | null
          status: Database["public"]["Enums"]["gift_card_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gift_card_redeem: {
        Args: {
          _amount_minor: number
          _code: string
          _idempotency_key: string
          _merchant_id: string
          _order_id: string
        }
        Returns: Json
      }
      has_merchant_role: {
        Args: {
          _merchant_id: string
          _roles: Database["public"]["Enums"]["merchant_role"][]
        }
        Returns: boolean
      }
      impersonation_consent: {
        Args: { _approve: boolean; _grant_id: string }
        Returns: {
          consent_at: string | null
          consent_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          merchant_id: string
          reason: string
          requested_at: string
          requested_by: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string
          use_count: number
        }
        SetofOptions: {
          from: "*"
          to: "impersonation_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      impersonation_request: {
        Args: {
          _merchant_id: string
          _minutes?: number
          _reason: string
          _scope?: string
        }
        Returns: {
          consent_at: string | null
          consent_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          merchant_id: string
          reason: string
          requested_at: string
          requested_by: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string
          use_count: number
        }
        SetofOptions: {
          from: "*"
          to: "impersonation_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      impersonation_revoke: {
        Args: { _grant_id: string }
        Returns: {
          consent_at: string | null
          consent_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          merchant_id: string
          reason: string
          requested_at: string
          requested_by: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string
          use_count: number
        }
        SetofOptions: {
          from: "*"
          to: "impersonation_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      impersonation_use: {
        Args: { _action: string; _grant_id: string }
        Returns: {
          consent_at: string | null
          consent_by: string | null
          expires_at: string
          id: string
          last_used_at: string | null
          merchant_id: string
          reason: string
          requested_at: string
          requested_by: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string
          use_count: number
        }
        SetofOptions: {
          from: "*"
          to: "impersonation_grants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      inventory_transfer_receive: {
        Args: { _transfer_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          merchant_id: string
          note: string | null
          received_at: string | null
          reference: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_merchant_member: { Args: { _merchant_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      kyc_review: {
        Args: {
          _merchant_id: string
          _reason: string
          _state: Database["public"]["Enums"]["kyc_state"]
        }
        Returns: Database["public"]["Enums"]["kyc_state"]
      }
      kyc_submit: {
        Args: { _merchant_id: string; _profile: Json }
        Returns: Database["public"]["Enums"]["kyc_state"]
      }
      market_apply_theme_install: {
        Args: { _install_id: string }
        Returns: string
      }
      market_revert_theme_install: {
        Args: { _install_id: string }
        Returns: string
      }
      merchant_save_setup: {
        Args: { _merchant_id: string; _patch: Json }
        Returns: Json
      }
      merchant_setup_state: { Args: { _merchant_id: string }; Returns: Json }
      money_conformance: { Args: never; Returns: Json }
      notifications_mark_read: {
        Args: { _ids?: string[]; _merchant_id: string }
        Returns: number
      }
      notifications_sweep: { Args: never; Returns: Json }
      notify_merchant: {
        Args: {
          _body_bn: string
          _body_en: string
          _dedupe_key?: string
          _entity_id?: string
          _href?: string
          _kind: string
          _merchant_id: string
          _severity: Database["public"]["Enums"]["notification_severity"]
          _title_bn: string
          _title_en: string
        }
        Returns: string
      }
      ops_retention_sweep: { Args: never; Returns: Json }
      ops_status_public: { Args: never; Returns: Json }
      order_amend: {
        Args: {
          _new_discount_minor: number
          _new_shipping_minor: number
          _order_id: string
          _reason: string
        }
        Returns: Json
      }
      order_invoice_issue: {
        Args: { _order_id: string }
        Returns: {
          business_bin: string | null
          created_at: string
          currency_code: string
          discount_minor_int: number
          id: string
          invoice_number: string
          issued_at: string
          merchant_id: string
          order_id: string
          sequence_no: number
          sequence_year: number
          shipping_minor_int: number
          subtotal_minor_int: number
          total_minor_int: number
          vat_minor_int: number
          vat_rate_basis_points: number
        }
        SetofOptions: {
          from: "*"
          to: "order_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      order_public_view: {
        Args: { _order_id: string; _token: string }
        Returns: Json
      }
      platform_audit_event: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _entity: string
          _entity_id: string
          _scope?: string
        }
        Returns: undefined
      }
      platform_clear_tenant_limits: {
        Args: { _merchant_id: string }
        Returns: undefined
      }
      platform_flag_enabled: { Args: { _key: string }; Returns: boolean }
      platform_log_audit: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
      platform_merchant_reinstate: {
        Args: { _merchant_id: string; _note?: string }
        Returns: {
          id: string
          merchant_id: string
          payments_frozen: boolean
          reason: string
          reinstate_note: string | null
          reinstated_at: string | null
          reinstated_by: string | null
          suspended_at: string
          suspended_by: string
        }
        SetofOptions: {
          from: "*"
          to: "merchant_suspensions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_merchant_suspend: {
        Args: {
          _freeze_payments?: boolean
          _merchant_id: string
          _reason: string
        }
        Returns: {
          id: string
          merchant_id: string
          payments_frozen: boolean
          reason: string
          reinstate_note: string | null
          reinstated_at: string | null
          reinstated_by: string | null
          suspended_at: string
          suspended_by: string
        }
        SetofOptions: {
          from: "*"
          to: "merchant_suspensions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_save_plan: {
        Args: { _plan: Json }
        Returns: {
          active: boolean
          created_at: string
          currency_code: string
          feature_flags: Json
          features: Json
          payment_methods_allowed: Json
          plan: Database["public"]["Enums"]["billing_plan"]
          price_minor_int: number | null
          products_limit: number
          sort_order: number
          staff_limit: number
          title_bn: string
          title_en: string
          trial_days: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "plan_definitions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_set_flag: {
        Args: { _key: string; _value: Json }
        Returns: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        SetofOptions: {
          from: "*"
          to: "platform_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_set_tenant_limits: {
        Args: {
          _merchant_id: string
          _products_limit: number
          _staff_limit: number
        }
        Returns: {
          created_at: string
          merchant_id: string
          products_limit: number
          staff_limit: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_limits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pos_refund: {
        Args: {
          _amount_minor_int: number
          _idempotency_key: string
          _lines: Json
          _merchant_id: string
          _method: Database["public"]["Enums"]["pos_payment_method"]
          _pos_order_id: string
          _reason: string
          _restock: boolean
          _staff_user_id: string
        }
        Returns: Json
      }
      pos_sale_capture: {
        Args: {
          _captured_at: string
          _client_id: string
          _customer: Json
          _discount_minor_int: number
          _lines: Json
          _merchant_id: string
          _origin: Database["public"]["Enums"]["pos_origin"]
          _session_id: string
          _tenders: Json
        }
        Returns: Json
      }
      pos_shift_report: {
        Args: { _merchant_id: string; _session_id: string }
        Returns: Json
      }
      rate_limit_hit: {
        Args: {
          _bucket: string
          _limit: number
          _subject: string
          _window_seconds: number
        }
        Returns: Json
      }
      refund_advance: {
        Args: {
          _failure_code?: string
          _provider_reference?: string
          _refund_id: string
          _to: string
        }
        Returns: {
          amount_minor_int: number
          attempt: number
          created_at: string
          currency_code: string
          failure_code: string | null
          id: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          order_id: string
          payment_provider: string | null
          provider_reference: string | null
          reason: string | null
          refund_key: string
          requested_by: string | null
          settled_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_request: {
        Args: {
          _amount_minor: number
          _order_id: string
          _reason: string
          _refund_key: string
        }
        Returns: {
          amount_minor_int: number
          attempt: number
          created_at: string
          currency_code: string
          failure_code: string | null
          id: string
          merchant_id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          order_id: string
          payment_provider: string | null
          provider_reference: string | null
          reason: string | null
          refund_key: string
          requested_by: string | null
          settled_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_advance: {
        Args: {
          _note: string
          _return_id: string
          _to: Database["public"]["Enums"]["return_status"]
        }
        Returns: {
          created_at: string
          currency_code: string
          customer_note: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          merchant_id: string
          order_id: string
          reason: string
          reference: string
          refund_id: string | null
          refund_minor_int: number
          staff_note: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_open: {
        Args: {
          _access_token?: string
          _items: Json
          _note: string
          _order_id: string
          _reason: string
        }
        Returns: {
          created_at: string
          currency_code: string
          customer_note: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          merchant_id: string
          order_id: string
          reason: string
          reference: string
          refund_id: string | null
          refund_minor_int: number
          staff_note: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_agg: { Args: { _product_id: string }; Returns: Json }
      review_list_published: {
        Args: { _limit?: number; _product_id: string }
        Returns: Json
      }
      review_moderate: {
        Args: {
          _note: string
          _review_id: string
          _status: Database["public"]["Enums"]["review_status"]
        }
        Returns: undefined
      }
      review_reply: {
        Args: { _body: string; _review_id: string }
        Returns: undefined
      }
      review_submit: {
        Args: {
          _author_name: string
          _body: string
          _merchant_id: string
          _product_id: string
          _rating: number
          _title: string
        }
        Returns: string
      }
      schema_fingerprint: { Args: never; Returns: Json }
      settlement_ingest: {
        Args: {
          _file_date: string
          _file_hash: string
          _items: Json
          _merchant_id: string
          _provider: string
        }
        Returns: {
          created_at: string
          currency_code: string
          fee_minor_int: number
          file_date: string
          file_hash: string
          gross_minor_int: number
          id: string
          item_count: number
          matched_count: number
          merchant_id: string
          net_minor_int: number
          posted_at: string | null
          provider: string
          reject_reason: string | null
          status: Database["public"]["Enums"]["settlement_file_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "settlement_files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      settlement_resolve_alert: {
        Args: { _alert_id: string; _note: string }
        Returns: {
          actual_minor_int: number
          created_at: string
          expected_minor_int: number
          file_id: string
          id: string
          item_id: string | null
          kind: string
          merchant_id: string
          resolution_note: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "settlement_variance_alerts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shipment_rank: {
        Args: { _s: Database["public"]["Enums"]["shipment_status"] }
        Returns: number
      }
      shipment_tracking_public: { Args: { _token: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_row: {
        Args: {
          _id: string
          _merchant_id: string
          _restore?: boolean
          _table: string
        }
        Returns: boolean
      }
      staff_delete_role: { Args: { _role_id: string }; Returns: boolean }
      staff_has: {
        Args: { _action: string; _group: string; _merchant_id: string }
        Returns: boolean
      }
      staff_normalize_grants: {
        Args: { _grants: Json; _owner: boolean }
        Returns: Json
      }
      staff_permission_matrix: { Args: never; Returns: Json }
      staff_save_role: {
        Args: {
          _grants: Json
          _merchant_id: string
          _name: string
          _role_id: string
        }
        Returns: string
      }
      staff_set_member: {
        Args: {
          _member_id: string
          _role_id: string
          _status: Database["public"]["Enums"]["staff_status"]
        }
        Returns: undefined
      }
      staff_set_own_mfa: {
        Args: {
          _merchant_id: string
          _status: Database["public"]["Enums"]["staff_mfa_status"]
        }
        Returns: Database["public"]["Enums"]["staff_mfa_status"]
      }
      step_up_consume: {
        Args: { _action: string; _merchant_id?: string }
        Returns: boolean
      }
      stock_hold_acquire: {
        Args: {
          _checkout_token: string
          _lines: Json
          _merchant_id: string
          _ttl_seconds?: number
        }
        Returns: Json
      }
      stock_hold_consume: {
        Args: { _checkout_token: string; _order_id: string }
        Returns: number
      }
      stock_hold_release: { Args: { _checkout_token: string }; Returns: number }
      stock_hold_sweep: { Args: never; Returns: number }
      store_slug_status: { Args: { p_slug: string }; Returns: string }
      storefront_search: {
        Args: {
          _category?: string
          _collection?: string
          _in_stock?: boolean
          _kind?: Database["public"]["Enums"]["product_kind"]
          _limit?: number
          _max_minor?: number
          _min_minor?: number
          _offset?: number
          _q?: string
          _slug: string
          _sort?: string
        }
        Returns: Json
      }
      tenant_cancel_purge: {
        Args: { _reason: string; _request_id: string }
        Returns: undefined
      }
      tenant_execute_purge: { Args: { _request_id: string }; Returns: Json }
      tenant_request_purge: {
        Args: { _delay_days?: number; _merchant_id: string; _reason: string }
        Returns: string
      }
      theme_autosave: {
        Args: {
          _revision?: number
          _templates: Json
          _theme_id: string
          _tokens?: Json
        }
        Returns: Json
      }
      theme_commit: {
        Args: {
          _label?: string
          _note?: string
          _templates: Json
          _theme_id: string
          _tokens?: Json
        }
        Returns: string
      }
      theme_install_preset: {
        Args: {
          _key: string
          _merchant_id: string
          _overwrite_draft?: boolean
          _preset: Json
        }
        Returns: string
      }
      theme_install_registry: {
        Args: { _key: string; _merchant_id: string }
        Returns: string
      }
      theme_publish: { Args: { _version_id: string }; Returns: string }
      theme_rollback: { Args: { _version_id: string }; Returns: string }
      theme_save_draft: {
        Args: { _ast: Json; _note?: string; _theme_id: string; _tokens?: Json }
        Returns: string
      }
      theme_schedule_cancel: {
        Args: { _schedule_id: string }
        Returns: boolean
      }
      theme_schedule_set: {
        Args: {
          _action: string
          _run_at: string
          _theme_id: string
          _version_id: string
        }
        Returns: string
      }
      theme_sweep: { Args: never; Returns: Json }
      theme_update_apply: {
        Args: {
          _expected_revision?: number
          _key: string
          _mode: string
          _templates: Json
          _theme_id: string
          _tokens: Json
          _version: string
        }
        Returns: Json
      }
      vat_resolve: {
        Args: { _category: string; _country: string; _year: number }
        Returns: Json
      }
      courier_shipment_rank: {
        Args: { _s: Database["public"]["Enums"]["shipment_status"] }
        Returns: number
      }
      experiment_assign: {
        Args: { _key: string; _merchant_id: string; _subject_key: string }
        Returns: Json
      }
      experiment_convert: {
        Args: {
          _key: string
          _merchant_id: string
          _metric: string
          _subject_key: string
          _value_minor?: number
        }
        Returns: boolean
      }
      is_merchant_admin: {
        Args: { _merchant_id: string; _user_id?: string }
        Returns: boolean
      }
      product_recommendations: {
        Args: { _limit?: number; _merchant_id: string; _product_id: string }
        Returns: Json
      }
      storefront_recently_viewed: {
        Args: {
          _exclude?: string
          _limit?: number
          _merchant_id: string
          _session_key: string
        }
        Returns: Json
      }
      storefront_track_view: {
        Args: {
          _merchant_id: string
          _product_id: string
          _session_key: string
        }
        Returns: undefined
      }
    }
    Enums: {
      abandoned_cart_status: "active" | "recovered" | "lost"
      address_type: "shipping" | "billing"
      ai_channel: "widget" | "admin"
      ai_conversation_status: "open" | "needs_agent" | "resolved" | "closed"
      ai_message_role: "customer" | "bot" | "agent"
      api_key_env: "test" | "live"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
        | "cancelled"
      billing_plan: "launch" | "growth" | "business" | "enterprise"
      catalog_status: "draft" | "active" | "archived"
      charge_intent_status:
        | "initiated"
        | "pending"
        | "paid"
        | "failed"
        | "expired"
        | "cancelled"
      cod_recon_status: "pending" | "matched" | "variance" | "cleared"
      cod_settlement_state:
        | "pending"
        | "matched"
        | "mismatch"
        | "settled"
        | "written_off"
      consent_channel: "email" | "sms" | "push"
      consent_purpose: "marketing" | "cart_recovery" | "stock_alerts"
      coupon_status: "draft" | "active" | "paused" | "expired"
      coupon_type: "fixed" | "percent" | "bogo" | "free_shipping"
      courier_event_status:
        | "processed"
        | "duplicate"
        | "rejected"
        | "dead_letter"
        | "replayed"
      dispute_status:
        | "open"
        | "evidence_submitted"
        | "won"
        | "lost"
        | "withdrawn"
      export_job_status:
        | "queued"
        | "generating"
        | "signing"
        | "ready_for_download"
        | "downloaded"
        | "expired"
        | "fail_retry"
      export_object_type:
        | "orders"
        | "products"
        | "customers"
        | "product_events"
        | "analytics_raw"
      fraud_blacklist_kind: "phone" | "email"
      fraud_case_status: "open" | "evidence_requested" | "approved" | "rejected"
      fulfilment_status:
        | "pending"
        | "packed"
        | "shipped"
        | "delivered"
        | "cancelled"
      gift_card_status: "active" | "redeemed" | "expired" | "void"
      invoice_status: "open" | "paid" | "past_due" | "void"
      kyc_state: "pending" | "submitted" | "verified" | "rejected"
      kyc_status: "pending" | "verified" | "rejected"
      market_install_status: "installed" | "trial" | "paused" | "rolled_back"
      market_kind: "theme" | "widget"
      market_listing_status:
        | "draft"
        | "review"
        | "active"
        | "paused"
        | "archived"
      merchant_role: "owner" | "admin" | "staff" | "viewer"
      merchant_status: "active" | "suspended" | "pending"
      notification_severity: "info" | "warning" | "critical"
      order_status:
        | "pending"
        | "payment_pending"
        | "confirmed"
        | "paid"
        | "fulfilled"
        | "cancelled"
        | "refunded"
        | "packed"
        | "shipped"
        | "delivered"
        | "refund_requested"
      payment_method: "cod" | "bkash" | "nagad" | "rocket"
      pos_order_status:
        | "local_pending"
        | "synced"
        | "paid"
        | "delivered"
        | "voided"
      pos_origin: "offline" | "online"
      pos_payment_method: "cash" | "card" | "cod"
      pos_session_status: "open" | "closed"
      product_kind: "physical" | "digital" | "service" | "subscription"
      product_status: "draft" | "active" | "archived"
      return_status:
        | "requested"
        | "approved"
        | "rejected"
        | "received"
        | "refunded"
        | "cancelled"
      review_status: "pending" | "published" | "rejected"
      seo_entity_type: "store" | "product" | "collection" | "page" | "article"
      settlement_file_status:
        | "received"
        | "parsed"
        | "matched"
        | "posted"
        | "rejected"
        | "variance_hold"
      shipment_status:
        | "created"
        | "pickup_scheduled"
        | "picked_up"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
        | "failed_attempt"
        | "returned"
      staff_mfa_status: "none" | "enrolled" | "enforced"
      staff_status: "invited" | "active" | "suspended" | "removed"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "paused"
        | "cancelled"
      sync_status: "pending" | "synced" | "failed"
      transfer_status: "draft" | "in_transit" | "received" | "cancelled"
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
      abandoned_cart_status: ["active", "recovered", "lost"],
      address_type: ["shipping", "billing"],
      ai_channel: ["widget", "admin"],
      ai_conversation_status: ["open", "needs_agent", "resolved", "closed"],
      ai_message_role: ["customer", "bot", "agent"],
      api_key_env: ["test", "live"],
      approval_status: [
        "pending",
        "approved",
        "rejected",
        "expired",
        "cancelled",
      ],
      billing_plan: ["launch", "growth", "business", "enterprise"],
      catalog_status: ["draft", "active", "archived"],
      charge_intent_status: [
        "initiated",
        "pending",
        "paid",
        "failed",
        "expired",
        "cancelled",
      ],
      cod_recon_status: ["pending", "matched", "variance", "cleared"],
      cod_settlement_state: [
        "pending",
        "matched",
        "mismatch",
        "settled",
        "written_off",
      ],
      consent_channel: ["email", "sms", "push"],
      consent_purpose: ["marketing", "cart_recovery", "stock_alerts"],
      coupon_status: ["draft", "active", "paused", "expired"],
      coupon_type: ["fixed", "percent", "bogo", "free_shipping"],
      courier_event_status: [
        "processed",
        "duplicate",
        "rejected",
        "dead_letter",
        "replayed",
      ],
      dispute_status: [
        "open",
        "evidence_submitted",
        "won",
        "lost",
        "withdrawn",
      ],
      export_job_status: [
        "queued",
        "generating",
        "signing",
        "ready_for_download",
        "downloaded",
        "expired",
        "fail_retry",
      ],
      export_object_type: [
        "orders",
        "products",
        "customers",
        "product_events",
        "analytics_raw",
      ],
      fraud_blacklist_kind: ["phone", "email"],
      fraud_case_status: ["open", "evidence_requested", "approved", "rejected"],
      fulfilment_status: [
        "pending",
        "packed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      gift_card_status: ["active", "redeemed", "expired", "void"],
      invoice_status: ["open", "paid", "past_due", "void"],
      kyc_state: ["pending", "submitted", "verified", "rejected"],
      kyc_status: ["pending", "verified", "rejected"],
      market_install_status: ["installed", "trial", "paused", "rolled_back"],
      market_kind: ["theme", "widget"],
      market_listing_status: [
        "draft",
        "review",
        "active",
        "paused",
        "archived",
      ],
      merchant_role: ["owner", "admin", "staff", "viewer"],
      merchant_status: ["active", "suspended", "pending"],
      notification_severity: ["info", "warning", "critical"],
      order_status: [
        "pending",
        "payment_pending",
        "confirmed",
        "paid",
        "fulfilled",
        "cancelled",
        "refunded",
        "packed",
        "shipped",
        "delivered",
        "refund_requested",
      ],
      payment_method: ["cod", "bkash", "nagad", "rocket"],
      pos_order_status: [
        "local_pending",
        "synced",
        "paid",
        "delivered",
        "voided",
      ],
      pos_origin: ["offline", "online"],
      pos_payment_method: ["cash", "card", "cod"],
      pos_session_status: ["open", "closed"],
      product_kind: ["physical", "digital", "service", "subscription"],
      product_status: ["draft", "active", "archived"],
      return_status: [
        "requested",
        "approved",
        "rejected",
        "received",
        "refunded",
        "cancelled",
      ],
      review_status: ["pending", "published", "rejected"],
      seo_entity_type: ["store", "product", "collection", "page", "article"],
      settlement_file_status: [
        "received",
        "parsed",
        "matched",
        "posted",
        "rejected",
        "variance_hold",
      ],
      shipment_status: [
        "created",
        "pickup_scheduled",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "failed_attempt",
        "returned",
      ],
      staff_mfa_status: ["none", "enrolled", "enforced"],
      staff_status: ["invited", "active", "suspended", "removed"],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "paused",
        "cancelled",
      ],
      sync_status: ["pending", "synced", "failed"],
      transfer_status: ["draft", "in_transit", "received", "cancelled"],
    },
  },
} as const
