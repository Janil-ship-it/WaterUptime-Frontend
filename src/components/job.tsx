import { Link } from "react-router-dom";
import { useDerived } from "../data/store";
import type { AuditEntry, JobAction, JobStatus, MaintenanceJob } from "../domain/types";
import { Fingerprint, Icon, formatDate, timeAgo } from "./ui";

export const ACTION_TEXT: Record<JobAction, { label: string; dot: string; tone: string }> = {
  Reported: { label: "Fault reported", dot: "bg-warning", tone: "text-warning" },
  Assigned: { label: "Job assigned", dot: "bg-secondary", tone: "text-secondary" },
  RepairSubmitted: { label: "Repair evidence submitted", dot: "bg-primary", tone: "text-primary" },
  RepairApproved: { label: "Repair approved", dot: "bg-primary-container", tone: "text-primary" },
  RepairReturned: { label: "Rework requested", dot: "bg-error", tone: "text-error" },
  Closed: { label: "Job closed", dot: "bg-outline", tone: "text-on-surface-variant" },
  Cancelled: { label: "Job cancelled", dot: "bg-outline-variant", tone: "text-on-surface-variant" },
};

/** Display name for a job: the off-chain fault summary when available. */
export function useJobLabel() {
  const { record, pointMeta } = useDerived();
  return (job: MaintenanceJob) => {
    const meta = pointMeta(job.waterPointId);
    return {
      title: record(job.faultReference)?.summary ?? "Off-chain fault record not available",
      point: meta ? `${meta.code} · ${meta.name}` : `Water point ${job.waterPointId.slice(0, 8)}…`,
      locality: meta?.locality,
      priority: record(job.faultReference)?.priority,
    };
  };
}

export function JobLink({ id }: { id: number }) {
  return (
    <Link to={`/jobs/${id}`} className="text-code-num text-primary hover:underline">
      JOB-{String(id).padStart(3, "0")}
    </Link>
  );
}

/** Pass `jobId` on entries to label each event with its job (activity feeds). */
export function AuditTimeline({ entries }: { entries: (AuditEntry & { jobId?: number })[] }) {
  const { person, record } = useDerived();
  if (entries.length === 0) return <p className="text-body-sm text-on-surface-variant">No recorded events.</p>;
  return (
    <ol className="relative space-y-space-md pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-0.5 before:bg-surface-variant">
      {entries.map((e, i) => {
        const t = ACTION_TEXT[e.action];
        const r = record(e.reference);
        const p = person(e.actor);
        return (
          <li key={`${e.timestamp}-${i}`} className="relative">
            <span className={`absolute -left-6 top-1.5 h-3 w-3 rounded-full ring-4 ring-surface-container ${t.dot}`} />
            <div className="flex flex-wrap items-center justify-between gap-x-space-sm">
              <span className={`text-label-sm uppercase ${t.tone}`}>
                {t.label}
                {e.jobId !== undefined && (
                  <>
                    {" · "}
                    <JobLink id={e.jobId} />
                  </>
                )}
              </span>
              <time className="text-code-num text-on-surface-variant" dateTime={new Date(e.timestamp * 1000).toISOString()} title={formatDate(e.timestamp)}>
                {timeAgo(e.timestamp)}
              </time>
            </div>
            <p className="mt-space-xxs text-body-sm text-on-surface">
              by <span className="font-semibold">{p?.name ?? "Unknown account"}</span>
              {p && <span className="text-on-surface-variant"> ({p.title.toLowerCase()})</span>}
            </p>
            {r && (
              <p className={`mt-space-xs rounded-sm bg-surface-container-lowest p-space-xs text-body-sm ${e.action === "RepairReturned" ? "border-l-2 border-error text-error" : "text-on-surface-variant"}`}>
                {r.category && <span className="font-semibold">{r.category}: </span>}
                {r.summary}
              </p>
            )}
            {e.reference && (
              <div className="mt-space-xs">
                <Fingerprint hex={e.reference} label="Evidence fingerprint" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const STEPS: { key: string; label: string }[] = [
  { key: "Reported", label: "Reported" },
  { key: "Assigned", label: "Assigned" },
  { key: "RepairSubmitted", label: "Repair submitted" },
  { key: "Verified", label: "Verified" },
  { key: "Closed", label: "Closed" },
];

const STEP_INDEX: Record<JobStatus, number> = {
  Reported: 0,
  Assigned: 1,
  NeedsRework: 1,
  RepairSubmitted: 2,
  Verified: 3,
  Closed: 4,
  Cancelled: -1,
};

export function LifecycleStepper({ status }: { status: JobStatus }) {
  if (status === "Cancelled") {
    return (
      <div className="flex items-center gap-space-xs rounded-lg bg-surface-container-lowest p-space-sm text-body-sm text-on-surface-variant">
        <Icon name="block" className="text-base" />
        This job was cancelled by the coordinator. Its history is kept for audit.
      </div>
    );
  }
  const current = STEP_INDEX[status];
  return (
    <ol className="grid grid-cols-5 gap-space-xs" aria-label="Job progress">
      {STEPS.map((step, i) => {
        const done = i < current || status === "Closed";
        const active = i === current && status !== "Closed";
        const rework = status === "NeedsRework" && i === 2;
        return (
          <li key={step.key} className="flex flex-col items-center gap-1 text-center" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-label-sm ${
                rework
                  ? "bg-error-container text-on-error-container"
                  : done
                    ? "bg-secondary-container text-on-secondary-container"
                    : active
                      ? "bg-primary text-on-primary ring-2 ring-primary/40"
                      : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              {rework ? <Icon name="restart_alt" className="text-sm" /> : done ? <Icon name="check" className="text-sm" /> : i + 1}
            </span>
            <span className={`text-label-sm ${active ? "text-primary" : rework ? "text-error" : done ? "text-on-surface" : "text-on-surface-variant"}`}>
              {rework ? "Rework" : step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
