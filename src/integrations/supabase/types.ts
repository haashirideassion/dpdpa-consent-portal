export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      consent_logs: {
        Row: {
          consent_status: string;
          consent_version: string;
          created_at: string;
          employee_id: string;
          id: string;
          ip_address: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          consent_status?: string;
          consent_version?: string;
          created_at?: string;
          employee_id: string;
          id?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          consent_status?: string;
          consent_version?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consent_logs_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          aadhaar_number: string | null;
          alternate_phone: string | null;
          bank_account_number: string | null;
          bank_name: string | null;
          blood_group: string | null;
          certifications: string | null;
          city: string | null;
          created_at: string;
          ctc: string | null;
          current_address: string | null;
          date_of_birth: string | null;
          date_of_joining: string;
          department: string;
          designation: string;
          driving_license: string | null;
          emergency_contact_email: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relation: string | null;
          employee_id: string;
          employee_status: string | null;
          employment_type: string | null;
          first_name: string;
          gender: string | null;
          id: string;
          ifsc_code: string | null;
          languages: string | null;
          last_name: string;
          marital_status: string | null;
          nationality: string | null;
          notes: string | null;
          pan_number: string | null;
          passport_expiry: string | null;
          passport_number: string | null;
          permanent_address: string | null;
          personal_email: string | null;
          phone_number: string | null;
          photo_url: string | null;
          pincode: string | null;
          qualifications: string | null;
          reporting_manager: string | null;
          state: string | null;
          uan_number: string | null;
          updated_at: string;
          voter_id: string | null;
          work_email: string;
          work_location: string | null;
        };
        Insert: {
          aadhaar_number?: string | null;
          alternate_phone?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          blood_group?: string | null;
          certifications?: string | null;
          city?: string | null;
          created_at?: string;
          ctc?: string | null;
          current_address?: string | null;
          date_of_birth?: string | null;
          date_of_joining: string;
          department: string;
          designation: string;
          driving_license?: string | null;
          emergency_contact_email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null;
          employee_id: string;
          employee_status?: string | null;
          employment_type?: string | null;
          first_name: string;
          gender?: string | null;
          id?: string;
          ifsc_code?: string | null;
          languages?: string | null;
          last_name: string;
          marital_status?: string | null;
          nationality?: string | null;
          notes?: string | null;
          pan_number?: string | null;
          passport_expiry?: string | null;
          passport_number?: string | null;
          permanent_address?: string | null;
          personal_email?: string | null;
          phone_number?: string | null;
          photo_url?: string | null;
          pincode?: string | null;
          qualifications?: string | null;
          reporting_manager?: string | null;
          state?: string | null;
          uan_number?: string | null;
          updated_at?: string;
          voter_id?: string | null;
          work_email: string;
          work_location?: string | null;
        };
        Update: {
          aadhaar_number?: string | null;
          alternate_phone?: string | null;
          bank_account_number?: string | null;
          bank_name?: string | null;
          blood_group?: string | null;
          certifications?: string | null;
          city?: string | null;
          created_at?: string;
          ctc?: string | null;
          current_address?: string | null;
          date_of_birth?: string | null;
          date_of_joining?: string;
          department?: string;
          designation?: string;
          driving_license?: string | null;
          emergency_contact_email?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relation?: string | null;
          employee_id?: string;
          employee_status?: string | null;
          employment_type?: string | null;
          first_name?: string;
          gender?: string | null;
          id?: string;
          ifsc_code?: string | null;
          languages?: string | null;
          last_name?: string;
          marital_status?: string | null;
          nationality?: string | null;
          notes?: string | null;
          pan_number?: string | null;
          passport_expiry?: string | null;
          passport_number?: string | null;
          permanent_address?: string | null;
          personal_email?: string | null;
          phone_number?: string | null;
          photo_url?: string | null;
          pincode?: string | null;
          qualifications?: string | null;
          reporting_manager?: string | null;
          state?: string | null;
          uan_number?: string | null;
          updated_at?: string;
          voter_id?: string | null;
          work_email?: string;
          work_location?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          employee_id: string | null;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          employee_id?: string | null;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          employee_id?: string | null;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_employee_id_for_user: { Args: { _user_id: string }; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "employee";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "employee"],
    },
  },
} as const;
