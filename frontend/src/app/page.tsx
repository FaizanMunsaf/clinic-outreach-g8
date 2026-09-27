import Link from "next/link";

const flow = [
  { n: "01", title: "Prospect", href: "/prospect", blurb: "Find clinics & admins" },
  { n: "02", title: "Lists", href: "/lists", blurb: "Build target sets" },
  { n: "03", title: "Enrich", href: "/enrich", blurb: "Fill emails & phones" },
  { n: "04", title: "Campaigns", href: "/campaigns", blurb: "Launch sequences" },
  { n: "05", title: "Inbox", href: "/inbox", blurb: "Triage replies" },
];

export default function HomePage() {
  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,#0c3d40_0%,#0a6b6b_48%,#1a7a72_100%)] px-6 py-12 text-white shadow-[var(--shadow)] sm:px-10 sm:py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35), transparent 40%), linear-gradient(120deg, transparent 40%, rgba(196,165,116,0.25) 100%)",
          }}
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="animate-rise max-w-xl space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d7ebe8]">
              ClinicReach
            </p>
            <h1 className="display text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.35rem]">
              Reach medical practices with a calm, focused desk.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-[#d5eae8] sm:text-lg">
              Prospect clinics, save lists, enrich contacts, launch campaigns,
              and triage replies — powered by Graph8.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                href="/prospect"
                className="inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-[var(--accent-deep)] transition hover:bg-[#eef7f6]"
              >
                Start prospecting
              </Link>
              <Link
                href="/lists"
                className="inline-flex rounded-lg border border-white/35 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open lists
              </Link>
            </div>
          </div>

          <div className="animate-rise-delay hidden lg:block">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.14em] text-[#b8d9d5]">
                Today&apos;s desk
              </p>
              <ul className="mt-4 space-y-3">
                {[
                  ["Dermatology clinics · Austin", "12 matches"],
                  ["Office managers · Chicago", "8 contacts"],
                  ["Enrichment dry-run", "Ready"],
                ].map(([label, meta]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3.5 py-3"
                  >
                    <span className="text-sm text-white/95">{label}</span>
                    <span className="text-xs text-[#c4a574]">{meta}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="animate-fade">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Workflow</p>
            <h2 className="display mt-1 text-2xl text-[var(--ink)] sm:text-3xl">
              One path from clinic to conversation
            </h2>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {flow.map((step, i) => (
            <li key={step.href} className="relative">
              <Link
                href={step.href}
                className="block h-full rounded-2xl border border-[var(--line)] bg-white/70 p-4 transition hover:border-[var(--accent)]/45 hover:bg-white"
              >
                <span className="text-[0.7rem] font-semibold tracking-wider text-[var(--warm)]">
                  {step.n}
                </span>
                <p className="display mt-2 text-lg text-[var(--ink)]">
                  {step.title}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">{step.blurb}</p>
              </Link>
              {i < flow.length - 1 && (
                <span className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[var(--line)] lg:block">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
