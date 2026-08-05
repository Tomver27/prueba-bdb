// Tipos de request/response de los endpoints de Croma usados por las tools RUES.
//
// Los nombres de campo siguen el schema real documentado en docs.usecroma.com (verificado en
// fase b), NO los nombres en español de "Transformación de salida" de docs/TOOLS_CROMA.md —
// esos son el contrato de salida de nuestras propias tools (ver lib/tools/rues-search.ts y
// lib/tools/rues-detail.ts), construido a partir de estos tipos crudos.

export interface CiiuActivity {
  code: string | null;
  description: string | null;
}

export interface RuesEntityDetail {
  registry_id: string | null;
  nit: string | null;
  verification_digit: string | null;
  identification_class?: string | null;
  secondary_identification?: string | null;
  name: string | null;
  acronym: string | null;
  chamber_code: string | null;
  chamber_name: string | null;
  registration_number: string | null;
  registration_status: string | null;
  registration_category?: string | null;
  legal_organization: string | null;
  society_type?: string | null;
  society_type_code?: string | null;
  registration_date?: string | null;
  last_renewal_date?: string | null;
  last_renewed_year: string | null;
  expiration_date?: string | null;
  cancellation_date?: string | null;
  cancellation_reason?: string | null;
  updated_date?: string | null;
  primary_activity: CiiuActivity | null;
  secondary_activity: CiiuActivity | null;
  ciiu_3?: CiiuActivity | null;
  ciiu_4?: CiiuActivity | null;
  commercial_address: string | null;
  commercial_municipality: string | null;
  commercial_phones?: readonly string[];
  commercial_email?: string | null;
  fiscal_address: string | null;
  fiscal_municipality: string | null;
  fiscal_phones?: readonly string[];
  fiscal_email?: string | null;
  is_bic?: boolean | null;
  is_social_enterprise?: boolean | null;
  is_law_1780?: boolean | null;
  is_transport?: boolean | null;
  domain_forfeiture?: boolean | null;
  sipref_inactivation_control?: boolean | null;
  certificates_sale_url?: string | null;
}

// --- POST /co/rues-entities-by-name ---

export interface RuesSearchRequestBody {
  name: string;
  page?: number;
}

export interface RuesSearchEntitySummary {
  registry_id: string | null;
  nit: string | null;
  verification_digit: string | null;
  name: string | null;
  acronym: string | null;
  chamber_code: string | null;
  chamber_name: string | null;
  registration_number: string | null;
  registration_status: string | null;
  legal_organization: string | null;
  last_renewed_year: string | null;
  category: string | null;
  document_type: string | null;
  detail: RuesEntityDetail | null;
}

export interface RuesSearchPagination {
  total: number;
  page_size: number;
  total_pages: number;
  page: number;
}

export interface RuesSearchData {
  query: string;
  capped: boolean;
  entities: RuesSearchEntitySummary[];
  pagination: RuesSearchPagination;
  simulated?: boolean;
}

// --- POST /co/rues-entity-by-nit ---

export interface RuesDetailRequestBody {
  document_number: string;
}

export interface RuesFinancialYear {
  year: string | null;
  current_assets: number | null;
  non_current_assets: number | null;
  total_assets: number | null;
  current_liabilities: number | null;
  non_current_liabilities: number | null;
  total_liabilities: number | null;
  equity: number | null;
  ordinary_revenue: number | null;
  cost_of_sales: number | null;
  operating_expenses: number | null;
  operating_profit: number | null;
  period_result: number | null;
}

export interface RuesRenewal {
  year: string | null;
  renewal_date: string | null;
}

export interface RuesRelatedParty {
  document_number: string | null;
  name: string | null;
  role: string | null;
}

export interface RuesNotice {
  name: string | null;
  act: string | null;
  note: string | null;
  published_date: string | null;
  registered_date: string | null;
  chamber_name: string | null;
}

export interface RuesDetailData {
  found: boolean;
  document_number: string;
  entity: RuesEntityDetail | null;
  financials: RuesFinancialYear[];
  renewals: RuesRenewal[];
  related_parties: RuesRelatedParty[];
  notices: RuesNotice[];
  simulated?: boolean;
}

// --- Envelope de error (ver docs/TOOLS_CROMA.md) ---

export interface CromaRawErrorDetail {
  type?: string;
  code?: string;
  message?: string;
  param?: string;
  details?: unknown;
}
