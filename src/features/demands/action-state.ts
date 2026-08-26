export interface DemandActionState {
  error: string | null;
  blockers: string[];
  saved: boolean;
}

export const initialDemandActionState: DemandActionState = {
  error: null,
  blockers: [],
  saved: false,
};
