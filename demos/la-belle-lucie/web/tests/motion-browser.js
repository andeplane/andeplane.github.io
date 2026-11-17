// Run in the dev-server page at phone width with normal motion enabled.
(async () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    throw Error("Enable normal motion for this check");
  const button = (label) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
  const wait = async (fn) => {
    for (let i = 0; i < 400; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("Motion check timed out");
  };
  document.querySelector(".site-navigation a").click();
  await wait(
    () => button("Winning example") && !button("Winning example").disabled,
  );
  button("Winning example").click();
  await wait(
    () =>
      button("Next move") &&
      !button("Next move").disabled &&
      document.querySelector(".table-status").textContent.includes("Move 0"),
  );
  window.scrollTo(0, document.documentElement.scrollHeight);
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  const previousScroll = scrollY;
  if (
    document.querySelector('[data-card="0"]').getBoundingClientRect().bottom > 0
  )
    throw Error("Fixture needs both endpoints above the viewport");
  button("Next move").click();
  await wait(() => document.querySelector(".flying")?.getAnimations().length);
  const flight = document.querySelector(".flying");
  if (
    parseFloat(flight.style.top) < 0 ||
    parseFloat(flight.style.top) >= innerHeight - 70 ||
    scrollY >= previousScroll
  )
    throw Error("Assisted move stayed offscreen");
  const animation = flight.getAnimations()[0];
  if (
    animation.effect
      .getKeyframes()
      .some((frame) => String(frame.transform).includes("NaN"))
  )
    throw Error("Invalid flight geometry");
  await animation.finished;
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("1 / 52") &&
      !document.querySelector(".flying"),
  );
  return {
    passed: true,
    normalAnimation: true,
    offscreenMoveRevealed: true,
    legalFoundationMove: true,
  };
})();
