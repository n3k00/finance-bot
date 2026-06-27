import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Logs the user out and sends them to /login.
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
