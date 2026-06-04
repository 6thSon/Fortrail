/* FHE client-side helpers using @zama-fhe/relayer-sdk/web */

let relayerInstance: any = null;

export async function getRelayer() {
  if (relayerInstance) return relayerInstance;

  /* Use the /web subpath — the root package has no "." export */
  const { RelayerWeb } = await import("@zama-fhe/relayer-sdk/web");

  relayerInstance = await RelayerWeb.create({
    gatewayUrl: "https://gateway.sepolia.zama.ai/",
    networkUrl:  import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
  });

  return relayerInstance;
}

export async function encryptUint64(
  value: bigint,
  contractAddress: string,
  userAddress: string
): Promise<{ handle: `0x${string}`; inputProof: `0x${string}` }> {
  const relayer = await getRelayer();
  const input = relayer.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);
  const { handles, inputProof } = input.encrypt();
  return {
    handle:     handles[0] as `0x${string}`,
    inputProof: inputProof as `0x${string}`,
  };
}

/* Formats an encrypted handle for display */
export function formatEncryptedHandle(handle: `0x${string}`): string {
  if (!handle || handle === "0x" + "0".repeat(64)) return "0x0000…0000";
  return handle.slice(0, 10) + "…" + handle.slice(-8);
}
