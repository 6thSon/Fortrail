/* Contract addresses — populated from env vars after deployment */
export const CONTRACT_ADDRESSES = {
  cUSDT:           import.meta.env.VITE_CUSDT_ADDRESS         ?? "",
  gate:            import.meta.env.VITE_GATE_ADDRESS           ?? "",
  vault:           import.meta.env.VITE_VAULT_ADDRESS          ?? "",
  vesting:         import.meta.env.VITE_VESTING_ADDRESS        ?? "",
  flowRegistry:    import.meta.env.VITE_FLOW_REGISTRY_ADDRESS  ?? "",
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
  "function deposit(bytes32 encryptedAmount, bytes calldata inputProof) external",
  "function routePayment(address recipient, bytes32 encryptedAmount, bytes calldata inputProof, uint8 mode) external",
  "function getBalance(address user) external view returns (bytes32)",
  "function hasBalance(address user) external view returns (bool)",
  "function sanctioned(address user) external view returns (bool)",
  "function admin() external view returns (address)",
  "function setSanctioned(address user, bool status) external",
  "function transferAdmin(address newAdmin) external",
  "event Deposited(address indexed user, uint256 timestamp)",
  "event PaymentRouted(address indexed from, address indexed to, uint8 mode, uint256 timestamp)",
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
