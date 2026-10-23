// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const runtime=vi.hoisted(()=>({ created:0, ready:null as null|(()=>void) }));
vi.mock("./goldCave",()=>({ GoldCave: class {
  unloading={total:0,delivered:0,done:true,active:null};
  constructor(_canvas:HTMLCanvasElement,ready:()=>void){runtime.created++;runtime.ready=ready;}
  showShip(){}show(){}pause(){}resetCamera(){}inspect(){}
} }));
vi.mock("../ui/mapPan",()=>({ mountMapPan:()=>({destroy(){},getState(){return {x:0,y:0,scale:1};}}) }));
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
  it("returns Home → Ship → Back to Home",async()=>{
    await import("./main");click("ship");await vi.waitFor(()=>expect(runtime.created).toBe(1));
    expect(root().dataset.screen).toBe("ship");click("back");expect(root().dataset.screen).toBe("home");
  });
  it("remembers both origins in Home → Ship → Cave → Back → Back",async()=>{
    await import("./main");click("ship");await vi.waitFor(()=>expect(runtime.created).toBe(1));
    click("cave");expect(root().dataset.screen).toBe("cave");
    click("cave");expect(root().dataset.screen).toBe("cave");
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
  it("keeps large bank balances compact in the header while retaining the full accessible amount",async()=>{
    const {freshProgress,saveMathProgress}=await import("./academy");
    const progress=freshProgress();progress.banks.add=15_000_000;saveMathProgress(progress,localStorage);
    await import("./main");click("play");
    const cave=root().querySelector<HTMLButtonElement>('[data-action="cave"]')!;
    expect(cave.textContent).toMatch(/15m gold/i);
    expect(cave.getAttribute("aria-label")).toContain("15,000,000 gold banked");
  });

});
