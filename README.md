# ConfidentialFlow

> Composable confidential payment rails on Zama FHEVM v0.11 — amounts encrypted end-to-end.

ConfidentialFlow is a set of four smart contracts and a React dApp that implement fully
encrypted payment routing on Ethereum Sepolia. Amounts are never visible in plaintext
on-chain; all arithmetic (yield calculation, vesting fractions, balance deductions) runs
inside the FHE coprocessor.

---

## How It Works

### 1. Connect wallet and approve gate as cUSDT operator

The user connects their Ethereum wallet via RainbowKit. Before any payment can flow, the
ConfidentialPaymentGate contract must be approved as an ERC-7984 operator on the user's
cUSDT balance. This is a one-time on-chain call to `cUSDT.setOperator(gateAddress, expiry)`.
The approval is tracked in localStorage and verified against the chain so users never repeat
it unnecessarily.

### 2. Deposit — amount encrypted client-side before broadcast

When the user deposits, the React frontend calls the Zama Relayer SDK (`@zama-fhe/relayer-sdk/web`)
to encrypt the amount into an FHEVM-compatible `externalEuint64` handle plus a ZK proof, all
inside the browser. The plaintext value never leaves the client. Only the encrypted handle and
proof are submitted on-chain. The gate contract calls `FHE.fromExternal(handle, proof)` to
verify and convert this into a gate-internal `euint64` balance entry.

### 3. Route payment — recipient, encrypted amount, and routing mode

The user fills in the recipient address, the amount to send (encrypted again by the SDK on
submission), and one of three routing modes:

- **Direct Transfer** — instant confidential cUSDT transfer to the recipient.
- **Yield Vault** — funds locked for 24 hours; recipient claims principal + 1% yield.
- **Vesting Schedule** — creates a 30-day cliff / 180-day linear vest for the recipient.

External protocols registered by the admin can also trigger routing via
`routeFromProtocol(from, to, encAmount, mode)` without going through the user deposit flow.

### 4. Sanction filter and balance gate using `FHE.select` — no reverts

Inside `routePayment`, two confidential guards run before dispatch:

1. **Sanction gate** — if the sender is flagged, `FHE.select(notSanctioned, amount, 0)` silently
   zeros the amount. The transaction succeeds; the on-chain observer cannot infer sanction status.
2. **Balance gate** — `FHE.le(requestedAmt, balance)` checks sufficiency. If insufficient,
   `FHE.select` again zeros the send amount. No on-chain revert, no information leak.

Both guards are pure FHE operations — the results are never decrypted on-chain.

### 5. Funds land in the appropriate module

After the guards, `_executeRoute` dispatches:

- **Mode 0 (Liquid)** → `cUSDT.confidentialTransfer(recipient, sendAmt)` directly.
- **Mode 1 (Yield)** → transfers to `ConfidentialYieldVault`, which records the encrypted
  deposit and releases principal + yield after the 24-hour lock expires.
- **Mode 2 (Vesting)** → transfers to `ConfidentialVestingModule`, which creates a per-beneficiary
  vesting schedule; tokens unlock linearly after the cliff.

In every path, `FHE.allow(sendAmt, recipient)` grants the recipient the ACL needed to decrypt
their received amount off-chain via the Zama Gateway.

---

## Architecture overview

```
User → ConfidentialPaymentGate → Mode 0: direct cUSDT transfer
                               → Mode 1: ConfidentialYieldVault  (+1% after 24 h)
                               → Mode 2: ConfidentialVestingModule (cliff + linear)
                FlowRegistry   ← per-sender routing config (plaintext)
Protocol  ──(onlyAuthorizedProtocol)──► routeFromProtocol()
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
│       ├── hooks/           useTransactionFlow
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

## Contract addresses (Sepolia)

| Contract | Address |
|---|---|
| MockERC7984 (cUSDT) | [0x9A2Bc655517d22CAC4a331Cfee6Fe7271f900Ec1](https://sepolia.etherscan.io/address/0x9A2Bc655517d22CAC4a331Cfee6Fe7271f900Ec1) |
| FlowRegistry | [0xA55A0E3CE8d613E090580eB1f797579b192376E0](https://sepolia.etherscan.io/address/0xA55A0E3CE8d613E090580eB1f797579b192376E0) |
| ConfidentialPaymentGate | [0x78e9683ab9A62C8A1F12a72E05e209111f7bec40](https://sepolia.etherscan.io/address/0x78e9683ab9A62C8A1F12a72E05e209111f7bec40) |
| ConfidentialYieldVault | [0xEC9dC67572704d219bfd03ED8Be0f4231f659a18](https://sepolia.etherscan.io/address/0xEC9dC67572704d219bfd03ED8Be0f4231f659a18) |
| ConfidentialVestingModule | [0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190](https://sepolia.etherscan.io/address/0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190) |

Deployed by `0x14A905eE9F79F871EaeEA20Aa932292BC472B435` on 2026-06-05.

---

## Stack

| Layer | Technology |
|---|---|
| FHE | Zama FHEVM v0.11, `@fhevm/solidity` 0.11.1 |
| Contracts | Solidity ^0.8.28 |
| Testing | Hardhat 2.x, `@fhevm/mock-utils`, ethers v6 |
| Network | Ethereum Sepolia |
| Frontend | React 19, Vite 7, wagmi v2, RainbowKit v2, viem v2 |
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
- Protocol registry uses `onlyAdmin` + swap-and-pop array management; revoked protocols are immediately denied.

---

## License

MIT
