import type { CapacitorConfig } from "@capacitor/cli";

const game = process.env.PIRATE_GAME ?? (process.env.CAPTAIN_CALCULUS === "1" ? "calculus" : "broadside");
if (!["broadside", "calculus", "reading"].includes(game)) throw new Error(`Unknown pirate game: ${game}`);
const games = {
  broadside: {appId:"com.andeplane.broadside",name:"Broadside",webDir:"dist-ios",path:"ios"},
  calculus: {appId:"com.andeplane.captaincalculus",name:"Captain Calculus",webDir:"dist-calculus-ios",path:"ios-calculus"},
  reading: {appId:"com.andeplane.captainreader",name:"Captain Reader",webDir:"dist-reading-ios",path:"ios-reading"},
};
const selected = games[game as keyof typeof games];

const config: CapacitorConfig = {
  ...(game === "reading" ? { loggingBehavior: "none" as const } : {}),
  appId: selected.appId,
  appName: selected.name,
  webDir: selected.webDir,
  backgroundColor: "#102e36",
  plugins: {
    SystemBars: { hidden: true, animation: "NONE" },
  },
  ios: {
    path: selected.path,
    contentInset: "never",
    scrollEnabled: false,
    zoomEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
    backgroundColor: "#102e36",
  },
};

export default config;
