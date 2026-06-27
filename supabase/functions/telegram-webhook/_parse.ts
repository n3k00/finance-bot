import type {
  Book,
  BusinessEntry,
  PersonalEntry,
  ParsedPayload,
} from "./_types.ts";

const PERSONAL_SYSTEM = `You parse Myanmar-language personal expense / income messages into structured JSON.

Examples:
- "မနက်စာ 3500" -> Expense, Food, Cash
- "coffee 2500" -> Expense, Drink, Cash
- "ဆီဖြည့် 30000" -> Expense, Transport, Cash
- "အမေ့ကို 100000 ပေး" -> Transfer, Family Support
- "လစာ 800000 ဝင်" -> Income

Rules:
- "type" must be one of: "Expense", "Income", "Transfer"
- "category" must be one of: "Food", "Drink", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Family Support", "Education", "Other"
- "payment_method" must be one of: "Cash", "Bank", "KPay", "Wave", "Card", "Other"
- Giving money to family/relative -> type "Transfer", category "Family Support"
- Receiving salary / income -> type "Income"
- Default payment_method is "Cash" if not stated
- "currency" defaults to "MMK"; use "USD" or "THB" only if explicitly mentioned
- "date" must be today's date in YYYY-MM-DD unless the message says otherwise
- "description" is the original item/person/purpose text, stripped of the amount
- "note" is empty unless there is extra context

Respond with ONLY a single minified JSON object. No markdown, no commentary.`;

const BUSINESS_SYSTEM = `You parse Myanmar-language business cashflow / account ledger messages into structured JSON.

Examples:
- "ကိုအောင်ကို 500000 လွှဲ ပစ္စည်းဖိုး" -> out, paid, bank_transfer
- "မောင်လှဆီက 1200000 ဝင် POS payment" -> in, received, bank_transfer
- "မနန်းကို 300000 cash ပေး" -> out, paid, cash
- "ABC shop က 850000 ကျန်" -> receivable, pending
- "ကိုအောင်ကို 300000 ပေးရန်ကျန်" -> payable, pending
- "ဇော် kpay 09265644066 ထွက် 3000000" -> out, paid, kpay, account_no
- "မိုးကြီး kpay 09899470003 ဝင် 1000000" -> in, received, kpay, account_no
- "ချစ်ဦး cash ထွက် 280000 note taxi" -> out, paid, cash
- "ကိုအောင်သိန်း special account ဝင် 5200000" -> in, received, account_type Special Account

Rules:
- "direction" must be one of: "in", "out", "receivable", "payable"
- "method" must be one of: "cash", "bank_transfer", "kpay", "wave", "binance", "other"
- "status" must be one of: "paid", "received", "pending", "partial"
- Support account-ledger columns: Date, Name, Account Type, Acc No, In, Out, Debt/Balance, Note
- If the message includes KPay, Wave, Cash, Bank, Special Account, KBZ, AYA, CB, Yoma, set "account_type" to that exact label and map "method" accordingly
- If the message includes a phone/account number, put it in "account_no"
- If money comes in / received / ဝင် / ရ / deposit, set "direction" to "in", "in_amount" to amount, "out_amount" and "debt_amount" to 0
- If money goes out / paid / ပေး / ထွက် / withdraw, set "direction" to "out", "out_amount" to amount, "in_amount" and "debt_amount" to 0
- If money is still owed / ကျန် / ပေးရန် / ရရန် / debt, set "direction" to "receivable" when they owe us and "payable" when we owe them; put the outstanding number in "debt_amount"
- Always include numeric "amount", "in_amount", "out_amount", and "debt_amount". "amount" is the main non-zero value
- direction "in" -> status "received"
- direction "out" -> status "paid"
- direction "receivable" -> status "pending" unless partially received
- direction "payable" -> status "pending" unless partially paid
- "currency" defaults to "MMK"; use "USD" / "THB" / "USDT" only if mentioned
- "person" is the person/shop/company name as written
- "purpose" is what the payment was for; use "-" if not stated
- "date" must be today's date in YYYY-MM-DD unless the message says otherwise
- "note" is empty unless there is extra context

Respond with ONLY a single minified JSON object. No markdown, no commentary.`;

function userPromptPersonal(text: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}.\nMessage: """${text}"""\nOutput JSON now.`;
}

function userPromptBusiness(text: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}.\nMessage: """${text}"""\nOutput JSON now.`;
}

