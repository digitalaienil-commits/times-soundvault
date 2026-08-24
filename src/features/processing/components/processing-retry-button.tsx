"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ProcessingRetryButton({
  submissionId,
}: {
  submissionId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  async function retry() {
    setState("pending");
    const response = await fetch(
      `/api/submissions/${submissionId}/processing/retry`,
      { method: "POST" },
    );
    if (!response.ok) {
      setState("error");
      return;
    }
    setState("idle");
    router.refresh();
  }
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        disabled={state === "pending"}
        onClick={retry}
      >
        {state === "pending" ? "Queueing…" : "Retry processing"}
      </Button>
      {state === "error" ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Processing could not be queued. Try again.
        </p>
      ) : null}
    </div>
  );
}
