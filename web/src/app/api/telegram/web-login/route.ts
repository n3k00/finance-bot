import { NextResponse } from "next/server";
import {
  authenticateAllowedTelegramUser,
  getTelegramBotToken,
  type TelegramWebLoginPayload,
  verifyTelegramWebLoginData,
} from "@/lib/telegramAuth";

interface RequestBody {
  telegramUser?: TelegramWebLoginPayload;
  nextUrl?: string;
}

function safeNextUrl(nextUrl?: string) {
  if (!nextUrl || !nextUrl.startsWith("/") || nextUrl.startsWith("//")) {
    return "/dashboard";
  }
  return nextUrl;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let verified;
  try {
    verified = verifyTelegramWebLoginData(
      body.telegramUser ?? {},
      getTelegramBotToken(),
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 401 },
    );
  }

  const authResult = await authenticateAllowedTelegramUser(verified);
  if (authResult.error) {
    return NextResponse.json(
      {
        allowed: false,
        error: authResult.error,
        telegramUser: authResult.user,
      },
      { status: authResult.status },
    );
  }

  return NextResponse.json({
    allowed: true,
    telegramUser: authResult.user,
    nextUrl: safeNextUrl(body.nextUrl),
  });
}
