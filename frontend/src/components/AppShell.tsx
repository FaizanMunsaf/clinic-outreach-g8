"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const nav = [
  { href: "/prospect", label: "Prospect" },
  { href: "/lists", label: "Lists" },
  { href: "/enrich", label: "Enrich" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/inbox", label: "Inbox" },
  { href: "/activity", label: "Activity" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(244,249,248,0.86)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
          <Link href="/" className="shrink-0">
            <p className="display text-[1.55rem] leading-none tracking-tight text-[var(--ink)]">
              ClinicReach
            </p>
            <p className="mt-0.5 text-[0.7rem] tracking-wide text-[var(--muted)]">
              {user?.full_name || user?.email || "Practice outreach desk"}
            </p>
          </Link>

          <nav className="hidden items-center gap-0.5 md:flex">
            {nav.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-[var(--tint)] font-semibold text-[var(--accent-deep)]"
                      : "text-[var(--muted)] hover:bg-white/70 hover:text-[var(--ink)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/prospect" className="btn-primary !px-3.5 !py-2 text-sm">
              New search
            </Link>
            <button
              type="button"
              onClick={logout}
              className="btn-secondary !px-3 !py-2 text-xs"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
