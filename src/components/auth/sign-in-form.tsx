"use client";

import { useState } from "react";
import { Building2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import type { AuthProvider } from "@/types/auth";

interface SignInFormProps {
  provider: AuthProvider;
  callbackUrl: string;
  localError?: boolean;
}

export function SignInForm({
  provider,
  callbackUrl,
  localError = false,
}: SignInFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signInWithProvider() {
    if (provider === "local") return;
    setPending(true);
    setError("");
    const result = await authClient.signIn.social({
      provider,
      callbackURL: callbackUrl,
      errorCallbackURL: "/auth/error",
    });
    if (result?.error) {
      setError(
        "Sign in could not be started. Check the approved company account and try again.",
      );
      setPending(false);
    }
  }

  if (provider !== "local") {
    return (
      <div className="space-y-4">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full justify-center px-5"
          onClick={signInWithProvider}
          disabled={pending}
        >
          <Building2 aria-hidden="true" data-icon="inline-start" />
          {pending
            ? "Connecting…"
            : provider === "google"
              ? "Continue with Google Workspace"
              : "Continue with Microsoft"}
        </Button>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Use the company identity assigned to Times SoundVault.
        </p>
        <p aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      action="/api/local-auth/direct-sign-in"
      method="post"
    >
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm text-foreground">
        <span className="flex items-center gap-2 font-medium">
          <KeyRound aria-hidden="true" className="size-4 text-warning" />
          Local development authentication
        </span>
        <p className="mt-1 pl-6 text-xs leading-5 text-muted-foreground">
          Enter as the seeded Local Admin. No password entry is required, and
          this mode is disabled in production.
        </p>
      </div>
      {localError ? (
        <p id="sign-in-error" role="alert" className="text-sm text-destructive">
          Local access could not be started. Check that PostgreSQL is running
          and the local identities are seeded.
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-12 w-full">
        Enter SoundVault
      </Button>
    </form>
  );
}
