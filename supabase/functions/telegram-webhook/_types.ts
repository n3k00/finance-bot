// Shared types for the Telegram → Notion expense bot.
// (Deno runtime — no @types dependency needed.)

export type Book = "personal" | "business";

export type PersonalType = "Expense" | "Income" | "Transfer";
export type PersonalCategory =
  string;

export interface PersonalEntry {
  date: string; // YYYY-MM-DD
  type: PersonalType;
  category: PersonalCategory;
  description: string;
  amount: number;
  currency: string; // MMK | USD | THB
  payment_method: string; // Cash | Bank | KPay | Wave | Card | Other
  note: string;
}

export type BusinessDirection = "in" | "out" | "receivable" | "payable";
export type BusinessMethod =
  | "cash"
  | "bank_transfer"
  | "kpay"
  | "wave"
  | "binance"
  | "other";
export type BusinessStatus =
  | "paid"
  | "received"
  | "pending"
  | "partial";

export interface BusinessEntry {
  date: string; // YYYY-MM-DD
  direction: BusinessDirection;
  person: string;
  amount: number;
  currency: string;
  method: BusinessMethod;
  account_type?: string;
  account_no?: string;
  in_amount?: number;
  out_amount?: number;
  debt_amount?: number;
  purpose: string;
  status: BusinessStatus;
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
  openai_api_key: string | null;
  openai_model: string;
  personal_categories: string[] | null;
  notion_token: string | null;
  personal_db_id: string | null;
  business_db_id: string | null;
}
