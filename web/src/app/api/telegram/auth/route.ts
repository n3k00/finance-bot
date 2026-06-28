import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  type TelegramMiniAppUser,
  type VerifiedTelegramInitData,
  verifyTelegramInitData,
} from "@/lib/telegramMiniApp";

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

function getTelegramAuthEmail(telegramId: number) {
  return `tg-${telegramId}@telegram.finance-bot.local`;
}

function getDisplayName(user: TelegramMiniAppUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

async function createOrLinkAuthSession({
  admin,
  allowlistRow,
  verified,
}: {
  admin: ReturnType<typeof createAdminClient>;
  allowlistRow: AllowlistRow;
  verified: VerifiedTelegramInitData;
}) {
  const telegramId = verified.user.id;
  let email = getTelegramAuthEmail(telegramId);
  let authUserId = allowlistRow.linked_user_id;

  if (authUserId) {
    const { data, error } = await admin.auth.admin.getUserById(authUserId);
    if (error) {
      return { error: error.message };
    }
    if (!data.user?.email) {
      return { error: "Linked Supabase Auth user has no email." };
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
    return { error: linkError.message };
  }

  const tokenHash = linkData.properties?.hashed_token;
  authUserId = authUserId ?? linkData.user?.id ?? null;

  if (!tokenHash || !authUserId) {
    return { error: "Failed to create Telegram auth session." };
  }

  const supabase = await createClient();
  const { data: sessionData, error: verifyError } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });

  if (verifyError) {
    return { error: verifyError.message };
  }

  if (sessionData.user?.id !== authUserId) {
    return { error: "Telegram auth linked to an unexpected user." };
  }

  return {
    error: null,
    userId: authUserId,
    email,
  };
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

  const authResult = await createOrLinkAuthSession({
    admin,
    allowlistRow: allowed,
    verified,
  });

  if (authResult.error || !authResult.userId) {
    return NextResponse.json(
      { error: authResult.error ?? "Telegram auth failed." },
      { status: 500 },
    );
  }

  const { data: config, error: configError } = await admin
    .from("bot_config")
    .select("allowed_telegram_ids")
    .eq("user_id", authResult.userId)
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
      .eq("user_id", authResult.userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { error: linkError } = await admin
    .from("telegram_allowlist")
    .update({ linked_user_id: authResult.userId })
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
    nextUrl: "/dashboard",
  });
}
