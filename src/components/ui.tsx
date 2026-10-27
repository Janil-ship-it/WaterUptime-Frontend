import { useState, type ReactNode } from "react";
import { shortAddress, shortHex } from "../domain/hash";
import type { Address, JobStatus, Person, Priority } from "../domain/types";

export function Icon({ name, className = "", fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${fill ? "icon-fill" : ""} ${className}`}>
      {name}
    </span>
  );
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  Reported: "Reported",
  Assigned: "Assigned",
  RepairSubmitted: "Awaiting verification",
  NeedsRework: "Rework requested",
  Verified: "Verified",
  Closed: "Closed",
  Cancelled: "Cancelled",
};

const STATUS_STYLE: Record<JobStatus, { text: string; dot: string }> = {
  Reported: { text: "text-error", dot: "bg-error" },
  Assigned: { text: "text-warning", dot: "bg-warning" },
  RepairSubmitted: { text: "text-primary", dot: "bg-primary" },
  NeedsRework: { text: "text-error", dot: "bg-error" },
  Verified: { text: "text-secondary", dot: "bg-secondary" },
  Closed: { text: "text-on-surface-variant", dot: "bg-outline" },
  Cancelled: { text: "text-on-surface-variant", dot: "bg-outline-variant" },
};

export function statusDot(status: JobStatus) {
  return STATUS_STYLE[status].dot;
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-surface-container-highest px-space-xs py-space-xxs text-label-sm ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  urgent: "bg-error-container text-on-error-container",
  high: "bg-warning/15 text-warning",
  medium: "bg-surface-container-highest text-on-surface-variant",
  low: "bg-surface-container-highest text-on-surface-variant",
};

export function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority) return null;
  return (
    <span className={`inline-flex items-center rounded-sm px-space-xs py-space-xxs text-label-sm uppercase ${PRIORITY_STYLE[priority]}`}>
      {priority}
    </span>
  );
}

/** Human name first; the address is secondary, never the only identifier. */
export function PersonLabel({ person, address, compact = false }: { person?: Person; address?: Address | null; compact?: boolean }) {
  if (!address) return <span className="italic text-outline">Not assigned</span>;
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="truncate font-medium text-on-surface">{person?.name ?? "Unknown account"}</span>
      {!compact && (
        <span className="truncate text-body-sm text-on-surface-variant" title={address}>
          {person ? `${person.title} · ` : ""}
          <span className="tabular">{shortAddress(address)}</span>
        </span>
      )}
    </span>
  );
}

export function Fingerprint({ hex, label }: { hex: string | null | undefined; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!hex) return <span className="text-outline">—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the full value is still in the title.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`${label ? `${label}: ` : ""}${hex} (click to copy)`}
      className="inline-flex items-center gap-1 rounded-sm bg-surface-container-lowest px-space-xs py-space-xxs text-code-num text-secondary tabular hover:text-primary"
    >
      <Icon name={copied ? "check" : "fingerprint"} className="text-[14px]" />
      {shortHex(hex)}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-surface-container p-space-md shadow-sm ${className}`}>{children}</section>;
}

export function SectionTitle({ icon, children, aside }: { icon: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-space-sm flex flex-wrap items-center justify-between gap-space-xs">
      <h2 className="flex items-center gap-space-xs text-title-md text-on-surface">
        <Icon name={icon} className="text-base text-primary" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description: string; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-space-lg flex flex-col justify-between gap-space-md lg:flex-row lg:items-end">
      <div className="flex max-w-3xl flex-col gap-space-xs">
        {eyebrow}
        <h1 className="text-headline-lg text-on-surface max-sm:text-[24px] max-sm:leading-8">{title}</h1>
        <p className="text-body-lg text-on-surface-variant max-sm:text-body-md">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-space-sm">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, icon, hint, accent = "bg-primary", tone = "text-primary" }: { label: string; value: ReactNode; icon: string; hint?: ReactNode; accent?: string; tone?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container p-space-md shadow-sm">
      <div className="flex items-start justify-between gap-space-xs">
        <span className="text-label-md uppercase text-on-surface-variant">{label}</span>
        <span className={`rounded-lg bg-surface-container-high p-space-xs ${tone}`}>
          <Icon name={icon} className="text-base" />
        </span>
      </div>
      <div className="mt-space-sm text-display-lg text-on-surface tabular max-sm:text-[30px] max-sm:leading-9">{value}</div>
      {hint && <div className="mt-space-sm text-body-sm text-on-surface-variant">{hint}</div>}
      <div className={`absolute inset-x-0 bottom-0 h-1 ${accent}`} />
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-space-xs rounded-xl bg-surface-container-low px-space-md py-space-xl text-center">
      <Icon name={icon} className="text-3xl text-outline" />
      <p className="text-title-md text-on-surface">{title}</p>
      {children && <div className="max-w-md text-body-md text-on-surface-variant">{children}</div>}
    </div>
  );
}

type ButtonTone = "primary" | "secondary" | "danger" | "ghost";
const BUTTON_TONE: Record<ButtonTone, string> = {
  primary: "bg-primary-container text-on-primary-container hover:brightness-110",
  secondary: "bg-surface-container-high text-on-surface hover:bg-surface-bright",
  danger: "bg-error/10 text-error hover:bg-error/20",
  ghost: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
};

export function Button({
  tone = "secondary",
  icon,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; icon?: string }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-space-xs rounded-lg px-space-md py-space-sm text-label-md transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${BUTTON_TONE[tone]} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} className="text-base" />}
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-lg bg-surface-container-lowest px-space-sm py-space-sm text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-space-xxs">
      <span className="text-label-sm uppercase text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="text-body-sm text-on-surface-variant">{hint}</span>}
    </label>
  );
}

export function timeAgo(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
