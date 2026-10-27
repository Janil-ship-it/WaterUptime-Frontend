// Read-only loader for the shared testnet deployment. No wallet needed: read
// calls are simulated, never submitted. Off-chain records are not available
// here, so the UI shows fingerprints instead of descriptions.

import { contract } from "@stellar/stellar-sdk";
import { bytesToHex } from "../domain/hash";
import { TESTNET } from "./config";
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
const KNOWN_ACCOUNTS: Person[] = [
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

export async function loadTestnet(): Promise<{ chain: ChainState; offchain: OffchainState }> {
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
  const pointIds = [...new Set(Object.values(jobs).map((j) => j.waterPointId))];
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

  const reporterChecks = await Promise.all(
    KNOWN_ACCOUNTS.map(async (p) => ((await c.is_reporter({ reporter: p.address })).result ? p.address : null)),
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
