import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { Lock, Send, Coins, Clock, ArrowRight, ShieldCheck, ChevronDown } from "lucide-react";
import { CONTRACT_ADDRESSES, GATE_ABI, CUSDT_ABI, ROUTING_MODE } from "@/lib/contracts";
import { encryptUint64 } from "@/lib/fhevm";
import { useToast } from "@/hooks/use-toast";

const ROUTING_OPTIONS = [
  {
    mode: ROUTING_MODE.LIQUID,
    label: "Direct Transfer",
    description: "Instant confidential transfer to recipient",
    icon: Send,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
  },
  {
    mode: ROUTING_MODE.YIELD,
    label: "Yield Vault",
    description: "Lock for 24 h, earn +1% yield",
    icon: Coins,
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/30",
  },
  {
    mode: ROUTING_MODE.VESTING,
    label: "Vesting Schedule",
    description: "30-day cliff, 180-day linear vest",
    icon: Clock,
    color: "text-chart-3",
    bg: "bg-chart-3/10",
    border: "border-chart-3/30",
  },
];

export default function SendPage() {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();

  const [recipient, setRecipient]   = useState("");
  const [amount, setAmount]         = useState("");
  const [mode, setMode]             = useState(ROUTING_MODE.LIQUID);
  const [isEncrypting, setIsEncrypting] = useState(false);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const selectedOption = ROUTING_OPTIONS.find(o => o.mode === mode)!;

  async function handleApproveOperator() {
    if (!address) return;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
    writeContract({
      address: CONTRACT_ADDRESSES.cUSDT as `0x${string}`,
      abi: CUSDT_ABI,
      functionName: "setOperator",
      args: [CONTRACT_ADDRESSES.gate as `0x${string}`, expiry],
    });
    toast({ title: "Operator approval sent", description: "Waiting for confirmation…" });
  }

  async function handleDeposit() {
    if (!address || !amount) return;
    setIsEncrypting(true);
    try {
      const amountBigInt = parseUnits(amount, 6);
      const { handle, inputProof } = await encryptUint64(
        amountBigInt,
        CONTRACT_ADDRESSES.gate,
        address
      );
      writeContract({
        address: CONTRACT_ADDRESSES.gate as `0x${string}`,
        abi: GATE_ABI,
        functionName: "deposit",
        args: [handle, inputProof],
      });
      toast({ title: "Deposit submitted", description: "Your encrypted deposit is being processed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsEncrypting(false);
    }
  }

  async function handleSend() {
    if (!address || !amount || !recipient) return;
    setIsEncrypting(true);
    try {
      const amountBigInt = parseUnits(amount, 6);
      const { handle, inputProof } = await encryptUint64(
        amountBigInt,
        CONTRACT_ADDRESSES.gate,
        address
      );
      writeContract({
        address: CONTRACT_ADDRESSES.gate as `0x${string}`,
        abi: GATE_ABI,
        functionName: "routePayment",
        args: [recipient as `0x${string}`, handle, inputProof, mode],
      });
      toast({ title: "Payment submitted", description: "Your confidential payment is routing now." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsEncrypting(false);
    }
  }

  const isBusy = isPending || isConfirming || isEncrypting;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">Confidential Payments</h1>
          <p className="text-muted-foreground max-w-md">
            Connect your wallet to send encrypted cUSDT using Zama FHEVM — amounts never visible on-chain.
          </p>
        </div>
        <div className="encrypted-badge px-4 py-2 rounded-lg text-sm text-primary/90 cipher-text">
          0xA3f9…B2e7 ▸ [ENCRYPTED] ▸ 0x7d2C…E891
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary" />
          Send cUSDT
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          All amounts encrypted via FHEVM — zero on-chain visibility.
        </p>
      </div>

      {/* Step 1: Approve */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">1</span>
          Approve Gate as cUSDT Operator
        </div>
        <p className="text-xs text-muted-foreground">
          One-time approval allowing the gate to pull cUSDT from your wallet during deposits.
        </p>
        <button
          onClick={handleApproveOperator}
          disabled={isBusy}
          className="w-full py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/60 text-sm font-medium transition-colors disabled:opacity-50"
        >
          Approve Operator
        </button>
      </div>

      {/* Step 2: Deposit */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">2</span>
          Deposit into Gate
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Amount (cUSDT)</label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              onClick={handleDeposit}
              disabled={isBusy || !amount}
              className="px-4 py-2.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              Deposit
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: Route Payment */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">3</span>
          Route Payment
        </div>

        {/* Recipient */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Recipient Address</label>
          <input
            type="text"
            placeholder="0x…"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Amount (cUSDT)</label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Routing mode */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">Routing Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {ROUTING_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = mode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => setMode(opt.mode)}
                  className={[
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all",
                    active
                      ? `${opt.bg} ${opt.border} ${opt.color}`
                      : "bg-secondary/30 border-border/40 text-muted-foreground hover:bg-secondary/60"
                  ].join(" ")}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <div className={`mt-2 text-xs ${selectedOption.color}/70 flex items-center gap-1`}>
            <selectedOption.icon className="w-3 h-3" />
            {selectedOption.description}
          </div>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isBusy || !recipient || !amount}
          className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 glow-primary"
        >
          {isBusy ? (
            <span className="cipher-text text-sm">Encrypting…</span>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Send Encrypted
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {isSuccess && (
          <p className="text-xs text-chart-3 text-center">
            Payment confirmed on-chain. Amount stays encrypted.
          </p>
        )}
      </div>
    </div>
  );
}
