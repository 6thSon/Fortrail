/*
 * @file deploy.ts
 * @description Deployment script for ConfidentialFlow contracts on Sepolia.
 *
 *              Deploy order:
 *                1. MockERC7984     (test cUSDT token — no deps)
 *                2. FlowRegistry    (no deps)
 *                3. ConfidentialPaymentGate  (needs cUSDT + registry)
 *                4. ConfidentialYieldVault   (needs gate + cUSDT)
 *                5. ConfidentialVestingModule (needs gate + cUSDT)
 *                6. gate.setModules(vault, vesting)
 *
 *              Saves addresses to: deployments/sepolia.json
 *
 *              Required env (contracts/.env):
 *                SEPOLIA_RPC_URL        — Alchemy / Infura endpoint
 *                DEPLOYER_PRIVATE_KEY   — 0x-prefixed deployer key
 *
 *              Run: cd contracts && npx hardhat run scripts/deploy.ts --network sepolia
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log(
        "Balance:",
        ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
        "ETH"
    );

    /* ------------------------------------------------------------------ */
    /* 1. MockERC7984 (test cUSDT)                                         */
    /* ------------------------------------------------------------------ */
    const TokenFactory = await ethers.getContractFactory("MockERC7984");
    const cUSDT = await TokenFactory.deploy();
    await cUSDT.waitForDeployment();
    const cUSDTAddr = await cUSDT.getAddress();
    console.log("MockERC7984 (cUSDT) deployed:", cUSDTAddr);

    /* ------------------------------------------------------------------ */
    /* 2. FlowRegistry                                                      */
    /* ------------------------------------------------------------------ */
    const RegistryFactory = await ethers.getContractFactory("FlowRegistry");
    const registry = await RegistryFactory.deploy();
    await registry.waitForDeployment();
    const registryAddr = await registry.getAddress();
    console.log("FlowRegistry deployed:", registryAddr);

    /* ------------------------------------------------------------------ */
    /* 3. ConfidentialPaymentGate (cUSDT, registry)                        */
    /* ------------------------------------------------------------------ */
    const GateFactory = await ethers.getContractFactory("ConfidentialPaymentGate");
    const gate = await GateFactory.deploy(cUSDTAddr, registryAddr);
    await gate.waitForDeployment();
    const gateAddr = await gate.getAddress();
    console.log("ConfidentialPaymentGate deployed:", gateAddr);

    /* ------------------------------------------------------------------ */
    /* 4. ConfidentialYieldVault (gate, cUSDT)                             */
    /* ------------------------------------------------------------------ */
    const VaultFactory = await ethers.getContractFactory("ConfidentialYieldVault");
    const vault = await VaultFactory.deploy(gateAddr, cUSDTAddr);
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    console.log("ConfidentialYieldVault deployed:", vaultAddr);

    /* ------------------------------------------------------------------ */
    /* 5. ConfidentialVestingModule (gate, cUSDT)                          */
    /* ------------------------------------------------------------------ */
    const VestFactory = await ethers.getContractFactory("ConfidentialVestingModule");
    const vesting = await VestFactory.deploy(gateAddr, cUSDTAddr);
    await vesting.waitForDeployment();
    const vestingAddr = await vesting.getAddress();
    console.log("ConfidentialVestingModule deployed:", vestingAddr);

    /* ------------------------------------------------------------------ */
    /* 6. Wire vault + vesting into gate                                   */
    /* ------------------------------------------------------------------ */
    const wireTx = await gate.setModules(vaultAddr, vestingAddr);
    await wireTx.wait();
    console.log("gate.setModules(vault, vesting) confirmed.");

    /* ------------------------------------------------------------------ */
    /* 7. Save deployments/sepolia.json                                    */
    /* ------------------------------------------------------------------ */
    const deployments = {
        network: "sepolia",
        chainId: 11155111,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            cUSDT:         cUSDTAddr,
            yieldVault:    vaultAddr,
            vestingModule: vestingAddr,
            flowRegistry:  registryAddr,
            paymentGate:   gateAddr,
        },
    };

    const outDir  = path.join(__dirname, "..", "deployments");
    const outFile = path.join(outDir, "sepolia.json");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2));

    console.log("\n✅ Deployment complete — addresses saved to deployments/sepolia.json");
    console.log(JSON.stringify(deployments.contracts, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
