import { Link, useNavigate } from "react-router-dom";
import { AuditTimeline, JobLink, useJobLabel } from "../components/job";
import { Button, Card, EmptyState, Kpi, PageHeader, PersonLabel, PriorityBadge, SectionTitle, StatusBadge, STATUS_LABEL, statusDot, timeAgo } from "../components/ui";
import { TransactionLog } from "../components/tx";
import { useDerived, useStore } from "../data/store";
import type { JobStatus } from "../domain/types";
import { isTerminal, nextStep } from "../domain/workflow";

const PIPELINE: JobStatus[] = ["Reported", "Assigned", "RepairSubmitted", "NeedsRework", "Verified", "Closed", "Cancelled"];

const NEXT_LABEL = {
  assign: "Assign technician & verifier",
  submit: "Technician submits repair",
  verify: "Verifier decides",
  close: "Coordinator closes",
} as const;

export function Overview() {
  const navigate = useNavigate();
  const { chain, mode } = useStore();
  const { jobs, points, person } = useDerived();
  const label = useJobLabel();

  const count = (s: JobStatus) => jobs.filter((j) => j.status === s).length;
  const open = jobs.filter((j) => !isTerminal(j.status));
  const active = points.filter((p) => p.active).length;
  const withOpenJob = points.filter((p) => p.openJob !== null).length;

  const feed = jobs
    .flatMap((j) => (chain.history[j.id] ?? []).map((e) => ({ ...e, jobId: j.id })))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Operations overview"
        description="Track water-point faults from report to independently verified repair, with an audit trail at every step."
        actions={
          <Button icon="format_list_bulleted" onClick={() => navigate("/jobs")}>
            View all jobs
          </Button>
        }
      />

      <div className="mb-space-xl grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Water points"
          value={points.length}
          icon="water_drop"
          hint={mode === "testnet" ? "Referenced by on-chain jobs or registered here" : `${active} active · ${withOpenJob} with an open job`}
        />
        <Kpi label="New faults" value={count("Reported")} icon="warning" tone="text-error" accent="bg-error" hint="Waiting for coordinator triage" />
        <Kpi
          label="Repairs underway"
          value={count("Assigned") + count("NeedsRework")}
          icon="construction"
          tone="text-secondary"
          accent="bg-secondary-container"
          hint={`${count("NeedsRework")} returned for rework`}
        />
        <Kpi
          label="Awaiting verification"
          value={count("RepairSubmitted")}
          icon="fact_check"
          tone="text-primary-fixed"
          hint={`${count("Verified")} verified, ready to close`}
        />
      </div>

      <Card className="mb-space-xl">
        <SectionTitle icon="linear_scale" aside={<span className="text-code-num text-on-surface-variant">{jobs.length} jobs total</span>}>
          Maintenance pipeline
        </SectionTitle>
        <div className="grid grid-cols-2 gap-space-xs sm:grid-cols-4 lg:grid-cols-7">
          {PIPELINE.map((s, i) => (
            <Link
              key={s}
              to={`/jobs?status=${s}`}
              className="flex flex-col rounded-lg bg-surface-container-high p-space-sm transition-colors hover:bg-surface-bright"
            >
              <span className="flex items-center justify-between text-label-sm text-on-surface-variant">
                STEP {i + 1}
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(s)}`} />
              </span>
              <span className="text-headline-sm text-on-surface tabular">{count(s)}</span>
              <span className="truncate text-label-sm text-on-surface-variant">{STATUS_LABEL[s]}</span>
            </Link>
          ))}
        </div>
        <p className="mt-space-sm flex items-start gap-space-xs rounded-lg bg-surface-container-lowest p-space-xs text-body-sm text-on-surface-variant">
          A job can only close after an independent verifier approves the repair. The record shows who did what; it does not by itself prove a repair
          physically happened.
        </p>
      </Card>

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SectionTitle icon="pending_actions" aside={<span className="text-label-sm text-on-surface-variant">{open.length} open</span>}>
            Open jobs and what they're waiting on
          </SectionTitle>
          {open.length === 0 ? (
            <EmptyState icon="task_alt" title="No open jobs">
              Every reported fault has been closed or cancelled.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl bg-surface-container shadow-md">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-lowest text-label-sm uppercase text-on-surface-variant">
                    <th className="px-space-md py-space-sm">Job & water point</th>
                    <th className="px-space-sm py-space-sm">Status</th>
                    <th className="px-space-sm py-space-sm">Next step</th>
                    <th className="px-space-sm py-space-sm">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant text-body-sm">
                  {open.map((job) => {
                    const l = label(job);
                    const next = nextStep(job);
                    const who = next.actor === "coordinator" ? person(chain.admin) : person(next.actor ?? undefined);
                    return (
                      <tr key={job.id} className="transition-colors hover:bg-surface-container-high">
                        <td className="px-space-md py-space-sm">
                          <div className="flex flex-col gap-space-xxs">
                            <span className="flex items-center gap-space-xs">
                              <JobLink id={job.id} />
                              <PriorityBadge priority={l.priority} />
                            </span>
                            <span className="line-clamp-1 text-label-md text-on-surface">{l.title}</span>
                            <span className="text-on-surface-variant">
                              {l.point}
                              {l.locality ? ` · ${l.locality}` : ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-space-sm py-space-sm">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-space-sm py-space-sm">
                          {next.step && (
                            <div className="flex flex-col">
                              <span className="text-on-surface">{NEXT_LABEL[next.step]}</span>
                              <span className="text-on-surface-variant">
                                <PersonLabel person={who} address={next.actor === "coordinator" ? chain.admin : next.actor} compact />
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-space-sm py-space-sm text-code-num text-on-surface-variant">{timeAgo(job.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          <SectionTitle icon="history" aside={<span className="text-code-num text-on-surface-variant">Audit feed</span>}>
            Recent activity
          </SectionTitle>
          <Card>
            <AuditTimeline entries={feed} />
          </Card>
          {mode === "testnet" && <TransactionLog />}
        </div>
      </div>
    </>
  );
}
