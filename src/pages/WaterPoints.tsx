import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { JobLink, useJobLabel } from "../components/job";
import { Button, Card, EmptyState, Field, Fingerprint, Icon, inputClass, Kpi, PageHeader, PersonLabel, StatusBadge, timeAgo } from "../components/ui";
import { useDerived, useStore } from "../data/store";
import type { Hex32, WaterPoint } from "../domain/types";

type JobFilter = "any" | "open" | "none";

export function WaterPoints() {
  const { chain, actor, readOnly } = useStore();
  const { points, pointMeta } = useDerived();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [locality, setLocality] = useState("all");
  const [jobFilter, setJobFilter] = useState<JobFilter>("any");
  const [registering, setRegistering] = useState(false);
  const selectedId = params.get("id");
  const isCoordinator = !readOnly && actor?.address === chain.admin;

  const localities = useMemo(
    () => [...new Set(points.map((p) => pointMeta(p.id)?.locality).filter((l): l is string => !!l))].sort(),
    [points, pointMeta],
  );

  const filtered = points.filter((p) => {
    const m = pointMeta(p.id);
    const text = `${m?.code ?? ""} ${m?.name ?? ""} ${m?.locality ?? ""} ${p.id}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (locality !== "all" && m?.locality !== locality) return false;
    if (jobFilter === "open" && p.openJob === null) return false;
    if (jobFilter === "none" && p.openJob !== null) return false;
    return true;
  });

  const selected = selectedId ? chain.waterPoints[selectedId] : undefined;
  const select = (id: Hex32 | null) => setParams(id ? { id } : {}, { replace: true });

  return (
    <>
      <PageHeader
        title="Water points"
        description="Registered community water points. Only an opaque ID and a fingerprint of the facility record are stored on-chain."
        actions={
          isCoordinator && (
            <Button tone="primary" icon="add_circle" onClick={() => setRegistering((v) => !v)}>
              Register water point
            </Button>
          )
        }
      />

      {registering && <RegisterForm onDone={() => setRegistering(false)} />}

      <div className="mb-space-lg grid grid-cols-2 gap-space-md md:grid-cols-4">
        <Kpi label="Registered" value={points.length} icon="water_drop" />
        <Kpi label="Active" value={points.filter((p) => p.active).length} icon="check_circle" />
        <Kpi label="With open job" value={points.filter((p) => p.openJob !== null).length} icon="build" tone="text-warning" accent="bg-warning" />
        <Kpi label="Inactive" value={points.filter((p) => !p.active).length} icon="block" tone="text-outline" accent="bg-outline-variant" />
      </div>

      <Card className="mb-space-lg">
        <div className="grid grid-cols-1 gap-space-sm md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" />
            <input
              aria-label="Search water points"
              className={`${inputClass} pl-9`}
              placeholder="Search by code, name or locality…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select aria-label="Locality" className={inputClass} value={locality} onChange={(e) => setLocality(e.target.value)}>
            <option value="all">All localities</option>
            {localities.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select aria-label="Open jobs" className={inputClass} value={jobFilter} onChange={(e) => setJobFilter(e.target.value as JobFilter)}>
            <option value="any">Any job status</option>
            <option value="open">Has an open job</option>
            <option value="none">No open job</option>
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="overflow-hidden rounded-xl bg-surface-container-low shadow-md xl:col-span-8">
          <div className="flex items-center justify-between bg-surface-container px-space-md py-space-sm">
            <span className="text-label-md text-on-surface">Registry</span>
            <span className="text-code-num text-on-surface-variant">
              {filtered.length} of {points.length}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="p-space-md">
              <EmptyState icon="search_off" title="No water points match">
                Try a different search or clear the filters.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-lowest text-label-sm uppercase text-on-surface-variant">
                    <th className="px-space-md py-space-sm">Water point</th>
                    <th className="px-space-sm py-space-sm">Locality</th>
                    <th className="px-space-sm py-space-sm">Status</th>
                    <th className="px-space-sm py-space-sm">Open job</th>
                    <th className="px-space-md py-space-sm text-right">
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-body-sm">
                  {filtered.map((p) => (
                    <PointRow key={p.id} point={p} selected={p.id === selectedId} onSelect={() => select(p.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="xl:col-span-4">
          {selected ? (
            <PointDetail point={selected} onClose={() => select(null)} />
          ) : (
            <EmptyState icon="touch_app" title="Select a water point">
              See its on-chain record and repair history.
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

function PointRow({ point, selected, onSelect }: { point: WaterPoint; selected: boolean; onSelect: () => void }) {
  const { pointMeta } = useDerived();
  const m = pointMeta(point.id);
  return (
    <tr className={`cursor-pointer transition-colors hover:bg-surface-container-high ${selected ? "bg-surface-container-high/60" : ""}`} onClick={onSelect}>
      <td className="px-space-md py-space-sm">
        <div className="flex flex-col">
          <span className={`text-code-num ${selected ? "text-primary" : "text-on-surface"}`}>{m?.code ?? `${point.id.slice(0, 10)}…`}</span>
          <span className="text-label-md text-on-surface">{m?.name ?? "No off-chain record"}</span>
          {m && <span className="text-on-surface-variant">{m.facilityType}</span>}
        </div>
      </td>
      <td className="px-space-sm py-space-sm text-on-surface">{m?.locality ?? "—"}</td>
      <td className="whitespace-nowrap px-space-sm py-space-sm">
        {point.active ? (
          <span className="inline-flex items-center gap-1.5 text-label-sm text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-label-sm text-outline">
            <span className="h-1.5 w-1.5 rounded-full bg-outline" /> Inactive
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-space-sm py-space-sm" onClick={(e) => e.stopPropagation()}>
        {point.openJob !== null ? <JobLink id={point.openJob} /> : <span className="text-on-surface-variant">None</span>}
      </td>
      <td className="px-space-md py-space-sm text-right">
        <button
          type="button"
          aria-label={`View ${m?.code ?? "water point"}`}
          onClick={onSelect}
          className="rounded-lg bg-surface-container p-space-xxs text-on-surface-variant hover:bg-surface-bright hover:text-primary"
        >
          <Icon name="visibility" className="text-base" />
        </button>
      </td>
    </tr>
  );
}

function PointDetail({ point, onClose }: { point: WaterPoint; onClose: () => void }) {
  const navigate = useNavigate();
  const { chain, actor, readOnly, actions } = useStore();
  const { pointMeta, person, jobs } = useDerived();
  const label = useJobLabel();
  const m = pointMeta(point.id);
  const pointJobs = jobs.filter((j) => j.waterPointId === point.id);
  const isCoordinator = !readOnly && actor?.address === chain.admin;
  const canReport = !readOnly && !!actor && chain.reporters.includes(actor.address) && point.active && point.openJob === null;

  return (
    <Card className="flex flex-col gap-space-md bg-surface-container-low shadow-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <span className="text-code-num text-primary">{m?.code ?? "Water point"}</span>
          <h2 className="text-title-md text-on-surface">{m?.name ?? "No off-chain record available"}</h2>
          {m && (
            <p className="text-body-sm text-on-surface-variant">
              {m.facilityType} · {m.locality} LGA
            </p>
          )}
        </div>
        <button type="button" aria-label="Close details" onClick={onClose} className="rounded-lg p-space-xxs text-on-surface-variant hover:bg-surface-container-high">
          <Icon name="close" className="text-base" />
        </button>
      </div>

      <dl className="grid grid-cols-1 gap-space-xs rounded-xl bg-surface-container p-space-sm text-body-sm">
        <div className="flex items-center justify-between gap-space-sm">
          <dt className="text-on-surface-variant">On-chain ID</dt>
          <dd>
            <Fingerprint hex={point.id} label="Water point ID" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-space-sm">
          <dt className="text-on-surface-variant">Metadata fingerprint</dt>
          <dd>
            <Fingerprint hex={point.metadataHash} label="Metadata fingerprint" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-space-sm">
          <dt className="text-on-surface-variant">Registered by</dt>
          <dd className="text-right">
            <PersonLabel person={person(point.registeredBy)} address={point.registeredBy} compact />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-space-sm">
          <dt className="text-on-surface-variant">Accepting reports</dt>
          <dd className={point.active ? "text-primary" : "text-outline"}>{point.active ? "Yes" : "No (inactive)"}</dd>
        </div>
      </dl>

      <div>
        <h3 className="mb-space-xs text-label-sm uppercase text-on-surface-variant">Repair history ({pointJobs.length})</h3>
        {pointJobs.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">No jobs recorded for this water point.</p>
        ) : (
          <ul className="flex flex-col gap-space-xs">
            {pointJobs.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-space-sm rounded-lg bg-surface-container p-space-xs">
                <div className="flex min-w-0 flex-col">
                  <JobLink id={j.id} />
                  <span className="line-clamp-1 text-body-sm text-on-surface">{label(j).title}</span>
                  <span className="text-body-sm text-on-surface-variant">{timeAgo(j.updatedAt)}</span>
                </div>
                <StatusBadge status={j.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-space-sm sm:flex-row">
        {canReport && (
          <Button tone="primary" icon="report" className="flex-1" onClick={() => navigate(`/report?point=${point.id}`)}>
            Report a fault
          </Button>
        )}
        {isCoordinator && (
          <Button icon={point.active ? "block" : "check_circle"} className="flex-1" onClick={() => actions.setWaterPointActive(point.id, !point.active)}>
            {point.active ? "Deactivate" : "Reactivate"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const { actions } = useStore();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [facilityType, setFacilityType] = useState("Handpump");
  const [locality, setLocality] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await actions.registerWaterPoint({ code: code.trim(), name: name.trim(), facilityType, locality: locality.trim() });
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <Card className="mb-space-lg">
      <form onSubmit={submit} className="flex flex-col gap-space-md">
        <h2 className="text-title-md text-on-surface">Register a water point</h2>
        <div className="grid grid-cols-1 gap-space-sm md:grid-cols-4">
          <Field label="Code">
            <input required className={inputClass} placeholder="WP-DEMO-600" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Facility name">
            <input required className={inputClass} placeholder="Community handpump" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Facility type">
            <select className={inputClass} value={facilityType} onChange={(e) => setFacilityType(e.target.value)}>
              {["Handpump", "Solar borehole", "Motorised borehole", "Public standpipe", "Protected well"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="LGA / locality">
            <input required className={inputClass} placeholder="e.g. Igabi" value={locality} onChange={(e) => setLocality(e.target.value)} />
          </Field>
        </div>
        <p className="flex items-start gap-space-xs text-body-sm text-on-surface-variant">
          <Icon name="shield" className="text-base text-secondary" />
          Only a random ID and a salted fingerprint of this record go on-chain. Do not enter exact coordinates, household details or names.
        </p>
        <div className="flex gap-space-sm">
          <Button type="submit" tone="primary" icon="add_circle" disabled={busy}>
            Register
          </Button>
          <Button tone="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
