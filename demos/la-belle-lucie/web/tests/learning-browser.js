// Run in an owned agent-browser session with reduced motion enabled.
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
  const evaluation = () => ({
    ...document.querySelector(".learning-analysis").dataset,
  });
  const board = () =>
    JSON.stringify(
      [...document.querySelectorAll(".pile")].map((pile) =>
        [...pile.querySelectorAll("[data-card]")].map(
          (card) => card.dataset.card,
        ),
      ),
    );
  button("Winning example").click();
  await wait(() =>
    document.querySelector(".table-status").textContent.includes("Move 0"),
  );
  button("Learning").click();
  await wait(
    () => evaluation().current === "50" && !button("Next move").disabled,
  );
  const initial = board();
  const selectAndMove = async (source, target, current) => {
    document.querySelector(`[data-card="${source}"]`).click();
    await wait(() =>
      document
        .querySelector(`[data-card="${target}"]`)
        .classList.contains("successor"),
    );
    document.querySelector(`[data-card="${target}"]`).click();
    await wait(
      () =>
        evaluation().current === String(current) &&
        !button("Next move").disabled,
    );
  };
  await selectAndMove(9, 10, 35);
  if (
    evaluation().ideal !== "50" ||
    evaluation().loss !== "15" ||
    evaluation().moveLoss !== "15"
  )
    throw Error("First mistake evaluation incorrect");
  if (document.querySelector(".evaluation-loss").textContent !== "−15")
    throw Error("Red loss missing");
  const potential = document.querySelector('[role="progressbar"]');
  if (
    potential.getAttribute("aria-valuemax") !== "50" ||
    potential.getAttribute("aria-valuenow") !== "35"
  )
    throw Error(
      "Potential indicator does not represent the actual round evaluation",
    );
  await selectAndMove(20, 21, 13);
  if (
    evaluation().ideal !== "50" ||
    evaluation().loss !== "37" ||
    evaluation().moveLoss !== "22"
  )
    throw Error("Cumulative/per-move loss incorrect");
  button("Back").click();
  await wait(
    () => evaluation().current === "35" && !button("Next move").disabled,
  );
  if (evaluation().loss !== "15" || evaluation().moveLoss !== "15")
    throw Error("Undo did not restore the earlier mistake");
  button("Back").click();
  await wait(
    () => evaluation().current === "50" && !button("Next move").disabled,
  );
  if (evaluation().loss !== "0" || board() !== initial)
    throw Error("Undo did not restore the ideal position");
  if (potential.getAttribute("aria-valuenow") !== "50")
    throw Error("Undo did not restore the potential indicator");
  const covered = document.querySelector('[data-card="2"]'),
    rectangle = covered.getBoundingClientRect();
  covered.scrollIntoView({ block: "center" });
  const exposedStrip = covered.getBoundingClientRect();
  const hit = document
    .elementFromPoint(exposedStrip.left + 8, exposedStrip.top + 8)
    .closest("[data-card]");
  if (hit?.dataset.card !== "2")
    throw Error("Covered card index cannot be clicked");
  hit.click();
  await wait(() =>
    document.querySelector('[data-card="3"]').classList.contains("successor"),
  );
  if (!document.querySelector('[data-card="3"]').classList.contains("covered"))
    throw Error("Fixture needs a buried successor");
  if (board() !== initial)
    throw Error("Inspecting a covered card changed the board");
  document.querySelector('[data-card="12"]').click();
  await wait(() => !document.querySelector(".successor"));
  document.querySelector('[data-card="0"]').click();
  await wait(() =>
    document
      .querySelector('[data-foundation="0"]')
      .classList.contains("target"),
  );
  document.querySelector('[data-foundation="0"]').click();
  await wait(
    () => evaluation().moveLoss === "0" && !button("Next move").disabled,
  );
  if (
    evaluation().ideal !== "50" ||
    evaluation().current !== "50" ||
    evaluation().loss !== "0"
  )
    throw Error("Preserving move incorrectly penalized");
  return {
    passed: true,
    firstMistakeLoss: 15,
    cumulativeLoss: 37,
    secondMoveLoss: 22,
    undoRestoresEvaluation: true,
    blueBuriedSuccessor: true,
    kingDoesNotWrap: true,
    preservingMoveNotPenalized: true,
  };
})();
