import type { CapacitorConfig } from "@capacitor/cli";

const calculus = process.env.CAPTAIN_CALCULUS === "1";

const config: CapacitorConfig = {
  appId: calculus ? "com.andeplane.captaincalculus" : "com.andeplane.broadside",
  appName: calculus ? "Captain Calculus" : "Broadside",
  webDir: calculus ? "dist-calculus-ios" : "dist-ios",
  backgroundColor: "#102e36",
  plugins: {
    SystemBars: { hidden: true, animation: "NONE" },
  },
  ios: {
    path: calculus ? "ios-calculus" : "ios",
    contentInset: "never",
    scrollEnabled: false,
    zoomEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
    backgroundColor: "#102e36",
  },
};

export default config;
