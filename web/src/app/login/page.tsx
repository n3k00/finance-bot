import Link from "next/link";
import { hasTelegramOidcConfig } from "@/lib/telegramOidc";

function getErrorMessage(error?: string) {
  if (!error) return null;
  if (error === "telegram_oidc_not_configured") {
    return "Telegram OpenID Connect is not configured on the server.";
  }
  return error;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const configured = hasTelegramOidcConfig();
  const next = params.next ? `?next=${encodeURIComponent(params.next)}` : "";
  const error = getErrorMessage(params.error);

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

        {configured ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <Link
              href={`/api/telegram/oidc/start${next}`}
              className="flex h-12 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Sign in with Telegram
            </Link>
            <p className="mt-3 text-center text-sm leading-6 text-slate-500">
              Only Telegram IDs in the allowlist can enter.
            </p>
            {error ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-700 shadow-sm">
            Telegram OpenID Connect is not configured on the server.
          </div>
        )}
      </section>
    </main>
  );
}
