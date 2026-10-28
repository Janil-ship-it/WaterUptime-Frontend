// Freighter wallet connection for testnet writes. The app never sees a secret
// key: it builds a transaction, Freighter shows it to the user and signs it.

import {
  getAddress,
  getNetworkDetails,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { TESTNET } from "./config";

export class WalletError extends Error {}

/** Freighter's error shape varies by version; pull out something readable. */
function describe(error: unknown): string {
  if (!error) return "Unknown wallet error.";
  if (typeof error === "string") return error;
  const e = error as { message?: string };
  return e.message ?? JSON.stringify(error);
}

async function assertTestnet() {
  const net = await getNetworkDetails();
  if (net.error) throw new WalletError(describe(net.error));
  if (net.networkPassphrase !== TESTNET.networkPassphrase) {
    throw new WalletError(
      `Freighter is set to ${net.network || "another network"}. Switch it to Testnet; this app never signs for any other network.`,
    );
  }
}

/** Ask Freighter for access and return the selected account. */
export async function connectWallet(): Promise<string> {
  const status = await isConnected();
  if (!status.isConnected) {
    throw new WalletError("Freighter was not found. Install the Freighter browser extension, then try again.");
  }
  const access = await requestAccess();
  if (access.error || !access.address) {
    throw new WalletError(access.error ? describe(access.error) : "Freighter did not share an account.");
  }
  await assertTestnet();
  return access.address;
}

/** The account currently selected in Freighter, or "" if access was never granted. */
export async function currentAddress(): Promise<string> {
  const res = await getAddress();
  return res.error ? "" : res.address;
}

/**
 * Signer passed to the Stellar SDK's contract client. Checks the network and
 * the account again at signing time, because either can change in Freighter
 * after connecting.
 */
export async function signWithWallet(xdr: string, address: string): Promise<{ signedTxXdr: string; signerAddress: string }> {
  await assertTestnet();
  const selected = await currentAddress();
  if (selected && selected !== address) {
    throw new WalletError("The account selected in Freighter changed. Reconnect the wallet and try again.");
  }
  const res = await signTransaction(xdr, { networkPassphrase: TESTNET.networkPassphrase, address });
  if (res.error) throw new WalletError(`Signature not given: ${describe(res.error)}`);
  return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
}
