import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Hidden anti-spam field: real visitors never see or fill it. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "block w-full min-h-28 rounded-control border border-sand-300 bg-white px-3 py-2 text-[0.9375rem] text-ink placeholder:text-muted/80 transition-colors hover:border-muted/50 focus:border-mekong-500 focus:outline-none focus-visible:ring-3 focus-visible:ring-mekong-500/25 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function ConsentCheckbox({
  id,
  children,
  invalid,
}: {
  id: string;
  children: ReactNode;
  invalid?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-sm text-ink-soft">
      <input
        id={id}
        name="consent"
        type="checkbox"
        required
        aria-invalid={invalid || undefined}
        className="mt-0.5 size-5 shrink-0 accent-mekong-700"
      />
      <span>{children}</span>
    </label>
  );
}

export function FormMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">
      {children}
    </p>
  );
}

export function SuccessMessage({ title, body }: { title: string; body: string }) {
  return (
    <div role="status" className="rounded-card border border-success/30 bg-success-50 p-5">
      <h3 className="text-lg font-bold text-success">{title}</h3>
      <p className="mt-1 text-[0.9375rem] text-ink-soft">{body}</p>
    </div>
  );
}
