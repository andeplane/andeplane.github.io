/** Suppress browser selection/callouts without cancelling game pointer or click events. */
export function installGameSurface(): void {
  const cancel = (event: Event) => event.preventDefault();
  for (const name of ["contextmenu", "selectstart", "dragstart", "dblclick"])
    document.addEventListener(name, cancel, { capture: true });

  // Safari emits these independently of the pointer events used for cave zoom.
  // Cancel viewport gestures; the game's own pinch/drag controls still receive input.
  for (const name of ["gesturestart", "gesturechange", "gestureend"])
    document.addEventListener(name, cancel, { capture: true, passive: false });

  // Also clear a native selection restored by Safari or left by an older build.
  const clearSelection = () => {
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
  };
  clearSelection();
  document.addEventListener("selectionchange", clearSelection);
}
