"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import type { ReviewActionState } from "../actions";

const initialReviewActionState: ReviewActionState = {
  error: null,
  saved: false,
};

interface ReviewActionFormProps {
  action: (
    state: ReviewActionState,
    formData: FormData,
  ) => Promise<ReviewActionState>;
  children: React.ReactNode;
  label: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
}

export function ReviewActionForm({
  action,
  children,
  label,
  variant = "default",
  className,
}: ReviewActionFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialReviewActionState,
  );
  return (
    <form action={formAction} className={className}>
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      <p className="mt-2 min-h-5 text-xs" aria-live="polite">
        {state.error ? (
          <span className="text-destructive">{state.error}</span>
        ) : state.saved ? (
          <span className="text-success">Saved</span>
        ) : null}
      </p>
    </form>
  );
}
