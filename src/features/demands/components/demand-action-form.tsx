"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  initialDemandActionState,
  type DemandActionState,
} from "../action-state";

export function DemandActionForm({
  action,
  label,
  children,
  variant = "outline",
  requireReason = false,
}: {
  action: (
    state: DemandActionState,
    formData: FormData,
  ) => Promise<DemandActionState>;
  label: string;
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "destructive";
  requireReason?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialDemandActionState,
  );
  return (
    <form action={formAction} className="min-w-0">
      {children}
      {requireReason ? (
        <label className="mb-2 grid gap-1 text-sm font-medium">
          Reason
          <input
            name="reason"
            required
            minLength={3}
            maxLength={1000}
            className="min-h-11 rounded-lg border border-border px-3"
          />
        </label>
      ) : null}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Working…" : label}
      </Button>
      <div aria-live="polite" className="mt-2 text-sm">
        {state.error ? (
          <>
            <p className="text-destructive">{state.error}</p>
            {state.blockers.length ? (
              <ul className="list-disc pl-5 text-destructive">
                {state.blockers.map((item) => (
                  <li key={item}>{item}</li>
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
