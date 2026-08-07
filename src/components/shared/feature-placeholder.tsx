import type { LucideIcon } from "lucide-react";

interface FeaturePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  section: string;
}

export function FeaturePlaceholder({
  title,
  description,
  icon: Icon,
  section,
}: FeaturePlaceholderProps) {
  return (
    <section
      aria-labelledby="feature-placeholder-title"
      className="mt-8 overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="grid min-h-72 place-items-center px-6 py-12 text-center sm:min-h-80">
        <div className="max-w-lg">
          <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </div>
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-brand uppercase">
            Planned for {section}
          </p>
          <h2
            id="feature-placeholder-title"
            className="text-xl font-semibold tracking-[-0.02em] text-foreground"
          >
            {title}
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}
