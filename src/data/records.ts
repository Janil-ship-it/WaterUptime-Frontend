// Off-chain records created from this browser in testnet mode. Only their
// fingerprints go on-chain; the text stays here, so other browsers see
// fingerprints only. A real deployment needs an access-controlled evidence
// store instead (see the hub's security-and-privacy doc).

import type { Hex32, OffchainRecord, WaterPointMeta } from "../domain/types";
import { TESTNET } from "./config";

export interface LocalRecords {
  records: Record<Hex32, OffchainRecord>;
  waterPoints: Record<Hex32, WaterPointMeta>;
  /** Confirmed transactions sent from this browser, newest first. */
  transactions: TxLogEntry[];
}

export interface TxLogEntry {
  hash: string;
  label: string;
  signer: string;
  /** Unix seconds when the app saw the confirmation. */
  at: number;
}

// Keyed by contract, so redeploying never mixes records between instances.
const key = () => `wateruptime-testnet-${TESTNET.contractId}`;
const empty = (): LocalRecords => ({ records: {}, waterPoints: {}, transactions: [] });

export function loadLocalRecords(): LocalRecords {
  try {
    const raw = localStorage.getItem(key());
    if (raw) return { ...empty(), ...(JSON.parse(raw) as Partial<LocalRecords>) };
  } catch {
    // Storage unavailable or corrupt: start empty.
  }
  return empty();
}

export function saveLocalRecords(data: LocalRecords) {
  try {
    localStorage.setItem(key(), JSON.stringify(data));
  } catch {
    // Persistence is a convenience only.
  }
}
