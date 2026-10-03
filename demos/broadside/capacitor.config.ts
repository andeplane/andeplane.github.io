import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andeplane.broadside",
  appName: "Broadside",
  webDir: "dist-ios",
  backgroundColor: "#102e36",
  plugins: {
    SystemBars: { hidden: true, animation: "NONE" },
  },
  ios: {
    contentInset: "never",
    scrollEnabled: false,
    zoomEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
    backgroundColor: "#102e36",
  },
};

export default config;
