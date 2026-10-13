import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const tones: Record<BadgeTone, string> = {
  success: "bg-success-50 text-success",
  warning: "bg-warning-50 text-warning",
  danger: "bg-danger-50 text-danger",
  info: "bg-info-50 text-info",
  brand: "bg-mekong-50 text-mekong-700",
  neutral: "bg-sand-100 text-ink-soft",
};

/**
 * Status chip. Always pair the colour with readable text (and ideally an
 * icon) so status is never conveyed by colour alone.
 */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
