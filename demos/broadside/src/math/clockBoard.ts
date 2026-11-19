import { QUESTIONS_PER_LEVEL } from "./academy";
import { clockFace, clockHour, clockQuestions, clockTime } from "./clock";
import type { createI18n } from "./i18n";

export function newClockRound(seed: number) {
  return { questions: clockQuestions(seed), index: 0, firstTry: 0, rejected: new Set<number>(), correct: false };
}

export function clockBoard(round: ReturnType<typeof newClockRound>, { t, format }: ReturnType<typeof createI18n>, back: string): string {
  const navigation = `<div class="voyage-status clock-status">${back}<span>${t("clockAdventure")}</span></div>`;
  const question = round.questions[round.index];
  if (!question) return `<section class="clock-board">${navigation}<div class="clock-sheet clock-complete">
    <h1 tabindex="-1">${t("voyageComplete")}</h1>
    <p class="clock-score">${t("clockScore", { count: format(round.firstTry) })}</p>
    <button class="wood-button primary" data-action="clock-restart">${t("clockAgain")}</button>
  </div></section>`;

  const minute = question.time % 60;
  const label = t(minute === 0 ? "clockFaceLabel" : "clockFaceBetween", {
    hour: clockHour(question.time), next: clockHour((question.time + 60) % 720), minute: minute / 5 || 12,
  });
  const feedback = round.correct ? t("clockCorrect", { time: clockTime(question.time) }) :
    round.rejected.size ? t("clockTryAgain") : t("clockChoose");
  const feedbackClass = round.correct ? "success" : round.rejected.size ? "retry" : "";
  return `<section class="clock-board">${navigation}<div class="clock-sheet">
    <header>
      <h1 tabindex="-1" aria-describedby="clock-count">${t("clockPrompt")}</h1>
      <p class="clock-count" id="clock-count">${t("problem", { count: format(round.index + 1) })}</p>
    </header>
    ${clockFace(question.time, label)}
    <div class="clock-actions">
      <p id="clock-feedback" class="clock-feedback ${feedbackClass}" tabindex="-1">${feedback}</p>
      <div class="clock-choices">${question.choices.map(time => {
        const rejected = round.rejected.has(time);
        const result = rejected ? "wrong" : round.correct && time === question.time ? "correct" : "";
        return `<button class="clock-choice" data-clock-time="${time}" data-result="${result}" ${round.correct || rejected ? "disabled" : ""}>${clockTime(time)}</button>`;
      }).join("")}</div>
      ${round.correct ? `<button class="wood-button primary" data-action="clock-next" aria-describedby="clock-feedback">${t(round.index + 1 === QUESTIONS_PER_LEVEL ? "clockResult" : "nextProblem")}</button>` : ""}
    </div>
  </div></section>`;
}
