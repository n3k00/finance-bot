// Types mirrored from the Edge Function _types.ts (kept in sync manually).
// Web app only needs these for rendering.

export type Book = "personal" | "business";

export interface PersonalEntry {
  date: string;
  type: "Expense" | "Income" | "Transfer";
  category: string;
  description: string;
  amount: number;
  currency: string;
  payment_method: string;
  note: string;
}

export interface BusinessEntry {
  date: string;
  direction: "in" | "out" | "receivable" | "payable";
  person: string;
  amount: number;
  currency: string;
  method: string;
  account_type?: string;
  account_no?: string;
  in_amount?: number;
  out_amount?: number;
  debt_amount?: number;
  purpose: string;
  status: "paid" | "received" | "pending" | "partial";
  note: string;
}

export interface ParsedPayload {
  book: Book;
  personal?: PersonalEntry;
  business?: BusinessEntry;
}

export interface BotConfig {
  user_id: string;
  ai_provider: string;
  ai_base_url: string;
  openai_api_key: string;
  openai_model: string;
  notion_token: string | null;
  personal_db_id: string | null;
  business_db_id: string | null;
  allowed_telegram_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface BotConfigFormInitial {
  user_id: string;
  ai_provider: string;
  ai_base_url: string;
  openai_model: string;
  personal_db_id: string | null;
  business_db_id: string | null;
  allowed_telegram_ids: number[];
  has_openai_api_key: boolean;
  has_notion_token: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntryLogRow {
  id: string;
  user_id: string;
  book: Book;
  notion_page_id: string | null;
  raw_text: string | null;
  data: ParsedPayload;
  amount: number | null;
  currency: string | null;
  direction: string | null;
  category: string | null;
  person: string | null;
  entry_date: string;
  created_at: string;
}

export interface BotConfigInput {
  ai_provider: string;
  ai_base_url: string;
  openai_api_key: string;
  openai_model?: string;
  notion_token: string;
  personal_db_id?: string;
  business_db_id?: string;
}

export interface OpenAIModelOption {
  id: string;
  created: number;
  owned_by: string;
}
