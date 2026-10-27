import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WorkflowError } from "../domain/errors";
import { fingerprint, randomId } from "../domain/hash";
import type {
  Address,
  ChainState,
  Hex32,
  OffchainRecord,
  OffchainState,
  Person,
  WaterPointMeta,
} from "../domain/types";
import * as wf from "../domain/workflow";
import { buildSeed } from "./seed";

export type Mode = "demo" | "testnet";

type LoadState = "idle" | "loading" | "ready" | "error";

interface Notice {
  id: number;
  tone: "success" | "error";
  text: string;
}

interface Store {
  mode: Mode;
  setMode(mode: Mode): void;
  loadState: LoadState;
  loadError: string | null;
  reload(): void;
  chain: ChainState;
  offchain: OffchainState;
  /** Demo mode: the person whose role the viewer is acting as. */
  actor: Person | null;
  setActor(address: Address): void;
  readOnly: boolean;
  notices: Notice[];
  dismiss(id: number): void;
  resetDemo(): void;
  actions: {
    reportFault(waterPointId: Hex32, record: Omit<OffchainRecord, "kind">): Promise<number | null>;
    assign(jobId: number, technician: Address, verifier: Address): Promise<boolean>;
    submitRepair(jobId: number, summary: string, detail?: string): Promise<boolean>;
    verify(jobId: number, approved: boolean, summary: string, category?: string): Promise<boolean>;
    close(jobId: number): Promise<boolean>;
    cancel(jobId: number, reason: string): Promise<boolean>;
    registerWaterPoint(meta: WaterPointMeta): Promise<boolean>;
    setWaterPointActive(id: Hex32, active: boolean): Promise<boolean>;
  };
}

const StoreContext = createContext<Store | null>(null);

const STORAGE_KEY = "wateruptime-demo-v1";
const now = () => Math.floor(Date.now() / 1000);
const emptyChain: ChainState = { admin: "", reporters: [], waterPoints: {}, jobs: {}, history: {} };
const emptyOffchain: OffchainState = { people: {}, waterPoints: {}, records: {} };

interface DemoSnapshot {
  chain: ChainState;
  offchain: OffchainState;
  actor: Address;
}

function loadDemo(): DemoSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DemoSnapshot;
  } catch {
    // Storage unavailable or corrupt: fall back to a fresh seed.
  }
  const seed = buildSeed(now());
  return { ...seed, actor: seed.chain.admin };
}

