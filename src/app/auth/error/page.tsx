import Link from "next/link";
import { redirect } from "next/navigation";

import { AccessMessage } from "@/components/auth/access-message";
import { Button } from "@/components/ui/button";

export default async function AuthErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const description = Array.isArray(query.error_description)
    ? query.error_description[0]
    : query.error_description;
  if (`${error ?? ""} ${description ?? ""}`.includes("ACCESS_NOT_ASSIGNED")) {
    redirect("/access-not-assigned");
  }

  return (
    <AccessMessage
      eyebrow="Authentication error"
      title="Sign in could not be completed"
      description="The approved identity provider did not complete this sign-in. Try again with the assigned company account. If the problem continues, contact a SoundVault Admin."
      actions={
        <Button asChild size="lg" className="h-11">
          <Link href="/sign-in">Try Sign In again</Link>
        </Button>
      }
    />
  );
}
