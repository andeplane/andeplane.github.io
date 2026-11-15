(async () => {
  const button = (label) =>
    [...document.querySelectorAll("button")].find(
      (item) => item.textContent.trim() === label,
    );
  const wait = async (predicate) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error("Timed out");
  };
  const inverted = () =>
    [...document.querySelectorAll(".next-foundation[data-card]")]
      .map((card) => Number(card.dataset.card))
      .sort((a, b) => a - b);
  const expect = (cards) => {
    if (JSON.stringify(inverted()) !== JSON.stringify(cards))
      throw Error(`Incorrect foundation targets: ${inverted()}`);
  };
  button("Winning example").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("Move 0") &&
      !button("Next move").disabled,
  );
  button("Foundation targets").click();
  await wait(() => inverted().length === 4);
  expect([0, 13, 26, 39]);
  if (!document.querySelector(".covered.next-foundation"))
    throw Error("Buried aces were not marked");
  if (
    getComputedStyle(document.querySelector(".next-foundation .card-art"))
      .filter !== "invert(1)"
  )
    throw Error("Target artwork is not inverted");
  const moveToFoundation = async (card, total) => {
    document.querySelector(`[data-card="${card}"]`).click();
    await wait(() => !document.querySelector('[data-foundation="3"]').disabled);
    document.querySelector('[data-foundation="3"]').click();
    await wait(
      () =>
        document
          .querySelector(".table-status")
          .textContent.includes(`${total} / 52`) &&
        !button("Next move").disabled,
    );
  };
  await moveToFoundation(39, 1);
  expect([0, 13, 26, 40]);
  await moveToFoundation(40, 2);
  expect([0, 13, 26, 41]);
  button("Back").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("1 / 52") &&
      !button("Next move").disabled,
  );
  expect([0, 13, 26, 40]);
  button("Back").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("0 / 52") &&
      !button("Next move").disabled,
  );
  expect([0, 13, 26, 39]);
  button("Foundation targets").click();
  await wait(() => !document.querySelector(".next-foundation"));
  button("Hint").click();
  await wait(() => document.querySelectorAll(".hint-arrow").length > 0);
  if (
    [...document.querySelectorAll(".hint-arrow")].some((arrow) =>
      /[CQ]/.test(arrow.getAttribute("d")),
    )
  )
    throw Error("A hint arrow is curved");
  document.querySelector('[data-card="9"]').click();
  await wait(() =>
    document.querySelector('[data-card="10"]').classList.contains("successor"),
  );
  const target = getComputedStyle(document.querySelector(".successor"));
  if (target.outlineStyle !== "solid" || parseFloat(target.outlineWidth) < 3)
    throw Error("Blue target outline is missing");
  return {
    passed: true,
    allAcesInitially: true,
    buriedCardsIncluded: true,
    twoSpadesTargetsThree: true,
    undoUpdatesTargets: true,
    straightArrows: true,
    brighterBlueOutline: true,
  };
})();
