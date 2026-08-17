import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { AuthFrame } from "./auth-frame";

export async function AccessMessage({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <AuthFrame>
      <section className="lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-2xl">
        <div className="rounded-2xl border border-border bg-surface p-7 shadow-soft sm:p-10">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <LockKeyhole aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-brand uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-foreground">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">{actions}</div>
        </div>
      </section>
    </AuthFrame>
  );
}
