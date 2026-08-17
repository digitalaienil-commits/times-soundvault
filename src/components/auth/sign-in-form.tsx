"use client";

import { useState } from "react";
import {
  Building2,
  ClipboardList,
  Headphones,
  KeyRound,
  Music2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";
import type { AuthProvider } from "@/types/auth";

interface SignInFormProps {
  provider: AuthProvider;
  callbackUrl: string;
  localError?: boolean;
}

const LOCAL_ACCESS_OPTIONS = [
  {
    role: "admin",
    label: "Admin",
    description: "Full workspace and team access",
    icon: ShieldCheck,
  },
  {
    role: "music_producer",
    label: "Music Producer",
    description: "Uploads, submissions and demands",
    icon: Music2,
  },
  {
    role: "coordinator",
    label: "Coordinator",
    description: "Quality control, uploads and demands",
    icon: ClipboardList,
  },
  {
    role: "user",
    label: "User",
    description: "Library discovery and downloads",
    icon: Headphones,
  },
] as const;

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
          Choose a seeded role to inspect its exact access. Credentials stay
          server-side, and this mode is disabled in production.
        </p>
      </div>
      {localError ? (
        <p id="sign-in-error" role="alert" className="text-sm text-destructive">
          Local access could not be started. Check that PostgreSQL is running
          and the local identities are seeded.
        </p>
      ) : null}
      <div
        className="grid gap-3 sm:grid-cols-2"
        role="group"
        aria-label="Local access roles"
      >
        {LOCAL_ACCESS_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Button
              key={option.role}
              type="submit"
              name="role"
              value={option.role}
              variant="outline"
              aria-label={`Enter as ${option.label}`}
              className="group h-auto min-h-20 w-full justify-start gap-3 rounded-xl px-4 py-3 text-left whitespace-normal hover:border-primary/40 hover:bg-accent"
            >
              <Icon
                aria-hidden="true"
                className="size-5 shrink-0 text-primary"
              />
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="font-semibold text-foreground">
                  {option.label}
                </span>
                <span className="text-xs leading-4 font-normal text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </Button>
          );
        })}
      </div>
    </form>
  );
}
