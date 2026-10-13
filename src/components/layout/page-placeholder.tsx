import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";

/**
 * Simple, honest page for sections that are planned but not built yet.
 * Pages using it should set `robots: { index: false }` until real content
 * exists, so search engines do not index thin placeholder pages.
 */
export function PagePlaceholder({
  title,
  body,
  badge,
  backLabel,
  backHref,
}: {
  title: string;
  body: string;
  badge: string;
  backLabel: string;
  backHref: string;
}) {
  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-2xl">
        <Badge tone="brand">
          <Icon name="clock" />
          {badge}
        </Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 text-lg text-muted">{body}</p>
        <Link href={backHref} className={buttonClasses({ variant: "secondary", className: "mt-8" })}>
          {backLabel}
        </Link>
      </div>
    </Container>
  );
}
