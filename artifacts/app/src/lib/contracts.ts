/* Contract addresses — Sepolia deployment (2026-06-05) */
export const CONTRACT_ADDRESSES = {
  cUSDT:        "0x9A2Bc655517d22CAC4a331Cfee6Fe7271f900Ec1",
  gate:         "0x78e9683ab9A62C8A1F12a72E05e209111f7bec40",
  vault:        "0xEC9dC67572704d219bfd03ED8Be0f4231f659a18",
  vesting:      "0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190",
  flowRegistry: "0xA55A0E3CE8d613E090580eB1f797579b192376E0",
} as const;

/* Routing modes */
export const ROUTING_MODE = {
  LIQUID:  0,
  YIELD:   1,
  VESTING: 2,
} as const;

export type RoutingMode = typeof ROUTING_MODE[keyof typeof ROUTING_MODE];

/* Minimal ABIs for UI interactions */
export const GATE_ABI = [
  /* Core payment functions */
  "function deposit(bytes32 encryptedAmount, bytes calldata inputProof) external",
  "function routePayment(address recipient, bytes32 encryptedAmount, bytes calldata inputProof, uint8 mode) external",

  /* Protocol registry integration */
  "function routeFromProtocol(address from, address to, bytes32 encryptedAmount, uint8 routingMode) external",

  /* Balance / status queries */
  "function getBalance(address user) external view returns (bytes32)",
  "function hasBalance(address user) external view returns (bool)",

  /* Sanction / admin */
  "function sanctioned(address user) external view returns (bool)",
  "function admin() external view returns (address)",
  "function setSanctioned(address user, bool status) external",
  "function transferAdmin(address newAdmin) external",
  "function setModules(address yieldVault, address vestingModule) external",

  /* Protocol registry admin */
  "function authorizedProtocols(address protocol) external view returns (bool)",
  "function protocolNames(address protocol) external view returns (string)",
  "function registerProtocol(address protocol, string calldata name) external",
  "function revokeProtocol(address protocol) external",
  "function getRegisteredProtocols() external view returns (address[] memory protocols, string[] memory names)",

  /* Events */
  "event Deposited(address indexed user, uint256 timestamp)",
  "event PaymentRouted(address indexed from, address indexed to, uint8 mode, uint256 timestamp)",
  "event ProtocolRegistered(address indexed protocol, string name)",
  "event ProtocolRevoked(address indexed protocol)",
] as const;

export const VAULT_ABI = [
  "function claimWithYield() external",
  "function hasDeposit(address user) external view returns (bool)",
  "function unlockTime(address user) external view returns (uint256)",
  "event Deposited(address indexed user, uint256 timestamp)",
  "event Claimed(address indexed user, uint256 timestamp)",
] as const;

export const VESTING_ABI = [
  "function claim() external",
  "function hasSchedule(address beneficiary) external view returns (bool)",
  "function cliffTimestamp(address beneficiary) external view returns (uint256)",
  "function vestingDuration(address beneficiary) external view returns (uint256)",
  "event VestingCreated(address indexed beneficiary, uint256 cliffTimestamp, uint256 vestingDuration)",
  "event VestingClaimed(address indexed beneficiary, uint256 timestamp)",
] as const;

export const REGISTRY_ABI = [
  "function setRoute(uint8 yieldPct, uint8 vestPct, uint8 liquidPct) external",
  "function resetRoute() external",
  "function getRoute(address sender) external view returns (tuple(uint8 yieldPct, uint8 vestPct, uint8 liquidPct))",
  "function hasCustomRoute(address sender) external view returns (bool)",
] as const;

export const CUSDT_ABI = [
  "function setOperator(address operator, uint48 until) external",
  "function isOperator(address holder, address spender) external view returns (bool)",
  "function balanceOf(address account) external view returns (bytes32)",
] as const;
