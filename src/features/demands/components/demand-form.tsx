"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DemandDetail } from "@/types/demands";

import {
  initialDemandActionState,
  type DemandActionState,
} from "../action-state";

type OptionData = {
  terms: Array<{ id: string; category: string; slug: string; label: string }>;
  people: Array<{ id: string; name: string; role: string }>;
};

const field =
  "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const label = "grid gap-1.5 text-sm font-medium text-foreground";

function Selection({
  name,
  title,
  description,
  terms,
  selected,
}: {
  name: string;
  title: string;
  description: string;
  terms: OptionData["terms"];
  selected: Set<string>;
}) {
  const groups = Map.groupBy(terms, (term) => term.category);
  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      <select
        name={name}
        multiple
        defaultValue={[...selected]}
        className={`${field} min-h-44`}
        aria-label={`${title} taxonomy requirements`}
      >
        {[...groups].map(([category, options]) => (
          <optgroup key={category} label={category.replaceAll("_", " ")}>
            {options.map((term) => (
              <option key={term.id} value={term.id}>
                {term.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-2 text-xs text-muted-foreground">
        Use Command or Control to select more than one.
      </p>
    </fieldset>
  );
}

export function DemandForm({
  action,
  options,
  demand,
}: {
  action: (
    state: DemandActionState,
    data: FormData,
  ) => Promise<DemandActionState>;
  options: OptionData;
  demand?: DemandDetail;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialDemandActionState,
  );
  const required = new Set(
    demand?.requirements
      .filter((item) => item.importance === "required")
      .map((item) => item.termId),
  );
  const preferred = new Set(
    demand?.requirements
      .filter((item) => item.importance === "preferred")
      .map((item) => item.termId),
  );
  return (
    <form
      action={formAction}
      className="mt-7 space-y-6"
      aria-label={demand ? "Edit Demand" : "Create Demand"}
    >
      {demand ? (
        <>
          <input type="hidden" name="demandId" value={demand.id} />
          <input type="hidden" name="rowVersion" value={demand.rowVersion} />
          {demand.references.map((reference) => (
            <input
              key={reference.id}
              type="hidden"
              name="referenceTrackIds"
              value={reference.trackId}
            />
          ))}
        </>
      ) : null}
      <section
        className="rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="request-heading"
      >
        <h2 id="request-heading" className="text-lg font-semibold">
          Request
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Title
            <Input
              name="title"
              required
              minLength={5}
              maxLength={120}
              defaultValue={demand?.title}
            />
          </label>
          <label className={label}>
            Requester
            <Input
              name="requesterName"
              maxLength={120}
              defaultValue={demand?.requesterName ?? ""}
            />
          </label>
          <label className={label}>
            Requesting team
            <Input
              name="requestingTeam"
              maxLength={120}
              defaultValue={demand?.requestingTeam ?? ""}
            />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Project / context
            <Input
              name="projectContext"
              required
              minLength={3}
              maxLength={300}
              defaultValue={demand?.projectContext}
            />
          </label>
          <label className={label}>
            Priority
            <select
              name="priority"
              className={field}
              defaultValue={demand?.priority ?? "normal"}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className={label}>
            Owner
            <select
              name="ownerUserId"
              className={field}
              required
              defaultValue={demand?.ownerUserId ?? options.people[0]?.id}
            >
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} — {person.role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="timing-heading"
      >
        <h2 id="timing-heading" className="text-lg font-semibold">
          Timing and supply
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Response deadline
            <Input
              name="responseDeadlineOn"
              type="date"
              required
              defaultValue={demand?.responseDeadlineOn}
            />
          </label>
          <label className={label}>
            Needed by
            <Input
              name="neededByOn"
              type="date"
              required
              defaultValue={demand?.neededByOn}
            />
          </label>
          <label className={label}>
            Target Tracks
            <Input
              name="targetTrackCount"
              type="number"
              min={1}
              max={25}
              required
              defaultValue={demand?.targetTrackCount ?? 1}
            />
          </label>
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="brief-heading"
      >
        <h2 id="brief-heading" className="text-lg font-semibold">
          Creative brief
        </h2>
        <div className="mt-4 grid gap-4">
          <label className={label}>
            Brief
            <textarea
              name="brief"
              required
              minLength={20}
              maxLength={5000}
              rows={7}
              className={field}
              defaultValue={demand?.brief}
            />
          </label>
          <label className={label}>
            Creative notes
            <textarea
              name="creativeNotes"
              maxLength={3000}
              rows={4}
              className={field}
              defaultValue={demand?.creativeNotes ?? ""}
            />
          </label>
          <label className={label}>
            Avoid notes
            <textarea
              name="avoidNotes"
              maxLength={2000}
              rows={3}
              className={field}
              defaultValue={demand?.avoidNotes ?? ""}
            />
          </label>
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="audio-heading"
      >
        <h2 id="audio-heading" className="text-lg font-semibold">
          Audio requirements
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className={label}>
            Asset type
            <select
              name="assetKind"
              className={field}
              defaultValue={demand?.assetKind ?? "music"}
            >
              <option value="music">Music</option>
              <option value="sound_effect">Sound effect</option>
              <option value="ambience">Ambience</option>
            </select>
          </label>
          <label className={label}>
            Minimum BPM
            <Input
              name="bpmMin"
              type="number"
              min="1"
              max="400"
              step="0.01"
              defaultValue={demand?.bpmMin ?? ""}
            />
          </label>
          <label className={label}>
            Maximum BPM
            <Input
              name="bpmMax"
              type="number"
              min="1"
              max="400"
              step="0.01"
              defaultValue={demand?.bpmMax ?? ""}
            />
          </label>
          <label className={label}>
            Minimum duration (seconds)
            <Input
              name="durationMinSeconds"
              type="number"
              min="1"
              max="21600"
              defaultValue={
                demand?.durationMinMs ? demand.durationMinMs / 1000 : ""
              }
            />
          </label>
          <label className={label}>
            Maximum duration (seconds)
            <Input
              name="durationMaxSeconds"
              type="number"
              min="1"
              max="21600"
              defaultValue={
                demand?.durationMaxMs ? demand.durationMaxMs / 1000 : ""
              }
            />
          </label>
          <label className={label}>
            Vocal
            <select
              name="vocalState"
              className={field}
              defaultValue={demand?.vocalState ?? ""}
            >
              <option value="">Not specified</option>
              <option value="instrumental">Instrumental</option>
              <option value="vocal">Vocal</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className={label}>
            Under dialogue
            <select
              name="underDialogue"
              className={field}
              defaultValue={
                demand?.underDialogue == null
                  ? ""
                  : demand.underDialogue
                    ? "yes"
                    : "no"
              }
            >
              <option value="">Not specified</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className={label}>
            Loopable
            <select
              name="loopable"
              className={field}
              defaultValue={
                demand?.loopable == null ? "" : demand.loopable ? "yes" : "no"
              }
            >
              <option value="">Not specified</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className={label}>
            Ending
            <select
              name="endingType"
              className={field}
              defaultValue={demand?.endingType ?? ""}
            >
              <option value="">Not specified</option>
              <option value="clean_stop">Clean stop</option>
              <option value="final_hit">Final hit</option>
              <option value="fade">Fade</option>
              <option value="open">Open</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              name="stemsRequired"
              type="checkbox"
              defaultChecked={demand?.stemsRequired}
              className="size-5 accent-brand"
            />
            Stems required
          </label>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Selection
            name="requiredTermIds"
            title="Required"
            description="An accepted Track must satisfy every selected requirement."
            terms={options.terms}
            selected={required}
          />
          <Selection
            name="preferredTermIds"
            title="Preferred"
            description="Creative direction that never acts as a hidden acceptance blocker."
            terms={options.terms}
            selected={preferred}
          />
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-surface p-5 sm:p-6"
        aria-labelledby="contributors-heading"
      >
        <h2 id="contributors-heading" className="text-lg font-semibold">
          Contributors
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Assignment supports planning; it does not change authorization.
        </p>
        <select
          name="assigneeUserIds"
          multiple
          defaultValue={demand?.assignees.map((item) => item.userId)}
          className={`${field} mt-4 min-h-32`}
          aria-label="Assigned contributors"
        >
          {options.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} — {person.role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </section>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div aria-live="polite" className="mb-3 min-h-5 text-sm">
          {state.error ? (
            <>
              <p className="text-destructive">{state.error}</p>
              {state.blockers.length ? (
                <ul className="mt-2 list-disc pl-5 text-destructive">
                  {state.blockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {!demand ? (
            <>
              <Button
                type="submit"
                name="intent"
                value="draft"
                variant="outline"
                disabled={pending}
              >
                {pending ? "Saving…" : "Save Draft"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="open"
                disabled={pending}
              >
                {pending ? "Opening…" : "Open Demand"}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href={demand ? `/demands/${demand.id}` : "/demands"}>
              Cancel
            </Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
