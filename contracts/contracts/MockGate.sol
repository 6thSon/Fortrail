// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file MockGate.sol
 * @description Test-only helper that simulates what ConfidentialPaymentGate
 *              does before delegating to ConfidentialYieldVault or
 *              ConfidentialVestingModule.
 *
 *              Calling FHE.fromExternal() here gives this contract ACL
 *              ownership of the resulting euint64, then FHE.allowTransient()
 *              lets the target contract call FHE.allowThis() on it.
 *              This mirrors the real gate's routePayment behaviour and allows
 *              vault / vesting unit tests to run without the full gate.
 */

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

interface IVaultDeposit {
    function deposit(address user, euint64 amount) external;
}

interface IVestingCreate {
    function createVest(
        address beneficiary,
        euint64 totalAmount,
        uint256 cliffTimestamp,
        uint256 vestingDuration
    ) external;
}

contract MockGate is ZamaEthereumConfig {

    /*
     * @notice Verify an encrypted input and forward it to the vault.
     *         Uses FHE.allowTransient so vault.deposit can call FHE.allowThis.
     */
    function depositToVault(
        address vault,
        address user,
        externalEuint64 handle,
        bytes calldata inputProof
    ) external {
        euint64 amount = FHE.fromExternal(handle, inputProof);
        FHE.allowTransient(amount, vault);
        IVaultDeposit(vault).deposit(user, amount);
    }

    /*
     * @notice Verify an encrypted input and forward it to the vesting module.
     *         Uses FHE.allowTransient so createVest can call FHE.allowThis.
     */
    function createVestInModule(
        address vestingModule,
        address beneficiary,
        externalEuint64 handle,
        bytes calldata inputProof,
        uint256 cliffTimestamp,
        uint256 vestingDuration
    ) external {
        euint64 amount = FHE.fromExternal(handle, inputProof);
        FHE.allowTransient(amount, vestingModule);
        IVestingCreate(vestingModule).createVest(
            beneficiary, amount, cliffTimestamp, vestingDuration
        );
    }
}
