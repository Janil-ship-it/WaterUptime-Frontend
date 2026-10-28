// Testnet only. Never point this app at mainnet.
export const TESTNET = {
  contractId:
    import.meta.env.VITE_CONTRACT_ID ?? "CD5V5AJCWEP25CVVFQ3J5E54AFOB6JFYO4MIWBJSIPECMEM3PHZ6TCLX",
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
