// Run with a fresh app tab and reduced motion enabled:
// agent-browser --session <owned-session> eval --stdin < tests/browser-smoke.js
(async () => {
  const find = (text) =>
    [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === text,
    );
  const wait = async (predicate) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error("Timed out waiting for UI state");
  };
  const snapshot = () =>
    JSON.stringify({
      cards: [...document.querySelectorAll(".pile")].map((pile) =>
        [...pile.querySelectorAll("[data-card]")].map(
          (card) => card.dataset.card,
        ),
      ),
      foundations: [...document.querySelectorAll("[data-foundation]")].map(
        (card) => card.textContent,
      ),
      status: document.querySelector(".table-status").textContent,
    });
  const verifyHints = () => {
    const tops = [
      ...document.querySelectorAll(".pile .exposed[data-card]"),
    ].map((card) => Number(card.dataset.card));
    const exposed = new Set(tops);
    const ranks = [
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ];
    const foundations = [...document.querySelectorAll("[data-foundation]")].map(
      (foundation) =>
        ranks.indexOf(
          foundation.querySelector("span:last-child").textContent.trim(),
        ) + 1,
    );
    const expected = tops
      .filter(
        (card) =>
          card % 13 === foundations[Math.floor(card / 13)] ||
          (card % 13 < 12 && exposed.has(card + 1)),
      )
      .sort((left, right) => left - right);
    const actual = [
      ...document.querySelectorAll(".playing-card.hinted[data-card]"),
    ]
      .map((card) => Number(card.dataset.card))
      .sort((left, right) => left - right);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw Error(`Incorrect hints: ${JSON.stringify({ actual, expected })}`);
    if (document.querySelector(".covered.hinted"))
      throw Error("A covered card was highlighted");
    const expectedArrows = tops
      .flatMap((card) => {
        const destinations = [];
        if (card % 13 === foundations[Math.floor(card / 13)])
          destinations.push(`${card}:-1`);
        if (card % 13 < 12 && exposed.has(card + 1))
          destinations.push(`${card}:${card + 1}`);
        return destinations;
      })
      .sort();
    const actualArrows = [...document.querySelectorAll(".hint-arrow")]
      .map(
        (arrow) => `${arrow.dataset.sourceCard}:${arrow.dataset.destination}`,
      )
      .sort();
    if (JSON.stringify(actualArrows) !== JSON.stringify(expectedArrows))
      throw Error("Hint arrows do not match all legal destinations");
    for (const arrow of document.querySelectorAll(".hint-arrow")) {
      if (/NaN|Infinity/.test(arrow.getAttribute("d")))
        throw Error("Invalid arrow geometry");
      const table = document.querySelector(".game").getBoundingClientRect();
      const source = document
        .querySelector(`[data-card="${arrow.dataset.sourceCard}"]`)
        .getBoundingClientRect();
      const target = document
        .querySelector(
          Number(arrow.dataset.destination) < 0
            ? `[data-foundation="${Math.floor(Number(arrow.dataset.sourceCard) / 13)}"]`
            : `[data-card="${arrow.dataset.destination}"]`,
        )
        .getBoundingClientRect();
      const nearEdge = (point, rectangle) => {
        const [x, y] = point.split(",").map(Number);
        const left = rectangle.left - table.left,
          top = rectangle.top - table.top;
        const outsideX = Math.max(left - x, 0, x - left - rectangle.width),
          outsideY = Math.max(top - y, 0, y - top - rectangle.height);
        return (
          Math.hypot(outsideX, outsideY) <= 8 && (outsideX > 0 || outsideY > 0)
        );
      };
      if (
        !nearEdge(arrow.dataset.start, source) ||
        !nearEdge(arrow.dataset.end, target)
      )
        throw Error("Arrow is not attached to its card edges");
    }
  };
  find("Winning example").click();
  await wait(() =>
    document.querySelector(".table-status").textContent.includes("Move 0"),
  );
  find("Learning").click();
  await wait(
    () =>
      find("Learning").getAttribute("aria-pressed") === "true" &&
      document.querySelector(".learning-analysis").dataset.current === "50",
  );
  const initial = snapshot();
  if (document.querySelector(".hinted"))
    throw Error("Hints should start hidden");
  find("Hint").click();
  await wait(() => find("Hint").getAttribute("aria-pressed") === "true");
  verifyHints();
  if (snapshot() !== initial) throw Error("Hint changed the game state");
  find("Hint").click();
  await wait(() => !document.querySelector(".hinted"));
  if (snapshot() !== initial)
    throw Error("Hiding hints changed the game state");
  find("Play yourself").click();
  await wait(
    () => find("Play yourself").getAttribute("aria-pressed") === "true",
  );
  find("Hint").click();
  await wait(() => find("Hint").getAttribute("aria-pressed") === "true");
  verifyHints();
  find("Learning").click();
  await wait(
    () =>
      find("Learning").getAttribute("aria-pressed") === "true" &&
      !find("Next move").disabled,
  );
  find("Next move").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("Move 1") &&
      !find("Next move").disabled,
  );
  const first = snapshot();
  verifyHints();
  if (first === initial) throw Error("Next did not change the board");
  find("Back").click();
  await wait(() => find("Back").disabled);
  if (snapshot() !== initial)
    throw Error("Back did not restore the initial board");
  verifyHints();
  find("Next move").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("Move 1") &&
      !find("Next move").disabled,
  );
  if (snapshot() !== first) throw Error("Redo changed the move");
  let shuffleUndoVerified = false,
    actions = 1;
  while (actions < 130) {
    const next = [...document.querySelectorAll(".step-controls button")].at(-1);
    if (next.textContent === "Game won") break;
    await wait(() => !next.disabled);
    const before = snapshot(),
      label = next.textContent;
    next.click();
    await wait(
      () => snapshot() !== before && !document.querySelector(".flying"),
    );
    await wait(
      () =>
        ![...document.querySelectorAll(".step-controls button")].at(-1)
          .disabled || !!find("Game won"),
    );
    actions++;
    verifyHints();
    if (document.querySelector(".learning-analysis").dataset.loss !== "0")
      throw Error("Assisted best play was marked as a mistake");
    if (label.startsWith("Shuffle")) {
      const after = snapshot();
      find("Back").click();
      await wait(() => snapshot() === before);
      [...document.querySelectorAll(".step-controls button")].at(-1).click();
      await wait(() => snapshot() === after);
      shuffleUndoVerified = true;
      verifyHints();
    }
  }
  if (!find("Game won")) throw Error("Winning example did not win");
  if (!shuffleUndoVerified) throw Error("Shuffle/back was not exercised");
  for (const card of document.querySelectorAll(".playing-card,.foundation")) {
    const rectangle = card.getBoundingClientRect();
    if (Math.abs(rectangle.width / rectangle.height - 5 / 7) > 0.002)
      throw Error("Incorrect playing card aspect ratio");
  }
  if (
    /\bclubs\b|\bdiamonds\b|\bhearts\b|\bspades\b/i.test(
      document.body.innerText,
    )
  )
    throw Error("Suit names visible");
  if (document.documentElement.scrollWidth > innerWidth)
    throw Error("Horizontal overflow");
  return {
    passed: true,
    hintToggleAndUpdatesVerified: true,
    arrowsAndLearningVerified: true,
    actions,
    shuffleUndoVerified,
    finalStatus: document.querySelector(".table-status").textContent,
  };
})();
