import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { UploadSubmissionCollection } from "@/features/uploads/components/upload-submission-collection";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getUploadWorkspaceSubmissions } from "@/lib/domain/uploads/uploads";

export const metadata: Metadata = { title: "Submissions" };

export default async function MyUploadsPage() {
  const user = await requireRouteAccess("/my-uploads");
  const submissions = await getUploadWorkspaceSubmissions(user);
  return (
    <>
      <PageHeader
        title={user.role === "admin" ? "Submissions" : "My Uploads"}
        description={
          user.role === "admin"
            ? "View and continue every team upload without changing its recorded owner."
            : user.role === "coordinator"
              ? "Continue your drafts and read team submissions. Other owners' drafts remain read-only."
              : "Continue drafts, retry transfers and follow submitted music."
        }
      />
      <UploadSubmissionCollection
        submissions={submissions}
        showOwner={user.role === "admin" || user.role === "coordinator"}
      />
    </>
  );
}
