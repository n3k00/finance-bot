import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/siteUrl";
import { authenticateAllowedTelegramUser } from "@/lib/telegramAuth";
import {
  exchangeTelegramOidcCode,
  safeNextUrl,
  TELEGRAM_OIDC_NEXT_COOKIE,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
  verifyTelegramOidcIdToken,
} from "@/lib/telegramOidc";

function redirectWithError(requestUrl: string, message: string) {
  const url = new URL("/login", requestUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error_description") ??
    requestUrl.searchParams.get("error");

  if (error) return redirectWithError(request.url, error);
  if (!code || !state) {
    return redirectWithError(request.url, "Telegram login response is invalid.");
  }

  const cookie = request.headers.get("cookie") ?? "";
  const cookieMap = new Map(
    cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
        ] as const;
      }),
  );
  const expectedState = cookieMap.get(TELEGRAM_OIDC_STATE_COOKIE);
  const verifier = cookieMap.get(TELEGRAM_OIDC_VERIFIER_COOKIE);
  const nextUrl = safeNextUrl(cookieMap.get(TELEGRAM_OIDC_NEXT_COOKIE));

  if (!expectedState || expectedState !== state || !verifier) {
    return redirectWithError(request.url, "Telegram login session expired.");
  }

  try {
    const redirectUri = `${getAppUrl()}/api/telegram/oidc/callback`;
    const idToken = await exchangeTelegramOidcCode({
      code,
      redirectUri,
      codeVerifier: verifier,
    });
    const verified = await verifyTelegramOidcIdToken(idToken);
    const authResult = await authenticateAllowedTelegramUser(verified);

    if (authResult.error) {
      return redirectWithError(request.url, authResult.error);
    }

    const response = NextResponse.redirect(new URL(nextUrl, request.url));
    response.cookies.delete(TELEGRAM_OIDC_STATE_COOKIE);
    response.cookies.delete(TELEGRAM_OIDC_VERIFIER_COOKIE);
    response.cookies.delete(TELEGRAM_OIDC_NEXT_COOKIE);
    return response;
  } catch (e) {
    return redirectWithError(request.url, (e as Error).message);
  }
}
