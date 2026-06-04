// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file FlowRegistry.sol
 * @description Per-sender routing configuration registry for ConfidentialFlow.
 *              Each sender can set a split of (yield%, vest%, liquid%) that must
 *              sum to 100. The ConfidentialPaymentGate reads this to determine
 *              how to split a payment across the three routing modes.
 *
 *              All storage is plaintext — only amounts are encrypted.
 */

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/*
 * @title FlowRegistry
 * @notice Stores per-user routing preferences (yieldPct, vestPct, liquidPct)
 *         where all three values must sum to exactly 100.
 *         Addresses with no explicit config get the default: 100% liquid.
 */
contract FlowRegistry is ZamaEthereumConfig {

    /* ------------------------------------------------------------------
     * Types
     * ------------------------------------------------------------------ */

    /*
     * @notice Routing configuration for one sender.
     * @param yieldPct   Percentage routed to the ConfidentialYieldVault (0-100).
     * @param vestPct    Percentage routed to the ConfidentialVestingModule (0-100).
     * @param liquidPct  Percentage routed directly to the recipient (0-100).
     */
    struct RouteConfig {
        uint8 yieldPct;
        uint8 vestPct;
        uint8 liquidPct;
    }

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    mapping(address => RouteConfig) private _routes;
    mapping(address => bool) private _hasCustomRoute;

    /* ------------------------------------------------------------------
     * Events
     * ------------------------------------------------------------------ */

    event RouteConfigSet(
        address indexed sender,
        uint8 yieldPct,
        uint8 vestPct,
        uint8 liquidPct
    );

    event RouteConfigReset(address indexed sender);

    /* ------------------------------------------------------------------
     * External functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Set a custom routing configuration for msg.sender.
     *         The three percentages must sum to exactly 100.
     * @param yieldPct   Portion for the yield vault.
     * @param vestPct    Portion for the vesting module.
     * @param liquidPct  Portion for direct transfer.
     */
    function setRoute(uint8 yieldPct, uint8 vestPct, uint8 liquidPct) external {
        require(
            uint16(yieldPct) + uint16(vestPct) + uint16(liquidPct) == 100,
            "FlowRegistry: percentages must sum to 100"
        );
        _routes[msg.sender] = RouteConfig(yieldPct, vestPct, liquidPct);
        _hasCustomRoute[msg.sender] = true;
        emit RouteConfigSet(msg.sender, yieldPct, vestPct, liquidPct);
    }

    /*
     * @notice Reset msg.sender's routing config to the default (100% liquid).
     */
    function resetRoute() external {
        delete _routes[msg.sender];
        _hasCustomRoute[msg.sender] = false;
        emit RouteConfigReset(msg.sender);
    }

    /* ------------------------------------------------------------------
     * View functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Returns the routing config for `sender`.
     *         Falls back to (0, 0, 100) if no custom config is set.
     * @param sender  The address whose config to query.
     * @return config  The RouteConfig for sender.
     */
    function getRoute(address sender) external view returns (RouteConfig memory config) {
        if (_hasCustomRoute[sender]) {
            return _routes[sender];
        }
        return RouteConfig({ yieldPct: 0, vestPct: 0, liquidPct: 100 });
    }

    /*
     * @notice Returns true when `sender` has a non-default routing config.
     */
    function hasCustomRoute(address sender) external view returns (bool) {
        return _hasCustomRoute[sender];
    }
}
