import { Container } from "@/components/ui/container";
import { Icon, type IconName } from "@/components/ui/icon";
import type { Dictionary } from "@/i18n/dictionaries";

export function VerificationSteps({ dict }: { dict: Dictionary }) {
  const t = dict.home.verify;
  const steps: Array<{ icon: IconName; title: string; body: string }> = [
    { icon: "pin", ...t.steps.visit },
    { icon: "key", ...t.steps.authorise },
    { icon: "clock", ...t.steps.recheck },
  ];

  return (
    <section aria-labelledby="verify-title" className="py-16 sm:py-20">
      <Container>
        <div className="max-w-2xl">
          <h2 id="verify-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-muted">{t.intro}</p>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-card border border-sand-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-mekong-50 text-mekong-700">
                  <Icon name={step.icon} className="size-5" />
                </span>
                <span className="font-display text-sm font-bold text-laterite-600 tabular-nums">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-[0.9375rem] text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
