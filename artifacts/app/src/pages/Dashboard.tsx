import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Lock, Coins, Clock, Eye, EyeOff, RefreshCw, CheckCircle } from "lucide-react";
import { useState } from "react";
import { CONTRACT_ADDRESSES, VAULT_ABI, VESTING_ABI } from "@/lib/contracts";
import { formatEncryptedHandle } from "@/lib/fhevm";
import { useToast } from "@/hooks/use-toast";

function EncryptedBadge({ handle }: { handle?: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm cipher-text text-primary">
        {revealed && handle ? formatEncryptedHandle(handle as `0x${string}`) : "[ENCRYPTED]"}
      </span>
      <button
        onClick={() => setRevealed(r => !r)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Toggle handle display"
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function VaultCard({ address }: { address: `0x${string}` }) {
  const { toast } = useToast();
  const { data: hasDeposit } = useReadContract({
    address: CONTRACT_ADDRESSES.vault as `0x${string}`,
    abi: VAULT_ABI,
    functionName: "hasDeposit",
    args: [address],
  });
  const { data: unlockTime } = useReadContract({
    address: CONTRACT_ADDRESSES.vault as `0x${string}`,
    abi: VAULT_ABI,
    functionName: "unlockTime",
    args: [address],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const unlockTs = unlockTime ? BigInt(unlockTime.toString()) : 0n;
  const unlocked = unlockTs > 0n && now >= unlockTs;
  const timeLeft = unlockTs > now ? Number(unlockTs - now) : 0;

  function formatTimeLeft(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m remaining`;
  }

  function handleClaim() {
    writeContract({
      address: CONTRACT_ADDRESSES.vault as `0x${string}`,
      abi: VAULT_ABI,
      functionName: "claimWithYield",
    });
    toast({ title: "Claim submitted", description: "Claiming principal + 1% yield." });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Coins className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-sm">Yield Vault</p>
            <p className="text-xs text-muted-foreground">24-hour lock · +1% yield</p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          hasDeposit
            ? unlocked ? "bg-chart-3/15 text-chart-3 border border-chart-3/30"
                       : "bg-accent/15 text-accent border border-accent/30"
            : "bg-secondary/50 text-muted-foreground border border-border/40"
        }`}>
          {hasDeposit ? (unlocked ? "Ready" : "Locked") : "Empty"}
        </span>
      </div>

      <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Deposited amount</span>
          <EncryptedBadge />
        </div>
        {hasDeposit && unlockTs > 0n && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Unlocks at</span>
            <span className="font-mono text-foreground">
              {new Date(Number(unlockTs) * 1000).toLocaleString()}
            </span>
          </div>
        )}
        {hasDeposit && !unlocked && timeLeft > 0 && (
          <div className="text-xs text-accent/80">{formatTimeLeft(timeLeft)}</div>
        )}
      </div>

      {hasDeposit && (
        <button
          onClick={handleClaim}
          disabled={!unlocked || isPending || isConfirming}
          className="w-full py-2.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isPending || isConfirming ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : isSuccess ? (
            <><CheckCircle className="w-4 h-4" /> Claimed!</>
          ) : (
            <><Coins className="w-4 h-4" /> Claim with Yield</>
          )}
        </button>
      )}
    </div>
  );
}

function VestingCard({ address }: { address: `0x${string}` }) {
  const { toast } = useToast();
  const { data: hasSchedule } = useReadContract({
    address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
    abi: VESTING_ABI,
    functionName: "hasSchedule",
    args: [address],
  });
  const { data: cliff } = useReadContract({
    address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
    abi: VESTING_ABI,
    functionName: "cliffTimestamp",
    args: [address],
  });
  const { data: duration } = useReadContract({
    address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
    abi: VESTING_ABI,
    functionName: "vestingDuration",
    args: [address],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const cliffTs = cliff ? BigInt(cliff.toString()) : 0n;
  const pastCliff = cliffTs > 0n && now >= cliffTs;

  function handleClaim() {
    writeContract({
      address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
      abi: VESTING_ABI,
      functionName: "claim",
    });
    toast({ title: "Vesting claim submitted" });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-chart-3/15 border border-chart-3/30 flex items-center justify-center">
            <Clock className="w-4 h-4 text-chart-3" />
          </div>
          <div>
            <p className="font-semibold text-sm">Vesting Schedule</p>
            <p className="text-xs text-muted-foreground">
              {duration ? `${Math.round(Number(duration) / 86400)}-day linear vest` : "30-day cliff · 180-day vest"}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          hasSchedule
            ? pastCliff ? "bg-chart-3/15 text-chart-3 border border-chart-3/30"
                        : "bg-secondary/50 text-muted-foreground border border-border/40"
            : "bg-secondary/50 text-muted-foreground border border-border/40"
        }`}>
          {hasSchedule ? (pastCliff ? "Claimable" : "Vesting") : "None"}
        </span>
      </div>

      <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total allocation</span>
          <EncryptedBadge />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Already claimed</span>
          <EncryptedBadge />
        </div>
        {cliff && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Cliff date</span>
            <span className="font-mono text-foreground">
              {new Date(Number(cliff) * 1000).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {hasSchedule && (
        <button
          onClick={handleClaim}
          disabled={!pastCliff || isPending || isConfirming}
          className="w-full py-2.5 rounded-lg bg-chart-3/15 hover:bg-chart-3/25 border border-chart-3/30 text-chart-3 text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isPending || isConfirming ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : isSuccess ? (
            <><CheckCircle className="w-4 h-4" /> Claimed!</>
          ) : (
            <><Clock className="w-4 h-4" /> Claim Vested Tokens</>
          )}
        </button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Lock className="w-12 h-12 text-primary/40" />
        <p className="text-muted-foreground">Connect your wallet to view your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary" />
          My Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your encrypted positions — amounts only visible to you.
        </p>
      </div>

      {/* Connected address */}
      <div className="rounded-lg bg-secondary/30 border border-border/40 px-4 py-2.5 flex items-center gap-2 text-sm">
        <div className="w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
        <span className="font-mono text-muted-foreground text-xs truncate">{address}</span>
      </div>

      <VaultCard address={address!} />
      <VestingCard address={address!} />

      {/* Privacy note */}
      <div className="encrypted-badge rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-primary text-sm">End-to-end encrypted</p>
        <p>
          All balance values are stored as encrypted handles on-chain.
          Only you can decrypt them using your wallet signature via the Zama Gateway.
        </p>
      </div>
    </div>
  );
}
