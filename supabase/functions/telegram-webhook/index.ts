import { answerChat } from "./_chat.ts";
import { parseMessage } from "./_parse.ts";
import {
  answerCallbackQuery,
  editMessageText,
  formatCard,
  type InlineButton,
  sendMessage,
} from "./_telegram.ts";
import { insertEntry } from "./_notion.ts";
import type {
  BotConfig,
  BusinessEntry,
  ParsedPayload,
  PersonalEntry,
} from "./_types.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const WEB_APP_URL = Deno.env.get("WEB_APP_URL") ?? "";
const TELEGRAM_BOT_TOKEN =
  Deno.env.get("TELEGRAM_BOT_TOKEN") ??
  Deno.env.get("TELEGRAM_MINI_APP_BOT_TOKEN") ??
  "";
const SHARED_AI_API_KEY = Deno.env.get("SHARED_AI_API_KEY") ?? "";
const SHARED_AI_BASE_URL =
  Deno.env.get("SHARED_AI_BASE_URL") ?? "https://api.openai.com/v1";
const SHARED_AI_MODEL = Deno.env.get("SHARED_AI_MODEL") ?? "gpt-4o-mini";

const DEFAULT_PERSONAL_CATEGORIES = [
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
];

async function dbSelect<T>(
  table: string,
  query: string,
  filters: Record<string, string | string[]>,
): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", query);
  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`dbSelect ${table} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

async function dbInsert<T>(
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`dbInsert ${table} ${res.status}: ${await res.text()}`);
  }
  const arr = (await res.json()) as T[];
  return arr[0];
}

async function dbUpdate(
  table: string,
  filters: Record<string, string>,
  patch: Record<string, unknown>,
): Promise<void> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`dbUpdate ${table} ${res.status}: ${await res.text()}`);
  }
}

async function findConfigByTelegramIdentity(
  chatId: number,
  fromId?: number,
): Promise<BotConfig | null> {
  const ids = Array.from(new Set([chatId, fromId].filter(Boolean))) as number[];
  const filters: Record<string, string | string[]> =
    ids.length > 1
      ? { or: ids.map((id) => `telegram_user_id.eq.${id}`).join(",") }
      : { telegram_user_id: `eq.${chatId}` };

  const allowedRows = await dbSelect<{
    telegram_user_id: number;
    is_active: boolean;
    linked_user_id: string | null;
  }>(
    "telegram_allowlist",
    "telegram_user_id,is_active,linked_user_id",
    filters,
  );
  const allowed = allowedRows.find((row) => row.is_active && row.linked_user_id);
  if (!allowed?.linked_user_id) return null;

  const rows = await dbSelect<BotConfig>(
    "bot_config",
    "user_id,ai_provider,ai_base_url,openai_api_key,openai_model,personal_categories,notion_token,personal_db_id,business_db_id",
    { user_id: `eq.${allowed.linked_user_id}` },
  );
  return rows[0] ?? null;
}

async function findConfigByUserId(userId: string): Promise<BotConfig | null> {
  const rows = await dbSelect<BotConfig>(
    "bot_config",
    "user_id,ai_provider,ai_base_url,openai_api_key,openai_model,personal_categories,notion_token,personal_db_id,business_db_id",
    { user_id: `eq.${userId}` },
  );
  return rows[0] ?? null;
}

interface PendingRow {
  id: string;
  user_id: string;
  telegram_chat_id: number;
  telegram_message_id: number;
  book: "personal" | "business";
  raw_text: string;
  parsed_data: ParsedPayload;
  status: string;
}

interface EntryLogReportRow {
  book: "personal" | "business";
  amount: number | null;
  currency: string | null;
  direction: string | null;
  category: string | null;
  data: ParsedPayload;
  entry_date: string;
}

type ReportScope = "personal" | "money" | "all";
type ReportPeriod = "today" | "month" | "previous_month";
type ReportMode = "summary" | "table";

interface ReportIntent {
  scope: ReportScope;
  period: ReportPeriod;
  mode: ReportMode;
}

interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number };
  text?: string;
}

interface TgCallback {
  id: string;
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}

interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallback;
}

const HELP = [
  "အသုံးစရိတ်နဲ့ ငွေအဝင်/အထွက် စာရင်းကို စာတိုပို့ရုံနဲ့ မှတ်လို့ရပါတယ်။",
  "",
  "<b>ကိုယ်ရေးသုံး</b>",
  "  မနက်စာ 3500",
  "  /p coffee 2500",
  "",
  "<b>ငွေအဝင်/အထွက်</b>",
  "  /m ဇော် kpay 09265644066 ထွက် 3000000",
  "  /m မိုးကြီး kpay 09899470003 ဝင် 1000000",
  "  /in ကိုအောင်သိန်း special account 5200000",
  "  /out ချစ်ဦး cash 280000",
  "",
  "<b>မေးလို့ရတာ</b>",
  "  ဒီလ ငွေသုံးတာ ဘယ်လောက်ရှိပြီလဲ",
  "  အရင်လ ငွေသုံးတာ ဘယ်လောက်ရှိလဲ",
  "  ဒီလ ငွေအဝင်အထွက် ဘယ်လောက်ရှိပြီလဲ",
  "  /report last month",
  "  /table အရင်လ",
  "  /report",
  "",
  "Confirm နှိပ်မှ Supabase ထဲသိမ်းပါမယ်။ Notion sync က optional ပါ။",
].join("\n");

function parseReportIntent(text: string): ReportIntent | null {
  const lower = text.toLowerCase();
  const explicit = /^\/(report|summary|sum|total|table)(?:@\w+)?(?:\s+([\s\S]+))?$/i.exec(
    text,
  );
  const questionWords =
    text.includes("ဘယ်လောက်") ||
    text.includes("စုစုပေါင်း") ||
    text.includes("ရှိပြီ") ||
    text.includes("စာရင်းချုပ်") ||
    text.includes("ဇယား") ||
    (!text.startsWith("/") &&
      (text.includes("ဒီလ") ||
        text.includes("အရင်လ") ||
        text.includes("ပြီးခဲ့တဲ့လ"))) ||
    lower.includes("report") ||
    lower.includes("summary") ||
    lower.includes("total") ||
    lower.includes("table");

  if (!explicit && !questionWords) return null;

  const body = explicit?.[2]?.toLowerCase() ?? lower;
  const commandName = explicit?.[1]?.toLowerCase();
  const period: ReportPeriod =
    body.includes("today") || text.includes("ဒီနေ့") || text.includes("ယနေ့")
      ? "today"
      : body.includes("last month") ||
          body.includes("previous month") ||
          text.includes("အရင်လ") ||
          text.includes("ပြီးခဲ့တဲ့လ")
        ? "previous_month"
        : "month";
  const mode: ReportMode =
    commandName === "table" || body.includes("table") || text.includes("ဇယား")
      ? "table"
      : "summary";

  const asksMoney =
    body.includes("money") ||
    body.includes("ledger") ||
    text.includes("အဝင်") ||
    text.includes("အထွက်") ||
    text.includes("ဝင်ထွက်");
  const asksPersonal =
    body.includes("personal") ||
    body.includes("expense") ||
    text.includes("သုံးတာ") ||
    text.includes("အသုံး") ||
    text.includes("ကုန်");

  if (asksMoney && !asksPersonal) return { scope: "money", period, mode };
  if (asksPersonal && !asksMoney) return { scope: "personal", period, mode };
  return { scope: "all", period, mode };
}

function myanmarTodayParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 6.5 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function dateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function subtractMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function reportRange(period: ReportPeriod) {
  const today = myanmarTodayParts();
  if (period === "today") {
    const start = dateString(today.year, today.month, today.day);
    const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
    const end = dateString(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
    );
    return { start, end, label: "ဒီနေ့" };
  }

  if (period === "previous_month") {
    const previous = subtractMonth(today.year, today.month);
    const start = dateString(previous.year, previous.month, 1);
    const end = dateString(today.year, today.month, 1);
    return { start, end, label: "အရင်လ" };
  }

  const start = dateString(today.year, today.month, 1);
  const next = addMonth(today.year, today.month);
  const end = dateString(next.year, next.month, 1);
  return { start, end, label: "ဒီလ" };
}

async function getReportRows(
  userId: string,
  period: ReportPeriod,
): Promise<{ label: string; rows: EntryLogReportRow[] }> {
  const range = reportRange(period);
  const rows = await dbSelect<EntryLogReportRow>(
    "entries_log",
    "book,amount,currency,direction,category,data,entry_date",
    {
      user_id: `eq.${userId}`,
      entry_date: [`gte.${range.start}`, `lt.${range.end}`],
      order: "entry_date.desc",
      limit: "1000",
    },
  );
  return { label: range.label, rows };
}

function money(n: number) {
  return Math.round(n).toLocaleString("en-US");
}

function sumReport(rows: EntryLogReportRow[], intent: ReportIntent) {
  const personalRows = rows.filter((row) => row.book === "personal");
  const moneyRows = rows.filter((row) => row.book === "business");

  const personalExpense = personalRows
    .filter((row) => row.data.personal?.type === "Expense")
    .reduce((sum, row) => sum + (row.amount ?? row.data.personal?.amount ?? 0), 0);
  const personalIncome = personalRows
    .filter((row) => row.data.personal?.type === "Income")
    .reduce((sum, row) => sum + (row.amount ?? row.data.personal?.amount ?? 0), 0);
  const personalTransfer = personalRows
    .filter((row) => row.data.personal?.type === "Transfer")
    .reduce((sum, row) => sum + (row.amount ?? row.data.personal?.amount ?? 0), 0);

  const moneyIn = moneyRows.reduce((sum, row) => {
    const entry = row.data.business;
    return sum + (entry?.in_amount ?? (row.direction === "in" ? row.amount ?? 0 : 0));
  }, 0);
  const moneyOut = moneyRows.reduce((sum, row) => {
    const entry = row.data.business;
    return sum + (entry?.out_amount ?? (row.direction === "out" ? row.amount ?? 0 : 0));
  }, 0);
  const receivable = moneyRows.reduce((sum, row) => {
    const entry = row.data.business;
    return sum + (row.direction === "receivable" ? entry?.debt_amount ?? row.amount ?? 0 : 0);
  }, 0);
  const payable = moneyRows.reduce((sum, row) => {
    const entry = row.data.business;
    return sum + (row.direction === "payable" ? entry?.debt_amount ?? row.amount ?? 0 : 0);
  }, 0);

  return {
    scope: intent.scope,
    personalRows: personalRows.length,
    moneyRows: moneyRows.length,
    personalExpense,
    personalIncome,
    personalTransfer,
    moneyIn,
    moneyOut,
    receivable,
    payable,
  };
}

function tableLine(label: string, value: number | string) {
  const left = label.length > 15 ? label.slice(0, 15) : label.padEnd(15, " ");
  const right =
    typeof value === "number"
      ? money(value).padStart(14, " ")
      : String(value).padStart(14, " ");
  return `${left} ${right}`;
}

function formatReportTable(
  label: string,
  intent: ReportIntent,
  rows: EntryLogReportRow[],
) {
  const s = sumReport(rows, intent);
  const table: string[] = [];
  table.push(tableLine("Item", "MMK"));
  table.push("------------------------------");

  if (s.scope === "personal" || s.scope === "all") {
    table.push(tableLine("Spend", s.personalExpense));
    table.push(tableLine("Income", s.personalIncome));
    if (s.personalTransfer) table.push(tableLine("Transfer", s.personalTransfer));
    table.push(tableLine("P entries", s.personalRows));
  }

  if (s.scope === "all") table.push("------------------------------");

  if (s.scope === "money" || s.scope === "all") {
    table.push(tableLine("Money in", s.moneyIn));
    table.push(tableLine("Money out", s.moneyOut));
    table.push(tableLine("Net", s.moneyIn - s.moneyOut));
    table.push(tableLine("Receivable", s.receivable));
    table.push(tableLine("Payable", s.payable));
    table.push(tableLine("M entries", s.moneyRows));
  }

  if (rows.length === 0) {
    table.push("------------------------------");
    table.push("No confirmed entries");
  }

  return `<b>${label} စာရင်းဇယား</b>\n<pre>${escapeHtml(table.join("\n"))}</pre>`;
}

function formatReport(label: string, intent: ReportIntent, rows: EntryLogReportRow[]) {
  if (intent.mode === "table") {
    return formatReportTable(label, intent, rows);
  }

  const s = sumReport(rows, intent);
  const lines = [`<b>${label} စာရင်းချုပ်</b>`, ""];

  if (s.scope === "personal" || s.scope === "all") {
    lines.push("<b>ကိုယ်ရေးသုံး</b>");
    lines.push(`သုံးငွေ: <b>${money(s.personalExpense)}</b> MMK`);
    lines.push(`ဝင်ငွေ: ${money(s.personalIncome)} MMK`);
    if (s.personalTransfer) lines.push(`လွှဲ/ထောက်ပံ့: ${money(s.personalTransfer)} MMK`);
    lines.push(`Entry: ${s.personalRows}`);
    lines.push("");
  }

  if (s.scope === "money" || s.scope === "all") {
    lines.push("<b>ငွေအဝင်/အထွက်</b>");
    lines.push(`အဝင်: <b>${money(s.moneyIn)}</b> MMK`);
    lines.push(`အထွက်: <b>${money(s.moneyOut)}</b> MMK`);
    lines.push(`Net: <b>${money(s.moneyIn - s.moneyOut)}</b> MMK`);
    lines.push(`ရရန်ကျန်: ${money(s.receivable)} MMK`);
    lines.push(`ပေးရန်ကျန်: ${money(s.payable)} MMK`);
    lines.push(`Entry: ${s.moneyRows}`);
  }

  if (rows.length === 0) {
    lines.push("ဒီ period ထဲမှာ confirm လုပ်ထားတဲ့ entry မရှိသေးပါဘူး။");
  }

  return lines.join("\n");
}

function looksLikeEntry(text: string) {
  return (
    /[0-9၀-၉]/.test(text) ||
    /\b(k|ks|mmk|usd|thb|usdt)\b/i.test(text) ||
    /(ကျပ်|ထောင်|သောင်း|သိန်း|သန်း|ဝင်|ထွက်|ပေး|ကျန်|ရရန်|ပေးရန်)/.test(text)
  );
}

function parseIncomingText(
  text: string,
): { book: "personal" | "business"; body: string } | null {
  const command = /^\/(p|personal|m|money|ledger|b|business|in|out)(?:@\w+)?(?:\s+([\s\S]+))?$/i.exec(
    text,
  );
  if (command) {
    const commandName = command[1].toLowerCase();
    const body = (command[2] ?? "").trim();
    if (commandName === "in") {
      return { book: "business", body: `${body} ဝင်`.trim() };
    }
    if (commandName === "out") {
      return { book: "business", body: `${body} ထွက်`.trim() };
    }
    return {
      book: ["m", "money", "ledger", "b", "business"].includes(commandName)
        ? "business"
        : "personal",
      body,
    };
  }

  const businessPrefix =
    /^(?:business|biz|လုပ်ငန်း|ဘစ်ဇနက်|ဆိုင်)\s+([\s\S]+)$/i.exec(text);
  if (businessPrefix) {
    return { book: "business", body: businessPrefix[1].trim() };
  }

  const personalPrefix =
    /^(?:personal|ကိုယ်ရေး|အသုံးစရိတ်|ကိုယ်ပိုင်)\s+([\s\S]+)$/i.exec(text);
  if (personalPrefix) {
    return { book: "personal", body: personalPrefix[1].trim() };
  }

  if (text.startsWith("/")) return null;

  if (!looksLikeEntry(text)) return null;

  return { book: "personal", body: text };
}

function aiSettings(cfg: BotConfig) {
  return {
    key: cfg.openai_api_key?.trim() || SHARED_AI_API_KEY.trim(),
    baseUrl: cfg.openai_api_key?.trim()
      ? cfg.ai_base_url || SHARED_AI_BASE_URL
      : SHARED_AI_BASE_URL,
    model: cfg.openai_api_key?.trim()
      ? cfg.openai_model || SHARED_AI_MODEL
      : SHARED_AI_MODEL,
  };
}

async function sendChatReply(
  cfg: BotConfig,
  chatId: number,
  text: string,
): Promise<void> {
  const ai = aiSettings(cfg);
  if (!ai.key) {
    await sendMessage(
      TELEGRAM_BOT_TOKEN,
      chatId,
      "AI assistant မဖွင့်ထားသေးလို့ rule parser နဲ့ စာရင်းမှတ်တာနဲ့ report မေးတာတွေကိုပဲ ဖြေပေးနိုင်ပါတယ်။ ဥပမာ - မုန့် 2000, /m ကိုအောင် kpay ဝင် 100000",
    );
    return;
  }

  try {
    const reply = await answerChat({
      text,
      aiKey: ai.key,
      baseUrl: ai.baseUrl,
      model: ai.model,
    });
    await sendMessage(TELEGRAM_BOT_TOKEN, chatId, escapeHtml(reply));
  } catch (err) {
    console.error("answerChat error", err);
    await sendMessage(
      TELEGRAM_BOT_TOKEN,
      chatId,
      "ဘာကူညီပေးရမလဲ ပြောပါ။ စာရင်းသိမ်းချင်ရင် amount ပါအောင်ရေးပါ။ ဥပမာ - coffee 2500",
    );
  }
}

function personalCategories(cfg: BotConfig) {
  return cfg.personal_categories?.length
    ? cfg.personal_categories
    : DEFAULT_PERSONAL_CATEGORIES;
}

function pendingKeyboard(
  pendingId: string,
  book: "personal" | "business",
  categories: string[],
): { inline_keyboard: InlineButton[][] } {
  const rows: InlineButton[][] = [];
  if (book === "personal") {
    const visibleCategories = categories.slice(0, 12);
    for (let i = 0; i < visibleCategories.length; i += 3) {
      rows.push(
        visibleCategories.slice(i, i + 3).map((category, offset) => ({
          text: category,
          callback_data: `cat:${pendingId}:${i + offset}`,
        })),
      );
    }
  }
  rows.push([
    { text: "သိမ်းမယ်", callback_data: `confirm:${pendingId}` },
    { text: "မသိမ်းဘူး", callback_data: `cancel:${pendingId}` },
  ]);
  return { inline_keyboard: rows };
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const text = (msg.text ?? "").trim();
  const cfg = await findConfigByTelegramIdentity(chatId, fromId);

  if (!cfg) {
    console.warn(`No bot_config for chat_id=${chatId} from_id=${fromId ?? "-"}`);
    return;
  }

  const token = TELEGRAM_BOT_TOKEN;

  if (!text || text === "/start" || text === "/help") {
    await sendMessage(
      token,
      chatId,
      HELP,
      WEB_APP_URL
        ? {
            inline_keyboard: [
              [{ text: "စာရင်း", web_app: { url: WEB_APP_URL } }],
            ],
          }
        : undefined,
    );
    return;
  }

  const reportIntent = parseReportIntent(text);
  if (reportIntent) {
    const { label, rows } = await getReportRows(cfg.user_id, reportIntent.period);
    await sendMessage(token, chatId, formatReport(label, reportIntent, rows));
    return;
  }

  const parsedText = parseIncomingText(text);
  if (!parsedText) {
    if (text.startsWith("/")) {
      await sendMessage(token, chatId, HELP);
    } else {
      await sendChatReply(cfg, chatId, text);
    }
    return;
  }

  const { book, body } = parsedText;
  if (!body) {
    await sendMessage(
      token,
      chatId,
      `စာသားထည့်ပေးပါ။ ဥပမာ - ${book === "personal" ? "coffee 2500" : "/m ဇော် kpay ထွက် 3000000"}`,
    );
    return;
  }

  await sendMessage(token, chatId, "စာရင်းခွဲနေပါတယ်...");

  let parsed: ParsedPayload;
  try {
    const ai = aiSettings(cfg);
    parsed = await parseMessage({
      book,
      text: body,
      aiKey: ai.key,
      baseUrl: ai.baseUrl,
      model: ai.model,
      personalCategories: personalCategories(cfg),
    });
  } catch (err) {
    console.error("parseMessage error", err);
    await sendMessage(
      token,
      chatId,
      `စာရင်းခွဲလို့မရသေးပါဘူး။ နောက်တစ်ခါပြန်စမ်းပါ။\n<code>${escapeHtml(String(err))}</code>`,
    );
    return;
  }

  const payloadData =
    book === "personal" ? parsed.personal : parsed.business;
  if (!payloadData) {
    await sendMessage(token, chatId, "သိမ်းမယ့် entry data မရလာပါဘူး။");
    return;
  }

  const inserted = await dbInsert<PendingRow>("pending_entries", {
    user_id: cfg.user_id,
    telegram_chat_id: chatId,
    telegram_message_id: msg.message_id,
    book,
    raw_text: body,
    parsed_data: parsed,
    status: "pending",
  });

  const card = formatCard(book, payloadData as unknown as Record<string, unknown>);
  await sendMessage(
    token,
    chatId,
    card,
    pendingKeyboard(inserted.id, book, personalCategories(cfg)),
  );
}

async function handleCallback(cb: TgCallback): Promise<void> {
  const cqId = cb.id;
  const data = cb.data ?? "";
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  if (!chatId || !messageId) return;

  const m = /^(confirm|cancel|cat):(.+?)(?::(\d+))?$/.exec(data);
  if (!m) return;

  const [, action, pendingId, categoryIndex] = m;
  const rows = await dbSelect<PendingRow>(
    "pending_entries",
    "id,user_id,telegram_chat_id,telegram_message_id,book,raw_text,parsed_data,status",
    { id: `eq.${pendingId}` },
  );
  const pending = rows[0];
  const cfg = pending ? await findConfigByUserId(pending.user_id) : null;

  if (!pending || !cfg) {
    await answerCallbackQuery(TELEGRAM_BOT_TOKEN, cqId, "သက်တမ်းကုန်သွားပါပြီ");
    return;
  }

  const token = TELEGRAM_BOT_TOKEN;

  if (pending.status !== "pending") {
    await answerCallbackQuery(token, cqId, "လုပ်ပြီးသားပါ");
    return;
  }

  if (action === "cat") {
    if (pending.book !== "personal" || !pending.parsed_data.personal) {
      await answerCallbackQuery(token, cqId, "Category ပြင်လို့မရပါ");
      return;
    }
    const categories = personalCategories(cfg);
    const category = categories[Number(categoryIndex)];
    if (!category) {
      await answerCallbackQuery(token, cqId, "Category မတွေ့ပါ");
      return;
    }

    const parsedData: ParsedPayload = {
      ...pending.parsed_data,
      personal: {
        ...pending.parsed_data.personal,
        category,
      },
    };

    await dbUpdate("pending_entries", { id: `eq.${pending.id}` }, {
      parsed_data: parsedData,
    });
    await answerCallbackQuery(token, cqId, `Category: ${category}`);
    await editMessageText(
      token,
      chatId,
      messageId,
      formatCard("personal", parsedData.personal as unknown as Record<string, unknown>),
      pendingKeyboard(pending.id, "personal", categories),
    );
    return;
  }

  if (action === "cancel") {
    await dbUpdate("pending_entries", { id: `eq.${pending.id}` }, {
      status: "cancelled",
    });
    await answerCallbackQuery(token, cqId, "မသိမ်းတော့ပါ");
    await editMessageText(token, chatId, messageId, "မသိမ်းတော့ပါ။");
    await sendMessage(token, chatId, "မသိမ်းတော့ပါဘူး။");
    return;
  }

  const entry =
    pending.book === "personal"
      ? pending.parsed_data.personal
      : pending.parsed_data.business;
  if (!entry) {
    await answerCallbackQuery(token, cqId, "Data မရှိပါ");
    return;
  }

  try {
    const databaseId =
      pending.book === "personal" ? cfg.personal_db_id : cfg.business_db_id;
    let pageId: string | null = null;
    let notionError: string | null = null;

    if (cfg.notion_token && databaseId) {
      try {
        pageId = await insertEntry({
          notionToken: cfg.notion_token,
          databaseId,
          book: pending.book,
          entry: entry as PersonalEntry | BusinessEntry,
        });
      } catch (err) {
        console.error("Notion optional sync error", err);
        notionError = String(err).slice(0, 500);
      }
    }

    await dbUpdate("pending_entries", { id: `eq.${pending.id}` }, {
      status: "confirmed",
      notion_page_id: pageId,
      error_message: notionError,
    });

    await dbInsert("entries_log", {
      user_id: cfg.user_id,
      book: pending.book,
      notion_page_id: pageId,
      raw_text: pending.raw_text,
      data: pending.parsed_data,
      amount: entry.amount,
      currency: (entry as { currency?: string }).currency ?? "MMK",
      direction:
        pending.book === "business"
          ? (entry as BusinessEntry).direction
          : null,
      category:
        pending.book === "personal"
          ? (entry as PersonalEntry).category
          : null,
      person:
        pending.book === "business"
          ? (entry as BusinessEntry).person
          : null,
      entry_date: entry.date,
    });

    await answerCallbackQuery(token, cqId, "သိမ်းပြီးပါပြီ");
    await editMessageText(
      token,
      chatId,
      messageId,
      `${pageId ? "Supabase နဲ့ Notion ထဲ သိမ်းပြီးပါပြီ။" : "Supabase ထဲ သိမ်းပြီးပါပြီ။"}\n${formatCard(pending.book, entry as unknown as Record<string, unknown>)}`,
    );
    await sendMessage(
      token,
      chatId,
      pageId
        ? "သိမ်းပြီးပါပြီ။ Supabase နဲ့ Notion ထဲဝင်သွားပါပြီ။"
        : "သိမ်းပြီးပါပြီ။ Supabase ထဲဝင်သွားပါပြီ။",
    );
  } catch (err) {
    console.error("confirm save error", err);
    await dbUpdate("pending_entries", { id: `eq.${pending.id}` }, {
      status: "error",
      error_message: String(err).slice(0, 500),
    });
    await answerCallbackQuery(token, cqId, "Error ဖြစ်နေပါတယ်");
    await sendMessage(
      token,
      chatId,
      `သိမ်းလို့မရပါဘူး။\n<code>${escapeHtml(String(err).slice(0, 300))}</code>`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("Missing TELEGRAM_BOT_TOKEN Edge Function secret.");
    }
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (err) {
    console.error("handler error", err);
  }

  return new Response("ok", { status: 200 });
});
