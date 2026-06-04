// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file ConfidentialVestingModule.sol
 * @description Linear vesting module for ConfidentialFlow.
 *              The ConfidentialPaymentGate calls createVest() to initialize a
 *              vesting schedule for a beneficiary. After the cliff timestamp the
 *              beneficiary may call claim() at any time; the claimable amount is
 *              determined by elapsed / vestingDuration (plaintext fraction) applied
 *              to the encrypted totalAmount via FHE.mul and FHE.div.
 *
 *              FHE branching rule: FHE.select() is used to clamp the claimable
 *              amount to zero when claimedAmount >= vestedAmount (rounding guard).
 *              No require() on an ebool or any other encrypted condition.
 *
 *              ACL rules:
 *                - Gate grants this contract transient ACL on totalAmount before
 *                  calling createVest().
 *                - This contract calls FHE.allowThis() on every stored handle.
 *                - This contract calls FHE.allow(handle, beneficiary) so the
 *                  beneficiary can decrypt their schedule off-chain.
 */

import { FHE, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984Minimal } from "./interfaces/IERC7984Minimal.sol";

/*
 * @title ConfidentialVestingModule
 * @notice Linear vesting with a cliff. Amounts are never revealed on-chain.
 */
contract ConfidentialVestingModule is ZamaEthereumConfig {

    /* ------------------------------------------------------------------
     * Types
     * ------------------------------------------------------------------ */

    /*
     * @notice Per-beneficiary vesting schedule.
     * @param totalAmount      Total encrypted tokens to vest.
     * @param claimedAmount    Running tally of claimed encrypted tokens.
     * @param cliffTimestamp   Earliest timestamp at which any claim is allowed.
     * @param vestingDuration  Seconds over which tokens vest linearly after cliff.
     * @param vestingStart     Timestamp when vesting began (used for linear calc).
     * @param initialized      Guard flag — false means no schedule exists.
     */
    struct VestingSchedule {
        euint64 totalAmount;
        euint64 claimedAmount;
        uint256 cliffTimestamp;
        uint256 vestingDuration;
        uint256 vestingStart;
        bool    initialized;
    }

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    address public immutable paymentGate;
    address public immutable cUSDT;

    mapping(address => VestingSchedule) private _schedules;

    /* ------------------------------------------------------------------
     * Events
     * ------------------------------------------------------------------ */

    event VestingCreated(
        address indexed beneficiary,
        uint256 cliffTimestamp,
        uint256 vestingDuration
    );

    event VestingClaimed(address indexed beneficiary, uint256 timestamp);

    /* ------------------------------------------------------------------
     * Modifiers
     * ------------------------------------------------------------------ */

    modifier onlyGate() {
        require(msg.sender == paymentGate, "ConfidentialVestingModule: caller is not the gate");
        _;
    }

    /* ------------------------------------------------------------------
     * Constructor
     * ------------------------------------------------------------------ */

    /*
     * @param _paymentGate  Address of ConfidentialPaymentGate.
     * @param _cUSDT        Address of the ERC-7984 cUSDT token contract.
     */
    constructor(address _paymentGate, address _cUSDT) {
        require(_paymentGate != address(0), "ConfidentialVestingModule: zero gate address");
        require(_cUSDT != address(0),       "ConfidentialVestingModule: zero token address");
        paymentGate = _paymentGate;
        cUSDT       = _cUSDT;
    }

    /* ------------------------------------------------------------------
     * External functions (gate-only)
     * ------------------------------------------------------------------ */

    /*
     * @notice Create a vesting schedule for `beneficiary`.
     *         Caller (gate) must have granted this contract transient ACL on
     *         `totalAmount` before this call, and the cUSDT tokens must already
     *         have been transferred to this contract by the gate.
     *         A beneficiary can only have one active schedule at a time.
     * @param beneficiary      The address that will claim vested tokens.
     * @param totalAmount      Encrypted total amount to vest.
     * @param cliffTimestamp   Unix timestamp before which no claim is permitted.
     * @param vestingDuration  Seconds of linear vesting after the cliff.
     */
    function createVest(
        address beneficiary,
        euint64 totalAmount,
        uint256 cliffTimestamp,
        uint256 vestingDuration
    ) external onlyGate {
        require(beneficiary != address(0), "ConfidentialVestingModule: zero beneficiary");
        require(!_schedules[beneficiary].initialized, "ConfidentialVestingModule: schedule already active");
        require(cliffTimestamp >= block.timestamp,    "ConfidentialVestingModule: cliff in the past");
        require(vestingDuration > 0,                 "ConfidentialVestingModule: zero vesting duration");

        /* Persist the totalAmount handle for future claim calculations */
        FHE.allowThis(totalAmount);
        /* Grant beneficiary ACL so they can decrypt their allocation off-chain */
        FHE.allow(totalAmount, beneficiary);
        /* Grant gate ACL for auditing */
        FHE.allow(totalAmount, paymentGate);

        euint64 zeroClaimed = FHE.asEuint64(0);
        FHE.allowThis(zeroClaimed);
        FHE.allow(zeroClaimed, beneficiary);

        _schedules[beneficiary] = VestingSchedule({
            totalAmount:     totalAmount,
            claimedAmount:   zeroClaimed,
            cliffTimestamp:  cliffTimestamp,
            vestingDuration: vestingDuration,
            vestingStart:    block.timestamp,
            initialized:     true
        });

        emit VestingCreated(beneficiary, cliffTimestamp, vestingDuration);
    }

    /* ------------------------------------------------------------------
     * External functions (beneficiary)
     * ------------------------------------------------------------------ */

    /*
     * @notice Claim all currently vested tokens minus already-claimed tokens.
     *         The vested fraction is computed as a plaintext basis-point ratio
     *         (elapsed * 10000 / vestingDuration) then applied to the encrypted
     *         totalAmount via FHE.mul + FHE.div with plaintext operands.
     *         FHE.select is used to clamp claimable to 0 if already fully claimed.
     */
    function claim() external {
        VestingSchedule storage schedule = _schedules[msg.sender];
        require(schedule.initialized,                             "ConfidentialVestingModule: no active schedule");
        require(block.timestamp >= schedule.cliffTimestamp,       "ConfidentialVestingModule: cliff not reached");

        /* Compute vested basis points (0 - 10000) entirely in plaintext */
        uint256 elapsed = block.timestamp - schedule.cliffTimestamp;
        uint256 capped  = elapsed < schedule.vestingDuration ? elapsed : schedule.vestingDuration;

        /* vestBps = capped * 10_000 / vestingDuration, range [0, 10000] */
        uint64 vestBps  = uint64((capped * 10_000) / schedule.vestingDuration);

        /*
         * Apply plaintext fraction to encrypted total:
         *   vestedAmount = totalAmount * vestBps / 10000
         * Overflow note: euint64 max ~1.84e19; vestBps <= 10000;
         * safe for token amounts up to ~1.84e15 (6-decimal: ~1.84 billion).
         */
        euint64 vestedAmount = FHE.div(
            FHE.mul(schedule.totalAmount, vestBps),
            uint64(10_000)
        );

        /*
         * claimable = max(vestedAmount - claimedAmount, 0)
         * Use FHE.le to guard against underflow:
         *   hasMore = claimedAmount <= vestedAmount
         *   claimable = FHE.select(hasMore, vested - claimed, 0)
         */
        ebool hasMore   = FHE.le(schedule.claimedAmount, vestedAmount);
        euint64 claimable = FHE.select(
            hasMore,
            FHE.sub(vestedAmount, schedule.claimedAmount),
            FHE.asEuint64(0)
        );

        /* Update running claimed amount */
        euint64 newClaimed = FHE.add(schedule.claimedAmount, claimable);
        FHE.allowThis(newClaimed);
        FHE.allow(newClaimed, msg.sender);
        schedule.claimedAmount = newClaimed;

        /* Grant msg.sender access to decrypt the claimable amount */
        FHE.allow(claimable, msg.sender);

        /* Transfer claimable amount from vault's cUSDT balance to beneficiary */
        FHE.allowTransient(claimable, cUSDT);
        IERC7984Minimal(cUSDT).confidentialTransfer(msg.sender, claimable);

        emit VestingClaimed(msg.sender, block.timestamp);
    }

    /* ------------------------------------------------------------------
     * View functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Returns whether `beneficiary` has an active vesting schedule.
     */
    function hasSchedule(address beneficiary) external view returns (bool) {
        return _schedules[beneficiary].initialized;
    }

    /*
     * @notice Returns the cliff timestamp for `beneficiary` (0 if none).
     */
    function cliffTimestamp(address beneficiary) external view returns (uint256) {
        return _schedules[beneficiary].cliffTimestamp;
    }

    /*
     * @notice Returns the vesting duration in seconds for `beneficiary`.
     */
    function vestingDuration(address beneficiary) external view returns (uint256) {
        return _schedules[beneficiary].vestingDuration;
    }

    /*
     * @notice Returns the encrypted totalAmount handle for `beneficiary`.
     *         Caller must hold ACL on the returned handle to decrypt it.
     */
    function totalAmount(address beneficiary) external view returns (euint64) {
        return _schedules[beneficiary].totalAmount;
    }

    /*
     * @notice Returns the encrypted claimedAmount handle for `beneficiary`.
     *         Caller must hold ACL on the returned handle to decrypt it.
     */
    function claimedAmount(address beneficiary) external view returns (euint64) {
        return _schedules[beneficiary].claimedAmount;
    }
}
