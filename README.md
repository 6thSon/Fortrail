# ConfidentialFlow

> Composable confidential payment rails on Zama FHEVM v0.11 — amounts encrypted end-to-end.

ConfidentialFlow is a set of four smart contracts and a React dApp that implement fully
encrypted payment routing on Ethereum Sepolia. Amounts are never visible in plaintext
on-chain; all arithmetic (yield calculation, vesting fractions, balance deductions) runs
inside the FHE coprocessor.

---

## Architecture overview

```
User → ConfidentialPaymentGate → Mode 0: direct cUSDT transfer
                               → Mode 1: ConfidentialYieldVault  (+1% after 24 h)
                               → Mode 2: ConfidentialVestingModule (cliff + linear)
                FlowRegistry   ← per-sender routing config (plaintext)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and ACL patterns.
See [`docs/DEMO_FLOW.md`](docs/DEMO_FLOW.md) for a step-by-step demo walkthrough.

---

## Repository layout

```
confidentialflow/
├── contracts/               Hardhat project (standalone npm, not pnpm workspace)
│   ├── contracts/
│   │   ├── ConfidentialPaymentGate.sol
│   │   ├── ConfidentialYieldVault.sol
│   │   ├── ConfidentialVestingModule.sol
│   │   ├── FlowRegistry.sol
│   │   └── interfaces/
│   │       └── IERC7984Minimal.sol
│   ├── test/
│   │   ├── ConfidentialPaymentGate.test.ts
│   │   ├── ConfidentialYieldVault.test.ts
│   │   ├── ConfidentialVestingModule.test.ts
│   │   ├── FlowRegistry.test.ts
│   │   └── MockERC7984.sol
│   ├── scripts/
│   │   ├── deploy.ts
│   │   └── seed.ts
│   ├── hardhat.config.ts
│   └── package.json
├── artifacts/app/           React + Vite frontend (pnpm workspace artifact)
│   └── src/
│       ├── pages/           Send, Dashboard, Admin
│       ├── components/      Layout, UI primitives
│       └── lib/             wagmi config, contract ABIs, FHEVM helpers
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEMO_FLOW.md
├── .env.example
└── .github/workflows/ci.yml
```

---

## Quick start (contracts)

```bash
cd contracts
cp .env.example .env
# Fill in SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, CUSDT_ADDRESS
npm install
npm test                        # 38 tests, all passing
npm run compile                 # Solidity compilation
npm run deploy:sepolia          # Deploy to Sepolia
npm run seed:sepolia            # Set operator + sample routing config
```

---

## Quick start (frontend)

```bash
# From repo root
cp .env.example artifacts/app/.env
# Fill in VITE_* addresses from deploy:sepolia output
pnpm --filter @workspace/app run dev
```

---

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `SEPOLIA_RPC_URL` | contracts/.env | Infura/Alchemy Sepolia endpoint |
| `DEPLOYER_PRIVATE_KEY` | contracts/.env | 0x-prefixed deployer private key |
| `CUSDT_ADDRESS` | contracts/.env + app/.env | cUSDT ERC-7984 contract on Sepolia |
| `GATE_ADDRESS` | app/.env | ConfidentialPaymentGate address |
| `VAULT_ADDRESS` | app/.env | ConfidentialYieldVault address |
| `VESTING_ADDRESS` | app/.env | ConfidentialVestingModule address |
| `FLOW_REGISTRY_ADDRESS` | app/.env | FlowRegistry address |
| `VITE_WALLETCONNECT_PROJECT_ID` | app/.env | WalletConnect v3 project ID |

---

## Contract addresses (Sepolia — fill after deploy)

| Contract | Address |
|---|---|
| FlowRegistry | — |
| ConfidentialPaymentGate | — |
| ConfidentialYieldVault | — |
| ConfidentialVestingModule | — |
| cUSDT (Zama ERC-7984) | — |

---

## Stack

| Layer | Technology |
|---|---|
| FHE | Zama FHEVM v0.11, `@fhevm/solidity` 0.11.1 |
| Contracts | Solidity ^0.8.28 |
| Testing | Hardhat 2.x, `@fhevm/mock-utils`, ethers v6 |
| Network | Ethereum Sepolia |
| Frontend | React 18, Vite, wagmi, RainbowKit, viem |
| Encryption client | `@zama-fhe/relayer-sdk` 0.4.1 |
| Styling | Tailwind CSS v4, shadcn/ui |

---

## Security notes

- Sanction enforcement uses `FHE.select` (not `require`) so on-chain observers cannot
  infer sanction status from transaction revert/success patterns.
- All `euint64` handles follow the three-rule ACL pattern: `allowThis` + `allow(user)` + `allowTransient(target)`.
- Vault claim follows CEI (Checks-Effects-Interactions): deposit slot is zeroed before the external cUSDT transfer.
- No `TFHE.*` calls — exclusively `FHE.*` (FHEVM v0.11 API).
- No `requestDecryption` on-chain — all decryption is user-initiated off-chain via the Zama Gateway.

---

## License

MIT
