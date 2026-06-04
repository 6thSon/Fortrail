// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @file ConfidentialPaymentGate.sol
 * @description Entry-point contract for ConfidentialFlow payment rails.
 *              Users deposit encrypted cUSDT into the gate, then call
 *              routePayment() to send funds to a recipient via one of three modes:
 *                Mode 0 — Direct transfer (liquid)
 *                Mode 1 — Yield vault (24-hour lock + 1% yield)
 *                Mode 2 — Vesting schedule (linear, configurable cliff + duration)
 *
 *              The gate reads per-sender routing preferences from FlowRegistry
 *              but mode is overridable per call.
 *
 *              Sanction enforcement:
 *                Sanctioned senders are silently routed with 0 amount using
 *                FHE.select rather than reverting, so transaction-level observers
 *                cannot infer sanction status from revert/success.
 *
 *              ACL rules (every stored euint64):
 *                - FHE.allowThis() after every write.
 *                - FHE.allow(handle, user) when user needs off-chain decryption.
 *                - FHE.allowTransient(handle, target) before any cross-contract call.
 */

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984Minimal } from "./interfaces/IERC7984Minimal.sol";
import { FlowRegistry } from "./FlowRegistry.sol";

interface IConfidentialYieldVault {
    function deposit(address user, euint64 amount) external;
}

interface IConfidentialVestingModule {
    function createVest(
        address beneficiary,
        euint64 totalAmount,
        uint256 cliffTimestamp,
        uint256 vestingDuration
    ) external;
}

/*
 * @title ConfidentialPaymentGate
 * @notice Custodial gateway: users deposit cUSDT, then route payments confidentially.
 */
