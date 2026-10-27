import type { Hex32 } from "./types";

export function bytesToHex(bytes: Uint8Array): Hex32 {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Random 32-byte opaque ID (e.g. a new water point ID). */
export function randomId(): Hex32 {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Salted SHA-256 fingerprint of an off-chain record. The random salt stops
 * low-entropy text from being guessed from its hash; it must be stored with
 * the off-chain record (never on-chain) so the fingerprint can be re-checked.
 */
export async function fingerprint(content: string): Promise<{ hash: Hex32; salt: Hex32 }> {
  const salt = randomId();
  const data = new TextEncoder().encode(`${salt}:${content}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return { hash: bytesToHex(new Uint8Array(digest)), salt };
}

export function shortHex(hex: string, size = 6): string {
  return hex.length <= size * 2 ? hex : `${hex.slice(0, size)}…${hex.slice(-4)}`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}
