// Loader and writer for the testnet deployment. Reads are simulated and need
// no wallet. Writes are signed in Freighter (see wallet.ts) and submitted.
// Off-chain records are not on-chain, so the UI shows fingerprints unless this
// browser created the record (see records.ts).

import { contract } from "@stellar/stellar-sdk";
import { messageForCode } from "../domain/errors";
import { bytesToHex } from "../domain/hash";
import { TESTNET } from "./config";
import { WalletError } from "./wallet";
import type {
  Address,
  AuditEntry,
  ChainState,
  Hex32,
  JobAction,
  JobStatus,
  MaintenanceJob,
  OffchainState,
  Person,
  WaterPoint,
} from "../domain/types";


/** Synthetic role accounts from docs/TESTNET.md in the contract repo. */
export const KNOWN_ACCOUNTS: Person[] = [
  { address: "GAVHHQY6RP2VDVLJA2JQGS2ZCIUYWBEZK6P5J64F5VSHSEHXZTM6IXM5", name: "Testnet coordinator", role: "coordinator", title: "Synthetic admin account" },
  { address: "GBA3CLHHBT6454VSCZZQ5AQ4P6K453K3AJLHOFOEBH4VVBJOUK7MSS7H", name: "Testnet reporter", role: "reporter", title: "Synthetic reporter account" },
  { address: "GDPTFRPXBAXJXDUVXIAK3TEWBMW26MN4CKXFJYSOGJ4U477YMVCYCWPA", name: "Testnet technician", role: "technician", title: "Synthetic technician account" },
  { address: "GDNCUBP3ZHREJ4QGWUGJQH4DWGQVL6T5AKKU3YV65XCNN72AF5LIMILZ", name: "Testnet verifier", role: "verifier", title: "Synthetic verifier account" },
];

// Shapes returned by the SDK's spec-driven decoding.
type Tagged<T extends string> = { tag: T };
type Bytes = Uint8Array;
interface RawJob {
  id: bigint;
  water_point_id: Bytes;
  reporter: string;
  fault_reference: Bytes;
  status: Tagged<JobStatus>;
  technician: string | null | undefined;
  verifier: string | null | undefined;
  repair_reference: Bytes | null | undefined;
  verification_reference: Bytes | null | undefined;
  created_at: bigint;
  updated_at: bigint;
}
interface RawEntry {
  action: Tagged<JobAction>;
  actor: string;
  reference: Bytes | null | undefined;
  timestamp: bigint;
}
interface RawWaterPoint {
  id: Bytes;
  metadata_hash: Bytes;
  active: boolean;
  registered_by: string;
  open_job: bigint | null | undefined;
}
interface Result<T> {
  isOk(): boolean;
  unwrap(): T;
}
interface Call<T> {
  result: T;
}
interface WaterUptimeClient {
  get_admin(): Promise<Call<Result<string>>>;
  job_count(): Promise<Call<bigint>>;
  is_reporter(a: { reporter: string }): Promise<Call<boolean>>;
  get_job(a: { job_id: bigint }): Promise<Call<Result<RawJob>>>;
  get_job_history(a: { job_id: bigint }): Promise<Call<Result<RawEntry[]>>>;
  get_water_point(a: { water_point_id: Buffer | Uint8Array }): Promise<Call<Result<RawWaterPoint>>>;
}

type Signer = (xdr: string, address: string) => Promise<{ signedTxXdr: string; signerAddress: string }>;

const hexOrNull = (b: Bytes | null | undefined): Hex32 | null => (b ? bytesToHex(b) : null);
const hexToBytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map((x) => parseInt(x, 16)));

