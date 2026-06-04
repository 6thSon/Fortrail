# ConfidentialFlow

Composable confidential payment rails on Zama FHEVM v0.11 — balances and transfer amounts are fully encrypted on-chain using homomorphic encryption.

## Run & Operate

- `pnpm --filter @workspace/app run dev` — React frontend (port assigned by env)
- `pnpm --filter @workspace/api-server run dev` — Express API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `cd contracts && npm run compile` — compile Solidity contracts with Hardhat
- `cd contracts && npm test` — run 38 Hardhat tests against the FHEVM mock
- `cd contracts && npm run deploy:sepolia` — deploy all 4 contracts to Sepolia
- Required env (root): `SESSION_SECRET`
- Required env (contracts): `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`
- Required env (frontend): `VITE_SEPOLIA_RPC_URL`, `VITE_WALLETCONNECT_PROJECT_ID` (optional — RainbowKit works without it in dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7, wagmi v2, RainbowKit v2, viem v2, Tailwind CSS v4
- FHEVM client: `@zama-fhe/relayer-sdk` v0.4.1 (import via `/web` subpath)
- Smart contracts: Solidity 0.8.24, Hardhat, `@fhevm/solidity` v0.11.1, `@fhevm/hardhat-plugin`
- API: Express 5, Drizzle ORM, PostgreSQL
- **`contracts/` is a standalone npm project** (NOT in pnpm workspace) to avoid `@zama-fhe/relayer-sdk` version conflict

## Where things live

- `contracts/contracts/` — 4 Solidity contracts (ConfidentialPaymentGate, ConfidentialYieldVault, ConfidentialVestingModule, FlowRegistry)
- `contracts/test/` — Hardhat TypeScript test files (38 tests)
- `contracts/scripts/` — deploy.ts and seed.ts deployment scripts
- `artifacts/app/src/pages/` — Send.tsx, Dashboard.tsx, Admin.tsx
- `artifacts/app/src/lib/` — wagmi.ts (chain/wallet config), contracts.ts (ABIs), fhevm.ts (FHE encrypt helpers)
- `artifacts/app/src/components/Layout.tsx` — top nav with RainbowKit wallet button
- `docs/ARCHITECTURE.md`, `docs/DEMO_FLOW.md` — technical docs

## Architecture decisions

- All 4 FHE contracts inherit `ZamaEthereumConfig` (not `ZamaCoprocessorConfig`); FHE coprocessor is auto-configured per-network.
- `FHE.fromExternal()` wraps every user-supplied encrypted input; `FHE.allowThis()` called after every stored encrypted value.
- `FHE.select(ebool, a, b)` used for conditional logic instead of `require(ebool)` — required by FHEVM rules.
- `@zama-fhe/relayer-sdk` must be imported as `@zama-fhe/relayer-sdk/web` (not bare) — the package has no root `"."` export.
- `contracts/` uses `overrides: { "@zama-fhe/relayer-sdk": "0.4.1" }` in its own package.json to pin the version independently of the pnpm workspace.

## Product

- **Send** — encrypt a cUSDT amount client-side, submit a confidential ERC-7984 transfer; amount never visible on-chain.
- **Dashboard** — view your encrypted balance (readable only by your wallet via FHE user decryption), vesting schedule, and yield position.
- **Admin** — manage FlowRegistry registrations, pause/resume gates, set yield APR.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `@zama-fhe/relayer-sdk/web` — use the `/web` subpath, not the bare package import. Vite throws "Missing '.' specifier" on the bare import.
- Vite `optimizeDeps.exclude` must list `@zama-fhe/relayer-sdk/web` (the subpath), not the bare package name.
- `contracts/` must NOT be added to pnpm-workspace.yaml — keep it as a standalone npm project.
- `cd contracts && npm install` takes ~60 s on first run (downloads hardhat + fhevm toolchain).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `docs/ARCHITECTURE.md` for FHE contract design patterns
- See `docs/DEMO_FLOW.md` for the end-to-end user journey
