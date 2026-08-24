interface UploadStepperProps {
  currentStep: number;
}

const STEPS = [
  "Add Files",
  "Organize Tracks",
  "Optional Details",
  "Review & Upload",
];

export function UploadStepper({ currentStep }: UploadStepperProps) {
  return (
    <nav
      aria-label="Upload progress"
      className="overflow-x-auto pb-1"
      tabIndex={0}
    >
      <ol className="flex min-w-max items-center gap-2 sm:grid sm:min-w-0 sm:grid-cols-4">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const active = step === currentStep;
          const complete = step < currentStep;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                active
                  ? "border-brand bg-brand-soft text-foreground"
                  : complete
                    ? "border-border bg-surface text-foreground"
                    : "border-transparent text-muted-foreground"
              }`}
            >
              <span className="tabular-nums">{step}.</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
