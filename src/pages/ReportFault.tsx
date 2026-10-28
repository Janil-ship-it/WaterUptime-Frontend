import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, EmptyState, Field, Icon, inputClass, PageHeader } from "../components/ui";
import { ActionHint } from "../components/tx";
import { useDerived, useStore } from "../data/store";
import type { Priority } from "../domain/types";

export function ReportFault() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { chain, actor, readOnly, mode, actions } = useStore();
  const { points, pointMeta } = useDerived();
  const [pointId, setPointId] = useState(params.get("point") ?? "");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [busy, setBusy] = useState(false);

  const authorised = !readOnly && !!actor && chain.reporters.includes(actor.address);
  const selectable = points
    .filter((p) => p.active)
    .sort((a, b) => (pointMeta(a.id)?.code ?? "").localeCompare(pointMeta(b.id)?.code ?? ""));
  const chosen = chain.waterPoints[pointId];

  if (!authorised) {
    return (
      <>
        <PageHeader title="Report a fault" description="Authorised community reporters can open a maintenance job for a registered water point." />
        <EmptyState icon="lock" title={readOnly ? "Read-only testnet view" : "Only authorised reporters can report faults"}>
          {readOnly
            ? "Connect Freighter with an account the coordinator has authorised as a reporter, or switch to demo data."
            : mode === "testnet"
              ? "The connected account is not an authorised reporter on this contract. Ask the coordinator to authorise it, or select a reporter account in Freighter."
              : "Switch to a reporter (for example Amina Garba) using the role selector in the header."}
        </EmptyState>
      </>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const jobId = await actions.reportFault(pointId, { summary: summary.trim(), detail: detail.trim() || undefined, priority });
    setBusy(false);
    if (jobId !== null) navigate(`/jobs/${jobId}`);
  };

  return (
    <>
      <PageHeader title="Report a fault" description="Describe what is wrong. The description stays off-chain; only its salted fingerprint is recorded with your account." />
      <Card className="max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-space-md">
          <Field label="Water point">
            <select required className={inputClass} value={pointId} onChange={(e) => setPointId(e.target.value)}>
              <option value="">Choose a water point…</option>
              {selectable.map((p) => {
                const m = pointMeta(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {m ? `${m.code} · ${m.name} (${m.locality})` : p.id.slice(0, 12)}
                    {p.openJob !== null ? " · already has an open job" : ""}
                  </option>
                );
              })}
            </select>
          </Field>
          {chosen?.openJob != null && (
            <p className="flex items-start gap-space-xs rounded-lg bg-warning/10 p-space-sm text-body-sm text-warning">
              <Icon name="info" className="text-base" />
              <span>
                This water point already has an open job.{" "}
                <Link className="underline" to={`/jobs/${chosen.openJob}`}>
                  Follow that job
                </Link>{" "}
                instead of reporting again.
              </span>
            </p>
          )}
          <Field label="What is wrong?">
            <input required maxLength={120} className={inputClass} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Handpump handle broken, no water" />
          </Field>
          <Field label="More detail (optional)">
            <textarea rows={3} className={`${inputClass} resize-none`} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="When it started, what you observed" />
          </Field>
          <fieldset className="flex flex-col gap-space-xxs">
            <legend className="mb-space-xxs text-label-sm uppercase text-on-surface-variant">Priority</legend>
            <div className="flex flex-wrap gap-space-xs">
              {(["urgent", "high", "medium", "low"] as Priority[]).map((p) => (
                <label
                  key={p}
                  className={`cursor-pointer rounded-lg px-space-md py-space-xs text-label-md capitalize ${priority === p ? "bg-primary-container text-on-primary-container" : "bg-surface-container-high text-on-surface-variant"}`}
                >
                  <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="flex items-start gap-space-xs text-body-sm text-on-surface-variant">
            <Icon name="shield" className="text-base text-secondary" />
            Do not include names, phone numbers or exact household locations.
          </p>
          <div>
            <Button type="submit" tone="primary" icon="send" disabled={busy || !pointId || !summary.trim()}>
              Submit report
            </Button>
          </div>
          <ActionHint />
        </form>
      </Card>
    </>
  );
}
