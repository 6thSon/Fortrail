// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file ConfidentialYieldVault.sol
 * @description Time-locked yield vault for ConfidentialFlow.
 *              Accepts encrypted cUSDT deposits from the ConfidentialPaymentGate,
 *              tracks per-user encrypted balances, and releases principal + 1%
 *              yield after 24 hours.
 *
 *              ACL rules:
 *                - Gate grants this contract transient ACL on the amount handle
 *                  before calling deposit().
 *                - This contract calls FHE.allowThis() on every stored handle.
 *                - This contract calls FHE.allow(handle, user) so the depositor
 *                  can decrypt their own balance.
 */

import { FHE, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984Minimal } from "./interfaces/IERC7984Minimal.sol";

/*
 * @title ConfidentialYieldVault
 * @notice Single-use 24-hour vault: deposit encrypted cUSDT, claim with 1% yield.
 */
contract ConfidentialYieldVault is ZamaEthereumConfig {

    /* ------------------------------------------------------------------
     * Constants
     * ------------------------------------------------------------------ */

    uint256 public constant LOCK_DURATION = 24 hours;
    uint64  public constant YIELD_DIVISOR = 100; /* 1% yield */

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    address public immutable paymentGate;
    address public immutable cUSDT;

    mapping(address => euint64)  private _deposits;
    mapping(address => uint256)  private _depositTimestamp;
    mapping(address => bool)     private _hasDeposit;

    /* ------------------------------------------------------------------
     * Events
     * ------------------------------------------------------------------ */

    event Deposited(address indexed user, uint256 timestamp);
    event Claimed(address indexed user, uint256 timestamp);

    /* ------------------------------------------------------------------
     * Modifiers
     * ------------------------------------------------------------------ */

    modifier onlyGate() {
        require(msg.sender == paymentGate, "ConfidentialYieldVault: caller is not the gate");
        _;
    }

    /* ------------------------------------------------------------------
     * Constructor
     * ------------------------------------------------------------------ */

    /*
     * @param _paymentGate  Address of ConfidentialPaymentGate (only caller allowed).
     * @param _cUSDT        Address of the ERC-7984 cUSDT token contract.
     */
    constructor(address _paymentGate, address _cUSDT) {
        require(_paymentGate != address(0), "ConfidentialYieldVault: zero gate address");
        require(_cUSDT != address(0),       "ConfidentialYieldVault: zero token address");
        paymentGate = _paymentGate;
        cUSDT       = _cUSDT;
    }

    /* ------------------------------------------------------------------
     * External functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Called by the gate to credit a deposit for `user`.
     *         Caller (gate) must have granted this contract transient ACL
     *         on `amount` via FHE.allowTransient before this call.
     *         The cUSDT tokens must already have been transferred to this
     *         contract by the gate before calling deposit().
     * @param user    Beneficiary of the deposit.
     * @param amount  Encrypted amount (handle) — gate must hold transient ACL.
     */
    function deposit(address user, euint64 amount) external onlyGate {
        require(user != address(0), "ConfidentialYieldVault: zero user address");
        require(!_hasDeposit[user], "ConfidentialYieldVault: existing deposit not yet claimed");

        /* Persist the handle so this contract can read it in future txs */
        FHE.allowThis(amount);
        /* Grant user access so they can decrypt their balance off-chain */
        FHE.allow(amount, user);
        /* Grant gate access so it can audit balances if needed */
        FHE.allow(amount, paymentGate);

        _deposits[user]          = amount;
        _depositTimestamp[user]  = block.timestamp;
        _hasDeposit[user]        = true;

        emit Deposited(user, block.timestamp);
    }

    /*
     * @notice Claim principal + 1% yield after LOCK_DURATION has elapsed.
     *         Clears the deposit slot to prevent double-claim.
     *         Calls cUSDT.confidentialTransfer to push tokens to msg.sender.
     */
    function claimWithYield() external {
        require(_hasDeposit[msg.sender], "ConfidentialYieldVault: no deposit found");
        require(
            block.timestamp >= _depositTimestamp[msg.sender] + LOCK_DURATION,
            "ConfidentialYieldVault: lock period not elapsed"
        );

        euint64 principal = _deposits[msg.sender];

        /* yield = principal / 100  (integer division in FHE, plaintext divisor) */
        euint64 yield        = FHE.div(principal, YIELD_DIVISOR);
        euint64 claimAmount  = FHE.add(principal, yield);

        /* Grant user access to decrypt the claim amount */
        FHE.allow(claimAmount, msg.sender);

        /* Clear deposit before external call (CEI pattern) */
        _deposits[msg.sender]         = FHE.asEuint64(0);
        FHE.allowThis(_deposits[msg.sender]);
        _depositTimestamp[msg.sender] = 0;
        _hasDeposit[msg.sender]       = false;

        /* Transfer principal + yield from vault's cUSDT balance to user */
        FHE.allowTransient(claimAmount, cUSDT);
        IERC7984Minimal(cUSDT).confidentialTransfer(msg.sender, claimAmount);

        emit Claimed(msg.sender, block.timestamp);
    }

    /* ------------------------------------------------------------------
     * View functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Returns the encrypted deposit handle for `user`.
     *         Caller must hold ACL on the returned handle to decrypt it.
     */
    function getDeposit(address user) external view returns (euint64) {
        return _deposits[user];
    }

    /*
     * @notice Returns the timestamp when `user` deposited. Zero means no deposit.
     */
    function getDepositTimestamp(address user) external view returns (uint256) {
        return _depositTimestamp[user];
    }

    /*
     * @notice Returns true when `user` has an active (unclaimed) deposit.
     */
    function hasDeposit(address user) external view returns (bool) {
        return _hasDeposit[user];
    }

    /*
     * @notice Returns the earliest timestamp at which `user` may claim.
     *         Returns 0 if user has no deposit.
     */
    function unlockTime(address user) external view returns (uint256) {
        if (!_hasDeposit[user]) return 0;
        return _depositTimestamp[user] + LOCK_DURATION;
    }
}
