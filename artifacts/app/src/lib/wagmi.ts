import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { darkTheme } from "@rainbow-me/rainbowkit";

export const wagmiConfig = getDefaultConfig({
  appName: "ConfidentialFlow",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "confidentialflow-demo",
  chains: [sepolia],
  ssr: false,
});

export const rainbowKitTheme = darkTheme({
  accentColor: "hsl(199 89% 48%)",
  accentColorForeground: "hsl(222 47% 6%)",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
});
