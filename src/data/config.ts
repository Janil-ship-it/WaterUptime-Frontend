// Testnet only. Never point this app at mainnet.
export const TESTNET = {
  contractId:
    import.meta.env.VITE_CONTRACT_ID ?? "CDRNO3OO3JCIWRNJIDRPH3UQ6ZX7GRTDQUPMJP4B5IVKUMNUNVHC3ZQO",
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};
