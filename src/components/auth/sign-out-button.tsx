"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    window.location.replace("/sign-in");
  }

  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      className={compact ? "h-11 w-full justify-start px-3" : "h-11"}
      onClick={signOut}
      disabled={pending}
    >
      <LogOut aria-hidden="true" data-icon="inline-start" />
      {pending ? "Signing out…" : "Sign Out"}
    </Button>
  );
}