contract ConfidentialPaymentGate is ZamaEthereumConfig {

    /* ------------------------------------------------------------------
     * Constants
     * ------------------------------------------------------------------ */

    uint8 public constant MODE_LIQUID  = 0;
    uint8 public constant MODE_YIELD   = 1;
    uint8 public constant MODE_VESTING = 2;

    /*
     * Default vesting parameters used when mode is MODE_VESTING and the
     * caller has not set custom vesting params: 30-day cliff, 180-day duration.
     */
    uint256 public constant DEFAULT_CLIFF_OFFSET   = 30 days;
    uint256 public constant DEFAULT_VEST_DURATION  = 180 days;

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    address public admin;
    address public immutable cUSDT;

    IConfidentialYieldVault    public yieldVault;
    IConfidentialVestingModule public vestingModule;
    FlowRegistry               public flowRegistry;

    mapping(address => bool)    public sanctioned;
    mapping(address => euint64) private _balances;
    mapping(address => bool)    private _hasBalance;

    /* ------------------------------------------------------------------
     * Events
     * ------------------------------------------------------------------ */

    /*
     * Amount is intentionally omitted to preserve confidentiality.
     */
    event Deposited(address indexed user, uint256 timestamp);

    /*
     * Amount is intentionally omitted to preserve confidentiality.
     */
    event PaymentRouted(
        address indexed from,
        address indexed to,
        uint8   mode,
        uint256 timestamp
    );

    event SanctionUpdated(address indexed user, bool sanctioned);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    /* ------------------------------------------------------------------
     * Modifiers
     * ------------------------------------------------------------------ */

    modifier onlyAdmin() {
        require(msg.sender == admin, "ConfidentialPaymentGate: caller is not admin");
        _;
    }

    /* ------------------------------------------------------------------
     * Constructor
     * ------------------------------------------------------------------ */

    /*
     * @param _cUSDT         Address of the ERC-7984 cUSDT token.
     * @param _flowRegistry  Address of the FlowRegistry contract.
     */
    constructor(address _cUSDT, address _flowRegistry) {
        require(_cUSDT != address(0),         "ConfidentialPaymentGate: zero cUSDT address");
        require(_flowRegistry != address(0),  "ConfidentialPaymentGate: zero registry address");
        admin        = msg.sender;
        cUSDT        = _cUSDT;
        flowRegistry = FlowRegistry(_flowRegistry);
    }

    /* ------------------------------------------------------------------
     * Admin functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Wire up vault and vesting module addresses after deployment.
     *         Can only be called once (immutable after first set).
     */
    function setModules(
        address _yieldVault,
        address _vestingModule
    ) external onlyAdmin {
        require(_yieldVault    != address(0), "ConfidentialPaymentGate: zero vault address");
        require(_vestingModule != address(0), "ConfidentialPaymentGate: zero vesting address");
        require(
            address(yieldVault) == address(0),
            "ConfidentialPaymentGate: modules already set"
        );
        yieldVault    = IConfidentialYieldVault(_yieldVault);
        vestingModule = IConfidentialVestingModule(_vestingModule);
    }

    /*
     * @notice Mark or unmark an address as sanctioned.
     *         Sanctioned addresses can still call routePayment but will route 0.
     * @param user    Target address.
     * @param status  True to sanction, false to lift sanction.
     */
    function setSanctioned(address user, bool status) external onlyAdmin {
        sanctioned[user] = status;
        emit SanctionUpdated(user, status);
    }

    /*
     * @notice Transfer admin role to a new address.
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ConfidentialPaymentGate: zero admin address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /* ------------------------------------------------------------------
     * Core functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Deposit encrypted cUSDT into the gate.
     *         Caller must have previously called cUSDT.setOperator(gate, expiry)
     *         to approve the gate as an operator.
     * @param encryptedAmount  ABI-encoded encrypted amount from the FHEVM SDK.
     * @param inputProof       ZK proof for the encrypted amount.
     */
    function deposit(
        externalEuint64 encryptedAmount,
        bytes calldata  inputProof
    ) external {
        /* Decrypt and verify the user-supplied input; gate gets transient ACL */
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        /* Pull cUSDT from user into gate (operator approval required) */
        FHE.allowTransient(amount, cUSDT);
        IERC7984Minimal(cUSDT).confidentialTransferFrom(msg.sender, address(this), amount);

        /* Update gate-internal balance tracking */
        if (_hasBalance[msg.sender]) {
            euint64 newBal = FHE.add(_balances[msg.sender], amount);
            FHE.allowThis(newBal);
            FHE.allow(newBal, msg.sender);
            _balances[msg.sender] = newBal;
        } else {
            FHE.allowThis(amount);
            FHE.allow(amount, msg.sender);
            _balances[msg.sender] = amount;
            _hasBalance[msg.sender] = true;
        }

        emit Deposited(msg.sender, block.timestamp);
    }

    /*
     * @notice Route an encrypted payment from the caller's gate balance to a recipient.
     *
     *         Sanction gate: if msg.sender is sanctioned the effective amount is
     *         silently zeroed via FHE.select (no revert, no information leak).
     *
     *         Insufficient-balance gate: if the requested amount exceeds the
     *         gate balance the effective amount is also silently zeroed.
     *
     * @param recipient        Destination address.
     * @param encryptedAmount  ABI-encoded encrypted amount.
     * @param inputProof       ZK proof for the encrypted amount.
     * @param mode             Routing mode: 0=liquid, 1=yield, 2=vesting.
     */
    function routePayment(
        address         recipient,
        externalEuint64 encryptedAmount,
        bytes calldata  inputProof,
        uint8           mode
    ) external {
        require(recipient != address(0), "ConfidentialPaymentGate: zero recipient");
        require(mode <= MODE_VESTING,    "ConfidentialPaymentGate: invalid mode");
        require(_hasBalance[msg.sender], "ConfidentialPaymentGate: no deposit");

        /* Step 1: Decrypt user-supplied amount; gate has transient ACL */
        euint64 requestedAmt = FHE.fromExternal(encryptedAmount, inputProof);

        /* Step 2: Apply sanction filter (no revert — preserves confidentiality) */
        ebool notSanctioned  = FHE.asEbool(!sanctioned[msg.sender]);
        euint64 sanitizedAmt = FHE.select(notSanctioned, requestedAmt, FHE.asEuint64(0));

        /* Step 3: Balance-sufficiency gate */
        ebool hasEnough    = FHE.le(sanitizedAmt, _balances[msg.sender]);
        euint64 sendAmt    = FHE.select(hasEnough, sanitizedAmt, FHE.asEuint64(0));
        euint64 newBalance = FHE.select(
            hasEnough,
            FHE.sub(_balances[msg.sender], sanitizedAmt),
            _balances[msg.sender]
        );

        /* Step 4: Persist updated sender balance */
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);
        _balances[msg.sender] = newBalance;

        /* Step 5: Dispatch based on mode */
        if (mode == MODE_YIELD) {
            require(address(yieldVault) != address(0), "ConfidentialPaymentGate: vault not set");
            FHE.allowTransient(sendAmt, cUSDT);
            IERC7984Minimal(cUSDT).confidentialTransfer(address(yieldVault), sendAmt);
            FHE.allowTransient(sendAmt, address(yieldVault));
            yieldVault.deposit(recipient, sendAmt);

        } else if (mode == MODE_VESTING) {
            require(address(vestingModule) != address(0), "ConfidentialPaymentGate: vesting not set");
            uint256 cliffTs      = block.timestamp + DEFAULT_CLIFF_OFFSET;
            uint256 vestDuration = DEFAULT_VEST_DURATION;
            FHE.allowTransient(sendAmt, cUSDT);
            IERC7984Minimal(cUSDT).confidentialTransfer(address(vestingModule), sendAmt);
            FHE.allowTransient(sendAmt, address(vestingModule));
            vestingModule.createVest(recipient, sendAmt, cliffTs, vestDuration);

        } else {
            /* MODE_LIQUID: direct transfer to recipient */
            FHE.allowTransient(sendAmt, cUSDT);
            IERC7984Minimal(cUSDT).confidentialTransfer(recipient, sendAmt);
        }

        /* Allow recipient to decrypt the sent amount for their records */
        FHE.allow(sendAmt, recipient);

        emit PaymentRouted(msg.sender, recipient, mode, block.timestamp);
    }

    /* ------------------------------------------------------------------
     * View functions
     * ------------------------------------------------------------------ */

    /*
     * @notice Returns the encrypted gate-balance handle for `user`.
     *         Caller must hold ACL on the returned handle to decrypt it.
     */
    function getBalance(address user) external view returns (euint64) {
        return _balances[user];
    }

    /*
     * @notice Returns true when `user` has a non-zero gate balance entry.
     */
    function hasBalance(address user) external view returns (bool) {
        return _hasBalance[user];
    }
}
