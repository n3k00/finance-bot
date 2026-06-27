"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { getMonthLabel, type MonthOption } from "./monthUtils";

export function MonthFilter({
  basePath,
  selectedMonth,
  monthOptions,
}: {
  basePath: string;
  selectedMonth: string;
  monthOptions: MonthOption[];
}) {
  const router = useRouter();

  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Month
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-950">
            {getMonthLabel(selectedMonth)}
          </p>
        </div>

        <label className="flex min-w-[260px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
          <select
            value={selectedMonth}
            onChange={(event) =>
              router.push(`${basePath}?month=${event.target.value}`)
            }
            className="min-w-0 flex-1 bg-transparent font-medium text-slate-950 outline-none"
            aria-label="Select month"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
