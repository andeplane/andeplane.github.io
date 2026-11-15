// Dev-server regression: real controls, URL-fragment import, and retained branches.
(async () => {
  const button = (label) =>
    [...document.querySelectorAll("button")].find(
      (item) => item.textContent.trim() === label,
    );
  const wait = async (fn) => {
    for (let i = 0; i < 400; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw Error("Timed out");
  };
  button("Winning example").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("Move 0") &&
      !button("Next move").disabled,
  );
  document.querySelector('[data-card="9"]').click();
  await wait(() =>
    document.querySelector('[data-card="10"]').classList.contains("successor"),
  );
  document.querySelector('[data-card="10"]').click();
  await wait(
    () =>
      document.querySelector(".learning-analysis").dataset.current === "35" &&
      !button("Next move").disabled,
  );
  button("Back").click();
  await wait(
    () =>
      document.querySelector(".learning-analysis").dataset.current === "50" &&
      !button("Next move").disabled,
  );
  button("Next move").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("1 / 52") &&
      !button("Next move").disabled,
  );
  if (!document.querySelector(".history-panel")) button("History").click();
  await wait(() => document.querySelector(".history-panel"));
  const entries = [...document.querySelectorAll(".history-panel li button")];
  if (entries.length !== 3) throw Error("Alternative line was lost");
  entries[1].click();
  await wait(
    () =>
      document.querySelector(".learning-analysis").dataset.current === "35" &&
      !button("Next move").disabled,
  );
  button("Share").click();
  await wait(
    () =>
      location.hash.startsWith("#replay=v1.") &&
      button("Share") &&
      !button("Share").disabled,
  );
  const { decodeReplay, seekSession, encodeReplay } = await import(
    "/src/replay.ts"
  );
  const session = await decodeReplay(location.href);
  if (
    session.data.cursor !== 1 ||
    session.data.nodes.length !== 2 ||
    session.data.nodes[1].parent !== 0
  )
    throw Error("Shared cursor or branch log is incorrect");
  if (
    session.data.nodes[0].actor !== "player" ||
    session.data.nodes[1].actor !== "computer"
  )
    throw Error("Player/computer origin was lost");
  location.hash = await encodeReplay(seekSession(session, 2));
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("1 / 52") &&
      !button("Next move").disabled,
  );
  document.querySelector(".history-panel li button").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("Move 0") &&
      !button("Next move").disabled,
  );
  button("Replay next").click();
  await wait(
    () =>
      document.querySelector(".table-status").textContent.includes("1 / 52") &&
      !button("Next move").disabled,
  );
  const stored = JSON.parse(
    localStorage.getItem("ingrids-solitaire-replay-v1"),
  );
  if (stored.cursor !== 2 || stored.nodes.length !== 2)
    throw Error("Replaying changed the move log");
  return {
    passed: true,
    retainedBranches: true,
    playerAndComputerLogged: true,
    shareCursorRestored: true,
    urlHashNavigation: true,
    localAutosave: true,
    replayDoesNotDuplicateMoves: true,
    hashLength: location.hash.length,
  };
})();
