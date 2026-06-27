import {
  requireUser,
  getBotConfig,
  getDatabaseSetupStatus,
} from "@/lib/supabase/queries";
import {
  checkTelegramWebhook,
  listOpenAIModels,
  registerTelegramWebhook,
  saveBotConfig,
} from "@/lib/actions";
import { AdminShell } from "../AdminShell";
import { SetupForm } from "../setup/SetupForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ telegram_id?: string }>;
}) {
  const params = await searchParams;
  const { email } = await requireUser();
  const [existing, databaseStatus] = await Promise.all([
    getBotConfig(),
    getDatabaseSetupStatus(),
  ]);

  return (
    <AdminShell
      active="settings"
      title="Settings"
      subtitle="Configure Telegram access, AI provider, webhook, and optional Notion sync."
      email={email}
    >
      <div className="grid max-w-7xl gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {!databaseStatus.ready ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm">
              {databaseStatus.message}
            </div>
          ) : null}

          <SetupForm
            initial={existing}
            initialTelegramId={params.telegram_id}
            action={saveBotConfig}
            loadModelsAction={listOpenAIModels}
            registerWebhookAction={registerTelegramWebhook}
            checkWebhookAction={checkTelegramWebhook}
          />
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 xl:self-start">
          <h2 className="text-sm font-semibold text-slate-950">
            Setup checklist
          </h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-700">
                1
              </span>
              <span>Create a Telegram bot and copy its token.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-700">
                2
              </span>
              <span>Add the Telegram user IDs allowed to submit entries.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-700">
                3
              </span>
              <span>Select the AI provider and model used by the bot.</span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-700">
                4
              </span>
              <span>Register the hosted Supabase Edge Function webhook.</span>
            </li>
          </ol>
        </aside>
      </div>
    </AdminShell>
  );
}