function stripFence(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

const PERSONAL_TYPES = ["Expense", "Income", "Transfer"] as const;
const PERSONAL_CATEGORIES = [
  "Food",
  "Drink",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Family Support",
  "Education",
  "Other",
] as const;
const PERSONAL_METHODS = ["Cash", "Bank", "KPay", "Wave", "Card", "Other"] as const;
const PERSONAL_CURRENCIES = ["MMK", "USD", "THB"] as const;
const BUSINESS_DIRECTIONS = ["in", "out", "receivable", "payable"] as const;
const BUSINESS_METHODS = [
  "cash",
  "bank_transfer",
  "kpay",
  "wave",
  "binance",
  "other",
] as const;
const BUSINESS_STATUSES = ["paid", "received", "pending", "partial"] as const;
const BUSINESS_CURRENCIES = ["MMK", "USD", "THB", "USDT"] as const;

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI output must be a JSON object.");
  }
}

function assertStringField(
  obj: Record<string, unknown>,
  field: string,
): string {
  const value = obj[field];
  if (typeof value !== "string") {
    throw new Error(`AI output field "${field}" must be a string.`);
  }
  return value;
}

function optionalStringField(
  obj: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = obj[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function assertEnumField<T extends readonly string[]>(
  obj: Record<string, unknown>,
  field: string,
  allowed: T,
): T[number] {
  const value = assertStringField(obj, field);
  if (!allowed.includes(value)) {
    throw new Error(
      `AI output field "${field}" must be one of: ${allowed.join(", ")}.`,
    );
  }
  return value;
}

function numericField(
  obj: Record<string, unknown>,
  field: string,
  fallback = 0,
): number {
  const value = obj[field];
  if (value === undefined || value === null || value === "") return fallback;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`AI output field "${field}" must be a positive number.`);
  }
  return amount;
}

function assertAmount(obj: Record<string, unknown>): number {
  return numericField(obj, "amount");
}

function assertDate(obj: Record<string, unknown>): string {
  const value = assertStringField(obj, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('AI output field "date" must use YYYY-MM-DD.');
  }
  return value;
}

function validatePersonalEntry(value: unknown): PersonalEntry {
  assertRecord(value);
  return {
    date: assertDate(value),
    type: assertEnumField(value, "type", PERSONAL_TYPES),
    category: assertEnumField(value, "category", PERSONAL_CATEGORIES),
    description: assertStringField(value, "description"),
    amount: assertAmount(value),
    currency: assertEnumField(value, "currency", PERSONAL_CURRENCIES),
    payment_method: assertEnumField(value, "payment_method", PERSONAL_METHODS),
    note: assertStringField(value, "note"),
  };
}

function validateBusinessEntry(value: unknown): BusinessEntry {
  assertRecord(value);
  const direction = assertEnumField(value, "direction", BUSINESS_DIRECTIONS);
  const amount = assertAmount(value);
  const inAmount = numericField(value, "in_amount", direction === "in" ? amount : 0);
  const outAmount = numericField(value, "out_amount", direction === "out" ? amount : 0);
  const debtAmount = numericField(
    value,
    "debt_amount",
    direction === "receivable" || direction === "payable" ? amount : 0,
  );

  return {
    date: assertDate(value),
    direction,
    person: assertStringField(value, "person"),
    amount,
    currency: assertEnumField(value, "currency", BUSINESS_CURRENCIES),
    method: assertEnumField(value, "method", BUSINESS_METHODS),
    account_type: optionalStringField(value, "account_type"),
    account_no: optionalStringField(value, "account_no"),
    in_amount: inAmount,
    out_amount: outAmount,
    debt_amount: debtAmount,
    purpose: assertStringField(value, "purpose"),
    status: assertEnumField(value, "status", BUSINESS_STATUSES),
    note: assertStringField(value, "note"),
  };
}

export async function parseMessage(opts: {
  book: Book;
  text: string;
  aiKey: string;
  baseUrl: string;
  model: string;
}): Promise<ParsedPayload> {
  const system =
    opts.book === "personal" ? PERSONAL_SYSTEM : BUSINESS_SYSTEM;
  const user =
    opts.book === "personal"
      ? userPromptPersonal(opts.text)
      : userPromptBusiness(opts.text);

  const endpoint = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: opts.model || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  let res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.aiKey}`,
      "api-key": opts.aiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const firstErr = await res.text();
    if (res.status === 400 && firstErr.toLowerCase().includes("response_format")) {
      const { response_format: _responseFormat, ...fallbackBody } = body;
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.aiKey}`,
          "api-key": opts.aiKey,
        },
        body: JSON.stringify(fallbackBody),
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI provider ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  const json = JSON.parse(stripFence(raw)) as unknown;

  return {
    book: opts.book,
    ...(opts.book === "personal"
      ? { personal: validatePersonalEntry(json) }
      : { business: validateBusinessEntry(json) }),
  } as ParsedPayload;
}
