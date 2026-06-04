# ConfidentialFlow Demo Flow

This guide walks through a complete end-to-end demo using the deployed contracts on Sepolia.

---

## Prerequisites

- MetaMask (or another wallet) connected to Sepolia
- Sepolia ETH for gas
- cUSDT (Zama ERC-7984 test token) — obtain from the Zama faucet
- Deployed contracts (addresses in `.env` after running `pnpm deploy:sepolia`)

---

## Step 0 — Deploy contracts

```bash
cd contracts
cp .env.example .env
# Fill in SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, CUSDT_ADDRESS
npm install
npm run deploy:sepolia
# Copy output addresses into .env and into artifacts/app/.env
```

---

## Step 1 — Connect wallet in the dApp

1. Open the ConfidentialFlow dApp (`/`).
2. Click **Connect Wallet** in the top-right corner.
3. Select MetaMask and connect to Sepolia.

---

## Step 2 — Approve the gate as operator

On the **Send** page:

1. Click **Approve Operator**.
2. Confirm the transaction in MetaMask.
3. This calls `cUSDT.setOperator(gate, expiry)` so the gate can pull cUSDT from your balance.

---

## Step 3 — Deposit into the gate

1. Enter an amount (e.g. `1000`).
2. Click **Deposit**.
3. The SDK encrypts `1000` using your wallet address + gate contract address as context.
4. The encrypted handle and ZK proof are submitted on-chain.
5. The gate stores `_balances[you] += 1000` — entirely as an encrypted `euint64`.

**On-chain: only `0x[64-char-handle]` is stored. No plaintext.**

---

## Step 4 — Route a payment (Mode 0: Direct)

1. Paste a recipient address.
2. Enter an amount (e.g. `100`).
3. Select **Direct Transfer**.
4. Click **Send Encrypted**.
5. `routePayment(recipient, encAmt, proof, 0)` is called.
6. The gate deducts `100` from your encrypted balance and calls `cUSDT.confidentialTransfer(recipient, 100enc)`.

**The recipient receives cUSDT. The amount is invisible to observers.**

---

## Step 5 — Route to Yield Vault (Mode 1)

1. Paste a recipient address (can be yourself).
2. Enter amount (e.g. `500`).
3. Select **Yield Vault**.
4. Click **Send Encrypted**.
5. `routePayment(recipient, encAmt, proof, 1)` is called.
6. Gate transfers cUSDT to the vault, vault records `_deposits[recipient] = 500enc`.

**Dashboard: open the Yield Vault card for the recipient address.**

---

## Step 6 — Claim from Yield Vault

After 24 hours (or advance time in local test):

1. Go to **Dashboard**.
2. The Yield Vault card shows **Ready** status.
3. Click **Claim with Yield**.
4. Vault computes `yield = deposit / 100` in FHE, sends `principal + yield` to you.
5. You receive `500 + 5 = 505` cUSDT (encrypted, visible only to you).

---

## Step 7 — Route to Vesting (Mode 2)

1. Paste a recipient address.
2. Enter amount (e.g. `2000`).
3. Select **Vesting Schedule**.
4. Click **Send Encrypted**.
5. Gate creates a 30-day cliff / 180-day linear schedule for the recipient.

**Dashboard: open the Vesting Schedule card.**

---

## Step 8 — Claim vested tokens

After the cliff (30 days in production; advance in test):

1. Go to **Dashboard**.
2. Click **Claim Vested Tokens**.
3. Contract computes: `vestBps = (elapsed * 10000) / 180days` (plaintext).
4. `claimable = FHE.div(FHE.mul(totalAmount, vestBps), 10000) - claimedAmount`.
5. Tokens transferred. Claim is idempotent once fully vested (returns 0 on repeat).

---

## Step 9 — Admin: sanction a sender

1. Go to **Admin** page (you must be the gate admin).
2. Enter an address in the **Sanction Controls** panel.
3. Click **Sanction**.
4. The sanctioned address can still call `routePayment()` — the tx succeeds — but `FHE.select` zeros the effective amount.

**Observer cannot distinguish a sanctioned zero-payment from a successful payment.**

---

## Step 10 — Set custom routing

1. Go to **Admin** page.
2. In **Routing Configuration**, set e.g. `50% yield / 50% liquid`.
3. Save.
4. Future calls to `routePayment` will read this preference from `FlowRegistry`.

---

## Running tests locally

```bash
cd contracts
npm install
npm test
# Expected: 20+ tests passing
```

## Typical test output

```
  FlowRegistry
    ✓ returns 100% liquid default for unset address
    ✓ stores and retrieves a custom route config
    ✓ reverts when percentages do not sum to 100
    ✓ accepts all-yield route (100, 0, 0)
    ✓ accepts all-vesting route (0, 100, 0)
    ✓ emits RouteConfigSet on setRoute
    ✓ hasCustomRoute returns false for default address
    ✓ hasCustomRoute returns true after setRoute
    ✓ resetRoute reverts custom config to default
    ✓ emits RouteConfigReset on resetRoute

  ConfidentialYieldVault
    ✓ deposit sets hasDeposit flag and emits Deposited
    ✓ reverts when non-gate calls deposit
    ✓ reverts on double deposit for same user
    ✓ reverts claimWithYield before lock period
    ✓ claimWithYield succeeds after lock period and clears deposit
    ✓ claimWithYield pays out principal + 1% yield
    ✓ reverts on double claim after first claim
    ✓ returns correct unlock timestamp

  ConfidentialVestingModule
    ✓ createVest sets hasSchedule flag and emits VestingCreated
    ✓ reverts when non-gate calls createVest
    ✓ reverts on double createVest for same beneficiary
    ✓ claim reverts before cliff timestamp
    ✓ claim emits VestingClaimed after cliff
    ✓ claim after full vesting duration receives full allocation
    ✓ second claim after full vest returns 0 (double-claim protection)

  ConfidentialPaymentGate
    ✓ deposit emits Deposited and sets hasBalance
    ✓ routePayment mode 0 emits PaymentRouted with correct args
    ✓ routePayment mode 1 triggers vault deposit
    ✓ routePayment mode 2 creates a vesting schedule for recipient
    ✓ sanctioned sender payment succeeds but routes 0 (no revert)
    ✓ over-limit payment routes 0 without revert
    ✓ admin can sanction and unsanction a user
    ✓ reverts when non-admin tries to setSanctioned
    ✓ transferAdmin hands admin role to new address
    ✓ reverts routePayment with mode > 2
    ✓ reverts routePayment when caller has no gate deposit
    ✓ accumulates gate balance across multiple deposits

38 passing
```
