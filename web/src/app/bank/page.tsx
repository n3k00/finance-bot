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

export default async function BankPage({
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
    .eq("book", "business")
    .order("entry_date", { ascending: false })
    .limit(1000);
  const { data } = await supabase
    .from("entries_log")
    .select("*")
    .eq("book", "business")
    .gte("entry_date", start)
    .lt("entry_date", end)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as EntryLogRow[];
  const monthOptions = buildMonthOptions(
    (monthData ?? []).map((row) => row.entry_date),
    selectedMonth,
  );
  const totalIn = rows.reduce((sum, row) => {
    const entry = row.data.business;
    return sum + (entry?.in_amount ?? (row.direction === "in" ? row.amount ?? 0 : 0));
  }, 0);
  const totalOut = rows.reduce((sum, row) => {
    const entry = row.data.business;
    return sum + (entry?.out_amount ?? (row.direction === "out" ? row.amount ?? 0 : 0));
  }, 0);

  return (
    <AdminShell
      active="bank"
      title="Bank Account Ledger"
      subtitle="Bank, KPay, cash, and special account in/out records."
      email={email}
    >
      <div className="max-w-7xl space-y-5">
        <MonthFilter
          basePath="/bank"
          selectedMonth={selectedMonth}
          monthOptions={monthOptions}
        />

        <section className="grid gap-3 sm:grid-cols-4">
          <SummaryCard label="Rows" value={rows.length.toLocaleString("en-US")} />
          <SummaryCard label="Total in" value={totalIn.toLocaleString("en-US")} />
          <SummaryCard label="Total out" value={totalOut.toLocaleString("en-US")} />
          <SummaryCard
            label="Net"
            value={(totalIn - totalOut).toLocaleString("en-US")}
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
          <header className="border-b border-slate-200 bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Bank account in/out table - {getMonthLabel(selectedMonth)}
            </h2>
          </header>
          <div>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="w-[112px] px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="hidden px-4 py-3 text-left font-semibold md:table-cell">Account</th>
                  <th className="w-[112px] px-4 py-3 text-right font-semibold">In</th>
                  <th className="w-[112px] px-4 py-3 text-right font-semibold">Out</th>
                  <th className="hidden w-[112px] px-4 py-3 text-right font-semibold lg:table-cell">Debt</th>
                  <th className="hidden px-4 py-3 text-left font-semibold xl:table-cell">Original</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const entry = row.data.business;
                  if (!entry) return null;
                  const inAmount =
                    entry.in_amount ??
                    (entry.direction === "in" ? row.amount ?? 0 : 0);
                  const outAmount =
                    entry.out_amount ??
                    (entry.direction === "out" ? row.amount ?? 0 : 0);
                  const debtAmount =
                    entry.debt_amount ??
                    (["receivable", "payable"].includes(entry.direction)
                      ? row.amount ?? 0
                      : 0);

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {row.entry_date}
                      </td>
                      <td className="min-w-0 px-4 py-3 text-slate-700">
                        <div className="truncate">{entry.person}</div>
                        <div className="mt-1 truncate text-xs text-slate-400 md:hidden">
                          {entry.account_type ?? entry.method}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        <div className="truncate">{entry.account_type ?? entry.method}</div>
                        <div className="mt-1 truncate font-mono text-xs text-slate-400">
                          {entry.account_no ?? "-"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                        {inAmount.toLocaleString("en-US")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-red-700">
                        {outAmount.toLocaleString("en-US")}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-blue-700 lg:table-cell">
                        {debtAmount.toLocaleString("en-US")}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 xl:table-cell">
                        <div className="truncate">{row.raw_text ?? "-"}</div>
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
