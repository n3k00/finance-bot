import Link from "next/link";
import {
  BanknoteArrowDown,
  ChartNoAxesColumnIncreasing,
  LayoutDashboard,
  ReceiptText,
  Settings,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

type ActivePage = "overview" | "personal" | "bank" | "reports" | "settings";

const navItems: Array<{
  href: string;
  label: string;
  active: ActivePage;
  Icon: LucideIcon;
}> = [
  {
    href: "/dashboard",
    label: "Overview",
    active: "overview",
    Icon: LayoutDashboard,
  },
  {
    href: "/personal",
    label: "Personal Expenses",
    active: "personal",
    Icon: ReceiptText,
  },
  {
    href: "/bank",
    label: "Bank Ledger",
    active: "bank",
    Icon: BanknoteArrowDown,
  },
  {
    href: "/reports",
    label: "Reports",
    active: "reports",
    Icon: ChartNoAxesColumnIncreasing,
  },
  { href: "/settings", label: "Settings", active: "settings", Icon: Settings },
];

export function AdminShell({
  active,
  title,
  subtitle,
  email,
  children,
}: {
  active: ActivePage;
  title: string;
  subtitle: string;
  email: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[252px_1fr]">
        <aside className="border-b border-slate-200 bg-white/95 text-slate-950 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 px-5 py-5">
              <Link href="/dashboard" className="block">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
                    <WalletCards className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-base font-semibold tracking-normal">
                      Ledger Admin
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Telegram finance control
                    </div>
                  </div>
                </div>
                <div className="sr-only">
                  Telegram finance control
                </div>
              </Link>
            </div>

            <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:block lg:space-y-1.5 lg:overflow-visible">
              {navItems.map((item) => {
                const selected = item.active === active;
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-w-fit items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                      selected
                        ? "bg-slate-950 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                        selected
                          ? "bg-white text-slate-950"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto hidden border-t border-slate-200 px-5 py-4 lg:block">
              <div className="truncate text-sm font-medium text-slate-800">{email}</div>
              <form action="/logout" method="post" className="mt-2">
                <button className="text-sm font-medium text-slate-500 transition hover:text-slate-950">
                  Logout
                </button>
              </form>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-slate-200 bg-white/95 px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-normal text-slate-950">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span className="truncate text-sm text-slate-500">{email}</span>
                <form action="/logout" method="post" className="lg:hidden">
                  <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
                    Logout
                  </button>
                </form>
              </div>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </section>
      </div>
    </main>
  );
}
