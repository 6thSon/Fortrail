# ConfidentialFlow Architecture

## Overview

ConfidentialFlow is a composable confidential payment rails system built on Zama FHEVM v0.11.
All payment amounts are encrypted on-chain using Fully Homomorphic Encryption (FHE) via the
Zama coprocessor. No amount is ever visible in plaintext on the Ethereum state.

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

## Contract Descriptions

### FlowRegistry

- Stores per-sender routing preferences as a plaintext struct `(yieldPct, vestPct, liquidPct)`.
- Percentages must sum to 100.
- Default (unset): `(0, 0, 100)` — 100% liquid.
- No FHE state; routing logic is plaintext.

### ConfidentialPaymentGate

- **Entry point** for all payment flows.
- Users deposit cUSDT (gate must be set as ERC-7984 operator).
- Gate maintains per-user encrypted balance tracking using `euint64` handles.
- `routePayment()` dispatches based on `mode` (0/1/2).
- **Sanction filtering**: Uses `FHE.select` to zero the amount for sanctioned senders without reverting — prevents information leakage through transaction revert/success patterns.
- **Balance gate**: Uses `FHE.le` + `FHE.select` to silently route 0 when balance is insufficient.

### ConfidentialYieldVault

- Accepts encrypted deposits from the gate.
- Tracks `_deposits[user]` as a `euint64` handle.
- After `LOCK_DURATION` (24 hours), allows `claimWithYield()`.
- Yield = `FHE.div(principal, 100)` — 1% computed entirely in FHE.
- Double-claim protection: deposit slot zeroed with `FHE.asEuint64(0)` before transfer.

### ConfidentialVestingModule

- Accepts a `createVest(beneficiary, totalAmount, cliffTimestamp, vestingDuration)` call from the gate.
- Linear vesting: vested basis points = `min(elapsed, duration) * 10000 / duration` (all plaintext).
- Claimable amount = `FHE.div(FHE.mul(totalAmount, vestBps), 10000)` minus already claimed.
- `FHE.select` is used to clamp claimable to 0 when `claimedAmount >= vestedAmount`.

---

## ACL (Access Control List) Pattern

Every `euint64` handle stored in contract state follows this three-rule pattern:

```
FHE.allowThis(handle);       // Contract can use it in future txs
FHE.allow(handle, user);     // User can decrypt off-chain
FHE.allowTransient(handle, target);  // Cross-contract call in same tx
```

### Cross-contract ACL flow (gate → vault example)

```
Gate:
  euint64 amount = FHE.fromExternal(...)     // Gate has TRANSIENT ACL
  FHE.allowTransient(amount, cUSDTAddress)    // cUSDT can use handle this tx
  cUSDT.confidentialTransfer(vault, amount)   // Transfer to vault
  FHE.allowTransient(amount, vaultAddress)    // Vault can use handle this tx
  vault.deposit(recipient, amount)            // Vault tracks amount

Vault.deposit():
  FHE.allowThis(amount)                       // Vault stores for future
  FHE.allow(amount, user)                     // User can decrypt
```

---

## Frontend Architecture

```
React + Vite
 +-- RainbowKit + wagmi (wallet connection, tx submission)
 +-- @zama-fhe/relayer-sdk (client-side encryption)
 |     createEncryptedInput() -> { handle, inputProof }
 +-- Three pages:
       /          Send page   -- deposit + routePayment
       /dashboard Dashboard   -- claim vault, claim vesting
       /admin     Admin       -- sanction controls, routing config
```

### Encryption flow (frontend)

1. User enters amount in plaintext in the UI.
2. `encryptUint64(value, contractAddress, userAddress)` calls the Zama Relayer SDK.
3. SDK returns `{ handle: bytes32, inputProof: bytes }`.
4. These are passed directly to the contract's `deposit()` or `routePayment()` calldata.
5. The plaintext value never leaves the browser.

### COEP header

The Vite dev server sets `Cross-Origin-Embedder-Policy: credentialless` (not `require-corp`) to
maintain compatibility with WalletConnect/RainbowKit iframes while enabling the SharedArrayBuffer
required by WASM-based FHE operations.

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
  |  [_balances[user] += amount]  encrypted, stored with allowThis
  |
  | 3. gate.routePayment(recipient, encAmt, proof, mode)
  |
  +-- mode=0 --> cUSDT.confidentialTransfer(recipient, amount)
  |
  +-- mode=1 --> cUSDT.confidentialTransfer(vault, amount)
  |              vault.deposit(recipient, amount)
  |              [_deposits[recipient] = amount]
  |
  +-- mode=2 --> cUSDT.confidentialTransfer(vesting, amount)
                 vesting.createVest(recipient, amount, cliff, dur)
                 [totalAmount = amount, claimedAmount = 0]
```
