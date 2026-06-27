const MONTH_RE = /^\d{4}-\d{2}$/;
const RANGOON_OFFSET_MS = 6.5 * 60 * 60 * 1000;

export interface MonthOption {
  value: string;
  label: string;
}

export function getCurrentMonth() {
  const now = new Date(Date.now() + RANGOON_OFFSET_MS);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normalizeMonth(value?: string) {
  const currentMonth = getCurrentMonth();

  return value && MONTH_RE.test(value) && value <= currentMonth
    ? value
    : currentMonth;
}

export function getMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;

  return {
    start: `${month}-01`,
    end: `${nextMonth}-01`,
  };
}

export function getMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
    },
  );
}

export function buildMonthOptions(
  entryDates: Array<string | null>,
  selectedMonth: string,
) {
  const currentMonth = getCurrentMonth();
  const months = new Set<string>([currentMonth]);

  for (const entryDate of entryDates) {
    const month = entryDate?.slice(0, 7);

    if (month && MONTH_RE.test(month) && month <= currentMonth) {
      months.add(month);
    }
  }

  if (selectedMonth <= currentMonth) {
    months.add(selectedMonth);
  }

  return Array.from(months)
    .sort()
    .reverse()
    .map<MonthOption>((value) => ({
      value,
      label:
        value === currentMonth
          ? `This month (${getMonthLabel(value)})`
          : getMonthLabel(value),
    }));
}
