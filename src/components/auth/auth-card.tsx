import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";

/** Centered card used by the staff sign-in, forgot and reset pages. */
export function AuthCard({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <Container className="grid flex-1 place-items-center py-12 sm:py-16">
      <div className="w-full max-w-md rounded-panel border border-sand-200 bg-white p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {intro ? <p className="mt-2 text-[0.9375rem] text-muted">{intro}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </Container>
  );
}
