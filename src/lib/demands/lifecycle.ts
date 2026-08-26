import type { DemandStatus } from "@/types/demands";

const TRANSITIONS: Record<DemandStatus, readonly DemandStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["fulfilled", "closed", "cancelled"],
  fulfilled: ["open"],
  closed: ["open"],
  cancelled: [],
};

export function canTransitionDemand(
  from: DemandStatus,
  to: DemandStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertDemandTransition(
  from: DemandStatus,
  to: DemandStatus,
): void {
  if (!canTransitionDemand(from, to))
    throw new Error(`A Demand cannot move from ${from} to ${to}.`);
}

export function deriveDemandState(input: {
  status: DemandStatus;
  responseDeadlineOn: string;
  today: string;
  activeResponseCount: number;
  validAcceptedCount: number;
  targetTrackCount: number;
  acceptedCount: number;
}) {
  const overdue =
    input.status === "open" && input.responseDeadlineOn < input.today;
  const inProgress = input.status === "open" && input.activeResponseCount > 0;
  const readyToFulfill =
    input.status === "open" &&
    input.validAcceptedCount >= input.targetTrackCount;
  const partiallyCovered =
    input.validAcceptedCount > 0 &&
    input.validAcceptedCount < input.targetTrackCount;
  return {
    overdue,
    inProgress,
    readyToFulfill,
    partiallyCovered,
    fulfillmentNeedsAttention: input.acceptedCount > input.validAcceptedCount,
  };
}

export function responseWindowOpen(
  status: DemandStatus,
  responseDeadlineOn: string,
  today: string,
): boolean {
  return status === "open" && responseDeadlineOn >= today;
}
