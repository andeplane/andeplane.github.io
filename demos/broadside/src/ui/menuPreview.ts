/** Browser QA can reserve the same space as the physical phone's system areas. */
export function installMenuPreview(): void {
  if (!import.meta.env.DEV) return;
  const mode = new URLSearchParams(location.search).get("phoneInsets");
  if (mode !== "portrait" && mode !== "landscape") return;
  const insets = mode === "portrait" ? [62, 34, 0, 0] : [0, 21, 62, 62];
  ["top", "bottom", "left", "right"].forEach((side, i) => {
    document.documentElement.style.setProperty(`--pirate-safe-${side}`, `${insets[i]}px`);
  });
}
