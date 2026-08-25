"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import type { DecisionActionState } from "../actions";

const initialState: DecisionActionState = {
  error: null,
  blockers: [],
  saved: false,
};

export function DecisionActionForm({
  action,
  children,
  label,
  variant = "default",
  className,
}: {
  action: (
    state: DecisionActionState,
    formData: FormData,
  ) => Promise<DecisionActionState>;
  children: React.ReactNode;
  label: string;
  variant?: "default" | "outline" | "secondary" | "destructive";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className={className}>
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Working…" : label}
      </Button>
      <div className="mt-2 min-h-5 text-sm" aria-live="polite">
        {state.error ? (
          <>
            <p className="text-destructive">{state.error}</p>
            {state.blockers.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
                {state.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : state.saved ? (
          <p className="text-success">Completed</p>
        ) : null}
      </div>
    </form>
  );
}
