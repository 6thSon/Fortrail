// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file IERC7984Minimal.sol
 * @description Minimal interface for the cUSDT ERC-7984 confidential token
 *              deployed by Zama on Sepolia. Only the functions used by the
 *              ConfidentialFlow gateway and vault are declared here.
 *
 *              Full ERC-7984 spec: https://eips.ethereum.org/EIPS/eip-7984
 */

import { euint64 } from "@fhevm/solidity/lib/FHE.sol";

/*
 * @title IERC7984Minimal
 * @notice Minimal interface covering confidential transfer and operator
 *         management used by ConfidentialFlow contracts.
 */
interface IERC7984Minimal {
    /*
     * @notice Transfer encrypted tokens from the caller's balance to `to`.
     *         Caller must have persistent or transient ACL on `amount`.
     * @param to      Recipient address
     * @param amount  Encrypted transfer amount (handle)
     */
    function confidentialTransfer(address to, euint64 amount) external;

    /*
     * @notice Operator-pull: transfer from `from` to `to`.
     *         Caller must be an approved operator of `from`.
     *         Caller must have persistent or transient ACL on `amount`.
     * @param from    Token holder
     * @param to      Recipient address
     * @param amount  Encrypted transfer amount (handle)
     */
    function confidentialTransferFrom(address from, address to, euint64 amount) external;

    /*
     * @notice Approve `operator` to call confidentialTransferFrom on behalf
     *         of msg.sender until `until` (unix timestamp, uint48).
     * @param operator  Spender address
     * @param until     Approval expiry (uint48 unix timestamp)
     */
    function setOperator(address operator, uint48 until) external;

    /*
     * @notice Returns true when `spender` is an active operator of `holder`.
     */
    function isOperator(address holder, address spender) external view returns (bool);

    /*
     * @notice Returns the encrypted balance handle for `account`.
     *         Caller must hold ACL on the returned handle to decrypt it.
     */
    function balanceOf(address account) external view returns (euint64);
}
