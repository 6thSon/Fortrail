/*
 * @file seed.ts
 * @description Seed script: mints 1,000,000 cUSDT to the deployer,
 *              approves the gate as cUSDT operator for the deployer,
 *              and sets a custom 50/50 yield/liquid routing config.
 *
 *              Required env:
 *                SEPOLIA_RPC_URL        — Alchemy / Infura endpoint
 *                DEPLOYER_PRIVATE_KEY   — 0x-prefixed deployer key
 *
 *              Reads contract addresses from: deployments/sepolia.json
 *
 *              Run: cd contracts && npx hardhat run scripts/seed.ts --network sepolia
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    /* Load deployed addresses */
    const sepoliaJson = path.join(__dirname, "..", "deployments", "sepolia.json");
    if (!fs.existsSync(sepoliaJson)) {
        throw new Error("deployments/sepolia.json not found — run deploy.ts first");
    }
    const dep = JSON.parse(fs.readFileSync(sepoliaJson, "utf8"));
    const { cUSDT: cUSDTAddr, yieldVault: vaultAddr, flowRegistry: registryAddr, paymentGate: gateAddr } = dep.contracts;

    const [deployer] = await ethers.getSigners();
    console.log("Seeding with deployer:", deployer.address);
    console.log("cUSDT:", cUSDTAddr);
    console.log("Gate:", gateAddr);

    /* ------------------------------------------------------------------
     * Step 1 — Mint 1,000,000 cUSDT to deployer using FHE encryption
     *
     * mintEncrypted() requires a ZK proof from the Zama relayer. If the
     * relayer is unreachable (e.g. restricted network / CI environment),
     * this step is skipped and a warning is printed. Mint can be run
     * separately once the relayer is accessible.
     * ------------------------------------------------------------------ */
    const RELAYER_URL = "https://relayer.zama.ai";
    const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "";
    const MINT_AMOUNT = 1_000_000n;

    const cUSDTContract = await ethers.getContractAt("MockERC7984", cUSDTAddr);

    try {
        console.log("\n📦 Creating FHEVM instance for encryption...");
        // Dynamic import to use the Node.js variant of the relayer SDK
        const { createInstance, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/node");

        const instance = await createInstance({
            ...SepoliaConfig,
            network: SEPOLIA_RPC_URL,
            relayerUrl: RELAYER_URL,
        });

        console.log("🔐 Encrypting mint amount:", MINT_AMOUNT.toString(), "cUSDT...");
        const input = instance.createEncryptedInput(cUSDTAddr, deployer.address);
        input.addUint64(MINT_AMOUNT);
        const { handles, inputProof } = await input.encrypt();
        console.log("✅ Encrypted. Submitting mintEncrypted transaction...");

        const mintTx = await cUSDTContract.mintEncrypted(deployer.address, handles[0], inputProof);
        await mintTx.wait();
        console.log("✅ Minted 1,000,000 cUSDT to", deployer.address);
    } catch (err: any) {
        console.warn(
            "\n⚠️  FHE mint skipped — Zama relayer unreachable from this environment."
        );
        console.warn(
            "   To mint later, run this seed script from a machine with access to https://relayer.zama.ai"
        );
        console.warn("   Error:", err?.message ?? String(err));
    }

    /* ------------------------------------------------------------------
     * Step 2 — Approve gate as cUSDT operator (1 year)
     * ------------------------------------------------------------------ */
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
    const opTx = await cUSDTContract.setOperator(gateAddr, expiry);
    await opTx.wait();
    console.log(
        "✅ Gate approved as cUSDT operator until:",
        new Date(Number(expiry) * 1000).toISOString()
    );

    /* ------------------------------------------------------------------
     * Step 3 — Set routing: 50% yield, 0% vest, 50% liquid
     * ------------------------------------------------------------------ */
    const registry = await ethers.getContractAt("FlowRegistry", registryAddr);
    const routeTx = await registry.setRoute(50, 0, 50);
    await routeTx.wait();
    console.log("✅ FlowRegistry route set: 50% yield / 50% liquid");

    console.log("\n✅ Seed complete.");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
