# ConfidentialFlow Architecture

## Overview

ConfidentialFlow is a composable confidential payment rails system built on Zama FHEVM v0.11. All payment amounts are encrypted on-chain using Fully Homomorphic Encryption via the Zama coprocessor. No amount is ever visible in plaintext on the Ethereum state — not in storage, not in events, not in calldata beyond the initial encrypted input submitted from the browser. Every arithmetic operation (yield calculation, vesting fractions, balance deductions, sanction checks) runs inside the FHE coprocessor and returns an encrypted result.

---

## Contract Architecture

```
User
 |
 | setOperator(gate, expiry)           -- approve gate to pull cUSDT
 |
 v
ConfidentialPaymentGate  <----reads---- FlowRegistry
 |       \                              (per-user routing config)
 |        \
 |         \-- MODE_LIQUID ------> confidentialTransfer(recipient)
 |          \
 |           \-- MODE_YIELD -----> ConfidentialYieldVault.deposit(recipient, amount)
 |            \
 |             \-- MODE_VESTING --> ConfidentialVestingModule.createVest(beneficiary, ...)
 |
cUSDT (ERC-7984)
```

---

## FlowRegistry

FlowRegistry stores per-sender routing preferences as a plaintext struct `(yieldPct, vestPct, liquidPct)`. Percentages must sum to 100. When a sender has not configured a preference, the default is `(0, 0, 100)` — all payments routed as direct liquid transfers. The registry contains no FHE state; routing configuration is entirely plaintext because it describes *how* to route, not *how much* — the amounts stay encrypted inside the Gate throughout.

The registry is written by the sender or by the admin and read by the Gate during every `routePayment` and `routeFromProtocol` call. Because routing config is plaintext, it can be read and validated cheaply before any FHE dispatch. Only the Gate reads routing preferences at execution time; the registry itself does not hold or touch any `euint64` handles.

Who can decrypt: nothing — there is no encrypted state in FlowRegistry.

---

## ConfidentialPaymentGate

ConfidentialPaymentGate is the single entry point for all payment flows. It accepts encrypted deposits from users, maintains per-user encrypted balances as `euint64` handles, and dispatches routed payments to the appropriate module or directly to the recipient. On deposit, the Gate calls `FHE.fromExternal(handle, proof)` to verify and convert the user-supplied `externalEuint64` into a gate-internal handle, then stores it in `_balances[user]` and grants the user ACL with `FHE.allow(amount, user)` so they can decrypt their own balance off-chain.

Before any payment is dispatched, two confidential guards run in sequence. First, the sanction gate: if the sender is flagged, `FHE.select(notSanctioned, amount, 0)` silently zeros the send amount. The transaction still succeeds; an on-chain observer cannot infer sanction status from the revert/success pattern because there is none. Second, the balance gate: `FHE.le(requestedAmount, balance)` checks sufficiency without revealing either value. If insufficient, `FHE.select` again zeros the send amount. Both guards are pure FHE operations — their results are never decrypted on-chain.

The Gate also implements the PaymentIntent system: `createPaymentIntent()` lets a user encrypt once and commit an intent on-chain; `executeIntent()` can be called later by the sender or any registered protocol; `cancelIntent()` can only be called by the original creator. This separates the declaration of payment intent from its execution, enabling protocol-triggered settlement where the executing party forwards an encrypted handle they received but never decrypted. Who can decrypt: only the original depositing user (via `FHE.allow`) can read their own balance; authorized protocols receive transient ACL on the amount handle for the duration of a single transaction.

---

## ConfidentialYieldVault

ConfidentialYieldVault accepts encrypted deposits from the Gate and holds them for a fixed lock duration (24 hours). It stores each depositor's position as `_deposits[user]` — a `euint64` handle. Because the vault receives the amount handle from the Gate via a cross-contract call, the Gate must call `FHE.allowTransient(amount, vaultAddress)` before passing the handle; the vault then immediately calls `FHE.allowThis(amount)` to persist ownership of the handle for future transactions, and `FHE.allow(amount, depositor)` so the depositor can decrypt their own position off-chain.

When the lock expires, the depositor calls `claimWithYield()`. The vault computes `yield = FHE.div(principal, 100)` entirely in FHE — a 1% return calculated without anyone learning the principal. The total claimable amount is `principal + yield`, transferred to the depositor via `cUSDT.confidentialTransfer`. Double-claim protection follows the Checks-Effects-Interactions pattern: the deposit slot is zeroed to `FHE.asEuint64(0)` before the external cUSDT transfer executes. If the transfer were to fail, the slot has already been cleared, preventing re-entry from replaying the claim.

Who can decrypt: only the depositor. The vault stores `FHE.allow(amount, depositor)` — no other party has ACL on the deposit handle. The vault itself retains `FHE.allowThis` to use the handle in subsequent transactions (computing yield, clearing the slot). Yield is computed without any plaintext intermediate: the division `FHE.div(principal, 100)` runs entirely inside the FHE coprocessor.

---

## ConfidentialVestingModule

ConfidentialVestingModule accepts a vesting allocation from the Gate and creates a per-beneficiary schedule with a cliff timestamp and a linear vesting duration. It stores two `euint64` handles per beneficiary: `totalAmount` (the full allocation) and `claimedAmount` (running total of prior claims, initially `FHE.asEuint64(0)`). As with the Vault, the Gate must call `FHE.allowTransient(amount, vestingAddress)` before the cross-contract call; the module immediately calls `FHE.allowThis` on both handles.