function saveDemo(snapshot: DemoSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Persistence is a convenience only.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("demo");
  const [demo, setDemo] = useState<DemoSnapshot>(loadDemo);
  const [live, setLive] = useState<{ chain: ChainState; offchain: OffchainState } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("ready");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // Actions await fingerprinting before applying, so read the latest state.
  const demoRef = useRef(demo);
  demoRef.current = demo;

  useEffect(() => saveDemo(demo), [demo]);

  useEffect(() => {
    if (mode !== "testnet") {
      setLoadState("ready");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);
    // Load the Stellar SDK only when testnet mode is used.
    import("./testnet")
      .then((m) => m.loadTestnet())
      .then((data) => {
        if (cancelled) return;
        setLive(data);
        setLoadState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, reloadKey]);

  const notify = useCallback((tone: Notice["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);

  const run = useCallback(
    async (
      label: string,
      apply: (s: DemoSnapshot) => DemoSnapshot,
    ): Promise<boolean> => {
      try {
        // Apply to the latest snapshot so workflow errors surface here, then commit.
        const next = apply(demoRef.current);
        demoRef.current = next;
        setDemo(next);
        notify("success", label);
        return true;
      } catch (e) {
        notify("error", e instanceof WorkflowError ? e.message : "Something went wrong. Please try again.");
        return false;
      }
    },
    [notify],
  );

  const withRecord = async (record: OffchainRecord) => {
    const { hash } = await fingerprint(JSON.stringify(record));
    return hash;
  };


  const actions: Store["actions"] = {
    async reportFault(waterPointId, record) {
      const ref = await withRecord({ kind: "fault", ...record });
      let jobId: number | null = null;
      const ok = await run("Fault reported.", (s) => {
        const out = wf.reportFault(s.chain, s.actor, waterPointId, ref, now());
        jobId = out.jobId;
        return {
          ...s,
          chain: out.state,
          offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: { kind: "fault", ...record } } },
        };
      });
      return ok ? jobId : null;
    },
    assign: (jobId, technician, verifier) =>
      run(`Job #${jobId} assigned.`, (s) => ({
        ...s,
        chain: wf.assignJob(s.chain, s.actor, jobId, technician, verifier, now()),
      })),
    async submitRepair(jobId, summary, detail) {
      const record: OffchainRecord = { kind: "repair", summary, detail };
      const ref = await withRecord(record);
      return run(`Repair evidence submitted for job #${jobId}.`, (s) => ({
        chain: wf.submitRepair(s.chain, s.actor, jobId, ref, now()),
        offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: record } },
        actor: s.actor,
      }));
    },
    async verify(jobId, approved, summary, category) {
      const record: OffchainRecord = { kind: "verification", summary, category };
      const ref = await withRecord(record);
      return run(
        approved ? `Repair approved for job #${jobId}. The coordinator can now close it.` : `Job #${jobId} returned for rework.`,
        (s) => ({
          chain: wf.verifyRepair(s.chain, s.actor, jobId, ref, approved, now()),
          offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: record } },
          actor: s.actor,
        }),
      );
    },
    close: (jobId) =>
      run(`Job #${jobId} closed.`, (s) => ({ ...s, chain: wf.closeJob(s.chain, s.actor, jobId, now()) })),
    async cancel(jobId, reason) {
      const record: OffchainRecord = { kind: "cancellation", summary: reason };
      const ref = await withRecord(record);
      return run(`Job #${jobId} cancelled.`, (s) => ({
        chain: wf.cancelJob(s.chain, s.actor, jobId, ref, now()),
        offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: record } },
        actor: s.actor,
      }));
    },
    async registerWaterPoint(meta) {
      const record: OffchainRecord = { kind: "metadata", summary: `${meta.name}, ${meta.locality}` };
      const metaHash = await withRecord(record);
      const id = randomId();
      return run(`${meta.code} registered.`, (s) => ({
        chain: wf.registerWaterPoint(s.chain, s.actor, id, metaHash),
        offchain: {
          ...s.offchain,
          waterPoints: { ...s.offchain.waterPoints, [id]: meta },
          records: { ...s.offchain.records, [metaHash]: record },
        },
        actor: s.actor,
      }));
    },
    setWaterPointActive: (id, active) =>
      run(active ? "Water point reactivated." : "Water point deactivated.", (s) => ({
        ...s,
        chain: wf.setWaterPointActive(s.chain, s.actor, id, active),
      })),
  };

  const isDemo = mode === "demo";
  const data = isDemo ? demo : (live ?? { chain: emptyChain, offchain: emptyOffchain });

  const value: Store = {
    mode,
    setMode,
    loadState,
    loadError,
    reload: () => setReloadKey((k) => k + 1),
    chain: data.chain,
    offchain: data.offchain,
    actor: isDemo ? (demo.offchain.people[demo.actor] ?? null) : null,
    setActor: (address) => setDemo((s) => ({ ...s, actor: address })),
    readOnly: !isDemo,
    notices,
    dismiss: (id) => setNotices((n) => n.filter((x) => x.id !== id)),
    resetDemo: () => {
      const seed = buildSeed(now());
      setDemo({ ...seed, actor: seed.chain.admin });
      notify("success", "Demo data reset.");
    },
    actions,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/** Convenience selectors used across pages. */
export function useDerived() {
  const { chain, offchain } = useStore();
  return useMemo(() => {
    const jobs = Object.values(chain.jobs).sort((a, b) => b.updatedAt - a.updatedAt);
    const points = Object.values(chain.waterPoints);
    const person = (a: Address | null | undefined) => (a ? offchain.people[a] : undefined);
    const pointMeta = (id: Hex32) => offchain.waterPoints[id];
    const record = (h: Hex32 | null | undefined) => (h ? offchain.records[h] : undefined);
    const peopleByRole = (role: Person["role"]) => Object.values(offchain.people).filter((p) => p.role === role);
    return { jobs, points, person, pointMeta, record, peopleByRole };
  }, [chain, offchain]);
}
