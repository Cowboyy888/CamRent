import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/** Honest empty state shown wherever listings will appear later. */
export function ListingsEmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
  headingLevel = "h3",
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  return (
    <div className="flex flex-col items-center rounded-panel border border-dashed border-sand-300 bg-white px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-mekong-50 text-mekong-700">
        <Icon name="home" className="size-6" />
      </span>
      <Heading className="mt-4 text-lg font-bold">{title}</Heading>
      <p className="mt-2 max-w-xl text-[0.9375rem] text-muted">{body}</p>
      {ctaLabel && ctaHref ? (
        <Link href={ctaHref} className={buttonClasses({ variant: "secondary", className: "mt-6" })}>
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}
