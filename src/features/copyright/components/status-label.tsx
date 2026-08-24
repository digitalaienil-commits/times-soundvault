const LABELS: Record<string, string> = {
  not_started: "Not started",
  awaiting_technical: "Awaiting technical processing",
  ready: "Ready",
  package_queued: "Package queued",
  package_building: "Package building",
  package_ready: "Package ready",
  manual_upload_pending: "Manual upload pending",
  manual_review_pending: "Manual review pending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Unknown",
  needs_rights_review: "Needs rights review",
  needs_policy_review: "Needs policy review",
  potentially_eligible: "Potentially eligible",
  ineligible: "Ineligible",
  approved_for_future_reference: "Approved for future reference",
  not_assessed: "Not assessed",
  needs_metadata: "Needs metadata",
  ready_for_future_registration: "Ready for future registration",
  existing_reference: "Existing reference",
  no_claim: "No claim observed",
  content_id_claim: "Content ID claim observed",
  existing_internal_reference: "Existing internal reference",
  copyright_strike: "Copyright strike observed",
  no_claim_observed: "No claim observed",
  third_party_claim_observed: "Content ID claim observed",
  existing_internal_claim: "Existing internal claim",
  reference_overlap: "Reference overlap",
  ownership_conflict: "Ownership conflict",
  copyright_strike_observed: "Copyright strike observed",
  inconclusive: "Inconclusive",
};

export function StatusLabel({ value }: { value: string | null }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">
      {value ? (LABELS[value] ?? value.replaceAll("_", " ")) : "Not recorded"}
    </span>
  );
}
