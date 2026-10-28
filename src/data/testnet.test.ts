import { describe, expect, it } from "vitest";
import { contractErrorCode } from "./testnet";

describe("contractErrorCode", () => {
  it("reads the code from a simulation error", () => {
    expect(contractErrorCode("HostError: Error(Contract, #11)\n\nEvent log (newest first): ...")).toBe(11);
  });

  it("returns null for errors that are not contract errors", () => {
    expect(contractErrorCode("Network request failed")).toBeNull();
  });
});
