import { copyFile, readFile } from "node:fs/promises";

// Capacitor starts at /index.html. The website keeps its separate /math/ URL.
const entry = new URL("../dist-calculus-ios/math/index.html", import.meta.url);
const html = await readFile(entry, "utf8");
if (!html.includes("<title>Captain Calculus · A Pirate Math Adventure</title>")) {
  throw new Error("The native bundle must start with Captain Calculus.");
}
await copyFile(entry, new URL("../dist-calculus-ios/index.html", import.meta.url));
