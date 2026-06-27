import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase auth callback for magic link / OAuth redirects.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/settings";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("auth exchange error", error);
  }

  return NextResponse.redirect(new URL("/login?error=1", url.origin));
}
