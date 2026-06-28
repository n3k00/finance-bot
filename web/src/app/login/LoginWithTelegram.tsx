"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginUser) => void;
  }
}

interface TelegramLoginUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function LoginWithTelegram({ botUsername }: { botUsername: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = widgetRef.current;
    if (!container) return;

    window.onTelegramAuth = async (user: TelegramLoginUser) => {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/telegram/web-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramUser: user,
          nextUrl: searchParams.get("next") ?? "/dashboard",
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        nextUrl?: string;
      };

      if (!res.ok) {
        setError(json.error ?? "Telegram login failed.");
        setLoading(false);
        return;
      }

      router.replace(json.nextUrl ?? "/dashboard");
      router.refresh();
    };

    container.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "6");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    container.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
      container.innerHTML = "";
    };
  }, [botUsername, router, searchParams]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        <div
          ref={widgetRef}
          className="flex min-h-12 items-center justify-center"
          aria-busy={loading}
        />
        {loading ? (
          <p className="text-center text-sm text-slate-500">
            Signing in with Telegram...
          </p>
        ) : null}
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
