import { createHmac, timingSafeEqual } from "crypto";

export interface TelegramMiniAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface VerifiedTelegramInitData {
  authDate: number;
  user: TelegramMiniAppUser;
}

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
): VerifiedTelegramInitData {
  if (!initData.trim()) {
    throw new Error("Missing Telegram initData.");
  }
  if (!botToken.trim()) {
    throw new Error("Missing Telegram Mini App bot token.");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("Telegram initData hash is missing.");
  }

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (!safeEqualHex(expectedHash, hash)) {
    throw new Error("Telegram initData signature is invalid.");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) {
    throw new Error("Telegram auth_date is invalid.");
  }
  if (Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error("Telegram initData has expired.");
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    throw new Error("Telegram user is missing.");
  }

  const user = JSON.parse(rawUser) as TelegramMiniAppUser;
  if (!Number.isFinite(user.id)) {
    throw new Error("Telegram user id is invalid.");
  }

  return { authDate, user };
}
