/*
 * @file deploy.ts
 * @description Deployment script for ConfidentialFlow contracts on Sepolia.
 *
 *              Deploy order:
 *                1. FlowRegistry
 *                2. ConfidentialPaymentGate (depends on FlowRegistry + cUSDT)
 *                3. ConfidentialYieldVault  (depends on Gate + cUSDT)
 *                4. ConfidentialVestingModule (depends on Gate + cUSDT)
 *                5. Gate.setModules(vault, vesting)
 *
 *              Required env vars (see .env.example):
 *                SEPOLIA_RPC_URL      — Infura / Alchemy endpoint
 *                DEPLOYER_PRIVATE_KEY — 0x-prefixed deployer key
 *                CUSDT_ADDRESS        — cUSDT ERC-7984 address on Sepolia
 *
 *              Run: pnpm deploy:sepolia
 */
import { ethers } from "hardhat";

const CUSDT_ADDRESS = process.env.CUSDT_ADDRESS ?? "";

async function main() {
    if (!CUSDT_ADDRESS) {
        throw new Error("CUSDT_ADDRESS env var must be set to the Sepolia cUSDT ERC-7984 address");
    }

    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    /* 1. FlowRegistry */
    const RegistryFactory = await ethers.getContractFactory("FlowRegistry");
    const registry = await RegistryFactory.deploy();
    await registry.waitForDeployment();
    console.log("FlowRegistry deployed:", await registry.getAddress());

    /* 2. ConfidentialPaymentGate */
    const GateFactory = await ethers.getContractFactory("ConfidentialPaymentGate");
    const gate = await GateFactory.deploy(CUSDT_ADDRESS, await registry.getAddress());
    await gate.waitForDeployment();
    console.log("ConfidentialPaymentGate deployed:", await gate.getAddress());

    /* 3. ConfidentialYieldVault */
    const VaultFactory = await ethers.getContractFactory("ConfidentialYieldVault");
    const vault = await VaultFactory.deploy(await gate.getAddress(), CUSDT_ADDRESS);
    await vault.waitForDeployment();
    console.log("ConfidentialYieldVault deployed:", await vault.getAddress());

    /* 4. ConfidentialVestingModule */
    const VestFactory = await ethers.getContractFactory("ConfidentialVestingModule");
    const vesting = await VestFactory.deploy(await gate.getAddress(), CUSDT_ADDRESS);
    await vesting.waitForDeployment();
    console.log("ConfidentialVestingModule deployed:", await vesting.getAddress());

    /* 5. Wire modules into gate */
    const tx = await gate.setModules(await vault.getAddress(), await vesting.getAddress());
    await tx.wait();
    console.log("Gate modules wired.");

    console.log("\n--- Deployed Addresses ---");
    console.log("FLOW_REGISTRY_ADDRESS=", await registry.getAddress());
    console.log("GATE_ADDRESS=",          await gate.getAddress());
    console.log("VAULT_ADDRESS=",         await vault.getAddress());
    console.log("VESTING_ADDRESS=",       await vesting.getAddress());
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
