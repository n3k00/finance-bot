import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { VerifiedTelegramInitData } from "./telegramMiniApp";

const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_AUTH_URL = "https://oauth.telegram.org/auth";
const TELEGRAM_TOKEN_URL = "https://oauth.telegram.org/token";
const TELEGRAM_JWKS = createRemoteJWKSet(
  new URL("https://oauth.telegram.org/.well-known/jwks.json"),
);

export const TELEGRAM_OIDC_STATE_COOKIE = "telegram_oidc_state";
export const TELEGRAM_OIDC_VERIFIER_COOKIE = "telegram_oidc_verifier";
export const TELEGRAM_OIDC_NEXT_COOKIE = "telegram_oidc_next";

interface TelegramOidcClaims extends JWTPayload {
  id?: number;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

export function getTelegramOidcClientId() {
  return process.env.TELEGRAM_OIDC_CLIENT_ID?.trim() ?? "";
}

export function getTelegramOidcClientSecret() {
  return process.env.TELEGRAM_OIDC_CLIENT_SECRET?.trim() ?? "";
}

export function hasTelegramOidcConfig() {
  return Boolean(getTelegramOidcClientId() && getTelegramOidcClientSecret());
}

function base64Url(input: Buffer) {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createTelegramOidcState() {
  return base64Url(randomBytes(32));
}

export function createTelegramOidcCodeVerifier() {
  return base64Url(randomBytes(48));
}

export function createTelegramOidcCodeChallenge(verifier: string) {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function createTelegramOidcAuthorizeUrl(input: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const params = new URLSearchParams({
    client_id: getTelegramOidcClientId(),
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid profile telegram:bot_access",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });

  return `${TELEGRAM_AUTH_URL}?${params.toString()}`;
}

export function safeNextUrl(nextUrl?: string | null) {
  if (!nextUrl || !nextUrl.startsWith("/") || nextUrl.startsWith("//")) {
    return "/dashboard";
  }
  return nextUrl;
}

export async function exchangeTelegramOidcCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const clientId = getTelegramOidcClientId();
  const clientSecret = getTelegramOidcClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("Telegram OpenID Connect is not configured.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: clientId,
    code_verifier: input.codeVerifier,
  });

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const res = await fetch(TELEGRAM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.id_token) {
    throw new Error(
      json.error_description ??
        json.error ??
        `Telegram token exchange failed (${res.status}).`,
    );
  }

  return json.id_token;
}

export async function verifyTelegramOidcIdToken(
  idToken: string,
): Promise<VerifiedTelegramInitData> {
  const { payload } = await jwtVerify(idToken, TELEGRAM_JWKS, {
    issuer: TELEGRAM_ISSUER,
    audience: getTelegramOidcClientId(),
  });
  const claims = payload as TelegramOidcClaims;
  const id = Number(claims.id ?? claims.sub);

  if (!Number.isFinite(id)) {
    throw new Error("Telegram user id is missing from the ID token.");
  }

  const [firstName, ...rest] = (claims.name ?? "").trim().split(/\s+/);
  return {
    authDate: Number(claims.iat ?? Math.floor(Date.now() / 1000)),
    user: {
      id,
      first_name: firstName || undefined,
      last_name: rest.length ? rest.join(" ") : undefined,
      username: claims.preferred_username,
      photo_url: claims.picture,
    },
  };
}
