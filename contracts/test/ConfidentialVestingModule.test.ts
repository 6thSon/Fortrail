/*
 * @file ConfidentialVestingModule.test.ts
 * @description Tests for ConfidentialVestingModule.
 *              Uses MockGate to simulate the ConfidentialPaymentGate ACL flow:
 *              MockGate calls FHE.fromExternal() then FHE.allowTransient() before
 *              delegating to vesting.createVest(), which lets the module call
 *              FHE.allowThis().
 */
import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers, network } from "hardhat";
import hre from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { Signer } from "ethers";
import type { ConfidentialVestingModule } from "../typechain-types";

describe("ConfidentialVestingModule", function () {
    let vesting: ConfidentialVestingModule;
    let mockCUSDT: any;
    let mockGate: any;
    let alice: Signer;
    let bob: Signer;

    const DAY       = 24 * 3600;
    const CLIFF_DAYS = 30;
    const VEST_DAYS  = 180;

    beforeEach(async function () {
        [alice, bob] = await ethers.getSigners();

        const TokenFactory = await ethers.getContractFactory("MockERC7984");
        mockCUSDT = await TokenFactory.deploy();
        await mockCUSDT.waitForDeployment();

        const MockGateFactory = await ethers.getContractFactory("MockGate");
        mockGate = await MockGateFactory.deploy();
        await mockGate.waitForDeployment();

        const VestFactory = await ethers.getContractFactory("ConfidentialVestingModule");
        vesting = (await VestFactory.deploy(
            await mockGate.getAddress(),
            await mockCUSDT.getAddress()
        )) as ConfidentialVestingModule;
        await vesting.waitForDeployment();

        /* Mint tokens to vesting module so it can pay out on claim */
        const mintInput = hre.fhevm.createEncryptedInput(
            await mockCUSDT.getAddress(),
            await alice.getAddress()
        );
        mintInput.add64(1_000_000n);
        const { handles, inputProof } = await mintInput.encrypt();
        await mockCUSDT.connect(alice).mintEncrypted(
            await vesting.getAddress(),
            handles[0],
            inputProof
        );
    });

    /*
     * Helper: create a vesting schedule for `beneficiary` via MockGate.
     * Uses alice as the default caller.
     */
    async function createVestVia(
        beneficiary: Signer,
        amount: bigint,
        cliffTs: bigint,
        vestDur: bigint,
        caller?: Signer
    ) {
        const txSigner     = caller ?? alice;
        const mockGateAddr = await mockGate.getAddress();

        const input = hre.fhevm.createEncryptedInput(
            mockGateAddr,
            await txSigner.getAddress()
        );
        input.add64(amount);
        const { handles, inputProof } = await input.encrypt();

        return mockGate.connect(txSigner).createVestInModule(
            await vesting.getAddress(),
            await beneficiary.getAddress(),
            handles[0],
            inputProof,
            cliffTs,
            vestDur
        );
    }

    async function defaultCliffAndDur(): Promise<[bigint, bigint]> {
        const latestBlock = await ethers.provider.getBlock("latest");
        const cliffTs = BigInt(latestBlock!.timestamp) + BigInt(CLIFF_DAYS * DAY) + 2n;
        const vestDur = BigInt(VEST_DAYS * DAY);
        return [cliffTs, vestDur];
    }

    /* ------------------------------------------------------------------
     * Test 1: createVest sets hasSchedule flag and emits VestingCreated
     * ------------------------------------------------------------------ */
    it("createVest sets hasSchedule flag and emits VestingCreated", async function () {
        const aliceAddr        = await alice.getAddress();
        const [cliffTs, vestDur] = await defaultCliffAndDur();

        await expect(createVestVia(alice, 5_000n, cliffTs, vestDur))
            .to.emit(vesting, "VestingCreated")
            .withArgs(aliceAddr, cliffTs, vestDur);

        expect(await vesting.hasSchedule(aliceAddr)).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 2: non-gate caller cannot createVest
     * ------------------------------------------------------------------ */
    it("reverts when non-gate calls createVest directly", async function () {
        const aliceAddr        = await alice.getAddress();
        const [cliffTs, vestDur] = await defaultCliffAndDur();

        const input = hre.fhevm.createEncryptedInput(
            await vesting.getAddress(),
            aliceAddr
        );
        input.add64(1_000n);
        const { handles } = await input.encrypt();

        await expect(
            vesting.connect(alice).createVest(aliceAddr, handles[0], cliffTs, vestDur)
        ).to.be.revertedWith("ConfidentialVestingModule: caller is not the gate");
    });

    /* ------------------------------------------------------------------
     * Test 3: double createVest for same beneficiary reverts
     * ------------------------------------------------------------------ */
    it("reverts on double createVest for same beneficiary", async function () {
        const [cliffTs, vestDur] = await defaultCliffAndDur();
        await createVestVia(alice, 1_000n, cliffTs, vestDur);

        await expect(createVestVia(alice, 500n, cliffTs, vestDur))
            .to.be.revertedWith("ConfidentialVestingModule: schedule already active");
    });

    /* ------------------------------------------------------------------
     * Test 4: claim reverts before cliff
     * ------------------------------------------------------------------ */
    it("claim reverts before cliff timestamp", async function () {
        const [cliffTs, vestDur] = await defaultCliffAndDur();
        await createVestVia(alice, 1_000n, cliffTs, vestDur);

        await network.provider.send("evm_increaseTime", [(CLIFF_DAYS - 1) * DAY]);
        await network.provider.send("evm_mine", []);

        await expect(
            vesting.connect(alice).claim()
        ).to.be.revertedWith("ConfidentialVestingModule: cliff not reached");
    });

    /* ------------------------------------------------------------------
     * Test 5: claim succeeds after cliff and emits VestingClaimed
     * ------------------------------------------------------------------ */
    it("claim emits VestingClaimed after cliff", async function () {
        const aliceAddr        = await alice.getAddress();
        const [cliffTs, vestDur] = await defaultCliffAndDur();
        await createVestVia(alice, 10_000n, cliffTs, vestDur);

        await network.provider.send("evm_increaseTime", [(CLIFF_DAYS + VEST_DAYS / 2) * DAY]);
        await network.provider.send("evm_mine", []);

        await expect(vesting.connect(alice).claim())
            .to.emit(vesting, "VestingClaimed")
            .withArgs(aliceAddr, anyValue);
    });

    /* ------------------------------------------------------------------
     * Test 6: full vest — claim after vestingDuration receives full amount
     * ------------------------------------------------------------------ */
    it("claim after full vesting duration receives full allocation", async function () {
        const aliceAddr        = await alice.getAddress();
        const principal        = 10_000n;
        const [cliffTs, vestDur] = await defaultCliffAndDur();

        await createVestVia(alice, principal, cliffTs, vestDur);

        await network.provider.send("evm_increaseTime", [(CLIFF_DAYS + VEST_DAYS + 1) * DAY]);
        await network.provider.send("evm_mine", []);
        await vesting.connect(alice).claim();

        const balHandle = await mockCUSDT.balanceOf(aliceAddr) as `0x${string}`;
        const received = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64,
            balHandle,
            await mockCUSDT.getAddress(),
            alice
        );
        expect(received).to.equal(principal);
    });

    /* ------------------------------------------------------------------
     * Test 7: second claim after full vest gets zero additional tokens
     * ------------------------------------------------------------------ */
    it("second claim after full vest returns 0 additional tokens", async function () {
        const aliceAddr        = await alice.getAddress();
        const [cliffTs, vestDur] = await defaultCliffAndDur();

        await createVestVia(alice, 5_000n, cliffTs, vestDur);

        await network.provider.send("evm_increaseTime", [(CLIFF_DAYS + VEST_DAYS + 1) * DAY]);
        await network.provider.send("evm_mine", []);

        await vesting.connect(alice).claim();
        const balHandle1 = await mockCUSDT.balanceOf(aliceAddr) as `0x${string}`;
        const firstBal = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64, balHandle1, await mockCUSDT.getAddress(), alice
        );

        await vesting.connect(alice).claim();
        const balHandle2 = await mockCUSDT.balanceOf(aliceAddr) as `0x${string}`;
        const secondBal = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64, balHandle2, await mockCUSDT.getAddress(), alice
        );

        /* Balance should not change after second claim */
        expect(secondBal).to.equal(firstBal);
    });
});
