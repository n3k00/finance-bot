// Minimal Telegram Bot API client.

export interface InlineButton {
  text: string;
  callback_data: string;
}

export async function tg(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(json)}`);
  }
  return (json.result as Record<string, unknown>) ?? {};
}

export function sendMessage(
  token: string,
  chatId: number | string,
  text: string,
  replyMarkup?: { inline_keyboard: InlineButton[][] },
) {
  return tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: { inline_keyboard: InlineButton[][] },
) {
  return tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
) {
  return tg(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

export function formatCard(
  book: "personal" | "business",
  data: Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push(
    book === "personal"
      ? "<b>ကိုယ်ရေးသုံး စာရင်း</b>"
      : "<b>ငွေအဝင်/အထွက် စာရင်း</b>",
  );
  lines.push("");

  if (book === "personal") {
    lines.push(`အမျိုးအစား: <b>${escapeHtml(data.type ?? "")}</b>`);
    lines.push(`ကဏ္ဍ: ${escapeHtml(data.category ?? "")}`);
    lines.push(`အကြောင်းအရာ: ${escapeHtml(data.description ?? "")}`);
    lines.push(
      `ပမာဏ: <b>${escapeHtml(fmtAmount(data.amount))}</b> ${escapeHtml(data.currency ?? "MMK")}`,
    );
    lines.push(`ငွေပေးချေမှု: ${escapeHtml(data.payment_method ?? "Cash")}`);
    lines.push(`ရက်စွဲ: ${escapeHtml(data.date ?? "")}`);
    if (data.note) lines.push(`မှတ်ချက်: ${escapeHtml(data.note)}`);
  } else {
    lines.push(
      `အဝင်/အထွက်: <b>${escapeHtml(data.direction ?? "").toUpperCase()}</b>`,
    );
    lines.push(`လူ/ဆိုင်: ${escapeHtml(data.person ?? "-")}`);
    if (data.account_type) {
      lines.push(`Account Type: ${escapeHtml(data.account_type)}`);
    }
    if (data.account_no) {
      lines.push(`Acc No: ${escapeHtml(data.account_no)}`);
    }
    lines.push(
      `ပမာဏ: <b>${escapeHtml(fmtAmount(data.amount))}</b> ${escapeHtml(data.currency ?? "MMK")}`,
    );
    if (data.in_amount) {
      lines.push(`အဝင်: ${escapeHtml(fmtAmount(data.in_amount))}`);
    }
    if (data.out_amount) {
      lines.push(`အထွက်: ${escapeHtml(fmtAmount(data.out_amount))}`);
    }
    if (data.debt_amount) {
      lines.push(`အကြွေး/ကျန်: ${escapeHtml(fmtAmount(data.debt_amount))}`);
    }
    lines.push(`ငွေပေးချေမှု: ${escapeHtml(data.method ?? "cash")}`);
    lines.push(`အကြောင်းအရာ: ${escapeHtml(data.purpose ?? "-")}`);
    lines.push(`အခြေအနေ: ${escapeHtml(data.status ?? "pending")}`);
    lines.push(`ရက်စွဲ: ${escapeHtml(data.date ?? "")}`);
    if (data.note) lines.push(`မှတ်ချက်: ${escapeHtml(data.note)}`);
  }

  lines.push("");
  lines.push("ဒီအတိုင်း သိမ်းမလား?");
  return lines.join("\n");
}

function fmtAmount(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!isFinite(num)) return String(n ?? "");
  return num.toLocaleString("en-US");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
