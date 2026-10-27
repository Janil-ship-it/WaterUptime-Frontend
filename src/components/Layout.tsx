import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { TESTNET } from "../data/config";
import { shortAddress } from "../domain/hash";
import type { Role } from "../domain/types";
import { Button, EmptyState, Icon } from "./ui";

const NAV = [
  { to: "/", label: "Overview", icon: "dashboard", end: true },
  { to: "/water-points", label: "Water points", icon: "water_drop" },
  { to: "/jobs", label: "Maintenance jobs", icon: "build" },
  { to: "/verification", label: "Verification", icon: "verified" },
];

const ROLE_LABEL: Record<Role, string> = {
  coordinator: "Coordinator",
  reporter: "Reporter",
  technician: "Technician",
  verifier: "Verifier",
};

function useVerificationCount() {
  const { chain } = useStore();
  return Object.values(chain.jobs).filter((j) => j.status === "RepairSubmitted").length;
}

function ModeSwitch() {
  const { mode, setMode } = useStore();
  return (
    <div role="radiogroup" aria-label="Data source" className="flex rounded-lg bg-surface-container p-space-xxs">
      {(["demo", "testnet"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`rounded-lg px-space-sm py-space-xs text-label-sm uppercase transition-colors ${
            mode === m ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          {m === "demo" ? "Demo data" : "Testnet"}
        </button>
      ))}
    </div>
  );
}

function ActorSwitch() {
  const { actor, setActor, offchain, readOnly } = useStore();
  if (readOnly) {
    return (
      <span className="hidden items-center gap-space-xs rounded-lg bg-surface-container px-space-sm py-space-xs text-label-sm text-on-surface-variant sm:inline-flex">
        <Icon name="visibility" className="text-base text-secondary" />
        Read-only
      </span>
    );
  }
  const people = Object.values(offchain.people);
  return (
    <label className="flex items-center gap-space-xs rounded-lg border-t-2 border-primary bg-surface-container px-space-sm py-space-xxs">
      <Icon name="badge" className="text-base text-secondary" />
      <span className="flex flex-col">
        <span className="text-label-sm uppercase text-primary">Acting as {actor ? ROLE_LABEL[actor.role].toLowerCase() : ""}</span>
        <select
          aria-label="Act as demo participant"
          value={actor?.address ?? ""}
          onChange={(e) => setActor(e.target.value)}
          className="max-w-[160px] cursor-pointer appearance-none bg-transparent text-label-md text-on-surface focus:outline-none"
        >
          {(["coordinator", "reporter", "technician", "verifier"] as Role[]).map((role) => (
            <optgroup key={role} label={ROLE_LABEL[role]}>
              {people
                .filter((p) => p.role === role)
                .map((p) => (
                  <option key={p.address} value={p.address}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </span>
      <Icon name="unfold_more" className="text-base text-on-surface-variant" />
    </label>
  );
}

function Header() {
  const navigate = useNavigate();
  const { actor, chain, readOnly } = useStore();
  const canReport = !readOnly && !!actor && chain.reporters.includes(actor.address);
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-space-sm border-b border-surface-variant bg-surface-container-low/90 px-gutter backdrop-blur-xl lg:px-gutter-desktop">
      <div className="flex min-w-0 items-center gap-space-md">
        <NavLink to="/" className="flex items-center gap-space-sm">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="flex flex-col">
            <span className="text-title-md font-bold tracking-tight">WaterUptime</span>
            <span className="hidden text-body-sm text-on-surface-variant xl:block">Every repair tracked. Every outcome verified.</span>
          </span>
        </NavLink>
        <div className="hidden md:block">
          <ModeSwitch />
        </div>
      </div>
      <div className="flex items-center gap-space-sm">
        <ActorSwitch />
        {canReport && (
          <Button tone="primary" icon="add_circle" onClick={() => navigate("/report")} className="max-sm:px-space-sm">
            <span className="hidden sm:inline">Report a fault</span>
          </Button>
        )}
      </div>
    </header>
  );
}

function Sidebar() {
  const pending = useVerificationCount();
  const { mode, resetDemo } = useStore();
  return (
    <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-64 flex-col justify-between border-r border-surface-variant bg-surface-container-low lg:flex">
      <nav className="flex flex-col gap-space-xxs px-space-xs py-space-md" aria-label="Main">
        <span className="px-space-sm pb-space-sm text-label-sm uppercase text-on-surface-variant">Navigation</span>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center justify-between rounded-lg px-space-sm py-space-sm transition-colors ${
                isActive
                  ? "border-l-2 border-primary bg-surface-container-high text-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`
            }
          >
            <span className="flex items-center gap-space-sm">
              <Icon name={item.icon} className="text-base" />
              <span className="text-label-md">{item.label}</span>
            </span>
            {item.to === "/verification" && pending > 0 && (
              <span className="rounded-full bg-secondary-container px-space-xs py-space-xxs text-label-sm text-on-secondary-container">{pending} pending</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-space-xs border-t border-surface-variant bg-surface-container-lowest/60 p-space-md text-label-sm text-on-surface-variant">
        {mode === "testnet" ? (
          <>
            <span className="flex items-center gap-space-xs">
              <span className="h-2 w-2 rounded-full bg-primary" /> Stellar testnet
            </span>
            <a
              href={`https://lab.stellar.org/r/testnet/contract/${TESTNET.contractId}`}
              target="_blank"
              rel="noreferrer"
              className="tabular text-secondary hover:underline"
              title={TESTNET.contractId}
            >
              Contract {shortAddress(TESTNET.contractId)}
            </a>
          </>
        ) : (
          <button type="button" onClick={resetDemo} className="flex items-center gap-space-xs text-left hover:text-on-surface">
            <Icon name="restart_alt" className="text-base" /> Reset demo data
          </button>
        )}
        <span className="flex justify-between border-t border-surface-variant/50 pt-space-xs">
          <span>Open-source prototype</span>
          <span className="tabular text-secondary">v0.1.0</span>
        </span>
      </div>
    </aside>
  );
}

function BottomNav() {
  const pending = useVerificationCount();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-surface-variant bg-surface-container-low lg:hidden">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-space-xxs py-space-sm text-label-sm ${isActive ? "text-primary" : "text-on-surface-variant"}`
          }
        >
          <Icon name={item.icon} className="text-xl" />
          <span className="truncate">{item.label.split(" ")[0]}</span>
          {item.to === "/verification" && pending > 0 && (
            <span className="absolute right-1/4 top-1 h-2 w-2 rounded-full bg-primary" aria-label={`${pending} pending`} />
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function PrototypeBanner() {
  const { mode } = useStore();
  return (
    <div className="mb-space-lg flex flex-col gap-space-sm rounded-lg bg-surface-container-high px-space-md py-space-sm text-body-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-space-xs">
        <Icon name="science" className="mt-px text-base text-primary" />
        {mode === "demo" ? (
          <span>
            <strong className="text-on-surface">Prototype with synthetic demo data.</strong> All people and facilities are fictional. Actions run
            the contract's rules in your browser; nothing is sent on-chain.
          </span>
        ) : (
          <span>
            <strong className="text-on-surface">Live Stellar testnet, read-only.</strong> On-chain state only; descriptions and evidence live
            off-chain and are shown as fingerprints. Wallet signing is not built yet.
          </span>
        )}
      </span>
      <div className="md:hidden">
        <ModeSwitch />
      </div>
    </div>
  );
}

function Notices() {
  const { notices, dismiss } = useStore();
  return (
    <div aria-live="polite" className="fixed bottom-20 right-space-md z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-space-xs lg:bottom-space-md">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.tone === "error" ? "alert" : "status"}
          className={`flex items-start gap-space-sm rounded-lg p-space-sm text-body-md shadow-lg ${
            n.tone === "error" ? "bg-error-container text-on-error-container" : "bg-surface-container-highest text-on-surface"
          }`}
        >
          <Icon name={n.tone === "error" ? "error" : "check_circle"} className={n.tone === "error" ? "" : "text-primary"} />
          <span className="flex-1">{n.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(n.id)} className="opacity-70 hover:opacity-100">
            <Icon name="close" className="text-base" />
          </button>
        </div>
      ))}
    </div>
  );
}

function LiveGate() {
  const { mode, loadState, loadError, reload } = useStore();
  if (mode !== "testnet") return <Outlet />;
  if (loadState === "loading" || loadState === "idle") {
    return (
      <div className="flex flex-col gap-space-md" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container" />
        ))}
        <span className="sr-only">Loading testnet data…</span>
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <EmptyState icon="cloud_off" title="Could not reach Stellar testnet">
        <p>{loadError}</p>
        <Button className="mt-space-md" icon="refresh" onClick={reload}>
          Try again
        </Button>
      </EmptyState>
    );
  }
  return <Outlet />;
}

export function Layout() {
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-space-sm focus:rounded-lg focus:bg-primary focus:p-space-sm focus:text-on-primary">
        Skip to content
      </a>
      <Header />
      <Sidebar />
      <main id="main" className="px-gutter pb-28 pt-20 lg:pb-space-xl lg:pl-[calc(16rem+1.5rem)] lg:pr-gutter-desktop lg:pt-[5.5rem]">
        <PrototypeBanner />
        <LiveGate />
      </main>
      <BottomNav />
      <Notices />
    </div>
  );
}
