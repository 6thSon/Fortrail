import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Settings, ShieldBan, ShieldCheck, UserX, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { CONTRACT_ADDRESSES, GATE_ABI, REGISTRY_ABI } from "@/lib/contracts";
import { useToast } from "@/hooks/use-toast";

function SanctionPanel() {
  const { toast } = useToast();
  const [targetAddress, setTargetAddress] = useState("");
  const [checkAddress, setCheckAddress] = useState("");

  const { data: isSanctioned, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.gate as `0x${string}`,
    abi: GATE_ABI,
    functionName: "sanctioned",
    args: [checkAddress as `0x${string}`],
    query: { enabled: checkAddress.length === 42 },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  function handleSanction(status: boolean) {
    if (!targetAddress) return;
    writeContract({
      address: CONTRACT_ADDRESSES.gate as `0x${string}`,
      abi: GATE_ABI,
      functionName: "setSanctioned",
      args: [targetAddress as `0x${string}`, status],
    });
    toast({
      title: status ? "Sanction applied" : "Sanction lifted",
      description: `${targetAddress.slice(0, 10)}…`,
    });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-destructive/15 border border-destructive/30 flex items-center justify-center">
          <UserX className="w-4 h-4 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-sm">Sanction Controls</p>
          <p className="text-xs text-muted-foreground">Sanctioned senders route 0 (silent, no revert)</p>
        </div>
      </div>

      {/* Check sanction status */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Check address</label>
        <div className="flex gap-2">
          <input
            value={checkAddress}
            onChange={e => setCheckAddress(e.target.value)}
            placeholder="0x…"
            className="flex-1 bg-input/30 border border-border/60 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={() => refetch()}
            className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/60 text-sm transition-colors"
          >
            Check
          </button>
        </div>
        {checkAddress.length === 42 && isSanctioned !== undefined && (
          <div className={`flex items-center gap-1.5 text-xs ${isSanctioned ? "text-destructive" : "text-chart-3"}`}>
            {isSanctioned ? <ShieldBan className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {isSanctioned ? "Address is sanctioned" : "Address is not sanctioned"}
          </div>
        )}
      </div>

      {/* Apply / lift sanction */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Apply / lift sanction</label>
        <input
          value={targetAddress}
          onChange={e => setTargetAddress(e.target.value)}
          placeholder="0x…"
          className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="flex gap-2">
          <button
            onClick={() => handleSanction(true)}
            disabled={!targetAddress || isPending || isConfirming}
            className="flex-1 py-2 rounded-lg bg-destructive/15 hover:bg-destructive/25 border border-destructive/30 text-destructive text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <ShieldBan className="w-3.5 h-3.5" />
            Sanction
          </button>
          <button
            onClick={() => handleSanction(false)}
            disabled={!targetAddress || isPending || isConfirming}
            className="flex-1 py-2 rounded-lg bg-chart-3/15 hover:bg-chart-3/25 border border-chart-3/30 text-chart-3 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Lift
          </button>
        </div>
        {(isPending || isConfirming) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Processing…
          </div>
        )}
        {isSuccess && (
          <div className="flex items-center gap-1.5 text-xs text-chart-3">
            <CheckCircle className="w-3.5 h-3.5" />
            Sanction status updated
          </div>
        )}
      </div>
    </div>
  );
}

function RouteConfigPanel({ address }: { address: `0x${string}` }) {
  const { toast } = useToast();
  const [yieldPct, setYieldPct] = useState("0");
  const [vestPct, setVestPct]   = useState("0");
  const [liquidPct, setLiquidPct] = useState("100");

  const { data: currentRoute, refetch: refetchRoute } = useReadContract({
    address: CONTRACT_ADDRESSES.flowRegistry as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "getRoute",
    args: [address],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const total = Number(yieldPct) + Number(vestPct) + Number(liquidPct);
  const isValid = total === 100;

  function handleSetRoute() {
    writeContract({
      address: CONTRACT_ADDRESSES.flowRegistry as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "setRoute",
      args: [Number(yieldPct), Number(vestPct), Number(liquidPct)],
    });
    toast({ title: "Route config submitted" });
  }

  function handleReset() {
    writeContract({
      address: CONTRACT_ADDRESSES.flowRegistry as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: "resetRoute",
    });
    toast({ title: "Route reset to default (100% liquid)" });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
          <Settings className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Routing Configuration</p>
          <p className="text-xs text-muted-foreground">Set your default payment routing split</p>
        </div>
      </div>

      {/* Current config */}
      {currentRoute && (
        <div className="bg-secondary/30 rounded-lg p-3 space-y-1.5 text-xs">
          <p className="text-muted-foreground font-medium">Current Config</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Yield", value: currentRoute.yieldPct, color: "text-accent" },
              { label: "Vest",  value: currentRoute.vestPct,  color: "text-chart-3" },
              { label: "Liquid",value: currentRoute.liquidPct,color: "text-primary" },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className={`font-bold text-lg ${item.color}`}>{String(item.value)}%</p>
                <p className="text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input fields */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Yield %",  value: yieldPct,  set: setYieldPct,  color: "border-accent/30 focus:ring-accent/50" },
          { label: "Vest %",   value: vestPct,   set: setVestPct,   color: "border-chart-3/30 focus:ring-chart-3/50" },
          { label: "Liquid %", value: liquidPct, set: setLiquidPct, color: "border-primary/30 focus:ring-primary/50" },
        ].map(({ label, value, set, color }) => (
          <div key={label}>
            <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
            <input
              type="number"
              min={0} max={100}
              value={value}
              onChange={e => set(e.target.value)}
              className={`w-full bg-input/30 border rounded-lg px-3 py-2 text-sm font-mono text-center focus:outline-none focus:ring-1 ${color}`}
            />
          </div>
        ))}
      </div>

      {!isValid && (
        <div className="flex items-center gap-1.5 text-xs text-chart-4">
          <AlertTriangle className="w-3.5 h-3.5" />
          Percentages must sum to 100 (currently {total})
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSetRoute}
          disabled={!isValid || isPending || isConfirming}
          className="flex-1 py-2.5 rounded-lg bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-sm font-medium transition-colors disabled:opacity-50"
        >
          Save Route
        </button>
        <button
          onClick={handleReset}
          disabled={isPending || isConfirming}
          className="px-4 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/60 text-sm transition-colors disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { data: adminAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.gate as `0x${string}`,
    abi: GATE_ABI,
    functionName: "admin",
    query: { enabled: isConnected },
  });

  const isAdmin = isConnected && address && adminAddress &&
    address.toLowerCase() === (adminAddress as string).toLowerCase();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Settings className="w-12 h-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">Connect your wallet to access admin controls.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Admin / Compliance
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sanction controls and routing configuration.
        </p>
      </div>

      {/* Admin status */}
      <div className={`rounded-lg px-4 py-2.5 border text-xs flex items-center gap-2 ${
        isAdmin
          ? "bg-chart-3/10 border-chart-3/30 text-chart-3"
          : "bg-chart-4/10 border-chart-4/30 text-chart-4"
      }`}>
        {isAdmin
          ? <><CheckCircle className="w-3.5 h-3.5" /> You are the gate admin</>
          : <><AlertTriangle className="w-3.5 h-3.5" /> Not the gate admin — some actions may revert</>
        }
      </div>

      {isAdmin && <SanctionPanel />}

      <RouteConfigPanel address={address!} />

      {/* Compliance note */}
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/80">Compliance model</p>
        <p>
          Sanctioned senders have their payment amount silently zeroed via
          <code className="mx-1 font-mono text-primary">FHE.select</code>
          — transactions succeed but route zero, so sanction status
          cannot be inferred from on-chain success/revert patterns.
        </p>
      </div>
    </div>
  );
}
