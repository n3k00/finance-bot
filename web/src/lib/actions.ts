"use server";

import { revalidatePath } from "next/cache";
import { getAppUrl } from "./siteUrl";
import { createClient } from "./supabase/server";
import type { BotConfigInput, OpenAIModelOption } from "./types";

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "https://api.openai.com/v1";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("AI base URL must use HTTPS.");
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("AI base URL is invalid.");
  }
}

function fallbackModelsForBaseUrl(baseUrl: string): OpenAIModelOption[] {
  if (!baseUrl.includes("xiaomimimo.com")) return [];
  const now = Math.floor(Date.now() / 1000);
  return [
    { id: "mimo-v2.5-pro", created: now, owned_by: "xiaomi-mimo" },
    {
      id: "mimo-v2.5-pro-ultraspeed",
      created: now - 1,
      owned_by: "xiaomi-mimo",
    },
    { id: "mimo-v2.5", created: now - 2, owned_by: "xiaomi-mimo" },
    { id: "mimo-v2.5-tts", created: now - 3, owned_by: "xiaomi-mimo" },
    {
      id: "mimo-v2.5-tts-voiceclone",
      created: now - 4,
      owned_by: "xiaomi-mimo",
    },
    { id: "mimo-v2.5-asr", created: now - 5, owned_by: "xiaomi-mimo" },
  ];
}

function mergeModels(
  models: OpenAIModelOption[],
  fallback: OpenAIModelOption[],
): OpenAIModelOption[] {
  const byId = new Map<string, OpenAIModelOption>();
  for (const model of [...models, ...fallback]) {
    if (!byId.has(model.id)) byId.set(model.id, model);
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.created - a.created || a.id.localeCompare(b.id),
  );
}

function getTelegramBotToken() {
  return (
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    process.env.TELEGRAM_MINI_APP_BOT_TOKEN?.trim() ||
    ""
  );
}

async function requireAuthenticatedAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? null : "Not authenticated";
}

export async function saveBotConfig(input: BotConfigInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("bot_config")
    .select("openai_api_key,notion_token,ai_provider,ai_base_url")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  const openaiApiKey =
    input.openai_api_key.trim() ||
    ((existing?.openai_api_key as string | undefined) ?? "");
  const notionToken =
    input.notion_token.trim() ||
    ((existing?.notion_token as string | undefined) ?? "");

  if (!openaiApiKey) {
    return { error: "AI API key is required." };
  }

  let aiBaseUrl: string;
  try {
    aiBaseUrl = normalizeBaseUrl(
      input.ai_base_url ||
        ((existing?.ai_base_url as string | undefined) ?? ""),
    );
  } catch (e) {
    return { error: (e as Error).message };
  }

  const row = {
    user_id: user.id,
    ai_provider: input.ai_provider?.trim() || "openai",
    ai_base_url: aiBaseUrl,
    openai_api_key: openaiApiKey,
    openai_model: (input.openai_model ?? "gpt-4o-mini").trim() || "gpt-4o-mini",
    notion_token: notionToken || null,
    personal_db_id: input.personal_db_id?.trim() || null,
    business_db_id: input.business_db_id?.trim() || null,
  };

  const { error } = await supabase
    .from("bot_config")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/setup");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function setTelegramMenuButton(): Promise<{
  error: string | null;
  message: string | null;
}> {
  const authError = await requireAuthenticatedAction();
  if (authError) return { error: authError, message: null };

  const botToken = getTelegramBotToken();
  if (!botToken) {
    return {
      error: "Missing TELEGRAM_BOT_TOKEN.",
      message: null,
    };
  }

  return setTelegramMenuButtonForToken(botToken);
}