function toJob(r: RawJob): MaintenanceJob {
  return {
    id: Number(r.id),
    waterPointId: bytesToHex(r.water_point_id),
    reporter: r.reporter,
    faultReference: bytesToHex(r.fault_reference),
    status: r.status.tag,
    technician: r.technician ?? null,
    verifier: r.verifier ?? null,
    repairReference: hexOrNull(r.repair_reference),
    verificationReference: hexOrNull(r.verification_reference),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

let clientPromise: Promise<WaterUptimeClient> | null = null;

function client(): Promise<WaterUptimeClient> {
  clientPromise ??= contract.Client.from({
    contractId: TESTNET.contractId,
    networkPassphrase: TESTNET.networkPassphrase,
    rpcUrl: TESTNET.rpcUrl,
  }).then((c) => c as unknown as WaterUptimeClient);
  return clientPromise;
}

export interface LoadOptions {
  /** Water points this browser knows about, e.g. ones it registered. */
  waterPointIds?: Hex32[];
  /** Extra accounts to check for reporter rights, e.g. the connected wallet. */
  accounts?: Address[];
}

export async function loadTestnet(opts: LoadOptions = {}): Promise<{ chain: ChainState; offchain: OffchainState }> {
  const c = await client();
  const [admin, count] = await Promise.all([c.get_admin(), c.job_count()]);
  const total = Number(count.result);

  const ids = Array.from({ length: total }, (_, i) => BigInt(i + 1));
  const [jobResults, historyResults] = await Promise.all([
    Promise.all(ids.map((job_id) => c.get_job({ job_id }))),
    Promise.all(ids.map((job_id) => c.get_job_history({ job_id }))),
  ]);

  const jobs: Record<number, MaintenanceJob> = {};
  const history: Record<number, AuditEntry[]> = {};
  jobResults.forEach((r, i) => {
    if (!r.result.isOk()) return;
    const job = toJob(r.result.unwrap());
    jobs[job.id] = job;
    const h = historyResults[i]!.result;
    history[job.id] = h.isOk()
      ? h.unwrap().map((e) => ({
          action: e.action.tag,
          actor: e.actor,
          reference: hexOrNull(e.reference),
          timestamp: Number(e.timestamp),
        }))
      : [];
  });

  // Water points are not enumerable on-chain (see contract issue #4), so load
  // the ones referenced by jobs.
  const pointIds = [...new Set([...Object.values(jobs).map((j) => j.waterPointId), ...(opts.waterPointIds ?? [])])];
  const pointResults = await Promise.all(
    pointIds.map((id) => c.get_water_point({ water_point_id: hexToBytes(id) })),
  );
  const waterPoints: Record<Hex32, WaterPoint> = {};
  for (const r of pointResults) {
    if (!r.result.isOk()) continue;
    const p = r.result.unwrap();
    const id = bytesToHex(p.id);
    waterPoints[id] = {
      id,
      metadataHash: bytesToHex(p.metadata_hash),
      active: p.active,
      registeredBy: p.registered_by,
      openJob: p.open_job == null ? null : Number(p.open_job),
    };
  }

  const candidates = [...new Set([...KNOWN_ACCOUNTS.map((p) => p.address), ...(opts.accounts ?? [])])];
  const reporterChecks = await Promise.all(
    candidates.map(async (a) => ((await c.is_reporter({ reporter: a })).result ? a : null)),
  );

  return {
    chain: {
      admin: admin.result.isOk() ? admin.result.unwrap() : "",
      reporters: reporterChecks.filter((a): a is Address => a !== null),
      waterPoints,
      jobs,
      history,
    },
    offchain: {
      people: Object.fromEntries(KNOWN_ACCOUNTS.map((p) => [p.address, p])),
      waterPoints: {},
      records: {},
    },
  };
}

// ---- Writes ----

/** Contract methods the app can call, with the SDK's argument shapes. */
export type WriteCall =
  | { method: "report_fault"; args: { reporter: Address; water_point_id: Hex32; fault_reference: Hex32 } }
  | { method: "assign_job"; args: { job_id: number; technician: Address; verifier: Address } }
  | { method: "submit_repair"; args: { technician: Address; job_id: number; repair_reference: Hex32 } }
  | { method: "verify_repair"; args: { verifier: Address; job_id: number; verification_reference: Hex32; approved: boolean } }
  | { method: "close_job"; args: { job_id: number } }
  | { method: "cancel_job"; args: { job_id: number; reason_reference: Hex32 } }
  | { method: "register_water_point"; args: { water_point_id: Hex32; metadata_hash: Hex32 } }
  | { method: "set_water_point_active"; args: { water_point_id: Hex32; active: boolean } };

export interface Receipt {
  hash: string;
  /** Decoded return value, e.g. the new job ID from report_fault. */
  value: unknown;
}

/** Convert app-side values (hex strings, numbers) to the SDK's types. */
function toSdkArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => {
      if (k === "job_id") return [k, BigInt(v as number)];
      if (typeof v === "string" && /^[0-9a-f]{64}$/.test(v)) return [k, hexToBytes(v)];
      return [k, v];
    }),
  );
}

/** Pull a contract error code out of a simulation or submission error. */
export function contractErrorCode(text: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(text);
  return m ? Number(m[1]) : null;
}

export class ChainError extends Error {}

function failure(text: string): Error {
  const code = contractErrorCode(text);
  return code !== null ? new ChainError(messageForCode(code)) : new ChainError(text.split("\n")[0] || "The transaction failed.");
}

/**
 * Simulate, sign in the wallet, submit and wait for the transaction to be
 * confirmed in a ledger. Throws ChainError with a plain-language message.
 * The SDK signs as the source account, which also authorises the contract's
 * `require_auth` for that address; no separate auth-entry signature is needed.
 */
export async function invoke(
  call: WriteCall,
  address: Address,
  sign: Signer,
  onStage?: (stage: "signing" | "confirming") => void,
): Promise<Receipt> {
  const c = await contract.Client.from({
    contractId: TESTNET.contractId,
    networkPassphrase: TESTNET.networkPassphrase,
    rpcUrl: TESTNET.rpcUrl,
    publicKey: address,
    signTransaction: (xdr: string) => sign(xdr, address),
  });
  const method = (c as unknown as Record<string, (a: unknown) => Promise<contract.AssembledTransaction<unknown>>>)[call.method]!;
  let tx: contract.AssembledTransaction<unknown>;
  try {
    tx = await method(toSdkArgs(call.args));
  } catch (e) {
    throw failure(e instanceof Error ? e.message : String(e));
  }
  const sim = tx.simulation as { error?: string } | undefined;
  if (sim?.error) throw failure(sim.error);

  let sent: contract.SentTransaction<unknown>;
  try {
    onStage?.("signing");
    await tx.sign();
    onStage?.("confirming");
    // Submits, then polls until the transaction is in a ledger.
    sent = await tx.send();
  } catch (e) {
    // The wallet's own errors are already readable.
    if (e instanceof WalletError) throw e;
    throw failure(e instanceof Error ? e.message : String(e));
  }
  const hash =
    sent.sendTransactionResponse?.hash ??
    (sent.getTransactionResponse as { txHash?: string } | undefined)?.txHash ??
    "";
  const result = sent.result;
  if (result && typeof result === "object" && "isOk" in result) {
    const r = result as Result<unknown>;
    if (!r.isOk()) throw new ChainError(`The contract rejected transaction ${hash}.`);
    return { hash, value: r.unwrap() };
  }
  return { hash, value: result };
}
