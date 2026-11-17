(async () => {
  const wait = async (predicate) => {
    for (let i = 0; i < 400; i++) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw Error("Timed out waiting for statistics UI");
  };
  const field = (name) => document.querySelector(`[aria-label="${name}"]`);
  const set = (name, value) => {
    const element = field(name);
    const prototype =
      element.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(
      element,
      String(value),
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const result = () =>
    document.querySelector('[data-testid="conditional-result"]');
  const raw = await (
    await fetch(`${location.pathname}stats/analysis.json`)
  ).json();
  const check = async (round, minimum, maximum, event = "win", target = 52) => {
    let games = 0,
      successes = 0;
    for (const [index, count] of raw.joint) {
      const scores = [
        Math.floor(index / 2809),
        Math.floor(index / 53) % 53,
        index % 53,
      ];
      if (scores[round] < minimum || scores[round] > maximum) continue;
      games += count;
      if (
        event === "win"
          ? scores[2] === 52
          : event === "finalAtLeast"
            ? scores[2] >= target
            : scores[round + 1] - scores[round] >= target
      )
        successes += count;
    }
    await wait(
      () =>
        Number(result().dataset.games) === games &&
        Number(result().dataset.successes) === successes,
    );
    return { games, successes };
  };
  set("Condition round", 0);
  set("Condition type", "exact");
  set("Condition score", 10);
  set("Conditional outcome", "win");
  await check(0, 10, 10);
  if (!result().textContent.includes("13.98%"))
    throw Error("Known conditional probability is wrong");
  set("Condition score", 51);
  await check(0, 51, 51);
  if (!result().textContent.includes("no defined conditional probability"))
    throw Error("Empty cohort treated as a probability");
  set("Condition score", 40);
  set("Condition type", "atLeast");
  await check(0, 40, 52);
  set("Condition type", "range");
  set("Condition score", 5);
  set("Condition upper score", 15);
  await check(0, 5, 15);
  set("Conditional outcome", "finalAtLeast");
  set("Outcome target", 40);
  await check(0, 5, 15, "finalAtLeast", 40);
  set("Conditional outcome", "gainAtLeast");
  set("Outcome target", 5);
  await check(0, 5, 15, "gainAtLeast", 5);
  set("Condition round", 1);
  await check(1, 5, 15, "gainAtLeast", 5);
  set("Histogram count type", "incremental");
  await wait(() =>
    document
      .querySelector(".round-histograms")
      .textContent.includes("new cards"),
  );
  set("Histogram count type", "cumulative");
  set("Conditional outcome", "win");
  const chart = document.querySelector(".round-histograms .chart-interaction");
  chart.focus();
  chart.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await wait(
    () =>
      document.querySelector(".round-histograms .chart-readout strong")
        .textContent === "1 cards",
  );
  chart.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  await check(0, 1, 1);
  set("Inspect win probability at score", 30);
  await check(0, 30, 30);
  set("Heatmap rounds", "1-2");
  await wait(() =>
    document
      .querySelector("#transitions figcaption")
      .textContent.includes("Round 2 → round 3"),
  );
  set("Losing streak strategy", "round-optimal");
  set("Losing streak game count", 20);
  await wait(() =>
    document
      .querySelector(".streak-results")
      .textContent.includes((100 * (1 - 0.193472) ** 20).toFixed(2) + "%"),
  );
  for (const file of [
    "analysis.json",
    "joint-scores.csv",
    "round-histograms.csv",
  ]) {
    const response = await fetch(`${location.pathname}stats/${file}`);
    if (!response.ok) throw Error("Missing export " + file);
  }
  const navigate = (name) =>
    [...document.querySelectorAll(".site-navigation a")]
      .find((a) => a.textContent === name)
      .click();
  navigate("Theory");
  await wait(() => document.querySelector(".fan-experiment"));
  set("Theory foundation card count", 40);
  await wait(() =>
    document.querySelector(".fan-experiment").textContent.includes("33.33%"),
  );
  navigate("Play");
  await wait(() =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Next move" && !b.disabled,
    ),
  );
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent === "Winning example")
    .click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("Move 0") &&
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Next move" && !b.disabled,
      ),
  );
  const next = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Next move",
  );
  next.click();
  await wait(() =>
    document.querySelector(".table-status").textContent.includes("Move 1"),
  );
  const position = document.querySelector(".table-status").textContent;
  navigate("Statistics");
  await wait(() => !document.querySelector(".statistics").closest("[hidden]"));
  navigate("Play");
  await wait(
    () => document.querySelector(".table-status").textContent === position,
  );
  navigate("Statistics");
  return {
    passed: true,
    conditionalFilters: true,
    emptyCohort: true,
    outcomeTargets: true,
    histogramKeyboard: true,
    heatmap: true,
    streakCalculator: true,
    exports: true,
    theoryDemo: true,
    gamePreservedAcrossNavigation: true,
  };
})();
