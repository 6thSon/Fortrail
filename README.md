# ConfidentialFlow — Composable Confidential Payment Rails

> Programmable encrypted payments on Zama FHEVM.
> Send, route, and schedule private stablecoin transfers
> with composable yield and vesting — all amounts sealed
> end-to-end with Fully Homomorphic Encryption.

**Zama Season 3 Builder Track Submission**

---

## What This Is (Plain English)

Public blockchains expose every transaction to anyone who looks. When you send USDT on Ethereum, the amount, recipient, and timing are all permanently visible on-chain — readable by competitors, counterparties, front-running bots, and surveillance tools alike. This makes DeFi effectively unusable for real institutional treasury flows, private payroll, confidential settlements, or any personal finance where financial privacy is a baseline expectation rather than an edge case.

ConfidentialFlow solves this by encrypting every payment amount end-to-end using Fully Homomorphic Encryption before it ever touches the chain. Senders encrypt amounts in the browser; the ciphertext is all that is ever written to Ethereum state. The contracts compute yield, vesting fractions, sanction checks, and balance deductions entirely inside the FHE coprocessor — without any party ever decrypting the values. A Protocol Registry lets external dApps plug in and route payments without handling FHE themselves: they pass an encrypted handle they received from the user and the protocol does the rest.

---

## Architecture

```
User Wallet
    │
    ▼
ConfidentialPaymentGate ──► FlowRegistry (routing config)
    │
    ├──► ConfidentialYieldVault (encrypted deposit → claim)
    │
    └──► ConfidentialVestingModule (cliff + linear release)

External protocols call routeFromProtocol() on the Gate
after registering via the Protocol Registry.
```

---

## PaymentIntent System

A PaymentIntent is a pre-authorized payment commitment stored on-chain. The sender encrypts an amount once and commits it to an intent record; the intent can then be executed by the sender or by any registered protocol when conditions are met — cleanly separating the declaration of payment intent from its execution. This enables protocol-triggered settlement flows where the executing party never holds or sees the plaintext amount.

| Function | Who calls it | What it does |
|---|---|---|
| `createPaymentIntent()` | User | Locks intent on-chain, returns `intentId` |
| `executeIntent()` | User or registered protocol | Executes the payment |
| `cancelIntent()` | User only | Cancels before execution |

---

## Smart Contracts

| Contract | Purpose | Key Functions |
|---|---|---|
| `ConfidentialPaymentGate` | Main entry point | `routePayment`, `routeFromProtocol`, `createPaymentIntent`, `executeIntent` |
| `ConfidentialYieldVault` | Encrypted yield storage | `deposit`, `claimWithYield`, `getUserBalance` |
| `ConfidentialVestingModule` | Time-locked allocations | `createVest`, `claim` |
| `FlowRegistry` | Routing preferences | `setRoute`, `getRoute` |

---

## Deployed Contracts (Sepolia Testnet)

Deployed by `0x14A905eE9F79F871EaeEA20Aa932292BC472B435` on 2026-06-05.

