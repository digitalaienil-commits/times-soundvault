import Link from "next/link";
import { Clock3, Search, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, USER_ROLES } from "@/types/auth";
import type { AccessAuditEvent, TeamAccessRecord } from "@/types/team-access";

import {
  addTeamMemberAction,
  changeTeamRoleAction,
  changeTeamStatusAction,
} from "../actions/team-actions";
import { ConfirmationDialog } from "./confirmation-dialog";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function StatusBadge({ status }: { status: TeamAccessRecord["status"] }) {
  const classes = {
    pending: "border-warning/25 bg-warning/5 text-warning",
    active: "border-success/25 bg-success/5 text-success",
    suspended: "border-destructive/20 bg-destructive/5 text-destructive",
  }[status];
  return (
    <Badge variant="outline" className={`h-7 capitalize ${classes}`}>
      <span
        aria-hidden="true"
        className="mr-1.5 size-1.5 rounded-full bg-current"
      />
      {status}
    </Badge>
  );
}

function TeamMemberActions({
  member,
  instance,
}: {
  member: TeamAccessRecord;
  instance: "desktop" | "mobile";
}) {
  const roleFormId = `role-form-${instance}-${member.id}`;
  const statusFormId = `status-form-${instance}-${member.id}`;
  const isSuspended = member.status === "suspended";

  return (
    <details className="group rounded-lg border border-border bg-background p-3">
      <summary className="min-h-6 cursor-pointer text-sm font-semibold text-foreground marker:text-muted-foreground">
        Manage access
      </summary>
      <div className="mt-4 space-y-5 border-t border-border pt-4">
        <form
          id={roleFormId}
          action={changeTeamRoleAction}
          className="space-y-3"
        >
          <input type="hidden" name="accessId" value={member.id} />
          <input type="hidden" name="confirmed" value="yes" />
          <label
            htmlFor={`role-${instance}-${member.id}`}
            className="block text-xs font-medium text-foreground"
          >
            Assigned role
          </label>
          <select
            id={`role-${instance}-${member.id}`}
            name="role"
            defaultValue={member.role}
            className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <ConfirmationDialog
            formId={roleFormId}
            triggerLabel="Review role change"
            title="Confirm role change"
            description="This changes the member’s server-owned permissions and immediately revokes every active session. Admin promotion and demotion cannot proceed without this confirmation."
            actionLabel="Change role and revoke sessions"
          />
        </form>
        <form
          id={statusFormId}
          action={changeTeamStatusAction}
          className="space-y-2"
        >
          <input type="hidden" name="accessId" value={member.id} />
          <input
            type="hidden"
            name="operation"
            value={isSuspended ? "reactivate" : "suspend"}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {isSuspended
              ? "Restore this assignment. Unbound accounts return to Pending."
              : "Suspension immediately revokes active sessions and preserves history."}
          </p>
          <ConfirmationDialog
            formId={statusFormId}
            triggerLabel={
              isSuspended ? "Review reactivation" : "Review suspension"
            }
            title={isSuspended ? "Reactivate access?" : "Suspend access?"}
            description={
              isSuspended
                ? "This restores workspace access for a bound identity. An unbound assignment returns to Pending until first sign in."
                : "This blocks workspace access immediately, revokes active sessions and preserves identity and audit history."
            }
            actionLabel={isSuspended ? "Reactivate access" : "Suspend access"}
            destructive={!isSuspended}
          />
        </form>
      </div>
    </details>
  );
}

