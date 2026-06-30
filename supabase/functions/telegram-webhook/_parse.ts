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
- "category" must be one of the categories provided by the user prompt
- "payment_method" must be one of: "Cash", "Bank", "KPay", "Wave", "Card", "Other"
- Giving money to family/relative -> type "Transfer", category "Family Support"
- Receiving salary / income -> type "Income"
- Default payment_method is "Cash" if not stated
- "currency" defaults to "MMK"; use "USD" or "THB" only if explicitly mentioned
- "date" must be today's date in YYYY-MM-DD unless the message says otherwise
- "description" is the user's caption/subject, stripped only of amount/date/payment words and trailing action words. Do not summarize or shorten the caption.
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

function userPromptPersonal(text: string, categories: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}.\nAllowed categories: ${categories.join(", ")}.\nMessage: """${text}"""\nOutput JSON now.`;
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
  "Tobacco",
  "Donation",
  "Gift",
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

function enumFieldFromList(
  obj: Record<string, unknown>,
  field: string,
  allowed: string[],
): string {
  const value = assertStringField(obj, field);
  return allowed.includes(value) ? value : "Other";
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

function validatePersonalEntry(value: unknown, categories: string[]): PersonalEntry {
  assertRecord(value);
  return {
    date: assertDate(value),
    type: assertEnumField(value, "type", PERSONAL_TYPES),
    category: enumFieldFromList(value, "category", categories),
    description: assertStringField(value, "description"),
    amount: assertAmount(value),
    currency: assertEnumField(value, "currency", PERSONAL_CURRENCIES),
    payment_method: assertEnumField(value, "payment_method", PERSONAL_METHODS),
    note: assertStringField(value, "note"),
  };
}

const MM_DIGITS: Record<string, string> = {
  "၀": "0",
  "၁": "1",
  "၂": "2",
  "၃": "3",
  "၄": "4",
  "၅": "5",
  "၆": "6",
  "၇": "7",
  "၈": "8",
  "၉": "9",
};

function normalizeDigits(text: string) {
  return text.replace(/[၀-၉]/g, (digit) => MM_DIGITS[digit] ?? digit);
}

function todayInMyanmar() {
  const shifted = new Date(Date.now() + 6.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function dateFromText(text: string) {
  const today = new Date(`${todayInMyanmar()}T00:00:00Z`);
  if (text.includes("မနေ့") || text.toLowerCase().includes("yesterday")) {
    today.setUTCDate(today.getUTCDate() - 1);
  }
  return today.toISOString().slice(0, 10);
}

function findAmount(text: string) {
  const normalized = normalizeDigits(text);
  const match = /(?:^|[^\d])(\d[\d,]*(?:\.\d+)?)(?:\s*(?:ကျပ်|ks|mmk|baht|thb|usd|usdt|ဒေါ်လာ))?/i.exec(
    normalized,
  );
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? { amount, raw: match[1] } : null;
}

function pickCategory(text: string, categories: string[]) {
  const lower = text.toLowerCase();
  const hasCategory = (category: string) => categories.includes(category);
  const rules: Array<{ category: string; words: string[] }> = [
    { category: "Tobacco", words: ["ဆေးလိပ်", "စီးကရက်", "cigarette", "smoke"] },
    { category: "Food", words: ["မုန့်", "မုန့်", "ထမင်း", "စား", "ဟင်း", "food", "snack"] },
    { category: "Drink", words: ["coffee", "ကော်ဖီ", "လက်ဖက်ရည်", "ရေသန့်", "drink"] },
    { category: "Transport", words: ["ဆီ", "taxi", "grab", "ကားခ", "bus", "transport"] },
    { category: "Bills", words: ["ဘေလ်", "ဖုန်းဘေ", "မီး", "internet", "wifi", "bill"] },
    { category: "Health", words: ["ဆေး", "ဆေးခန်း", "hospital", "clinic"] },
    { category: "Family Support", words: ["အမေ", "အဖေ", "မိဘ", "ညီ", "အစ်ကို", "အစ်မ"] },
    { category: "Donation", words: ["အလှူ", "donation", "လှူ"] },
    { category: "Gift", words: ["လက်ဆောင်", "gift"] },
    { category: "Shopping", words: ["ဝယ်", "shopping", "အင်္ကျီ", "ဖိနပ်"] },
  ];
  for (const rule of rules) {
    if (!hasCategory(rule.category)) continue;
    if (rule.words.some((word) => lower.includes(word.toLowerCase()))) {
      return rule.category;
    }
  }
  return hasCategory("Other") ? "Other" : categories[0] ?? "Other";
}

function paymentMethodFromText(text: string): PersonalEntry["payment_method"] {
  const lower = text.toLowerCase();
  if (lower.includes("kpay") || lower.includes("k pay")) return "KPay";
  if (lower.includes("wave")) return "Wave";
  if (lower.includes("card")) return "Card";
  if (lower.includes("bank") || lower.includes("kbz") || lower.includes("aya")) return "Bank";
  return "Cash";
}

function personalTypeFromText(text: string): PersonalEntry["type"] {
  const lower = text.toLowerCase();
  if (text.includes("လစာ") || text.includes("ဝင်ငွေ") || /\bincome\b/.test(lower)) {
    return "Income";
  }
  if (text.includes("ပေး") && /(အမေ|အဖေ|မိဘ|ညီ|အစ်ကို|အစ်မ)/.test(text)) {
    return "Transfer";
  }
  return "Expense";
}

function cleanPersonalDescription(text: string, amountRaw: string) {
  let description = normalizeDigits(text);
  description = description.replace(amountRaw, " ");
  description = description.replace(/\b(today|yesterday)\b/gi, " ");
  description = description.replace(/ဒီနေ့|ယနေ့|မနေ့က|မနေ့|ကျပ်|ks|mmk|kyats?/gi, " ");
  description = description.replace(/\b(kpay|k pay|wave|cash|bank|card|kbz|aya)\b/gi, " ");
  description = description.replace(/(ကုန်တယ်|ကုန်|သုံးတယ်|သုံး|ဝင်တယ်|ဝင်|ပေးတယ်|ပေး)\s*$/gi, " ");
  description = description.replace(/\s+/g, " ").trim();
  return description || "Other";
}

function ruleParsePersonal(text: string, categories: string[]): PersonalEntry | null {
  const found = findAmount(text);
  if (!found) return null;
  return {
    date: dateFromText(text),
    type: personalTypeFromText(text),
    category: pickCategory(text, categories),
    description: cleanPersonalDescription(text, found.raw),
    amount: found.amount,
    currency: /usd|ဒေါ်လာ/i.test(text) ? "USD" : /thb|baht/i.test(text) ? "THB" : "MMK",
    payment_method: paymentMethodFromText(text),
    note: "",
  };
}

function methodFromText(text: string): BusinessEntry["method"] {
  const lower = text.toLowerCase();
  if (lower.includes("kpay") || lower.includes("k pay")) return "kpay";
  if (lower.includes("wave")) return "wave";
  if (lower.includes("binance") || lower.includes("usdt")) return "binance";
  if (lower.includes("bank") || lower.includes("kbz") || lower.includes("aya")) return "bank_transfer";
  if (lower.includes("cash")) return "cash";
  return "cash";
}

function ruleParseBusiness(text: string): BusinessEntry | null {
  const found = findAmount(text);
  if (!found) return null;
  const lower = text.toLowerCase();
  const direction: BusinessEntry["direction"] =
    text.includes("ရရန်") || text.includes("ရရန်း") || text.includes("ကျန်")
      ? "receivable"
      : text.includes("ပေးရန်")
        ? "payable"
        : text.includes("ဝင်") || lower.includes("in")
          ? "in"
          : "out";
  const method = methodFromText(text);
  const accountNo = normalizeDigits(text).match(/\b09\d{7,11}\b/)?.[0];
  const accountType =
    method === "kpay"
      ? "KPay"
      : method === "wave"
        ? "Wave"
        : method === "bank_transfer"
          ? "Bank"
          : "Cash";
  const person = cleanPersonalDescription(text, found.raw)
    .replace(/ဝင်|ထွက်|ပေးရန်|ရရန်|ကျန်|cash|kpay|wave|bank/gi, " ")
    .replace(accountNo ?? "", " ")
    .replace(/\s+/g, " ")
    .trim() || "-";
  return {
    date: dateFromText(text),
    direction,
    person,
    amount: found.amount,
    currency: /usd|ဒေါ်လာ/i.test(text) ? "USD" : /thb|baht/i.test(text) ? "THB" : /usdt/i.test(text) ? "USDT" : "MMK",
    method,
    account_type: accountType,
    account_no: accountNo,
    in_amount: direction === "in" ? found.amount : 0,
    out_amount: direction === "out" ? found.amount : 0,
    debt_amount: direction === "receivable" || direction === "payable" ? found.amount : 0,
    purpose: "-",
    status: direction === "in" ? "received" : direction === "out" ? "paid" : "pending",
    note: "",
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
  aiKey?: string | null;
  baseUrl: string;
  model: string;
  personalCategories?: string[] | null;
}): Promise<ParsedPayload> {
  const personalCategories =
    opts.personalCategories?.length ? opts.personalCategories : [...PERSONAL_CATEGORIES];
  const ruleParsed =
    opts.book === "personal"
      ? ruleParsePersonal(opts.text, personalCategories)
      : ruleParseBusiness(opts.text);
  if (ruleParsed) {
    return {
      book: opts.book,
      ...(opts.book === "personal"
        ? { personal: ruleParsed as PersonalEntry }
        : { business: ruleParsed as BusinessEntry }),
    } as ParsedPayload;
  }

  if (!opts.aiKey?.trim()) {
    throw new Error("AI key မရှိသေးပါ။ Amount ပါတဲ့ simple format နဲ့ရေးပါ။ ဥပမာ - မုန့် 2000 cash");
  }

  const system =
    opts.book === "personal" ? PERSONAL_SYSTEM : BUSINESS_SYSTEM;
  const user =
    opts.book === "personal"
      ? userPromptPersonal(opts.text, personalCategories)
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
      ? { personal: validatePersonalEntry(json, personalCategories) }
      : { business: validateBusinessEntry(json) }),
  } as ParsedPayload;
}
