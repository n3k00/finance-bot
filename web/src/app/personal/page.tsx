import { AdminShell } from "../AdminShell";
import { MonthFilter } from "../MonthFilter";
import {
  buildMonthOptions,
  getMonthLabel,
  getMonthRange,
  normalizeMonth,
} from "../monthUtils";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/queries";
import type { EntryLogRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const selectedMonth = normalizeMonth(params.month);
  const { start, end } = getMonthRange(selectedMonth);
  const { email } = await requireUser();
  const supabase = await createClient();
  const { data: monthData } = await supabase
    .from("entries_log")
    .select("entry_date")
    .eq("book", "personal")
    .order("entry_date", { ascending: false })
    .limit(1000);
  const { data } = await supabase
    .from("entries_log")
    .select("*")
    .eq("book", "personal")
    .gte("entry_date", start)
    .lt("entry_date", end)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as EntryLogRow[];
  const monthOptions = buildMonthOptions(
    (monthData ?? []).map((row) => row.entry_date),
    selectedMonth,
  );
  const total = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);

  return (
    <AdminShell
      active="personal"
      title="Personal Expenses"
      subtitle="Personal spending entries parsed from Telegram messages."
      email={email}
    >
      <div className="max-w-7xl space-y-5">
        <MonthFilter
          basePath="/personal"
          selectedMonth={selectedMonth}
          monthOptions={monthOptions}
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Rows" value={rows.length.toLocaleString("en-US")} />
          <SummaryCard label="Total amount" value={total.toLocaleString("en-US")} />
          <SummaryCard
            label="Month"
            value={getMonthLabel(selectedMonth)}
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
          <header className="border-b border-slate-200 bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Personal expense table - {getMonthLabel(selectedMonth)}
            </h2>
          </header>
          <div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="w-[112px] px-4 py-3 text-left font-semibold">Date</th>
                  <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">Category</th>
                  <th className="px-4 py-3 text-left font-semibold">Description</th>
                  <th className="hidden px-4 py-3 text-left font-semibold lg:table-cell">Original text</th>
                  <th className="hidden px-4 py-3 text-left font-semibold xl:table-cell">Method</th>
                  <th className="w-[128px] px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const entry = row.data.personal;
                  if (!entry) return null;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {row.entry_date}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {entry.category}
                      </td>
                      <td className="min-w-0 px-4 py-3 text-slate-700">
                        <div className="truncate">{entry.description}</div>
                        <div className="mt-1 truncate text-xs text-slate-400 md:hidden">
                          {entry.category}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 lg:table-cell">
                        <div className="truncate">{row.raw_text ?? "-"}</div>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 xl:table-cell">
                        {entry.payment_method}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-slate-950">
                        {(row.amount ?? entry.amount).toLocaleString("en-US")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 font-mono text-[26px] font-semibold leading-none text-slate-950">
        {value}
      </p>
    </div>
  );
}