export function TeamAccessPage({
  members,
  history,
  selectedHistoryId,
  notice,
  error,
  filters,
}: {
  members: TeamAccessRecord[];
  history: AccessAuditEvent[];
  selectedHistoryId?: string;
  notice?: string;
  error?: string;
  filters: { search?: string; role?: string; status?: string };
}) {
  return (
    <div className="mt-8 space-y-6">
      <div aria-live="polite">
        {notice ? (
          <p className="rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <section
        aria-labelledby="add-member-title"
        className="rounded-xl border border-border bg-surface p-5 sm:p-7"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <UserPlus aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id="add-member-title" className="text-lg font-semibold">
              Add team member
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Pre-authorise one corporate identity. No invitation email is sent.
            </p>
          </div>
        </div>
        <form
          action={addTeamMemberAction}
          className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end"
        >
          <div className="space-y-2">
            <label htmlFor="team-email" className="text-sm font-medium">
              Corporate email
            </label>
            <Input
              id="team-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="team-name" className="text-sm font-medium">
              Display name{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="team-name"
              name="displayName"
              autoComplete="name"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="team-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="team-role"
              name="role"
              defaultValue="user"
              className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="lg" className="h-11">
            <UserPlus aria-hidden="true" data-icon="inline-start" />
            Add member
          </Button>
        </form>
      </section>

      <section
        aria-labelledby="team-directory-title"
        className="rounded-xl border border-border bg-surface"
      >
        <div className="border-b border-border p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="team-directory-title" className="text-lg font-semibold">
                Team directory
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {members.length} matching assignment
                {members.length === 1 ? "" : "s"}
              </p>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_10rem_10rem_auto]"
              action="/team"
            >
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute top-3.5 left-3 size-4 text-muted-foreground"
                />
                <Input
                  name="search"
                  defaultValue={filters.search}
                  placeholder="Search name or email"
                  className="pl-9"
                  aria-label="Search team"
                />
              </div>
              <select
                name="role"
                defaultValue={filters.role ?? ""}
                aria-label="Filter by role"
                className="h-11 rounded-lg border border-input bg-surface px-3 text-sm"
              >
                <option value="">All roles</option>
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                aria-label="Filter by status"
                className="h-11 rounded-lg border border-input bg-surface px-3 text-sm"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <Button type="submit" variant="outline" className="h-11">
                Apply
              </Button>
            </form>
          </div>
        </div>

        {members.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">
              No team assignments match these filters.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear the filters or add the first approved company identity.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Team member</th>
                    <th className="px-5 py-3 font-semibold">Role</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Identity</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => (
                    <tr key={member.id} className="align-top">
                      <td className="px-5 py-5">
                        <p className="font-semibold">
                          {member.displayName || "Name not provided"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {member.normalizedEmail}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <Badge variant="outline">
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      </td>
                      <td className="px-5 py-5">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-5 py-5 text-xs text-muted-foreground">
                        {member.provider
                          ? `${member.provider} · bound`
                          : "Awaiting first sign in"}
                      </td>
                      <td className="w-64 px-5 py-4">
                        <TeamMemberActions member={member} instance="desktop" />
                        <Button
                          asChild
                          variant="link"
                          className="mt-1 h-9 px-1"
                        >
                          <Link href={`/team?history=${member.id}`}>
                            View access history
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {members.map((member) => (
                <article key={member.id} className="space-y-4 p-5">
                  <div>
                    <p className="font-semibold">
                      {member.displayName || "Name not provided"}
                    </p>
                    <p className="mt-1 text-sm break-all text-muted-foreground">
                      {member.normalizedEmail}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                    <StatusBadge status={member.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {member.provider
                      ? `${member.provider} identity bound`
                      : "Awaiting first sign in"}
                  </p>
                  <TeamMemberActions member={member} instance="mobile" />
                  <Button asChild variant="outline" className="h-11 w-full">
                    <Link href={`/team?history=${member.id}`}>
                      <Clock3 aria-hidden="true" data-icon="inline-start" />
                      Access history
                    </Link>
                  </Button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {selectedHistoryId ? (
        <section
          aria-labelledby="history-title"
          className="rounded-xl border border-border bg-surface p-5 sm:p-7"
        >
          <h2 id="history-title" className="text-lg font-semibold">
            Recent access history
          </h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No access events are recorded for this assignment.
            </p>
          ) : (
            <ol className="mt-5 divide-y divide-border">
              {history.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm font-medium">
                    {event.action.replaceAll("_", " ")}
                  </span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={event.createdAt.toISOString()}
                  >
                    {dateFormatter.format(event.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
