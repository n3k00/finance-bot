import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/siteUrl";
import {
  createTelegramOidcAuthorizeUrl,
  createTelegramOidcCodeChallenge,
  createTelegramOidcCodeVerifier,
  createTelegramOidcState,
  hasTelegramOidcConfig,
  safeNextUrl,
  TELEGRAM_OIDC_NEXT_COOKIE,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
} from "@/lib/telegramOidc";

export async function GET(request: Request) {
  if (!hasTelegramOidcConfig()) {
    return NextResponse.redirect(
      new URL("/login?error=telegram_oidc_not_configured", request.url),
    );
  }

  const requestUrl = new URL(request.url);
  const nextUrl = safeNextUrl(requestUrl.searchParams.get("next"));
  const state = createTelegramOidcState();
  const verifier = createTelegramOidcCodeVerifier();
  const redirectUri = `${getAppUrl()}/api/telegram/oidc/callback`;
  const authorizeUrl = createTelegramOidcAuthorizeUrl({
    redirectUri,
    state,
    codeChallenge: createTelegramOidcCodeChallenge(verifier),
  });

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getAppUrl().startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  };
  response.cookies.set(TELEGRAM_OIDC_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(TELEGRAM_OIDC_VERIFIER_COOKIE, verifier, cookieOptions);
  response.cookies.set(TELEGRAM_OIDC_NEXT_COOKIE, nextUrl, cookieOptions);

  return response;
}
