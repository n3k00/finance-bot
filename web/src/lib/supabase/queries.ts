import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { BotConfig, BotConfigFormInitial } from "../types";

export async function requireUser(): Promise<{
  userId: string;
  email: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { userId: user.id, email: user.email ?? "" };
}

export async function getBotConfig(): Promise<BotConfigFormInitial | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("bot_config")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return null;
  }
  const config = data as BotConfig | null;
  if (!config) return null;

  return {
    user_id: config.user_id,
    ai_provider: config.ai_provider ?? "openai",
    ai_base_url: config.ai_base_url ?? "https://api.openai.com/v1",
    openai_model: config.openai_model,
    personal_db_id: config.personal_db_id,
    business_db_id: config.business_db_id,
    allowed_telegram_ids: config.allowed_telegram_ids,
    has_openai_api_key: Boolean(config.openai_api_key),
    has_notion_token: Boolean(config.notion_token),
    created_at: config.created_at,
    updated_at: config.updated_at,
  };
}

export async function getDatabaseSetupStatus(): Promise<{
  ready: boolean;
  message: string | null;
}> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("bot_config")
    .select("user_id")
    .limit(1);

  if (!error) {
    return { ready: true, message: null };
  }

  const message =
    "Supabase database schema is not ready. Run supabase/schema.sql in the Supabase SQL Editor, then refresh this page.";

  return { ready: false, message };
}
