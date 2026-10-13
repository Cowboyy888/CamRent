import { siteConfig } from "@/config/site";
import { cn } from "@/lib/cn";

/**
 * Placeholder logo: house-with-check mark + two-tone wordmark from
 * siteConfig. Replace the <svg> with the final logo once the brand is
 * confirmed (blueprint Appendix B, D-01).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[0.6rem] bg-mekong-700 text-white",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[62%]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v10h13V10" />
        <path d="m9 14.5 2.2 2.2L15.5 12" />
      </svg>
    </span>
  );
}

export function BrandWordmark({ inverse = false }: { inverse?: boolean }) {
  const [lead, accent] = siteConfig.wordmark;
  return (
    <span
      className={cn(
        "font-display text-xl font-extrabold tracking-tight",
        inverse ? "text-white" : "text-ink",
      )}
    >
      {lead}
      <span className={inverse ? "text-mekong-300" : "text-mekong-700"}>{accent}</span>
    </span>
  );
}

export function BrandLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark className={inverse ? "bg-mekong-500" : undefined} />
      <BrandWordmark inverse={inverse} />
    </span>
  );
}
