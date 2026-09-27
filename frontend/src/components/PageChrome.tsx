import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="animate-rise mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl space-y-2">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
          {title}
        </h1>
        <p className="text-[var(--muted)] leading-relaxed">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function WorkSurface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`animate-rise-delay panel rounded-2xl p-5 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