| Contract | Address | Etherscan |
|---|---|---|
| ConfidentialPaymentGate | `0x78e9683ab9A62C8A1F12a72E05e209111f7bec40` | [view](https://sepolia.etherscan.io/address/0x78e9683ab9A62C8A1F12a72E05e209111f7bec40) |
| ConfidentialYieldVault | `0xEC9dC67572704d219bfd03ED8Be0f4231f659a18` | [view](https://sepolia.etherscan.io/address/0xEC9dC67572704d219bfd03ED8Be0f4231f659a18) |
| ConfidentialVestingModule | `0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190` | [view](https://sepolia.etherscan.io/address/0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190) |
| FlowRegistry | `0xA55A0E3CE8d613E090580eB1f797579b192376E0` | [view](https://sepolia.etherscan.io/address/0xA55A0E3CE8d613E090580eB1f797579b192376E0) |
| cUSDT (official Zama wrapper) | `0x9A2Bc655517d22CAC4a331Cfee6Fe7271f900Ec1` | [view](https://sepolia.etherscan.io/address/0x9A2Bc655517d22CAC4a331Cfee6Fe7271f900Ec1) |

---

## Encrypted State

Every value in this table lives on-chain as a `euint64` FHE handle — never as a plaintext integer.

| Variable | Contract | Who can decrypt |
|---|---|---|
| `userBalance[address]` | PaymentGate | Owner only |
| `depositAmount[address]` | YieldVault | Depositor only |
| `vestedAmount` | VestingModule | Beneficiary only |
| `encryptedAmount` (intent) | PaymentGate | Sender + authorized protocols |

---

## For Users — How to Test

1. Get Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com)
2. Get testnet USDT from [app.aave.com](https://app.aave.com) (Sepolia faucet tab)
3. Wrap USDT → cUSDT at [portfolio.zama.org](https://portfolio.zama.org)
4. Open the app (URL from deployment output)
5. Connect MetaMask (Sepolia network)
6. Step 1: Approve Gate as operator (one-time transaction)
7. Step 2: Deposit cUSDT into Gate
8. Step 3: Route payment — choose Direct, Yield Vault, or Vesting
9. Or: Schedule a PaymentIntent for future or protocol-triggered execution

---

## For Developers — Integration Guide

Any registered protocol can trigger a confidential payment on behalf of a user without ever handling FHE logic directly. The flow is: (1) the user calls `createPaymentIntent()` once, which encrypts the amount and stores an intent on-chain; (2) the external protocol calls `routeFromProtocol()` referencing that intent, forwarding the encrypted handle the user already committed. The protocol handles only the `bytes32` intent ID — the FHE arithmetic stays inside the Gate.

To register, the admin calls `registerProtocol(protocolAddress, description)` on the Gate. Once registered, the protocol can call:

```solidity
function routeFromProtocol(
    address from,
    address to,
    euint64 encryptedAmount,
    uint8 routingMode
) external onlyAuthorizedProtocol
```

The calling protocol never handles FHE directly — it receives the encrypted handle from the user's prior `createPaymentIntent` call and forwards it. The Gate verifies the handle's ACL, runs the sanction and balance guards entirely in FHE, and dispatches to the appropriate module.

---

## Test Coverage

| Category | Tests | What is verified |
|---|---|---|
| Gate — basic flow | 5 | Deposit, route, sanction block, ACL |
| Yield Vault | 8 | Deposit, claim, timing, ACL |
| Vesting Module | 9 | Cliff, linear release, double-claim |
| Flow Registry | 10 | Route config, percentages |
| PaymentIntent | 5 | Create, execute, protocol execute, expiry, replay |
| **Total** | **42** | |

Run with `cd contracts && npm test`.

---

## Measured Latency (Sepolia)

_Placeholder — fill after Sepolia deployment and live testing._

| Metric | Value |
|---|---|
| Median end-to-end | TBD |
| P90 | TBD |
| Failure rate | TBD |
| Avg gas per flow | ~866K (estimated from prior Season data) |

---

## Why FHE, Not ZK

ZK proofs verify that a static claim is true without revealing the underlying data. They work well for proving "I know a secret" or "this transaction is valid." But ZK cannot compute over shared, evolving state that multiple parties update over time — because someone has to know the plaintext to generate the proof. That makes ZK unsuitable anywhere the prover does not already hold all inputs in the clear.

ConfidentialFlow's load-bearing computation is shared, evolving state. Multiple users deposit into the same yield vault. Routing percentages update per user independently. PaymentIntents are created by one party and executed by another who never held the plaintext amount. FHE lets the contract compute over all of this — additions, comparisons, divisions, conditional selects — without any party ever holding the plaintext. That is categorically impossible with ZK.

---

## Known Limitations

- Yield returns are hardcoded at 1% for demonstration. Production would connect to Aave or a real yield source.
- Vesting uses simplified linear release. Production would support custom cliff curves and multiple tranches.
- The Zama Relayer is currently centralized. Zama has noted decentralization is on their roadmap.
- PaymentIntent expiry relies on `block.timestamp` — set windows of at least 1 hour to avoid edge-case variance.
- Gas costs for FHE operations are substantially higher than standard ERC-20 (~866K gas per end-to-end flow).
- Yield vault holds pooled funds — subject to the same contract-level freeze risk as any DeFi protocol that holds user assets. This is a known limitation of the current USDC/USDT centralization model, not specific to this implementation.

---

## Setup

```bash
# Contracts
cd contracts
cp ../.env.example .env     # fill in SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY
npm install
npm test                    # run test suite
npm run compile             # Solidity compilation
npm run deploy:sepolia      # deploy all 4 contracts
npm run seed:sepolia        # set operator + sample routing config

# Frontend (from repo root)
pnpm --filter @workspace/app run dev
```

---

## License

MIT
