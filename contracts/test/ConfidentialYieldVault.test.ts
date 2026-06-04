/*
 * @file ConfidentialYieldVault.test.ts
 * @description Tests for ConfidentialYieldVault.
 *              Uses MockGate to simulate the ConfidentialPaymentGate ACL flow:
 *              MockGate calls FHE.fromExternal() then FHE.allowTransient() before
 *              delegating to vault.deposit(), which lets vault call FHE.allowThis().
 */
import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers, network } from "hardhat";
import hre from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { Signer } from "ethers";
import type { ConfidentialYieldVault } from "../typechain-types";

describe("ConfidentialYieldVault", function () {
    let vault: ConfidentialYieldVault;
    let mockCUSDT: any;
    let mockGate: any;
    let alice: Signer;
    let other: Signer;

    const LOCK_DURATION = 24 * 3600;

    beforeEach(async function () {
        [alice, other] = await ethers.getSigners();

        const TokenFactory = await ethers.getContractFactory("MockERC7984");
        mockCUSDT = await TokenFactory.deploy();
        await mockCUSDT.waitForDeployment();

        const MockGateFactory = await ethers.getContractFactory("MockGate");
        mockGate = await MockGateFactory.deploy();
        await mockGate.waitForDeployment();

        const VaultFactory = await ethers.getContractFactory("ConfidentialYieldVault");
        vault = (await VaultFactory.deploy(
            await mockGate.getAddress(),
            await mockCUSDT.getAddress()
        )) as ConfidentialYieldVault;
        await vault.waitForDeployment();

        /* Mint cUSDT to vault so it can pay out claims */
        const mintInput = hre.fhevm.createEncryptedInput(
            await mockCUSDT.getAddress(),
            await alice.getAddress()
        );
        mintInput.add64(100_000n);
        const { handles, inputProof } = await mintInput.encrypt();
        await mockCUSDT.connect(alice).mintEncrypted(
            await vault.getAddress(),
            handles[0],
            inputProof
        );
    });

    /* Helper: deposit `amount` to vault for `beneficiary` via MockGate */
    async function depositVia(beneficiary: Signer, amount: bigint, caller?: Signer) {
        const txSigner  = caller ?? alice;
        const mockGateAddr = await mockGate.getAddress();

        const input = hre.fhevm.createEncryptedInput(
            mockGateAddr,
            await txSigner.getAddress()
        );
        input.add64(amount);
        const { handles, inputProof } = await input.encrypt();

        return mockGate.connect(txSigner).depositToVault(
            await vault.getAddress(),
            await beneficiary.getAddress(),
            handles[0],
            inputProof
        );
    }

    /* ------------------------------------------------------------------
     * Test 1: deposit sets hasDeposit flag and emits event
     * ------------------------------------------------------------------ */
    it("deposit sets hasDeposit flag and emits Deposited", async function () {
        const aliceAddr = await alice.getAddress();
        await expect(depositVia(alice, 1_000n))
            .to.emit(vault, "Deposited")
            .withArgs(aliceAddr, anyValue);

        expect(await vault.hasDeposit(aliceAddr)).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 2: non-gate caller cannot deposit
     * ------------------------------------------------------------------ */
    it("reverts when non-gate calls deposit directly", async function () {
        const aliceAddr = await alice.getAddress();

        /* alice calls vault.deposit directly — not via mockGate */
        const input = hre.fhevm.createEncryptedInput(
            await vault.getAddress(),
            aliceAddr
        );
        input.add64(500n);
        const { handles } = await input.encrypt();

        /* vault.deposit takes (address, euint64) — cast handles[0] */
        await expect(
            vault.connect(alice).deposit(aliceAddr, handles[0])
        ).to.be.revertedWith("ConfidentialYieldVault: caller is not the gate");
    });

    /* ------------------------------------------------------------------
     * Test 3: double deposit reverts
     * ------------------------------------------------------------------ */
    it("reverts on double deposit for same user", async function () {
        await depositVia(alice, 1_000n);

        await expect(depositVia(alice, 500n))
            .to.be.revertedWith("ConfidentialYieldVault: existing deposit not yet claimed");
    });

    /* ------------------------------------------------------------------
     * Test 4: claimWithYield reverts before lock period elapses
     * ------------------------------------------------------------------ */
    it("reverts claimWithYield before lock period", async function () {
        await depositVia(alice, 1_000n);

        await network.provider.send("evm_increaseTime", [LOCK_DURATION - 60]);
        await network.provider.send("evm_mine", []);

        await expect(
            vault.connect(alice).claimWithYield()
        ).to.be.revertedWith("ConfidentialYieldVault: lock period not elapsed");
    });

    /* ------------------------------------------------------------------
     * Test 5: claimWithYield succeeds after lock period and clears deposit
     * ------------------------------------------------------------------ */
    it("claimWithYield succeeds after lock period and clears deposit", async function () {
        const aliceAddr = await alice.getAddress();
        await depositVia(alice, 1_000n);

        await network.provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
        await network.provider.send("evm_mine", []);

        await expect(vault.connect(alice).claimWithYield())
            .to.emit(vault, "Claimed")
            .withArgs(aliceAddr, anyValue);

        expect(await vault.hasDeposit(aliceAddr)).to.be.false;
    });

    /* ------------------------------------------------------------------
     * Test 6: claimWithYield includes 1% yield in payout
     * ------------------------------------------------------------------ */
    it("claimWithYield pays out principal + 1% yield", async function () {
        const aliceAddr = await alice.getAddress();
        const principal = 10_000n;

        await depositVia(alice, principal);

        await network.provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
        await network.provider.send("evm_mine", []);
        await vault.connect(alice).claimWithYield();

        const balHandle = await mockCUSDT.balanceOf(aliceAddr) as `0x${string}`;
        const received = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64,
            balHandle,
            await mockCUSDT.getAddress(),
            alice
        );
        expect(received).to.equal(principal + principal / 100n);
    });

    /* ------------------------------------------------------------------
     * Test 7: double claim reverts after first successful claim
     * ------------------------------------------------------------------ */
    it("reverts on double claim after first claim", async function () {
        await depositVia(alice, 1_000n);

        await network.provider.send("evm_increaseTime", [LOCK_DURATION + 1]);
        await network.provider.send("evm_mine", []);
        await vault.connect(alice).claimWithYield();

        await expect(
            vault.connect(alice).claimWithYield()
        ).to.be.revertedWith("ConfidentialYieldVault: no deposit found");
    });

    /* ------------------------------------------------------------------
     * Test 8: unlockTime returns correct future timestamp
     * ------------------------------------------------------------------ */
    it("returns correct unlock timestamp", async function () {
        const aliceAddr = await alice.getAddress();
        const tx      = await depositVia(alice, 500n);
        const receipt = await tx.wait();
        const block   = await ethers.provider.getBlock(receipt!.blockNumber);
        const expectedUnlock = BigInt(block!.timestamp) + BigInt(LOCK_DURATION);

        const unlock = await vault.unlockTime(aliceAddr);
        expect(unlock).to.equal(expectedUnlock);
    });
});
