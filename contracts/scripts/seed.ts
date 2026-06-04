/*
 * @file seed.ts
 * @description Seed script: approves the gate as cUSDT operator for the deployer
 *              and sets a custom 50/50 yield/liquid routing config in FlowRegistry.
 *              Used for demo purposes after deploy.ts has run.
 *
 *              Required env vars:
 *                GATE_ADDRESS          — from deploy.ts output
 *                FLOW_REGISTRY_ADDRESS — from deploy.ts output
 *                CUSDT_ADDRESS         — Sepolia cUSDT address
 *
 *              Run: pnpm seed:sepolia
 */
import { ethers } from "hardhat";
import {
    RelayerWeb,
    ViemSigner,
    createEncryptedInput,
} from "@zama-fhe/relayer-sdk";

const GATE_ADDRESS          = process.env.GATE_ADDRESS ?? "";
const FLOW_REGISTRY_ADDRESS = process.env.FLOW_REGISTRY_ADDRESS ?? "";
const CUSDT_ADDRESS         = process.env.CUSDT_ADDRESS ?? "";

async function main() {
    if (!GATE_ADDRESS || !FLOW_REGISTRY_ADDRESS || !CUSDT_ADDRESS) {
        throw new Error(
            "GATE_ADDRESS, FLOW_REGISTRY_ADDRESS and CUSDT_ADDRESS env vars must be set"
        );
    }

    const [deployer] = await ethers.getSigners();
    console.log("Seeding with deployer:", deployer.address);

    /* Approve gate as cUSDT operator for 1 year */
    const cUSDT = await ethers.getContractAt("IERC7984Minimal", CUSDT_ADDRESS);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
    const opTx = await cUSDT.setOperator(GATE_ADDRESS, expiry);
    await opTx.wait();
    console.log("Gate approved as cUSDT operator until:", new Date(Number(expiry) * 1000).toISOString());

    /* Set custom routing: 50% yield, 0% vest, 50% liquid */
    const registry = await ethers.getContractAt("FlowRegistry", FLOW_REGISTRY_ADDRESS);
    const routeTx = await registry.setRoute(50, 0, 50);
    await routeTx.wait();
    console.log("FlowRegistry route set: 50% yield / 50% liquid");

    console.log("Seed complete.");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
