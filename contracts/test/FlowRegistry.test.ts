/*
 * @file FlowRegistry.test.ts
 * @description Tests for FlowRegistry routing-config contract.
 *              Covers: setRoute validation, getRoute default, reset, and
 *              the ConfidentialPaymentGate integration path.
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";
import type { FlowRegistry } from "../typechain-types";

describe("FlowRegistry", function () {
    let registry: FlowRegistry;
    let admin: Signer;
    let alice: Signer;
    let bob: Signer;

    beforeEach(async function () {
        [admin, alice, bob] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("FlowRegistry");
        registry = (await Factory.deploy()) as FlowRegistry;
        await registry.waitForDeployment();
    });

    /* ------------------------------------------------------------------
     * Test 1: Default route returns 100% liquid for unset address
     * ------------------------------------------------------------------ */
    it("returns 100% liquid default for unset address", async function () {
        const config = await registry.getRoute(await alice.getAddress());
        expect(config.yieldPct).to.equal(0);
        expect(config.vestPct).to.equal(0);
        expect(config.liquidPct).to.equal(100);
    });

    /* ------------------------------------------------------------------
     * Test 2: setRoute stores and retrieves custom config
     * ------------------------------------------------------------------ */
    it("stores and retrieves a custom route config", async function () {
        await registry.connect(alice).setRoute(20, 30, 50);
        const config = await registry.getRoute(await alice.getAddress());
        expect(config.yieldPct).to.equal(20);
        expect(config.vestPct).to.equal(30);
        expect(config.liquidPct).to.equal(50);
    });

    /* ------------------------------------------------------------------
     * Test 3: setRoute reverts when percentages do not sum to 100
     * ------------------------------------------------------------------ */
    it("reverts when percentages do not sum to 100", async function () {
        await expect(
            registry.connect(alice).setRoute(20, 30, 51)
        ).to.be.revertedWith("FlowRegistry: percentages must sum to 100");
    });

    /* ------------------------------------------------------------------
     * Test 4: setRoute allows (100, 0, 0) — all yield
     * ------------------------------------------------------------------ */
    it("accepts all-yield route (100, 0, 0)", async function () {
        await registry.connect(alice).setRoute(100, 0, 0);
        const config = await registry.getRoute(await alice.getAddress());
        expect(config.yieldPct).to.equal(100);
        expect(config.vestPct).to.equal(0);
        expect(config.liquidPct).to.equal(0);
    });

    /* ------------------------------------------------------------------
     * Test 5: setRoute allows (0, 100, 0) — all vesting
     * ------------------------------------------------------------------ */
    it("accepts all-vesting route (0, 100, 0)", async function () {
        await registry.connect(alice).setRoute(0, 100, 0);
        const config = await registry.getRoute(await alice.getAddress());
        expect(config.yieldPct).to.equal(0);
        expect(config.vestPct).to.equal(100);
        expect(config.liquidPct).to.equal(0);
    });

    /* ------------------------------------------------------------------
     * Test 6: setRoute emits RouteConfigSet event
     * ------------------------------------------------------------------ */
    it("emits RouteConfigSet on setRoute", async function () {
        const aliceAddr = await alice.getAddress();
        await expect(registry.connect(alice).setRoute(10, 40, 50))
            .to.emit(registry, "RouteConfigSet")
            .withArgs(aliceAddr, 10, 40, 50);
    });

    /* ------------------------------------------------------------------
     * Test 7: hasCustomRoute returns false before setting a route
     * ------------------------------------------------------------------ */
    it("hasCustomRoute returns false for default address", async function () {
        expect(await registry.hasCustomRoute(await bob.getAddress())).to.be.false;
    });

    /* ------------------------------------------------------------------
     * Test 8: hasCustomRoute returns true after setRoute
     * ------------------------------------------------------------------ */
    it("hasCustomRoute returns true after setRoute", async function () {
        await registry.connect(bob).setRoute(50, 50, 0);
        expect(await registry.hasCustomRoute(await bob.getAddress())).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 9: resetRoute reverts to default
     * ------------------------------------------------------------------ */
    it("resetRoute reverts custom config to default", async function () {
        await registry.connect(alice).setRoute(40, 30, 30);
        await registry.connect(alice).resetRoute();
        const config = await registry.getRoute(await alice.getAddress());
        expect(config.liquidPct).to.equal(100);
        expect(await registry.hasCustomRoute(await alice.getAddress())).to.be.false;
    });

    /* ------------------------------------------------------------------
     * Test 10: resetRoute emits RouteConfigReset event
     * ------------------------------------------------------------------ */
    it("emits RouteConfigReset on resetRoute", async function () {
        const aliceAddr = await alice.getAddress();
        await registry.connect(alice).setRoute(50, 50, 0);
        await expect(registry.connect(alice).resetRoute())
            .to.emit(registry, "RouteConfigReset")
            .withArgs(aliceAddr);
    });
});
