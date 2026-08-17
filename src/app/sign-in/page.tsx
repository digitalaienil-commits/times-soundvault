import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getAuthState } from "@/lib/auth/current-user";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import { getAuthEnvironment } from "@/lib/auth/environment";
import { getDefaultRouteForRole } from "@/lib/auth/route-policy";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const query = await searchParams;
  const requestedCallback = Array.isArray(query.callbackUrl)
    ? query.callbackUrl[0]
    : query.callbackUrl;
  const state = await getAuthState();
  if (state.kind === "authenticated") {
    redirect(
      sanitizeCallbackUrl(
        requestedCallback,
        getDefaultRouteForRole(state.user.role),
      ),
    );
  }
  const callbackUrl = sanitizeCallbackUrl(requestedCallback, "/");
  const provider = getAuthEnvironment().provider;

  return (
    <AuthFrame>
      <section className="max-w-xl py-8 lg:py-0">
        <p className="inline-flex rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Internal access only
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.045em] text-foreground sm:text-5xl">
          Music operations, held to one clear standard.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
          Sign in with your approved company identity to work across
          submissions, quality control and the published music library.
        </p>
      </section>
      <section
        aria-labelledby="sign-in-title"
        className="rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8"
      >
        <h2
          id="sign-in-title"
          className="text-2xl font-semibold tracking-[-0.03em]"
        >
          Sign in to SoundVault
        </h2>
        <p className="mt-2 mb-7 text-sm leading-6 text-muted-foreground">
          Authentication does not grant access unless an Admin has assigned your
          account to the team.
        </p>
        <SignInForm provider={provider} callbackUrl={callbackUrl} />
      </section>
    </AuthFrame>
  );
}
