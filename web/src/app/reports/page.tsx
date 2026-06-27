import { AdminShell } from "../AdminShell";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/queries";
import type { EntryLogRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function monthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function addMonthStart() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ReportsPage() {
  const { email } = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("entries_log")
    .select("*")
    .gte("entry_date", monthStart())
    .lt("entry_date", addMonthStart())
    .order("entry_date", { ascending: false });

  const rows = (data ?? []) as EntryLogRow[];
  const personalExpense = rows
    .filter((row) => row.book === "personal" && row.data.personal?.type === "Expense")
    .reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const moneyIn = rows
    .filter((row) => row.book === "business" && row.direction === "in")
    .reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const moneyOut = rows
    .filter((row) => row.book === "business" && row.direction === "out")
    .reduce((sum, row) => sum + (row.amount ?? 0), 0);

  return (
    <AdminShell
      active="reports"
      title="Reports"
      subtitle="Monthly summary from confirmed Supabase records."
      email={email}
    >
      <div className="max-w-7xl space-y-5">
        <section className="grid gap-3 md:grid-cols-3">
          <ReportCard label="Personal spend" value={personalExpense} />
          <ReportCard label="Bank in" value={moneyIn} />
          <ReportCard label="Bank out" value={moneyOut} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
          <h2 className="text-sm font-semibold text-slate-950">
            Telegram report prompts
          </h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <code className="rounded bg-slate-100 px-3 py-2">
              ဒီလ ငွေသုံးတာ ဘယ်လောက်ရှိပြီလဲ
            </code>
            <code className="rounded bg-slate-100 px-3 py-2">
              ဒီလ ငွေအဝင်အထွက် ဘယ်လောက်ရှိပြီလဲ
            </code>
            <code className="rounded bg-slate-100 px-3 py-2">
              /report last month
            </code>
            <code className="rounded bg-slate-100 px-3 py-2">
              /table အရင်လ
            </code>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function ReportCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 font-mono text-[26px] font-semibold leading-none text-slate-950">
        {value.toLocaleString("en-US")}
      </p>
    </div>
  );
}