When a beneficiary calls `claim()`, the module computes how much has vested in plaintext — `vestBps = min(elapsed, duration) * 10000 / duration` — then applies that fraction to the encrypted total using `FHE.div(FHE.mul(totalAmount, vestBps), 10000)`. Subtracting `claimedAmount` gives the currently claimable portion. A `FHE.select` clamps the result to zero when `claimedAmount >= vestedAmount`, preventing over-claims without any plaintext reveal. The claimedAmount handle is updated after each claim by adding the claimed portion, again entirely in FHE.

Who can decrypt: only the beneficiary. The module stores `FHE.allow(totalAmount, beneficiary)` and `FHE.allow(claimedAmount, beneficiary)` so they can read their own position via the Zama Gateway. No other party — not the admin, not the Gate — has ACL on these handles after the vest is created. The fraction arithmetic (vestBps) uses plaintext timestamps but never touches plaintext amounts.

---

## ACL (Access Control List) Pattern

Every `euint64` handle stored in contract state follows this three-rule pattern:

```
FHE.allowThis(handle);                   // Contract can use it in future txs
FHE.allow(handle, user);                 // User can decrypt off-chain
FHE.allowTransient(handle, target);      // Cross-contract call in same tx
```

### Cross-contract ACL flow (gate → vault example)

```
Gate:
  euint64 amount = FHE.fromExternal(...)     // Gate has TRANSIENT ACL
  FHE.allowTransient(amount, cUSDTAddress)   // cUSDT can use handle this tx
  cUSDT.confidentialTransfer(vault, amount)  // Transfer to vault
  FHE.allowTransient(amount, vaultAddress)   // Vault can use handle this tx
  vault.deposit(recipient, amount)           // Vault tracks amount

Vault.deposit():
  FHE.allowThis(amount)                      // Vault stores for future
  FHE.allow(amount, user)                    // User can decrypt
```

---

## Frontend Architecture

```
React + Vite
 +-- RainbowKit + wagmi v2 (wallet connection, tx submission)
 +-- @zama-fhe/sdk@^3 + @zama-fhe/react-sdk@^3 (client-side encryption)
 |     useEncrypt() -> { handle: externalEuint64, inputProof: Uint8Array }
 |     RelayerWeb (WASM, runs in Web Worker)
 +-- Three pages:
       /           Send page   -- deposit + routePayment
       /dashboard  Dashboard   -- claim vault, claim vesting
       /admin      Admin       -- sanction controls, routing config
```

### Encryption flow (frontend)

1. User enters amount in plaintext in the UI.
2. `useEncrypt().mutateAsync({ contractAddress, userAddress, uintValue })` calls the Zama SDK.
3. SDK returns `{ handles: [externalEuint64Handle], inputProof: Uint8Array }`.
4. `toHex(inputProof)` (from viem) converts the proof bytes for ABI encoding.
5. Handle and proof are passed directly to `deposit()` or `routePayment()` calldata.
6. The plaintext value never leaves the browser.

### Relayer status lifecycle

`new RelayerWeb(config)` starts WASM initialization in a Web Worker immediately on app mount. The status dot in the top navigation reflects: yellow (initializing) → green (ready) → red (error). On Sepolia, expect 5–15 seconds for WASM load + network handshake. The `RelayerStatusContext` is polled via `setInterval(500ms)` in `RouterWithZama` and consumed in `Layout.tsx`.

---

## Security Model

| Threat | Mitigation |
|---|---|
| Amount leakage on-chain | All values stored as `euint64` FHE handles |
| Sanction inference via revert | `FHE.select` silently zeros amount, tx succeeds |
| Balance overflow | `FHE.le` + `FHE.select` guard before subtraction |
| Double-claim vault | Deposit slot zeroed before external call (CEI) |
| Double-claim vesting | Running `claimedAmount` subtracted from vested |
| Cross-contract ACL | `FHE.allowTransient` before every cross-contract call |
| Unauthorized module calls | `onlyGate` modifier on vault/vesting entry points |
| Protocol registry abuse | `onlyAdmin` gated registration + swap-and-pop revocation |
| Intent replay | `settled` flag set before dispatch; reverts on re-execution |

---

## Data Flow Diagram

```
User wallet
  |
  | 1. setOperator(gate, expiry)
  v
cUSDT (ERC-7984)
  |
  | 2. gate.deposit(encAmount, proof)
  v
ConfidentialPaymentGate
  |  [_balances[user] += amount]  encrypted, stored with allowThis + allow(user)
  |
  | 3. gate.routePayment(recipient, encAmt, proof, mode)
  |      → sanction check (FHE.select)
  |      → balance check (FHE.le + FHE.select)
  |
  +-- mode=0 --> cUSDT.confidentialTransfer(recipient, amount)
  |
  +-- mode=1 --> cUSDT.confidentialTransfer(vault, amount)
  |              vault.deposit(recipient, amount)
  |              [_deposits[recipient] = amount, lock 24h]
  |
  +-- mode=2 --> cUSDT.confidentialTransfer(vesting, amount)
                 vesting.createVest(recipient, amount, cliff, dur)
                 [totalAmount = amount, claimedAmount = 0]

  OR:
  | 4. createPaymentIntent(to, encAmt, proof, mode, expiry) → intentId
  |
  | 5. executeIntent(intentId)   [by sender or registered protocol]
  |      → same sanction + balance guards
  |      → same _executeRoute dispatch
```
