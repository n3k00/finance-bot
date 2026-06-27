import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyTelegramInitData } from "@/lib/telegramMiniApp";

interface RequestBody {
  initData?: string;
}

interface AllowlistRow {
  telegram_user_id: number;
  label: string | null;
  is_active: boolean;
  linked_user_id: string | null;
}

interface BotConfigRow {
  allowed_telegram_ids: number[] | null;
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
    verified = verifyTelegramInitData(
      body.initData ?? "",
      process.env.TELEGRAM_MINI_APP_BOT_TOKEN ?? "",
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 401 },
    );
  }

  const telegramId = verified.user.id;
  const admin = createAdminClient();
  const { data: allowlistRow, error: allowlistError } = await admin
    .from("telegram_allowlist")
    .select("telegram_user_id,label,is_active,linked_user_id")
    .eq("telegram_user_id", telegramId)
    .maybeSingle();

  if (allowlistError) {
    return NextResponse.json({ error: allowlistError.message }, { status: 500 });
  }

  const allowed = allowlistRow as AllowlistRow | null;
  if (!allowed?.is_active) {
    return NextResponse.json(
      {
        allowed: false,
        error: "Access not allowed. Ask the admin to add your Telegram ID.",
        telegramUser: verified.user,
      },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      allowed: true,
      linked: false,
      needsLogin: true,
      telegramUser: verified.user,
      nextUrl: `/login?next=${encodeURIComponent(`/settings?telegram_id=${telegramId}`)}`,
    });
  }

  if (allowed.linked_user_id && allowed.linked_user_id !== user.id) {
    return NextResponse.json(
      {
        allowed: false,
        error: "This Telegram account is already linked to another web account.",
        telegramUser: verified.user,
      },
      { status: 409 },
    );
  }

  const { data: config, error: configError } = await admin
    .from("bot_config")
    .select("allowed_telegram_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  const existingIds = ((config as BotConfigRow | null)?.allowed_telegram_ids ?? [])
    .map(Number)
    .filter(Number.isFinite);
  const nextIds = Array.from(new Set([...existingIds, telegramId]));

  const hasConfig = Boolean(config);
  if (hasConfig) {
    const { error: updateError } = await admin
      .from("bot_config")
      .update({ allowed_telegram_ids: nextIds })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { error: linkError } = await admin
    .from("telegram_allowlist")
    .update({ linked_user_id: user.id })
    .eq("telegram_user_id", telegramId);

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({
    allowed: true,
    linked: hasConfig,
    needsLogin: false,
    hasConfig,
    telegramUser: verified.user,
    nextUrl: `/settings?telegram_id=${telegramId}`,
  });
}
