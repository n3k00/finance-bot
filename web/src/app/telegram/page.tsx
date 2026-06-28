"use client";

import { Check, Copy, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

interface TelegramAuthResponse {
  allowed?: boolean;
  linked?: boolean;
  needsLogin?: boolean;
  hasConfig?: boolean;
  nextUrl?: string;
  error?: string;
  telegramUser?: {
    id: number;
    first_name?: string;
    username?: string;
  };
}

export default function TelegramMiniAppPage() {
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState("Loading Telegram...");
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!sdkReady) return;

    async function run() {
      const webApp = window.Telegram?.WebApp;
      webApp?.ready?.();
      webApp?.expand?.();

      const initData = webApp?.initData ?? "";
      if (!initData) {
        setError("Open this page from the Telegram Mini App button.");
        setStatus("Telegram Mini App data is missing.");
        setChecking(false);
        return;
      }

      const res = await fetch("/api/telegram/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const json = (await res.json()) as TelegramAuthResponse;
      setTelegramId(json.telegramUser?.id ?? null);

      if (!res.ok || !json.allowed) {
        setError(json.error ?? "Access not allowed.");
        setStatus("Access denied.");
        setChecking(false);
        return;
      }

      setNextUrl(json.nextUrl ?? "/settings");
      setStatus("Telegram access confirmed. Opening dashboard...");
      setChecking(false);
      window.setTimeout(() => {
        window.location.href = json.nextUrl ?? "/dashboard";
      }, 900);
    }

    run().catch((err) => {
      setError(String(err));
      setStatus("Telegram access check failed.");
      setChecking(false);
    });
  }, [sdkReady]);

  async function copyTelegramId() {
    if (!telegramId) return;
    await navigator.clipboard.writeText(String(telegramId));
    setCopyDone(true);
    window.setTimeout(() => setCopyDone(false), 1600);
  }

  const deniedWithId = Boolean(error && telegramId && !nextUrl);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onReady={() => setSdkReady(true)}
        onError={() => {
          setError("Telegram Web App SDK failed to load.");
          setStatus("Telegram access check failed.");
          setChecking(false);
        }}
      />
      <main className="min-h-[100dvh] bg-[#f5f7fb] px-4 py-5 text-slate-950 sm:px-6 sm:py-8">
        <section className="mx-auto flex min-h-[calc(100dvh-40px)] w-full max-w-[520px] flex-col justify-center sm:min-h-[calc(100dvh-64px)]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
                TG
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-normal text-slate-950">
                  Telegram Access
                </h1>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Mini App login
                </p>
              </div>
            </div>

            {checking ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                <p className="text-sm leading-6 text-slate-600">{status}</p>
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">{status}</p>
            )}

            {deniedWithId ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-amber-950">
                      Access မရသေးပါ
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-amber-900">
                      ဒီ Telegram ID ကို copy ကူးပြီး @n3k000 ကို message ပို့ပါ။
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <div className="min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-normal text-amber-700">
                      Your Telegram ID
                    </p>
                    <p className="mt-1 break-all font-mono text-lg font-semibold text-slate-950">
                      {telegramId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={copyTelegramId}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    {copyDone ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copyDone ? "Copied" : "Copy ID"}
                  </button>
                </div>

                <a
                  href={`https://t.me/n3k000?text=${encodeURIComponent(
                    `Please allow my Telegram ID: ${telegramId}`,
                  )}`}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
                >
                  Message @n3k000
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : null}

            {telegramId && !deniedWithId ? (
              <div className="mt-4 rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-normal text-slate-500">
                  Telegram ID
                </p>
                <p className="mt-1 break-all font-mono text-sm text-slate-800">
                  {telegramId}
                </p>
              </div>
            ) : null}

            {error && !deniedWithId ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                {error}
              </div>
            ) : null}

            {nextUrl ? (
              <a
                href={nextUrl}
                className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Continue
              </a>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