async function setTelegramMenuButtonForToken(botToken: string): Promise<{
  error: string | null;
  message: string | null;
}> {
  const miniAppUrl = `${getAppUrl()}/telegram`;
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setChatMenuButton`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menu_button: {
          type: "web_app",
          text: "စာရင်း",
          web_app: { url: miniAppUrl },
        },
      }),
      cache: "no-store",
    },
  );

  const json = (await res.json()) as {
    ok?: boolean;
    description?: string;
  };

  if (!res.ok || !json.ok) {
    return {
      error: json.description ?? `Telegram setChatMenuButton failed (${res.status}).`,
      message: null,
    };
  }

  return {
    error: null,
    message: `Telegram menu button set: ${miniAppUrl}`,
  };
}

export async function listOpenAIModels(input: {
  openai_api_key?: string;
  ai_base_url?: string;
}): Promise<{
  error: string | null;
  models: OpenAIModelOption[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated", models: [] };
  }

  let apiKey = input.openai_api_key?.trim() ?? "";
  let baseUrl = "";
  if (!apiKey) {
    const { data, error } = await supabase
      .from("bot_config")
      .select("openai_api_key,ai_base_url")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      return { error: error.message, models: [] };
    }
    apiKey = (data?.openai_api_key as string | undefined) ?? "";
    baseUrl = (data?.ai_base_url as string | undefined) ?? "";
  }

  if (!apiKey) {
    return { error: "Enter or save an AI API key first.", models: [] };
  }

  try {
    baseUrl = normalizeBaseUrl(input.ai_base_url || baseUrl);
  } catch (e) {
    return { error: (e as Error).message, models: [] };
  }

  const res = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "api-key": apiKey,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const fallback = fallbackModelsForBaseUrl(baseUrl);
    if (fallback.length > 0) {
      return { error: null, models: fallback };
    }
    return {
      error: `Models request failed (${res.status}). Check the API key and base URL.`,
      models: [],
    };
  }

  const json = (await res.json()) as {
    data?: OpenAIModelOption[];
  };

  const excluded = baseUrl.includes("xiaomimimo.com")
    ? []
    : [
    "audio",
    "dall-e",
    "embedding",
    "image",
    "moderation",
    "realtime",
    "search",
    "speech",
    "tts",
    "transcribe",
    "translation",
    "whisper",
      ];

  const models = (json.data ?? [])
    .filter((model) => {
      const id = model.id.toLowerCase();
      return !excluded.some((word) => id.includes(word));
    })
    .sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));

  return {
    error: null,
    models: mergeModels(models, fallbackModelsForBaseUrl(baseUrl)),
  };
}

export async function registerTelegramWebhook(input?: BotConfigInput): Promise<{
  error: string | null;
  message: string | null;
}> {
  const authError = await requireAuthenticatedAction();
  if (authError) return { error: authError, message: null };

  if (input) {
    const saveResult = await saveBotConfig(input);
    if (saveResult.error) {
      return { error: saveResult.error, message: null };
    }
  }

  const botToken = getTelegramBotToken();
  if (!botToken) {
    return {
      error: "Missing TELEGRAM_BOT_TOKEN.",
      message: null,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { error: "Missing NEXT_PUBLIC_SUPABASE_URL.", message: null };
  }

  const webhookUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/telegram-webhook`;
  const secret = process.env.WEBHOOK_SECRET?.trim();

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        ...(secret ? { secret_token: secret } : {}),
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      }),
      cache: "no-store",
    },
  );

  const json = (await res.json()) as {
    ok?: boolean;
    description?: string;
  };

  if (!res.ok || !json.ok) {
    return {
      error: json.description ?? `Telegram setWebhook failed (${res.status}).`,
      message: null,
    };
  }

  const menuResult = await setTelegramMenuButtonForToken(botToken);
  if (menuResult.error) {
    return {
      error: null,
      message: `Webhook registered: ${webhookUrl}\nMenu button not updated: ${menuResult.error}`,
    };
  }

  return {
    error: null,
    message: secret
      ? `Webhook registered: ${webhookUrl}\n${menuResult.message}`
      : `Webhook registered without a secret token: ${webhookUrl}\n${menuResult.message}`,
  };
}

export async function checkTelegramWebhook(): Promise<{
  error: string | null;
  message: string | null;
}> {
  const authError = await requireAuthenticatedAction();
  if (authError) return { error: authError, message: null };

  const botToken = getTelegramBotToken();
  if (!botToken) {
    return {
      error: "Missing TELEGRAM_BOT_TOKEN.",
      message: null,
    };
  }

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
    { cache: "no-store" },
  );
  const json = (await res.json()) as {
    ok?: boolean;
    description?: string;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
    };
  };

  if (!res.ok || !json.ok) {
    return {
      error: json.description ?? `Telegram getWebhookInfo failed (${res.status}).`,
      message: null,
    };
  }

  const info = json.result ?? {};
  const parts = [
    `Webhook URL: ${info.url || "(none)"}`,
    `Pending updates: ${info.pending_update_count ?? 0}`,
  ];
  if (info.last_error_message) {
    parts.push(`Last error: ${info.last_error_message}`);
  }
  if (info.last_error_date) {
    parts.push(
      `Last error time: ${new Date(info.last_error_date * 1000).toISOString()}`,
    );
  }

  return { error: null, message: parts.join("\n") };
}
