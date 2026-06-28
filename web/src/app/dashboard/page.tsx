import Link from "next/link";
import { requireUser, getBotConfig } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import type { EntryLogRow } from "@/lib/types";
import { AdminShell } from "../AdminShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { email } = await requireUser();
  const cfg = await getBotConfig();

  const supabase = await createClient();

  const [
    { data: personalRows },
    { data: businessRows },
    { data: personalTotalRows },
    { data: businessTotalRows },
  ] = await Promise.all([
    supabase
      .from("entries_log")
      .select("*")
      .eq("book", "personal")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("entries_log")
      .select("*")
      .eq("book", "business")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("entries_log")
      .select("amount,category,data")
      .eq("book", "personal"),
    supabase
      .from("entries_log")
      .select("amount,direction,data")
      .eq("book", "business"),
  ]);

  const personal = (personalRows ?? []) as EntryLogRow[];
  const business = (businessRows ?? []) as EntryLogRow[];
  const personalTotals = (personalTotalRows ?? []) as Pick<
    EntryLogRow,
    "amount" | "category" | "data"
  >[];
  const businessTotals = (businessTotalRows ?? []) as Pick<
    EntryLogRow,
    "amount" | "direction" | "data"
  >[];

  const personalTotal = personalTotals.reduce(
    (s, r) => s + (r.amount ?? 0),
    0,
  );
  const businessIn = businessTotals
    .filter((r) => r.direction === "in")
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const businessOut = businessTotals
    .filter((r) => r.direction === "out")
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const receivable = businessTotals
    .filter((r) => r.direction === "receivable")
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const payable = businessTotals
    .filter((r) => r.direction === "payable")
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const net = businessIn - businessOut - payable;
  const categoryTotals = Array.from(
    personalTotals.reduce((map, row) => {
      const category = row.category ?? row.data.personal?.category ?? "Other";
      map.set(category, (map.get(category) ?? 0) + (row.amount ?? 0));
      return map;
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCategory = Math.max(...categoryTotals.map(([, value]) => value), 1);
  const bankMax = Math.max(businessIn, businessOut, receivable, payable, 1);
  const isConfigured = Boolean(cfg?.has_openai_api_key);

  return (
    <AdminShell
      active="overview"
      title="Overview"
      subtitle="Live totals from confirmed Telegram entries."
      email={email}
    >
      <div className="mx-auto max-w-7xl space-y-5">
        {!isConfigured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p>
                Setup is incomplete. Add an AI provider key before the bot can parse entries.
              </p>
              <Link href="/settings" className="font-medium underline">
                Open settings
              </Link>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricCard
            className="lg:col-span-2"
            label="Personal total"
            value={personalTotal}
            accent="slate"
          />
          <MetricCard label="Bank in" value={businessIn} accent="green" />
          <MetricCard label="Bank out" value={businessOut} accent="red" />
          <MetricCard label="Receivable" value={receivable} accent="blue" />
          <MetricCard label="Payable" value={payable} accent="amber" />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1fr_2fr]">
          <MetricCard label="Net position" value={net} accent="slate" />
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Activity
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Showing 5 recent rows in Overview. Full records stay in Personal
              Expenses and Bank Ledger.
            </p>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <BarChart
            title="Personal spend by category"
            items={categoryTotals.map(([label, value]) => ({
              label,
              value,
              percent: (value / maxCategory) * 100,
              tone: "slate",
            }))}
            emptyText="No personal expense data yet."
          />
          <BarChart
            title="Bank ledger flow"
            items={[
              { label: "In", value: businessIn, percent: (businessIn / bankMax) * 100, tone: "green" },
              { label: "Out", value: businessOut, percent: (businessOut / bankMax) * 100, tone: "red" },
              { label: "Receivable", value: receivable, percent: (receivable / bankMax) * 100, tone: "blue" },
              { label: "Payable", value: payable, percent: (payable / bankMax) * 100, tone: "amber" },
            ]}
            emptyText="No bank ledger data yet."
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <RecentList title="Personal Expenses" rows={personal} kind="personal" />
          <RecentList title="Bank Account Ledger" rows={business} kind="business" />
        </div>
      </div>
    </AdminShell>
  );
}

function MetricCard({
  label,
  value,
  accent,
  className = "",
}: {
  label: string;
  value: number;
  accent: "slate" | "green" | "red" | "blue" | "amber";
  className?: string;
}) {
  const accentClasses: Record<typeof accent, string> = {
    slate: "bg-slate-950",
    green: "bg-emerald-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <span className={`h-2.5 w-2.5 rounded-full ${accentClasses[accent]}`} />
      </div>
      <p className="mt-3 font-mono text-[26px] font-semibold leading-none text-slate-950">
        {(value ?? 0).toLocaleString("en-US")}
      </p>
    </div>
  );
}

function BarChart({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Array<{
    label: string;
    value: number;
    percent: number;
    tone: "slate" | "green" | "red" | "blue" | "amber";
  }>;
  emptyText: string;
}) {
  const toneClasses = {
    slate: "bg-slate-900",
    green: "bg-emerald-500",
    red: "bg-red-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-700">
                  {item.label}
                </span>
                <span className="font-mono text-xs font-semibold text-slate-600">
                  {item.value.toLocaleString("en-US")}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${toneClasses[item.tone]}`}
                  style={{ width: `${Math.max(item.percent, item.value ? 4 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentList({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: EntryLogRow[];
  kind: "personal" | "business";
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {rows.length} recent
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No entries yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Confirmed Telegram entries will appear here.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((row) => {
            const entry =
              kind === "personal" ? row.data.personal : row.data.business;
            if (!entry) return null;
            const titleText =
              kind === "personal"
                ? (entry as { description: string }).description
                : (entry as { person: string }).person;
            const metaText =
              kind === "personal"
                ? (entry as { category: string }).category
                : ((entry as { account_type?: string; method: string })
                    .account_type ?? (entry as { method: string }).method);
            const amount =
              kind === "personal"
                ? row.amount ?? (entry as { amount: number }).amount
                : row.amount ?? 0;
            const bankEntry =
              kind === "business"
                ? (entry as {
                    direction: string;
                    in_amount?: number;
                    out_amount?: number;
                    debt_amount?: number;
                  })
                : null;
            const bankAmount = bankEntry
              ? bankEntry.direction === "in"
                ? (bankEntry.in_amount ?? amount)
                : bankEntry.direction === "out"
                  ? (bankEntry.out_amount ?? amount)
                  : (bankEntry.debt_amount ?? amount)
              : amount;
            const amountLabel = bankEntry
              ? bankEntry.direction === "in"
                ? `+${bankAmount.toLocaleString("en-US")}`
                : bankEntry.direction === "out"
                  ? `-${bankAmount.toLocaleString("en-US")}`
                  : bankAmount.toLocaleString("en-US")
              : amount.toLocaleString("en-US");
            const amountClass = bankEntry
              ? bankEntry.direction === "in"
                ? "text-emerald-700"
                : bankEntry.direction === "out"
                  ? "text-red-700"
                  : bankEntry.direction === "receivable"
                    ? "text-blue-700"
                    : "text-amber-700"
              : "text-slate-950";
            const directionLabel = bankEntry
              ? bankEntry.direction === "in"
                ? "In"
                : bankEntry.direction === "out"
                  ? "Out"
                  : bankEntry.direction === "receivable"
                    ? "Receivable"
                    : "Payable"
              : null;

            return (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 transition hover:bg-slate-50/80"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {titleText}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{row.entry_date}</span>
                    <span>{metaText}</span>
                    {row.raw_text ? (
                      <span className="max-w-full truncate">{row.raw_text}</span>
                    ) : null}
                  </div>
                </div>
                <div className="whitespace-nowrap text-right">
                  {directionLabel ? (
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                      {directionLabel}
                    </div>
                  ) : null}
                  <div className={`font-mono text-sm font-semibold ${amountClass}`}>
                    {amountLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
