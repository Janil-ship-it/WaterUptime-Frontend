# WaterUptime — Frontend

Web app for **WaterUptime**: an auditable repair workflow for community water points. A reporter logs a fault, a coordinator assigns a technician and a separate verifier, the technician submits repair evidence, the verifier approves it or requests rework, and the coordinator closes the job.

> **Status:** experimental prototype. Synthetic data and Stellar testnet only. All people and facilities in the demo are fictional. No government, NGO, or UNDP partnership is claimed.

Contract: [WaterUptime-SmartContract](https://github.com/WaterUptime/WaterUptime-SmartContract) · Project docs: [WaterUptime](https://github.com/WaterUptime/WaterUptime)

## Two data modes

| Mode | Source | What you can do |
|---|---|---|
| **Demo data** (default) | Synthetic seed, stored in your browser | Act as any role (header selector) and run the full workflow. Every action goes through `src/domain/workflow.ts`, a port of the contract's state machine with the same rules and errors. Nothing is sent on-chain. |
| **Testnet** | The shared testnet contract (`docs/TESTNET.md` in the contract repo) | Read-only view of real on-chain jobs, history and water points. No wallet needed. Off-chain descriptions aren't available, so fingerprints are shown instead. |

Wallet signing for testnet writes is not built yet.

## Pages

- **Overview**: counts by status, open jobs with their next step and who owns it, recent audit activity.
- **Water points**: registry with search and filters, on-chain record and repair history; coordinators can register and deactivate points.
- **Maintenance jobs**: status tabs, lifecycle stepper, role-aware actions (assign/reassign, submit evidence, close, cancel) and the full audit trail.
- **Verification**: queue of submitted repairs; the assigned verifier approves or returns the job for rework with a reason.
- **Report a fault**: for authorised reporters.

## Data handling

- Only opaque IDs, salted SHA-256 fingerprints (`src/domain/hash.ts`), addresses and timestamps correspond to on-chain data.
- Forms warn against entering names, phone numbers or exact locations; the demo stores LGA-level locality only.
- People are shown by name and role, with the address as secondary information.
- The demo's off-chain records live in `localStorage` for convenience only. A real deployment needs an access-controlled evidence store.

## Development

Requires Node 24.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # workflow state-machine tests
npm run typecheck
npm run build
```

Optional: copy `.env.example` to `.env.local` to point Testnet mode at a different contract. **Testnet only.**

The Stellar SDK is loaded only when Testnet mode is opened, which keeps the default bundle small for low-bandwidth connections.

## Layout

```text
src/
├── domain/       # contract-mirroring types, state machine, error messages, hashing
├── data/         # demo seed, app store, read-only testnet loader, config
├── components/   # layout shell, shared UI, job timeline and stepper
└── pages/        # Overview, WaterPoints, Jobs, Verification, ReportFault
```

When the contract interface changes, update `src/domain/types.ts`, `src/domain/workflow.ts` (and its tests) and `src/domain/errors.ts` together.

## License

[MIT](LICENSE)
