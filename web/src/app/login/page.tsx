import { LoginWithTelegram } from "./LoginWithTelegram";
import { getTelegramBotToken } from "@/lib/telegramAuth";

async function getBotUsername() {
  const token = getTelegramBotToken();
  if (!token) return null;

  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    cache: "no-store",
  });
  const json = (await res.json()) as {
    ok?: boolean;
    result?: { username?: string };
  };

  return json.ok ? (json.result?.username ?? null) : null;
}

export default async function LoginPage() {
  const botUsername = await getBotUsername();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-[420px]">
        <div className="mb-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white shadow-sm">
            FB
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
            Finance Bot
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Sign in with the Telegram account that is allowed for this app.
          </p>
        </div>

        {botUsername ? (
          <LoginWithTelegram botUsername={botUsername} />
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-700 shadow-sm">
            Telegram bot is not configured on the server.
          </div>
        )}
      </section>
    </main>
  );
}
