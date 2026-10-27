// Mirrors the on-chain types in WaterUptime-SmartContract
// (contracts/water_uptime/src/types.rs). Keep in sync with docs/CONTRACT_INTERFACE.md.

/** 32-byte opaque ID or fingerprint, as lowercase hex. */
export type Hex32 = string;

/** Stellar account address (G...). */
export type Address = string;

export type JobStatus =
  | "Reported"
  | "Assigned"
  | "RepairSubmitted"
  | "NeedsRework"
  | "Verified"
  | "Closed"
  | "Cancelled";

export type JobAction =
  | "Reported"
  | "Assigned"
  | "RepairSubmitted"
  | "RepairApproved"
  | "RepairReturned"
  | "Closed"
  | "Cancelled";

export interface WaterPoint {
  id: Hex32;
  metadataHash: Hex32;
  active: boolean;
  registeredBy: Address;
  openJob: number | null;
}

export interface MaintenanceJob {
  id: number;
  waterPointId: Hex32;
  reporter: Address;
  faultReference: Hex32;
  status: JobStatus;
  technician: Address | null;
  verifier: Address | null;
  repairReference: Hex32 | null;
  verificationReference: Hex32 | null;
  /** Unix seconds (ledger timestamp). */
  createdAt: number;
  updatedAt: number;
}

export interface AuditEntry {
  action: JobAction;
  actor: Address;
  reference: Hex32 | null;
  timestamp: number;
}

/** On-chain state as the contract exposes it. */
export interface ChainState {
  admin: Address;
  reporters: Address[];
  waterPoints: Record<Hex32, WaterPoint>;
  jobs: Record<number, MaintenanceJob>;
  history: Record<number, AuditEntry[]>;
}

// ---- Off-chain records (never stored on-chain) ----

export type Role = "coordinator" | "reporter" | "technician" | "verifier";

/** A fictional demo participant. Real deployments must not hard-code people. */
export interface Person {
  address: Address;
  name: string;
  role: Role;
  title: string;
}

export interface WaterPointMeta {
  code: string;
  name: string;
  facilityType: string;
  /** LGA-level locality only. Never store exact coordinates. */
  locality: string;
}

export type Priority = "urgent" | "high" | "medium" | "low";

export type RecordKind = "metadata" | "fault" | "repair" | "verification" | "cancellation";

/**
 * Off-chain evidence or note whose fingerprint is anchored on-chain.
 * In a real deployment this lives behind access control, not in the browser.
 */
export interface OffchainRecord {
  kind: RecordKind;
  summary: string;
  detail?: string;
  priority?: Priority;
  /** Verification only: approved or returned for rework. */
  category?: string;
}

export interface OffchainState {
  people: Record<Address, Person>;
  waterPoints: Record<Hex32, WaterPointMeta>;
  records: Record<Hex32, OffchainRecord>;
}
