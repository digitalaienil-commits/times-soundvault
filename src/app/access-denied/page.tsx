import Link from "next/link";

import { AccessMessage } from "@/components/auth/access-message";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getDefaultRouteForRole } from "@/lib/auth/route-policy";

export default async function AccessDeniedPage() {
  const user = await requireCurrentUser();
  return (
    <AccessMessage
      eyebrow="Permission required"
      title="You don’t have access to this area"
      description="Your SoundVault account is active, but this part of the workspace requires a different responsibility. Return to the work available to your role or sign out."
      actions={
        <>
          <Button asChild size="lg" className="h-11">
            <Link href={getDefaultRouteForRole(user.role)}>
              Return to default workspace
            </Link>
          </Button>
          <SignOutButton />
        </>
      }
    />
  );
}
