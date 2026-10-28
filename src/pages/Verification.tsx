import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AuditTimeline, JobLink, useJobLabel } from "../components/job";
import { Button, Card, EmptyState, Field, Fingerprint, Icon, inputClass, Kpi, PageHeader, PersonLabel, PriorityBadge, SectionTitle, timeAgo } from "../components/ui";
import { ActionHint, useSwitchHint } from "../components/tx";
import { useDerived, useStore } from "../data/store";
import type { MaintenanceJob } from "../domain/types";

const REWORK_REASONS = [
  "Incomplete evidence",
  "Water service not restored",
  "Improper component installation",
  "Evidence does not match this water point",
  "Other",
];

export function Verification() {
  const { chain, actor, readOnly } = useStore();
  const { jobs, person } = useDerived();
  const label = useJobLabel();
  const [params, setParams] = useSearchParams();
  const [mineOnly, setMineOnly] = useState(true);

  const isVerifier = !readOnly && actor?.role === "verifier";
  const pending = jobs
    .filter((j) => j.status === "RepairSubmitted")
    .filter((j) => !isVerifier || !mineOnly || j.verifier === actor?.address)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  const allHistory = Object.values(chain.history).flat();
  const decided = allHistory.filter((e) => e.action === "RepairApproved" || e.action === "RepairReturned");
  const returned = decided.filter((e) => e.action === "RepairReturned").length;

  const selectedId = Number(params.get("job"));
  const selected = pending.find((j) => j.id === selectedId) ?? pending[0];

  return (
    <>
      <PageHeader
        eyebrow={<span className="text-label-sm uppercase text-primary">Independent verification</span>}
        title="Verification queue"
        description="Review the technician's repair evidence against the original fault, then approve it or return it for rework."
        actions={
          isVerifier && actor ? (
            <div className="flex items-center gap-space-sm rounded-lg bg-surface-container-high px-space-md py-space-sm">
              <Icon name="verified_user" fill className="text-xl text-primary" />
              <PersonLabel person={actor} address={actor.address} />
            </div>
          ) : undefined
        }
      />

      <div className="mb-space-lg flex items-start gap-space-sm rounded-lg bg-surface-container-high p-space-md">
        <Icon name="warning" fill className="text-xl text-secondary" />
        <div>
          <p className="text-label-md uppercase text-secondary">What verification does and doesn't prove</p>
          <p className="mt-space-xxs text-body-sm text-on-surface-variant">
            Your decision is recorded with your account and a fingerprint of your notes. Photos alone do not prove water is safe to drink: confirm the
            agreed service checks were done before approving.
          </p>
        </div>
      </div>

      <div className="mb-space-xl grid grid-cols-2 gap-space-md md:grid-cols-3">
        <Kpi label="Awaiting decision" value={jobs.filter((j) => j.status === "RepairSubmitted").length} icon="pending_actions" />
        <Kpi label="Decisions recorded" value={decided.length} icon="gavel" tone="text-secondary" accent="bg-secondary-container" />
        <Kpi
          label="Returned for rework"
          value={decided.length ? `${Math.round((returned / decided.length) * 100)}%` : "—"}
          icon="assignment_return"
          tone="text-error"
          accent="bg-error"
          hint={`${returned} of ${decided.length} decisions`}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
        <div className="flex flex-col gap-space-sm lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-title-md text-on-surface">Queue ({pending.length})</h2>
            {isVerifier && (
              <label className="flex items-center gap-space-xs text-body-sm text-on-surface-variant">
                <input type="checkbox" className="accent-[var(--color-primary)]" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                Assigned to me
              </label>
            )}
          </div>
          {pending.length === 0 ? (
            <EmptyState icon="task_alt" title="Nothing to review">
              {isVerifier && mineOnly ? "No submitted repairs are assigned to you." : "No repairs are waiting for verification."}
            </EmptyState>
          ) : (
            pending.map((j) => {
              const l = label(j);
              const active = selected?.id === j.id;
              return (
                <button
                  key={j.id}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => setParams({ job: String(j.id) }, { replace: true })}
                  className={`relative overflow-hidden rounded-lg p-space-md text-left shadow-sm transition-colors ${active ? "bg-surface-container-high shadow-md" : "bg-surface-container hover:bg-surface-container-high"}`}
                >
                  <span className={`absolute inset-y-0 left-0 ${active ? "w-1.5 bg-primary" : "w-1 bg-surface-variant"}`} />
                  <div className="flex flex-col gap-space-xxs pl-space-xs">
                    <span className="flex items-center justify-between gap-space-xs">
                      <span className="text-code-num text-on-surface-variant">
                        JOB-{String(j.id).padStart(3, "0")} · {l.point.split(" · ")[0]}
                      </span>
                      <PriorityBadge priority={l.priority} />
                    </span>
                    <span className="text-title-md text-on-surface">{l.point.split(" · ")[1] ?? l.point}</span>
                    <span className="line-clamp-1 text-body-sm text-on-surface-variant">{l.title}</span>
                    <span className="mt-space-xs flex items-center justify-between text-body-sm text-on-surface-variant">
                      <span className="flex items-center gap-space-xxs">
                        <Icon name="person_pin" className="text-sm text-secondary" />
                        {person(j.technician)?.name ?? "Unknown"}
                      </span>
                      <span className="text-code-num">{timeAgo(j.updatedAt)}</span>
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-8">{selected && <Review key={selected.id} job={selected} />}</div>
      </div>
    </>
  );
}

function Review({ job }: { job: MaintenanceJob }) {
  const { chain, actor, readOnly } = useStore();
  const { person, record } = useDerived();
  const l = useJobLabel()(job);
  const fault = record(job.faultReference);
  const repair = record(job.repairReference);
  const isAssigned = !readOnly && actor?.address === job.verifier;
  const switchHint = useSwitchHint();
  const history = chain.history[job.id] ?? [];
  const submittedAt = [...history].reverse().find((e) => e.action === "RepairSubmitted")?.timestamp;

  return (
    <div className="flex flex-col gap-space-lg">
      <Card className="flex flex-col gap-space-md p-space-lg max-sm:p-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          <span className="rounded-lg bg-primary px-space-sm py-space-xs text-label-md text-on-primary">JOB-{String(job.id).padStart(3, "0")}</span>
          <div className="flex flex-col">
            <span className="text-headline-sm text-on-surface">{l.point}</span>
            {l.locality && <span className="text-body-sm text-on-surface-variant">{l.locality} LGA</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
          <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container-low p-space-md">
            <span className="flex items-center justify-between text-label-sm uppercase text-on-surface-variant">
              <span className="flex items-center gap-1">
                <Icon name="flag" className="text-sm" /> 1. Original fault
              </span>
              <span className="text-code-num normal-case">{timeAgo(job.createdAt)}</span>
            </span>
            <PersonLabel person={person(job.reporter)} address={job.reporter} />
            <p className="rounded-sm bg-surface-container-lowest p-space-sm text-body-sm text-on-surface">{fault?.summary ?? "Off-chain fault record not available."}</p>
            <Fingerprint hex={job.faultReference} label="Fault record" />
          </div>
          <div className="flex flex-col gap-space-xs rounded-lg bg-surface-container-low p-space-md">
            <span className="flex items-center justify-between text-label-sm uppercase text-primary">
              <span className="flex items-center gap-1">
                <Icon name="engineering" className="text-sm" /> 2. Technician submission
              </span>
              {submittedAt && <span className="text-code-num normal-case">{timeAgo(submittedAt)}</span>}
            </span>
            <PersonLabel person={person(job.technician)} address={job.technician} />
            <p className="rounded-sm bg-surface-container-lowest p-space-sm text-body-sm text-on-surface">{repair?.summary ?? "Off-chain evidence not available."}</p>
            {repair?.detail && <p className="text-body-sm text-on-surface-variant">{repair.detail}</p>}
            <Fingerprint hex={job.repairReference} label="Repair evidence" />
          </div>
        </div>
        <p className="flex items-start gap-space-xs text-body-sm text-on-surface-variant">
          <Icon name="photo_library" className="text-base" />
          Photos and test logs are kept in the off-chain evidence store, which is not part of this prototype yet.
        </p>
      </Card>

      {isAssigned ? (
        <Decision job={job} />
      ) : (
        <p className="flex items-start gap-space-xs rounded-lg bg-surface-container-lowest p-space-sm text-body-sm text-on-surface-variant">
          <Icon name="lock" className="text-base text-secondary" />
          {readOnly
            ? "Read-only testnet view. Connect Freighter as the assigned verifier to decide on this repair."
            : `Only the assigned verifier, ${person(job.verifier)?.name ?? "unknown"}, can decide on this repair. ${switchHint}`}
        </p>
      )}

      <Card>
        <SectionTitle icon="history" aside={<JobLink id={job.id} />}>
          Job history
        </SectionTitle>
        <AuditTimeline entries={history} />
      </Card>
    </div>
  );
}

function Decision({ job }: { job: MaintenanceJob }) {
  const { actions } = useStore();
  const { person } = useDerived();
  const [checks, setChecks] = useState([false, false]);
  const [approveNotes, setApproveNotes] = useState("");
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const tech = person(job.technician)?.name ?? "the technician";

  const approve = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await actions.verify(job.id, true, approveNotes.trim() || "Repair accepted.");
    setBusy(false);
  };
  const rework = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await actions.verify(job.id, false, instructions.trim(), reason);
    setBusy(false);
  };

  return (
    <section aria-labelledby="decision-title" className="flex flex-col gap-space-md">
      <h2 id="decision-title" className="flex items-center gap-space-xs text-title-md text-on-surface">
        <Icon name="gavel" className="text-xl text-secondary" /> 3. Your decision
      </h2>
      <div className="grid grid-cols-1 gap-space-lg md:grid-cols-2">
        <form onSubmit={approve} className="relative flex flex-col justify-between gap-space-md overflow-hidden rounded-lg bg-surface-container-low p-space-lg shadow-md max-sm:p-space-md">
          <span className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <div className="flex flex-col gap-space-md">
            <div className="flex items-center gap-space-xs">
              <Icon name="task_alt" fill className="text-2xl text-primary" />
              <div>
                <h3 className="text-title-md text-on-surface">Approve repair</h3>
                <span className="text-label-sm uppercase text-primary">Service restored</span>
              </div>
            </div>
            {[
              "The evidence matches this water point and the reported fault, and the agreed service checks were done.",
              `I have no conflict of interest with ${tech}.`,
            ].map((text, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-space-sm text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  required
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                  checked={checks[i] ?? false}
                  onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                {text}
              </label>
            ))}
            <Field label="Verification notes">
              <textarea rows={3} className={`${inputClass} resize-none`} value={approveNotes} onChange={(e) => setApproveNotes(e.target.value)} placeholder="What you checked and observed" />
            </Field>
          </div>
          <div className="flex flex-col gap-space-xs">
            <Button type="submit" tone="primary" icon="verified" disabled={busy || !checks.every(Boolean)}>
              Approve repair
            </Button>
            <span className="text-center text-body-sm text-on-surface-variant">The coordinator closes the job after approval.</span>
          </div>
        </form>

        <form onSubmit={rework} className="relative flex flex-col justify-between gap-space-md overflow-hidden rounded-lg bg-surface-container-low p-space-lg shadow-md max-sm:p-space-md">
          <span className="absolute inset-x-0 top-0 h-1 bg-error" />
          <div className="flex flex-col gap-space-md">
            <div className="flex items-center gap-space-xs">
              <Icon name="assignment_late" fill className="text-2xl text-error" />
              <div>
                <h3 className="text-title-md text-on-surface">Request rework</h3>
                <span className="text-label-sm uppercase text-error">Not accepted yet</span>
              </div>
            </div>
            <Field label="Reason">
              <select required className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="" disabled>
                  Select a reason…
                </option>
                {REWORK_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label={`Instructions for ${tech}`}>
              <textarea
                required
                rows={3}
                className={`${inputClass} resize-none`}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="What needs to be fixed or added"
              />
            </Field>
          </div>
          <Button type="submit" tone="danger" icon="undo" disabled={busy || !reason || !instructions.trim()}>
            Return for rework
          </Button>
        </form>
      </div>
      <ActionHint />
    </section>
  );
}
