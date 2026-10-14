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
      context_events: {
        Row: {
          ends_at: string
          id: string
          kind: string
          label: string
          location_id: string | null
          org_id: string
          starts_at: string
        }
        Insert: {
          ends_at: string
          id?: string
          kind: string
          label: string
          location_id?: string | null
          org_id: string
          starts_at: string
        }
        Update: {
          ends_at?: string
          id?: string
          kind?: string
          label?: string
          location_id?: string | null
          org_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      exposure_daily: {
        Row: {
          count: number
          day: string
          location_id: string
        }
        Insert: {
          count: number
          day: string
          location_id: string
        }
        Update: {
          count?: number
          day?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exposure_daily_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      footfall_hourly: {
        Row: {
          count: number
          hour_start: string
          location_id: string
        }
        Insert: {
          count: number
          hour_start: string
          location_id: string
        }
        Update: {
          count?: number
          hour_start?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "footfall_hourly_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          category: string
          id: string
          intervention: string | null
          intervention_at: string | null
          location_id: string
          notes: string | null
          opened_at: string
          org_id: string
          owner: string | null
          resolved_at: string | null
          status: string
          title: string
        }
        Insert: {
          category: string
          id?: string
          intervention?: string | null
          intervention_at?: string | null
          location_id: string
          notes?: string | null
          opened_at: string
          org_id: string
          owner?: string | null
          resolved_at?: string | null
          status?: string
          title: string
        }
        Update: {
          category?: string
          id?: string
          intervention?: string | null
          intervention_at?: string | null
          location_id?: string
          notes?: string | null
          opened_at?: string
          org_id?: string
          owner?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          id: string
          kind: string
          label: string
          lat: number | null
          level: Database["public"]["Enums"]["location_level"]
          lng: number | null
          org_id: string
          parent_id: string | null
          ref: string
          schematic_x: number | null
          schematic_y: number | null
          sort: number
        }
        Insert: {
          id?: string
          kind: string
          label: string
          lat?: number | null
          level: Database["public"]["Enums"]["location_level"]
          lng?: number | null
          org_id: string
          parent_id?: string | null
          ref: string
          schematic_x?: number | null
          schematic_y?: number | null
          sort?: number
        }
        Update: {
          id?: string
          kind?: string
          label?: string
          lat?: number | null
          level?: Database["public"]["Enums"]["location_level"]
          lng?: number | null
          org_id?: string
          parent_id?: string | null
          ref?: string
          schematic_x?: number | null
          schematic_y?: number | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
          sector: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sector: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sector?: string
          slug?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          active_from: string
          active_to: string | null
          code: string
          id: string
          is_primary: boolean
          org_id: string
          scale: Json
          version: number
          wording: string
        }
        Insert: {
          active_from: string
          active_to?: string | null
          code: string
          id?: string
          is_primary?: boolean
          org_id: string
          scale: Json
          version?: number
          wording: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          code?: string
          id?: string
          is_primary?: boolean
          org_id?: string
          scale?: Json
          version?: number
          wording?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          after_dark: boolean
          answered_at: string
          channel: string
          comment: string | null
          id: string
          is_valid: boolean
          issue_category: string | null
          location_id: string
          org_id: string
          question_id: string
          respondent_key: string | null
          segment: string | null
          severity: string | null
          value: string
        }
        Insert: {
          after_dark?: boolean
          answered_at: string
          channel?: string
          comment?: string | null
          id?: string
          is_valid?: boolean
          issue_category?: string | null
          location_id: string
          org_id: string
          question_id: string
          respondent_key?: string | null
          segment?: string | null
          severity?: string | null
          value: string
        }
        Update: {
          after_dark?: boolean
          answered_at?: string
          channel?: string
          comment?: string | null
          id?: string
          is_valid?: boolean
          issue_category?: string | null
          location_id?: string
          org_id?: string
          question_id?: string
          respondent_key?: string | null
          segment?: string | null
          severity?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      service_hourly: {
        Row: {
          buses_run: number
          buses_scheduled: number
          hour_start: string
          location_id: string
          on_time: number
        }
        Insert: {
          buses_run: number
          buses_scheduled: number
          hour_start: string
          location_id: string
          on_time: number
        }
        Update: {
          buses_run?: number
          buses_scheduled?: number
          hour_start?: string
          location_id?: string
          on_time?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_hourly_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weather_hourly: {
        Row: {
          hour_start: string
          is_dark: boolean
          org_id: string
          precip_mm: number
          temp_c: number
          wind_kmh: number
        }
        Insert: {
          hour_start: string
          is_dark: boolean
          org_id: string
          precip_mm?: number
          temp_c: number
          wind_kmh?: number
        }
        Update: {
          hour_start?: string
          is_dark?: boolean
          org_id?: string
          precip_mm?: number
          temp_c?: number
          wind_kmh?: number
        }
        Relationships: [
          {
            foreignKeyName: "weather_hourly_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "staff"
      location_level: "site" | "zone" | "point"
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
      app_role: ["admin", "staff"],
      location_level: ["site", "zone", "point"],
    },
  },
} as const

