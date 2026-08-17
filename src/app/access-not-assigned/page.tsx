import Link from "next/link";

import { AccessMessage } from "@/components/auth/access-message";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";

export default function AccessNotAssignedPage() {
  return (
    <AccessMessage
      eyebrow="Team assignment required"
      title="SoundVault access has not been assigned"
      description="The company identity was recognized, but it does not have an active SoundVault team assignment. Ask a SoundVault Admin to verify the company email and access status."
      actions={
        <>
          <Button asChild size="lg" className="h-11">
            <Link href="/sign-in">Return to Sign In</Link>
          </Button>
          <SignOutButton />
        </>
      }
    />
  );
}
