"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Building2, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import type { AuthProvider } from "@/types/auth";

interface SignInFormProps {
  provider: AuthProvider;
  callbackUrl: string;
}

export function SignInForm({ provider, callbackUrl }: SignInFormProps) {
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

  async function signInLocally(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: callbackUrl,
    });
    if (result.error) {
      setError(
        "The email or password is incorrect, or SoundVault access is not active.",
      );
      setPending(false);
      return;
    }
    window.location.replace(callbackUrl);
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
    <form className="space-y-5" onSubmit={signInLocally} noValidate>
      <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm text-foreground">
        <span className="flex items-center gap-2 font-medium">
          <KeyRound aria-hidden="true" className="size-4 text-warning" />
          Local development authentication
        </span>
        <p className="mt-1 pl-6 text-xs leading-5 text-muted-foreground">
          This mode is disabled in production and has no public registration.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          aria-describedby={error ? "sign-in-error" : undefined}
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={error ? "sign-in-error" : undefined}
        />
      </div>
      <p
        id="sign-in-error"
        aria-live="polite"
        className="min-h-5 text-sm text-destructive"
      >
        {error}
      </p>
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  );
}
