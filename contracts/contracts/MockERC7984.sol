// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file MockERC7984.sol
 * @description Minimal mock of the ERC-7984 cUSDT token for Hardhat tests.
 *              Implements the IERC7984Minimal interface using the FHE coprocessor
 *              mock provided by @fhevm/hardhat-plugin. Not for production use.
 */

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984Minimal } from "./interfaces/IERC7984Minimal.sol";

contract MockERC7984 is ZamaEthereumConfig, IERC7984Minimal {

    mapping(address => euint64)          private _balances;
    mapping(address => mapping(address => uint48)) private _operators;

    /* ------------------------------------------------------------------
     * Mint helper (test-only)
     * ------------------------------------------------------------------ */

    /*
     * @notice Mint encrypted tokens to an account. Only used in tests.
     */
    function mintEncrypted(
        address to,
        externalEuint64 encAmount,
        bytes calldata  inputProof
    ) external {
        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        euint64 newBal = FHE.add(_balances[to], amount);
        FHE.allowThis(newBal);
        FHE.allow(newBal, to);
        _balances[to] = newBal;
    }

    /* ------------------------------------------------------------------
     * IERC7984Minimal implementation
     * ------------------------------------------------------------------ */

    function confidentialTransfer(address to, euint64 amount) external override {
        require(to != address(0), "MockERC7984: zero recipient");

        /* Debit sender */
        euint64 senderNewBal = FHE.sub(_balances[msg.sender], amount);
        FHE.allowThis(senderNewBal);
        FHE.allow(senderNewBal, msg.sender);
        _balances[msg.sender] = senderNewBal;

        /* Credit recipient */
        euint64 recipientNewBal = FHE.add(_balances[to], amount);
        FHE.allowThis(recipientNewBal);
        FHE.allow(recipientNewBal, to);
        _balances[to] = recipientNewBal;
    }

    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external override {
        require(to != address(0),                "MockERC7984: zero recipient");
        require(
            _operators[from][msg.sender] >= uint48(block.timestamp),
            "MockERC7984: not an operator or expired"
        );

        /* Debit from */
        euint64 fromNewBal = FHE.sub(_balances[from], amount);
        FHE.allowThis(fromNewBal);
        FHE.allow(fromNewBal, from);
        _balances[from] = fromNewBal;

        /* Credit to */
        euint64 toNewBal = FHE.add(_balances[to], amount);
        FHE.allowThis(toNewBal);
        FHE.allow(toNewBal, to);
        _balances[to] = toNewBal;
    }

    function setOperator(address operator, uint48 until) external override {
        _operators[msg.sender][operator] = until;
    }

    function isOperator(address holder, address spender) external view override returns (bool) {
        return _operators[holder][spender] >= uint48(block.timestamp);
    }

    function balanceOf(address account) external view override returns (euint64) {
        return _balances[account];
    }
}
