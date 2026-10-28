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
import { loadLocalRecords, saveLocalRecords, type LocalRecords, type TxLogEntry } from "./records";
import { buildSeed } from "./seed";
import type { WriteCall } from "./testnet";

export type Mode = "demo" | "testnet";

type LoadState = "idle" | "loading" | "ready" | "error";

interface Notice {
  id: number;
  tone: "success" | "error";
  text: string;
  /** Testnet: link to the confirmed transaction. */
  txHash?: string;
}

/** A testnet transaction in progress. */
export interface Pending {
  label: string;
  stage: "preparing" | "signing" | "confirming";
}

interface Wallet {
  address: Address | null;
  connecting: boolean;
  connect(): Promise<void>;
  disconnect(): void;
}

interface Store {
  mode: Mode;
  setMode(mode: Mode): void;
  loadState: LoadState;
  loadError: string | null;
  reload(): void;
  chain: ChainState;
  offchain: OffchainState;
  /** Demo: the participant chosen in the header. Testnet: the connected wallet. */
  actor: Person | null;
  setActor(address: Address): void;
  /** Testnet without a connected wallet. */
  readOnly: boolean;
  wallet: Wallet;
  pending: Pending | null;
  /** Testnet transactions confirmed from this browser, newest first. */
  transactions: TxLogEntry[];
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
const WALLET_KEY = "wateruptime-wallet-connected";
const MODE_KEY = "wateruptime-mode";
const now = () => Math.floor(Date.now() / 1000);
const emptyChain: ChainState = { admin: "", reporters: [], waterPoints: {}, jobs: {}, history: {} };
const emptyOffchain: OffchainState = { people: {}, waterPoints: {}, records: {} };

/** Testnet: describe the connected account by what the contract lets it do. */
function walletPerson(address: Address, chain: ChainState, known: Person | undefined): Person {
  if (known) return known;
  const jobs = Object.values(chain.jobs);
  const role: Person["role"] =
    address === chain.admin
      ? "coordinator"
      : chain.reporters.includes(address)
        ? "reporter"
        : jobs.some((j) => j.verifier === address)
          ? "verifier"
          : "technician";
  return { address, name: "Connected wallet", role, title: "Freighter account" };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Convenience only.
  }
}

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
  const [mode, setModeState] = useState<Mode>(() => (readStorage(MODE_KEY) === "testnet" ? "testnet" : "demo"));
  const setMode = (m: Mode) => {
    setModeState(m);
    writeStorage(MODE_KEY, m);
  };
  const [demo, setDemo] = useState<DemoSnapshot>(loadDemo);
  const [live, setLive] = useState<{ chain: ChainState; offchain: OffchainState } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("ready");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  // Whether this browser chose to use a wallet; survives reloads.
  const [walletLinked, setWalletLinked] = useState(() => readStorage(WALLET_KEY) === "1");
  const [pending, setPending] = useState<Pending | null>(null);
  const [local, setLocal] = useState<LocalRecords>(loadLocalRecords);
  // Actions await fingerprinting before applying, so read the latest state.
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const localRef = useRef(local);
  localRef.current = local;

  useEffect(() => saveDemo(demo), [demo]);
  useEffect(() => saveLocalRecords(local), [local]);

  const loadOptions = useCallback(
    () => ({ waterPointIds: Object.keys(localRef.current.waterPoints), accounts: walletAddress ? [walletAddress] : [] }),
    [walletAddress],
  );

  useEffect(() => {
    if (mode !== "testnet") {
      setLoadState("ready");
      return;
    }
    let cancelled = false;
    // Keep showing the current data while refreshing after a transaction.
    if (!live) setLoadState("loading");
    setLoadError(null);
    // Load the Stellar SDK only when testnet mode is used.
    import("./testnet")
      .then((m) => m.loadTestnet(loadOptions()))
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
    // `live` is only read to decide whether to show the loading state.
  }, [mode, reloadKey, loadOptions]);

  // Testnet: reconnect silently if this browser connected before, and follow
  // account switches made in Freighter.
  useEffect(() => {
    if (mode !== "testnet" || !walletLinked) return;
    const sync = () =>
      import("./wallet")
        .then((w) => w.currentAddress())
        .then((a) => setWalletAddress(a || null))
        .catch(() => setWalletAddress(null));
    void sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, [mode, walletLinked]);

  const notify = useCallback((tone: Notice["tone"], text: string, txHash?: string) => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n.slice(-2), { id, tone, text, txHash }]);
    window.setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), txHash ? 15000 : 6000);
  }, []);

  const wallet: Wallet = {
    address: walletAddress,
    connecting,
    async connect() {
      setConnecting(true);
      try {
        const w = await import("./wallet");
        const address = await w.connectWallet();
        setWalletAddress(address);
        setWalletLinked(true);
        writeStorage(WALLET_KEY, "1");
      } catch (e) {
        notify("error", e instanceof Error ? e.message : String(e));
      } finally {
        setConnecting(false);
      }
    },
    disconnect() {
      // Freighter keeps the site's permission; this only stops using the account here.
      setWalletAddress(null);
      setWalletLinked(false);
      writeStorage(WALLET_KEY, null);
    },
  };

  /**
   * Testnet: sign with the wallet, submit, wait for confirmation, then reload
   * on-chain state so the interface shows what the contract recorded.
   */
  const send = useCallback(
    async (label: string, call: WriteCall, saved: Partial<Pick<LocalRecords, "records" | "waterPoints">> = {}): Promise<{ ok: boolean; value?: unknown }> => {
      if (!walletAddress) {
        notify("error", "Connect a wallet to sign testnet transactions.");
        return { ok: false };
      }
      setPending({ label, stage: "preparing" });
      try {
        const [t, w] = await Promise.all([import("./testnet"), import("./wallet")]);
        const receipt = await t.invoke(call, walletAddress, w.signWithWallet, (stage) => setPending({ label, stage }));
        const entry: TxLogEntry = { hash: receipt.hash, label, signer: walletAddress, at: now() };
        const next: LocalRecords = {
          records: { ...localRef.current.records, ...saved.records },
          waterPoints: { ...localRef.current.waterPoints, ...saved.waterPoints },
          transactions: [entry, ...localRef.current.transactions].slice(0, 50),
        };
        localRef.current = next;
        setLocal(next);
        const data = await t.loadTestnet({ waterPointIds: Object.keys(next.waterPoints), accounts: [walletAddress] });
        setLive(data);
        notify("success", `${label} Confirmed on Stellar testnet.`, receipt.hash);
        return { ok: true, value: receipt.value };
      } catch (e) {
        notify("error", e instanceof Error ? e.message : "The transaction failed. Please try again.");
        return { ok: false };
      } finally {
        setPending(null);
      }
    },
    [walletAddress, notify],
  );

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
        notify("success", `${label} Simulated in your browser; nothing was sent on-chain.`);
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


  const isDemo = mode === "demo";
  const actorAddress = isDemo ? demo.actor : walletAddress;

  const actions: Store["actions"] = {
    async reportFault(waterPointId, record) {
      const full: OffchainRecord = { kind: "fault", ...record };
      const ref = await withRecord(full);
      if (!isDemo) {
        const r = await send("Fault reported.", {
          method: "report_fault",
          args: { reporter: actorAddress!, water_point_id: waterPointId, fault_reference: ref },
        }, { records: { [ref]: full } });
        return r.ok ? Number(r.value) : null;
      }
      let jobId: number | null = null;
      const ok = await run("Fault reported.", (s) => {
        const out = wf.reportFault(s.chain, s.actor, waterPointId, ref, now());
        jobId = out.jobId;
        return {
          ...s,
          chain: out.state,
          offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: full } },
        };
      });
      return ok ? jobId : null;
    },
    async assign(jobId, technician, verifier) {
      const label = `Job #${jobId} assigned.`;
      if (!isDemo) return (await send(label, { method: "assign_job", args: { job_id: jobId, technician, verifier } })).ok;
      return run(label, (s) => ({
        ...s,
        chain: wf.assignJob(s.chain, s.actor, jobId, technician, verifier, now()),
      }));
    },
    async submitRepair(jobId, summary, detail) {
      const record: OffchainRecord = { kind: "repair", summary, detail };
      const ref = await withRecord(record);
      const label = `Repair evidence submitted for job #${jobId}.`;
      if (!isDemo) {
        return (await send(label, {
          method: "submit_repair",
          args: { technician: actorAddress!, job_id: jobId, repair_reference: ref },
        }, { records: { [ref]: record } })).ok;
      }
      return run(label, (s) => ({
        chain: wf.submitRepair(s.chain, s.actor, jobId, ref, now()),
        offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: record } },
        actor: s.actor,
      }));
    },
    async verify(jobId, approved, summary, category) {
      const record: OffchainRecord = { kind: "verification", summary, category };
      const ref = await withRecord(record);
      const label = approved ? `Repair approved for job #${jobId}. The coordinator can now close it.` : `Job #${jobId} returned for rework.`;
      if (!isDemo) {
        return (await send(label, {
          method: "verify_repair",
          args: { verifier: actorAddress!, job_id: jobId, verification_reference: ref, approved },
        }, { records: { [ref]: record } })).ok;
      }
      return run(label, (s) => ({
        chain: wf.verifyRepair(s.chain, s.actor, jobId, ref, approved, now()),
        offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: record } },
        actor: s.actor,
      }));
    },
    async close(jobId) {
      const label = `Job #${jobId} closed.`;
      if (!isDemo) return (await send(label, { method: "close_job", args: { job_id: jobId } })).ok;
      return run(label, (s) => ({ ...s, chain: wf.closeJob(s.chain, s.actor, jobId, now()) }));
    },
    async cancel(jobId, reason) {
      const record: OffchainRecord = { kind: "cancellation", summary: reason };
      const ref = await withRecord(record);
      const label = `Job #${jobId} cancelled.`;
      if (!isDemo) {
        return (await send(label, { method: "cancel_job", args: { job_id: jobId, reason_reference: ref } }, { records: { [ref]: record } })).ok;
      }
      return run(label, (s) => ({
        chain: wf.cancelJob(s.chain, s.actor, jobId, ref, now()),
        offchain: { ...s.offchain, records: { ...s.offchain.records, [ref]: record } },
        actor: s.actor,
      }));
    },
    async registerWaterPoint(meta) {
      const record: OffchainRecord = { kind: "metadata", summary: `${meta.name}, ${meta.locality}` };
      const metaHash = await withRecord(record);
      const id = randomId();
      const label = `${meta.code} registered.`;
      if (!isDemo) {
        return (await send(label, { method: "register_water_point", args: { water_point_id: id, metadata_hash: metaHash } }, {
          records: { [metaHash]: record },
          waterPoints: { [id]: meta },
        })).ok;
      }
      return run(label, (s) => ({
        chain: wf.registerWaterPoint(s.chain, s.actor, id, metaHash),
        offchain: {
          ...s.offchain,
          waterPoints: { ...s.offchain.waterPoints, [id]: meta },
          records: { ...s.offchain.records, [metaHash]: record },
        },
        actor: s.actor,
      }));
    },
    async setWaterPointActive(id, active) {
      const label = active ? "Water point reactivated." : "Water point deactivated.";
      if (!isDemo) return (await send(label, { method: "set_water_point_active", args: { water_point_id: id, active } })).ok;
      return run(label, (s) => ({
        ...s,
        chain: wf.setWaterPointActive(s.chain, s.actor, id, active),
      }));
    },
  };

  const liveData = live ?? { chain: emptyChain, offchain: emptyOffchain };
  const walletActor =
    walletAddress && !isDemo ? walletPerson(walletAddress, liveData.chain, liveData.offchain.people[walletAddress]) : null;
  // Testnet: merge in records this browser created, and show the wallet as a person.
  const data = isDemo
    ? demo
    : {
        chain: liveData.chain,
        offchain: {
          people: walletActor ? { ...liveData.offchain.people, [walletActor.address]: walletActor } : liveData.offchain.people,
          waterPoints: { ...liveData.offchain.waterPoints, ...local.waterPoints },
          records: { ...liveData.offchain.records, ...local.records },
        },
      };

  const value: Store = {
    mode,
    setMode,
    loadState,
    loadError,
    reload: () => setReloadKey((k) => k + 1),
    chain: data.chain,
    offchain: data.offchain,
    actor: isDemo ? (demo.offchain.people[demo.actor] ?? null) : walletActor,
    setActor: (address) => setDemo((s) => ({ ...s, actor: address })),
    readOnly: !isDemo && !walletAddress,
    wallet,
    pending,
    transactions: local.transactions,
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
