// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const runtime=vi.hoisted(()=>({ created:0, ready:null as null|(()=>void) }));
vi.mock("./goldCave",()=>({ GoldCave: class {
  unloading={total:0,delivered:0,done:true,active:null};
  constructor(_canvas:HTMLCanvasElement,ready:()=>void){runtime.created++;runtime.ready=ready;}
  showShip(){}show(){}pause(){}dispose(){}resetCamera(){}inspect(){}
} }));
const memoryStorage=()=>{ const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:vi.fn((key:string,value:string)=>{data.set(key,value);}),clear:()=>data.clear()}; };
const root=()=>document.querySelector<HTMLElement>("#academy")!;
const click=(action:string)=>{
  const button=root().querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  expect(button,action).not.toBeNull();button!.click();
};
beforeEach(()=>{
  vi.resetModules();runtime.created=0;runtime.ready=null;
  history.replaceState(null,"","/");vi.stubGlobal("localStorage",memoryStorage());vi.stubGlobal("sessionStorage",memoryStorage());
  document.body.innerHTML='<canvas id="treasure-scene" hidden></canvas><main id="academy"></main>';
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("Captain Calculus navigation destinations",()=>{
  it("keeps Play pointed at the choices even when there is a saved voyage", async () => {
    const { freshProgress, saveMathProgress, startVoyage } = await import("./academy");
    const progress = freshProgress();
    startVoyage(progress, "add-10", 1, 100);
    saveMathProgress(progress, localStorage);
    await import("./main");

    expect(root().querySelector('[data-action="resume"]')?.textContent).toContain("Level 1");
    click("play");
    expect(root().dataset.screen).toBe("operators");
    expect(root().querySelector('[data-action="ship"], [data-action="cave"], [data-action="settings"]')).toBeNull();
    click("back");
    click("resume");
    expect(root().dataset.screen).toBe("question");
    click("back");
    expect(root().dataset.screen).toBe("home");
    click("play");
    root().querySelector<HTMLButtonElement>('[data-operator="add"]')!.click();
    root().querySelector<HTMLButtonElement>('[data-pack="add-10"]')!.click();
    root().querySelector<HTMLButtonElement>('[data-level="1"]')!.click();
    expect(root().dataset.screen).toBe("question");
    click("back");
    expect(root().dataset.screen).toBe("levels");
  });
  it("continues the most recently attempted voyage after browsing another pack and reloading", async () => {
    const { freshProgress, saveMathProgress, startVoyage, answerQuestion, questionsFor } = await import("./academy");
    const progress = freshProgress();
    startVoyage(progress, "add-10", 1, 100);
    const run = startVoyage(progress, "add-20", 1, 200)!;
    answerQuestion(progress, "add-20", 1, questionsFor("add-20", run.seed, run.questionSet)[0]!.answer + 1);
    saveMathProgress(progress, localStorage);
    await import("./main");
    click("play");
    root().querySelector<HTMLButtonElement>('[data-operator="add"]')!.click();
    root().querySelector<HTMLButtonElement>('[data-pack="add-10"]')!.click();
    click("back"); click("back"); click("back");
    expect(root().querySelector('[data-action="resume"]')?.textContent).toContain("Up to 20");
    vi.resetModules();
    await import("./main");
    click("resume");
    expect(root().querySelector(".voyage-status")?.textContent).toContain("Up to 20");
    click("back");
    expect(document.activeElement?.getAttribute("data-action")).toBe("resume");
  });
  it("unwinds each actual visit when alternating between the ship and cave", async () => {
    await import("./main");
    click("cave"); await vi.waitFor(() => expect(runtime.created).toBe(1));
    click("ship"); click("cave");
    for (const screen of ["ship", "cave", "home"]) {
      click("back");
      expect(root().dataset.screen).toBe(screen);
    }
    expect(document.activeElement?.getAttribute("data-action")).toBe("cave");
  });
  it("retries a failed cave in place and preserves its Back destination", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    history.replaceState(null, "", "/?qa=true&view=cave&fail=scene");
    await import("./main");
    expect(root().querySelector('[data-action="retry-scene"]')).not.toBeNull();
    expect(root().querySelector("#math-cave-pad")).toBeNull();
    history.replaceState(null, "", "/?qa=true");
    click("retry-scene");
    await vi.waitFor(() => expect(root().querySelector("#math-cave-pad")).not.toBeNull());
    click("back");
    expect(root().dataset.screen).toBe("home");
  });
  it("keeps cargo aboard and never claims unloading completed when the cave fails",async()=>{
    vi.spyOn(console,"error").mockImplementation(()=>{});
    history.replaceState(null,"","/?qa=true&fresh=1&cargo=1&view=unload&fail=scene");
    await import("./main");
    expect(root().textContent).toContain("The cave couldn't load");
    expect(root().textContent).not.toContain("Welcome home, Captain");
    expect(root().querySelector('[data-action="stay-cave"]')).toBeNull();
    click("back");expect(root().dataset.screen).toBe("home");
    expect(root().querySelector('[data-action="ship"]')?.textContent).toContain("1 chest aboard");
  });
  it("returns Home → Ship → Back to Home",async()=>{
    await import("./main");click("ship");await vi.waitFor(()=>expect(runtime.created).toBe(1));
    expect(root().dataset.screen).toBe("ship");click("back");expect(root().dataset.screen).toBe("home");
  });
  it("remembers both origins in Home → Ship → Cave → Back → Back",async()=>{
    await import("./main");click("ship");await vi.waitFor(()=>expect(runtime.created).toBe(1));
    click("cave");expect(root().dataset.screen).toBe("cave");
    expect(root().querySelector('[data-action="cave"]')).toBeNull();
    click("back");expect(root().dataset.screen).toBe("ship");
    click("back");expect(root().dataset.screen).toBe("home");
  });
  it("disables the reward's next-island action until the chest reveal is ready",async()=>{
    history.replaceState(null,"","/?qa=true&cargo=1&view=reward");
    await import("./main");await vi.waitFor(()=>expect(runtime.created).toBe(1));
    const next=()=>root().querySelector<HTMLButtonElement>('[data-action="reward-next"]')!;
    expect(next().disabled).toBe(true);next().click();expect(root().dataset.screen).toBe("reward");
    runtime.ready!();expect(next().disabled).toBe(false);
  });
  it("reserves error-notice space when the browser cannot save progress",async()=>{
    await import("./main");
    vi.mocked(localStorage.setItem).mockImplementation(()=>{throw new Error("Storage unavailable");});
    click("play");root().querySelector<HTMLButtonElement>('[data-operator="add"]')!.click();
    expect(root().dataset.saveFailed).toBe("true");
    expect(root().querySelector('[role="status"]')?.textContent).toContain("Progress can't be saved");
  });
  it("keeps large bank balances compact on the home menu while retaining the full accessible amount",async()=>{
    const {freshProgress,saveMathProgress}=await import("./academy");
    const progress=freshProgress();progress.banks.add=15_000_000;saveMathProgress(progress,localStorage);
    await import("./main");
    const cave=root().querySelector<HTMLButtonElement>('[data-action="cave"]')!;
    expect(cave.textContent).toMatch(/15m gold/i);
    expect(cave.getAttribute("aria-label")).toContain("15,000,000 gold banked");
  });

});

describe("Captain Calculus language preferences", () => {
  it("detects Norwegian and keeps its first-try reward instructions", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["nb-NO", "en"]);
    await import("./main");
    expect(document.documentElement.lang).toBe("nb");
    expect(root().querySelector("button[data-action=play]")?.textContent).toContain("Spill");
    expect(root().querySelector("[data-action=settings]")?.textContent).toContain("Innstillinger");
    click("settings");
    expect(root().textContent).toContain("100 gull per riktig svar på første forsøk");
    expect(root().querySelector("#game-language")).toBeNull();
    click("back");
    click("settings");
    expect(root().querySelector("[data-action=language]")?.textContent).toContain("🇳🇴 Auto");
    click("language");
    expect(document.querySelector("[data-language=auto]")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("changes language from Home without changing the saved voyage", async () => {
    history.replaceState(null, "", "/?qa=true&view=question");
    await import("./main");
    const equation = root().querySelector(".left-term")!.textContent;
    const before = sessionStorage.getItem("broadside.math.v1");
    expect(root().querySelector('[data-action="settings"]')).toBeNull();
    click("back"); click("back"); click("back"); click("back");
    expect(root().dataset.screen).toBe("home");
    click("language");
    document.querySelector<HTMLButtonElement>("[data-language=de]")!.click();
    expect(document.documentElement.lang).toBe("de");
    expect(document.activeElement?.getAttribute("data-action")).toBe("language");
    expect(sessionStorage.getItem("broadside.math.v1")).toBe(before);
    expect(document.querySelector<HTMLDialogElement>(".language-picker")?.open).toBe(false);
    click("resume");
    expect(root().dataset.screen).toBe("question");
    expect(root().querySelector(".left-term")!.textContent).toBe(equation);
    expect(root().textContent).toContain("Antwort prüfen");
  });

  it("uses a saved override before browser preferences and explains failed preference writes", async () => {
    localStorage.setItem("broadside.math.language.v1", "fi");
    await import("./main");
    expect(document.documentElement.lang).toBe("fi");
    click("settings");
    click("language");
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw Error("full"); });
    document.querySelector<HTMLButtonElement>("[data-language=fr]")!.click();
    expect(document.documentElement.lang).toBe("fr");
    expect(document.querySelector<HTMLElement>("#language-save-error")!.hidden).toBe(false);
    expect(document.querySelector<HTMLDialogElement>(".language-picker")?.textContent).toContain("n’a pas pu être sauvegardée");
  });
});
