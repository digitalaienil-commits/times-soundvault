import type { Metadata } from "next";
import Link from "next/link";
import { ListMusic, Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/auth/permissions";
import { requireRouteAccess } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/database/database";
import {
  getDemandMetrics,
  listDemandFormOptions,
  listDemands,
} from "@/lib/demands/repository";

export const metadata: Metadata = { title: "Demand Sheet" };
const control =
  "min-h-10 rounded-lg border border-border bg-surface px-3 text-sm";

export default async function DemandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRouteAccess("/demands");
  const raw = await searchParams;
  const scalar = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const [result, metrics, options] = await Promise.all([
    listDemands(getDatabase(), user, scalar),
    getDemandMetrics(getDatabase(), user),
    listDemandFormOptions(getDatabase()),
  ]);
  const canCreate = hasPermission(user.role, "demand.create");
  const cards =
    user.role === "music_producer"
      ? [
          ["Open Demands", metrics.open],
          ["Assigned to you", metrics.assigned],
          ["Your active responses", metrics.myActive],
          ["Deadline passed", metrics.overdue],
        ]
      : [
          ["Open Demands", metrics.open],
          ["Overdue", metrics.overdue],
          ["Ready to fulfill", metrics.ready],
          ["Visible results", result.total],
        ];
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(scalar))
      if (typeof value === "string" && value && key !== "page")
        query.set(key, value);
    query.set("page", String(page));
    return `/demands?${query.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Demand Sheet"
        description="Plan internal music needs, check the published catalog first and track accepted supply."
        actions={
          canCreate ? (
            <Button asChild size="lg">
              <Link href="/demands/new">
                <Plus aria-hidden="true" />
                New Demand
              </Link>
            </Button>
          ) : undefined
        }
      />
      <section
        aria-label="Demand summary"
        className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map(([cardLabel, value]) => (
          <div
            key={String(cardLabel)}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-sm text-muted-foreground">{cardLabel}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>
      <form
        className="mt-5 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-8"
        aria-label="Demand filters"
      >
        <label className="grid gap-1 text-xs font-semibold lg:col-span-2">
          Search
          <input
            className={control}
            name="query"
            defaultValue={result.filters.query}
            placeholder="Number, title, project or requester"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Status
          <select
            className={control}
            name="status"
            defaultValue={result.filters.status}
          >
            <option value="open">Open</option>
            <option value="all">All</option>
            {user.role !== "music_producer" ? (
              <option value="draft">Draft</option>
            ) : null}
            <option value="fulfilled">Fulfilled</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Owner
          <select
            className={control}
            name="ownerUserId"
            defaultValue={result.filters.ownerUserId}
          >
            <option value="all">All owners</option>
            {options.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Priority
          <select
            className={control}
            name="priority"
            defaultValue={result.filters.priority}
          >
            <option value="all">All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Sort
          <select
            className={control}
            name="sort"
            defaultValue={result.filters.sort}
          >
            <option value="priority">Priority</option>
            <option value="response_deadline">Response deadline</option>
            <option value="needed_by">Needed by</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Timing
          <select
            className={control}
            name="timing"
            defaultValue={result.filters.timing}
          >
            <option value="all">All</option>
            <option value="overdue">Deadline passed</option>
            <option value="due_soon">Due in 7 days</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button asChild variant="ghost">
            <Link href="/demands">Reset</Link>
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm lg:col-span-2">
          <input
            type="checkbox"
            name="assignedToMe"
            value="true"
            defaultChecked={result.filters.assignedToMe}
            className="size-4 accent-brand"
          />
          Assigned to me
        </label>
        {user.role === "music_producer" ? (
          <label className="grid gap-1 text-xs font-semibold">
            My response
            <select
              className={control}
              name="myResponse"
              defaultValue={result.filters.myResponse}
            >
              <option value="all">Any status</option>
              <option value="working">Working</option>
              <option value="submitted">Submitted</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </label>
        ) : null}
      </form>
      <main className="mt-6" aria-label="Demand results">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            {result.total} {result.total === 1 ? "Demand" : "Demands"}
          </h2>
        </div>
        {result.items.length ? (
          <ul className="space-y-3">
            {result.items.map((demand) => (
              <li key={demand.id}>
                <article className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {demand.displayNumber}
                        </span>
                        <Badge
                          variant={
                            demand.priority === "urgent" || demand.overdue
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {demand.overdue ? "Deadline passed" : demand.priority}
                        </Badge>
                        {demand.assignedToCurrentUser ? (
                          <Badge variant="secondary">Assigned to you</Badge>
                        ) : null}
                      </div>
                      <h3 className="mt-2 text-lg font-semibold">
                        <Link
                          className="underline-offset-4 hover:text-brand hover:underline"
                          href={`/demands/${demand.id}`}
                        >
                          {demand.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {demand.projectContext}
                      </p>
                    </div>
                    <Badge variant="outline">{demand.status}</Badge>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <dt className="text-muted-foreground">Needed by</dt>
                      <dd>{demand.neededByOn}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Response deadline
                      </dt>
                      <dd>{demand.responseDeadlineOn}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Accepted</dt>
                      <dd className="tabular-nums">
                        {demand.coverage.validAccepted} /{" "}
                        {demand.targetTrackCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Responses</dt>
                      <dd>
                        {demand.coverage.working} working ·{" "}
                        {demand.coverage.submitted +
                          demand.coverage.shortlisted}{" "}
                        submitted
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Owner</dt>
                      <dd>{demand.ownerName}</dd>
                    </div>
                  </dl>
                  {demand.readyToFulfill ? (
                    <p className="mt-4 text-sm font-semibold text-success">
                      Ready to fulfill
                    </p>
                  ) : demand.fulfillmentNeedsAttention ? (
                    <p className="mt-4 text-sm font-semibold text-warning">
                      Fulfillment needs attention
                    </p>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <section className="rounded-xl border border-border bg-surface px-6 py-14 text-center">
            <ListMusic
              className="mx-auto size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="mt-3 text-lg font-semibold">No Demands match</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust filters or create the first internal music brief.
            </p>
          </section>
        )}
      </main>
      {result.total > result.filters.pageSize ? (
        <nav
          aria-label="Demand result pages"
          className="mt-6 flex items-center justify-between"
        >
          {result.filters.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={pageHref(result.filters.page - 1)}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {result.filters.page} of{" "}
            {Math.ceil(result.total / result.filters.pageSize)}
          </span>
          {result.filters.page * result.filters.pageSize < result.total ? (
            <Button asChild variant="outline">
              <Link href={pageHref(result.filters.page + 1)}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
