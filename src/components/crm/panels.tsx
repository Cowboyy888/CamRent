import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  id,
  action,
  children,
  className,
}: {
  title: string;
  id: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-card border border-sand-200 bg-white p-5", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-bold">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-card border border-sand-200 bg-white p-5">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <div className="mt-2 font-display text-3xl font-extrabold tracking-tight tabular-nums">
        {value}
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
