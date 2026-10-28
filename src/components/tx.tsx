// Shared pieces that make it obvious whether an action is simulated (demo)
// or a real transaction signed in the wallet (testnet).

import { explorerTx } from "../data/config";
import { useStore } from "../data/store";
import { shortAddress, shortHex } from "../domain/hash";
import { Button, Card, Icon, SectionTitle, timeAgo } from "./ui";

/** Shown next to every action button. */
export function ActionHint() {
  const { mode } = useStore();
  return mode === "demo" ? (
    <span className="inline-flex items-center gap-space-xxs text-body-sm text-on-surface-variant">
      <Icon name="science" className="text-base text-on-surface-variant" />
      Simulated: runs in your browser, nothing is sent on-chain.
    </span>
  ) : (
    <span className="inline-flex items-center gap-space-xxs text-body-sm text-primary">
      <Icon name="draw" className="text-base" />
      Real testnet transaction: you will sign it in Freighter.
    </span>
  );
}

export function TxLink({ hash, className = "" }: { hash: string; className?: string }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className={`tabular underline ${className}`} title={hash}>
      tx {shortHex(hash, 6)}
    </a>
  );
}

/** Header control in testnet mode: connect, or show the connected account. */
export function WalletControl() {
  const { wallet, actor, loadState } = useStore();
  if (!wallet.address) {
    return (
      <Button tone="primary" icon="account_balance_wallet" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
        {wallet.connecting ? "Connecting…" : "Connect Freighter"}
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-space-xs rounded-lg border-t-2 border-primary bg-surface-container px-space-sm py-space-xxs">
      <Icon name="account_balance_wallet" className="text-base text-secondary" />
      <span className="flex flex-col">
        <span className="hidden text-label-sm uppercase text-primary sm:block" data-testid="wallet-role">
          {/* The role is only known once on-chain state has loaded. */}
          {actor && loadState === "ready" ? (actor.name === "Connected wallet" ? `${actor.name} · ${actor.role}` : actor.name) : "Wallet connected"}
        </span>
        <span className="tabular text-label-md text-on-surface" title={wallet.address} data-testid="wallet-address">
          {shortAddress(wallet.address)}
        </span>
      </span>
      <button type="button" onClick={wallet.disconnect} aria-label="Disconnect wallet" className="text-on-surface-variant hover:text-on-surface">
        <Icon name="logout" className="text-base" />
      </button>
    </span>
  );
}

const STAGE_TEXT = {
  preparing: "Simulating the transaction on testnet…",
  signing: "Approve the transaction in Freighter.",
  confirming: "Submitted. Waiting for the ledger to confirm…",
} as const;

/** Blocks the page while a testnet transaction is in flight. */
export function PendingOverlay() {
  const { pending } = useStore();
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/70 p-gutter backdrop-blur-sm" role="alertdialog" aria-live="assertive" aria-busy="true">
      <Card className="flex max-w-sm flex-col items-center gap-space-sm text-center">
        <Icon name={pending.stage === "signing" ? "draw" : "hourglass_top"} className="animate-pulse text-3xl text-primary" />
        <p className="text-title-md">{pending.label.replace(/\.$/, "")}</p>
        <p className="text-body-md text-on-surface-variant" data-testid="pending-stage">
          {STAGE_TEXT[pending.stage]}
        </p>
      </Card>
    </div>
  );
}

/** Testnet transactions confirmed from this browser. */
export function TransactionLog() {
  const { transactions, offchain } = useStore();
  return (
    <Card>
      <SectionTitle icon="receipt_long" aside={<span className="text-code-num text-on-surface-variant">This browser</span>}>
        Your testnet transactions
      </SectionTitle>
      {transactions.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">None yet. Connect Freighter and act on a job to send one.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-variant" data-testid="tx-log">
          {transactions.map((t) => (
            <li key={t.hash} className="flex flex-wrap items-center justify-between gap-space-xs py-space-xs text-body-sm">
              <span className="flex flex-col">
                <span className="text-on-surface">{t.label}</span>
                <span className="text-on-surface-variant">
                  Signed by {offchain.people[t.signer]?.name ?? shortAddress(t.signer)} · {timeAgo(t.at)}
                </span>
              </span>
              <TxLink hash={t.hash} className="text-secondary" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** How to act as someone else: a header switch in demo, an account switch in Freighter on testnet. */
export function useSwitchHint(): string {
  const { mode } = useStore();
  return mode === "demo" ? "Switch roles in the header to act as them." : "Select their account in Freighter to act as them.";
}
