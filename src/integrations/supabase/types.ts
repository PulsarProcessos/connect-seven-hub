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
      conciliacao_extrato: {
        Row: {
          conciliado_por: string | null
          created_at: string
          data_identificacao: string
          id: string
          id_conta_bancaria: string
          id_extrato_lancamento: string | null
          id_loja: string
          id_venda_ucase: string
          tipo: string
          valor_pago_banco: number
        }
        Insert: {
          conciliado_por?: string | null
          created_at?: string
          data_identificacao?: string
          id?: string
          id_conta_bancaria: string
          id_extrato_lancamento?: string | null
          id_loja: string
          id_venda_ucase: string
          tipo?: string
          valor_pago_banco: number
        }
        Update: {
          conciliado_por?: string | null
          created_at?: string
          data_identificacao?: string
          id?: string
          id_conta_bancaria?: string
          id_extrato_lancamento?: string | null
          id_loja?: string
          id_venda_ucase?: string
          tipo?: string
          valor_pago_banco?: number
        }
        Relationships: [
          {
            foreignKeyName: "conciliacao_extrato_conciliado_por_fkey"
            columns: ["conciliado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_extrato_id_conta_bancaria_fkey"
            columns: ["id_conta_bancaria"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_extrato_id_extrato_lancamento_fkey"
            columns: ["id_extrato_lancamento"]
            isOneToOne: false
            referencedRelation: "extrato_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_extrato_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacao_extrato_id_venda_ucase_fkey"
            columns: ["id_venda_ucase"]
            isOneToOne: false
            referencedRelation: "vendas_ucase"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string
          ativa: boolean
          banco: string
          conta: string
          created_at: string
          id: string
          id_loja: string
        }
        Insert: {
          agencia: string
          ativa?: boolean
          banco: string
          conta: string
          created_at?: string
          id?: string
          id_loja: string
        }
        Update: {
          agencia?: string
          ativa?: boolean
          banco?: string
          conta?: string
          created_at?: string
          id?: string
          id_loja?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          id_grupo: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          id_grupo: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          id_grupo?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "dre_categorias_id_grupo_fkey"
            columns: ["id_grupo"]
            isOneToOne: false
            referencedRelation: "dre_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      dre_grupos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          natureza: Database["public"]["Enums"]["natureza_dre"]
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          natureza?: Database["public"]["Enums"]["natureza_dre"]
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          natureza?: Database["public"]["Enums"]["natureza_dre"]
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      extrato_lancamentos: {
        Row: {
          conciliado: boolean
          created_at: string
          data_lancamento: string
          descricao: string | null
          fitid: string | null
          id: string
          id_conta_bancaria: string
          id_importacao: string | null
          id_loja: string
          valor: number
        }
        Insert: {
          conciliado?: boolean
          created_at?: string
          data_lancamento: string
          descricao?: string | null
          fitid?: string | null
          id?: string
          id_conta_bancaria: string
          id_importacao?: string | null
          id_loja: string
          valor: number
        }
        Update: {
          conciliado?: boolean
          created_at?: string
          data_lancamento?: string
          descricao?: string | null
          fitid?: string | null
          id?: string
          id_conta_bancaria?: string
          id_importacao?: string | null
          id_loja?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_lancamentos_id_conta_bancaria_fkey"
            columns: ["id_conta_bancaria"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_lancamentos_id_importacao_fkey"
            columns: ["id_importacao"]
            isOneToOne: false
            referencedRelation: "importacoes_extrato"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_lancamentos_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiras: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          prazo_recebimento_dias: number
          taxa_padrao: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          prazo_recebimento_dias?: number
          taxa_padrao?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          prazo_recebimento_dias?: number
          taxa_padrao?: number
        }
        Relationships: []
      }
      importacoes_extrato: {
        Row: {
          created_at: string
          id: string
          id_conta_bancaria: string
          id_loja: string
          importado_por: string | null
          nome_arquivo: string
          total_lancamentos: number
        }
        Insert: {
          created_at?: string
          id?: string
          id_conta_bancaria: string
          id_loja: string
          importado_por?: string | null
          nome_arquivo: string
          total_lancamentos?: number
        }
        Update: {
          created_at?: string
          id?: string
          id_conta_bancaria?: string
          id_loja?: string
          importado_por?: string | null
          nome_arquivo?: string
          total_lancamentos?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_extrato_id_conta_bancaria_fkey"
            columns: ["id_conta_bancaria"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_extrato_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_extrato_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes_ucase: {
        Row: {
          created_at: string
          id: string
          id_loja: string
          importado_por: string | null
          nome_arquivo: string
          total_registros: number
        }
        Insert: {
          created_at?: string
          id?: string
          id_loja: string
          importado_por?: string | null
          nome_arquivo: string
          total_registros?: number
        }
        Update: {
          created_at?: string
          id?: string
          id_loja?: string
          importado_por?: string | null
          nome_arquivo?: string
          total_registros?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_ucase_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_ucase_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      lojas: {
        Row: {
          ativa: boolean
          cnpj: string
          created_at: string
          id: string
          nome_fantasia: string
          tipo: string
        }
        Insert: {
          ativa?: boolean
          cnpj: string
          created_at?: string
          id?: string
          nome_fantasia: string
          tipo?: string
        }
        Update: {
          ativa?: boolean
          cnpj?: string
          created_at?: string
          id?: string
          nome_fantasia?: string
          tipo?: string
        }
        Relationships: []
      }
      movimentacoes: {
        Row: {
          created_at: string
          criado_por: string | null
          data_movimento: string
          descricao: string
          id: string
          id_categoria: string | null
          id_conta_bancaria: string | null
          id_conta_destino: string | null
          id_extrato_lancamento: string | null
          id_loja: string
          status_conciliacao: Database["public"]["Enums"]["status_conciliacao"]
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          valor: number
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data_movimento: string
          descricao: string
          id?: string
          id_categoria?: string | null
          id_conta_bancaria?: string | null
          id_conta_destino?: string | null
          id_extrato_lancamento?: string | null
          id_loja: string
          status_conciliacao?: Database["public"]["Enums"]["status_conciliacao"]
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
          valor: number
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data_movimento?: string
          descricao?: string
          id?: string
          id_categoria?: string | null
          id_conta_bancaria?: string | null
          id_conta_destino?: string | null
          id_extrato_lancamento?: string | null
          id_loja?: string
          status_conciliacao?: Database["public"]["Enums"]["status_conciliacao"]
          tipo?: Database["public"]["Enums"]["tipo_movimentacao"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "dre_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_id_conta_bancaria_fkey"
            columns: ["id_conta_bancaria"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_id_conta_destino_fkey"
            columns: ["id_conta_destino"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_id_extrato_lancamento_fkey"
            columns: ["id_extrato_lancamento"]
            isOneToOne: false
            referencedRelation: "extrato_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfis: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          id_loja: string | null
          nome: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          id_loja?: string | null
          nome: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          id_loja?: string | null
          nome?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_perfis_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_ucase: {
        Row: {
          created_at: string
          data_prevista_recebimento: string | null
          data_venda: string
          id: string
          id_financeira: string
          id_importacao: string | null
          id_loja: string
          mes_venda: string
          status_conciliacao: Database["public"]["Enums"]["status_conciliacao"]
          valor_bruto: number
          valor_liquido_previsto: number
        }
        Insert: {
          created_at?: string
          data_prevista_recebimento?: string | null
          data_venda: string
          id?: string
          id_financeira: string
          id_importacao?: string | null
          id_loja: string
          mes_venda?: string
          status_conciliacao?: Database["public"]["Enums"]["status_conciliacao"]
          valor_bruto: number
          valor_liquido_previsto?: number
        }
        Update: {
          created_at?: string
          data_prevista_recebimento?: string | null
          data_venda?: string
          id?: string
          id_financeira?: string
          id_importacao?: string | null
          id_loja?: string
          mes_venda?: string
          status_conciliacao?: Database["public"]["Enums"]["status_conciliacao"]
          valor_bruto?: number
          valor_liquido_previsto?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_ucase_id_financeira_fkey"
            columns: ["id_financeira"]
            isOneToOne: false
            referencedRelation: "financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_ucase_id_importacao_fkey"
            columns: ["id_importacao"]
            isOneToOne: false
            referencedRelation: "importacoes_ucase"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_ucase_id_loja_fkey"
            columns: ["id_loja"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_extrato_financeiro: {
        Row: {
          categoria_dre: string | null
          created_at: string | null
          data_movimento: string | null
          descricao: string | null
          grupo_dre: string | null
          id: string | null
          id_categoria: string | null
          id_conta_bancaria: string | null
          id_loja: string | null
          natureza: string | null
          origem: string | null
          status_conciliacao:
            | Database["public"]["Enums"]["status_conciliacao"]
            | null
          tipo: string | null
          valor: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_loja: { Args: { p_loja: string }; Returns: boolean }
      current_loja: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      fn_atualizar_status_atrasados: { Args: never; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_global: { Args: never; Returns: boolean }
      is_master: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "administrador" | "master" | "gerente" | "analista" | "operador"
      natureza_dre: "receita" | "despesa"
      status_conciliacao: "pendente" | "conciliado" | "atrasado"
      tipo_movimentacao: "venda" | "despesa" | "transferencia"
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
      app_role: ["administrador", "master", "gerente", "analista", "operador"],
      natureza_dre: ["receita", "despesa"],
      status_conciliacao: ["pendente", "conciliado", "atrasado"],
      tipo_movimentacao: ["venda", "despesa", "transferencia"],
    },
  },
} as const
