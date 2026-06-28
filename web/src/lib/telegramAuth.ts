import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type {
  TelegramMiniAppUser,
  VerifiedTelegramInitData,
} from "./telegramMiniApp";

interface AllowlistRow {
  telegram_user_id: number;
  label: string | null;
  is_active: boolean;
  linked_user_id: string | null;
}

export interface TelegramWebLoginPayload {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
}

const MAX_TELEGRAM_AUTH_AGE_SECONDS = 24 * 60 * 60;

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return left.length === right.length && timingSafeEqual(left, right);
}

function getTelegramAuthEmail(telegramId: number) {
  return `tg-${telegramId}@telegram.finance-bot.local`;
}

function getDisplayName(user: TelegramMiniAppUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

export function getTelegramBotToken() {
  return (
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    process.env.TELEGRAM_MINI_APP_BOT_TOKEN?.trim() ||
    ""
  );
}

export function verifyTelegramWebLoginData(
  payload: TelegramWebLoginPayload,
  botToken: string,
): VerifiedTelegramInitData {
  if (!botToken.trim()) {
    throw new Error("Missing Telegram bot token.");
  }
  if (!payload.hash) {
    throw new Error("Telegram login hash is missing.");
  }
  if (!Number.isFinite(payload.id)) {
    throw new Error("Telegram user id is invalid.");
  }
  if (!Number.isFinite(payload.auth_date)) {
    throw new Error("Telegram auth_date is invalid.");
  }
  if (Date.now() / 1000 - Number(payload.auth_date) > MAX_TELEGRAM_AUTH_AGE_SECONDS) {
    throw new Error("Telegram login data has expired.");
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "hash" || value === undefined || value === null) continue;
    fields[key] = String(value);
  }

  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!safeEqualHex(expectedHash, payload.hash)) {
    throw new Error("Telegram login signature is invalid.");
  }

  return {
    authDate: Number(payload.auth_date),
    user: {
      id: Number(payload.id),
      first_name: payload.first_name,
      last_name: payload.last_name,
      username: payload.username,
      photo_url: payload.photo_url,
    },
  };
}

export async function authenticateAllowedTelegramUser(
  verified: VerifiedTelegramInitData,
) {
  const telegramId = verified.user.id;
  const admin = createAdminClient();
  const { data: allowlistRow, error: allowlistError } = await admin
    .from("telegram_allowlist")
    .select("telegram_user_id,label,is_active,linked_user_id")
    .eq("telegram_user_id", telegramId)
    .maybeSingle();

  if (allowlistError) {
    return { error: allowlistError.message, status: 500, user: verified.user };
  }

  const allowed = allowlistRow as AllowlistRow | null;
  if (!allowed?.is_active) {
    return {
      error: "Access not allowed. Ask the admin to add your Telegram ID.",
      status: 403,
      user: verified.user,
    };
  }

  let email = getTelegramAuthEmail(telegramId);
  let authUserId = allowed.linked_user_id;

  if (authUserId) {
    const { data, error } = await admin.auth.admin.getUserById(authUserId);
    if (error) {
      return { error: error.message, status: 500, user: verified.user };
    }
    if (!data.user?.email) {
      return {
        error: "Linked Supabase Auth user has no email.",
        status: 500,
        user: verified.user,
      };
    }
    email = data.user.email;
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          provider: "telegram",
          telegram_user_id: telegramId,
          telegram_username: verified.user.username ?? null,
          telegram_name: getDisplayName(verified.user) || null,
        },
      },
    });

  if (linkError) {
    return { error: linkError.message, status: 500, user: verified.user };
  }

  const tokenHash = linkData.properties?.hashed_token;
  authUserId = authUserId ?? linkData.user?.id ?? null;

  if (!tokenHash || !authUserId) {
    return {
      error: "Failed to create Telegram auth session.",
      status: 500,
      user: verified.user,
    };
  }

  const supabase = await createClient();
  const { data: sessionData, error: verifyError } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });

  if (verifyError) {
    return { error: verifyError.message, status: 500, user: verified.user };
  }

  if (sessionData.user?.id !== authUserId) {
    return {
      error: "Telegram auth linked to an unexpected user.",
      status: 500,
      user: verified.user,
    };
  }

  const { error: updateError } = await admin
    .from("telegram_allowlist")
    .update({ linked_user_id: authUserId })
    .eq("telegram_user_id", telegramId);

  if (updateError) {
    return { error: updateError.message, status: 500, user: verified.user };
  }

  return {
    error: null,
    status: 200,
    user: verified.user,
    userId: authUserId,
  };
}
