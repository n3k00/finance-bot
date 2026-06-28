"use client";

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
  const [status, setStatus] = useState("Checking Telegram access...");
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);

  useEffect(() => {
    async function run() {
      const webApp = window.Telegram?.WebApp;
      webApp?.ready?.();
      webApp?.expand?.();

      const initData = webApp?.initData ?? "";
      if (!initData) {
        setError("Open this page from the Telegram Mini App button.");
        setStatus("Telegram Mini App data is missing.");
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
        return;
      }

      setNextUrl(json.nextUrl ?? "/settings");
      setStatus("Telegram access confirmed. Opening dashboard...");
      window.setTimeout(() => {
        window.location.href = json.nextUrl ?? "/dashboard";
      }, 900);
    }

    run().catch((err) => {
      setError(String(err));
      setStatus("Telegram access check failed.");
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <section className="w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
          TG
        </div>
        <h1 className="text-xl font-semibold text-slate-950">
          Telegram Access
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{status}</p>
        {telegramId ? (
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
            Telegram ID: {telegramId}
          </p>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {nextUrl ? (
          <a
            href={nextUrl}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Continue
          </a>
        ) : null}
      </section>
    </main>
  );
}
