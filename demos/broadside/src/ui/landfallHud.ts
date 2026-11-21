import { icon } from "./icons";
import "./landfallHud.css";

interface LandfallActions {
  move(right: number, forward: number): void;
  dig(): void;
  chart(): void;
  leave(): void;
  pauseInputs(): void;
}

export class LandfallHud {
  private readonly root = document.createElement("section");
  private readonly lifetime = new AbortController();
  private readonly dialog: HTMLDialogElement;
  private readonly leaveButton: HTMLButtonElement;
  private readonly digButton: HTMLButtonElement;
  private readonly pack: HTMLElement;
  private readonly island: HTMLElement;
  private readonly clue: HTMLElement;
  private readonly pad: HTMLElement;
  private readonly thumb: HTMLElement;
  private pointer: number | null = null;

  constructor(parent: HTMLElement, private readonly actions: LandfallActions) {
    const root = this.root;
    root.className = "landfall-hud";
    root.hidden = true;
    root.setAttribute("aria-label", "Island exploration");
    root.innerHTML = `
      <div class="landfall-heading">
        <button type="button" class="landfall-leave" title="Leave island" aria-label="Leave island">${icon("arrow")}</button>
        <div class="landfall-place"><span class="landfall-pack"></span><h1></h1></div>
        <button type="button" class="landfall-map" aria-label="Treasure map" aria-haspopup="dialog" aria-keyshortcuts="M">${icon("map")} Map</button>
      </div>
      <div class="landfall-clue">${icon("map")}<p role="status" aria-live="polite" aria-atomic="true"></p></div>
      <div class="landfall-foot">
        <div class="landfall-pad" role="group" aria-label="Walk with the thumbstick"><span></span></div>
        <p class="landfall-help"><span class="landfall-keys">WASD to walk · Arrows to look</span><span class="landfall-touch">Drag the view to look</span></p>
        <button type="button" class="landfall-dig" aria-keyshortcuts="E" hidden>Dig <kbd>E</kbd></button>
      </div>
      <dialog class="landfall-dialog" aria-labelledby="landfall-leave-title" aria-describedby="landfall-leave-detail">
        <h2 id="landfall-leave-title">Leave this island?</h2>
        <p id="landfall-leave-detail">Return to the island chart? Your digging progress stays on this island during this visit.</p>
        <div><button type="button" class="landfall-stay" autofocus>Keep exploring</button><button type="button" class="landfall-confirm">Leave island</button></div>
      </dialog>`;
    parent.append(root);
    this.dialog = root.querySelector("dialog")!;
    this.leaveButton = root.querySelector(".landfall-leave")!;
    this.digButton = root.querySelector(".landfall-dig")!;
    this.pack = root.querySelector(".landfall-pack")!;
    this.island = root.querySelector("h1")!;
    this.clue = root.querySelector(".landfall-clue p")!;
    this.pad = root.querySelector(".landfall-pad")!;
    this.thumb = this.pad.querySelector("span")!;

    this.leaveButton.onclick = () => this.requestLeave();
    root.querySelector<HTMLButtonElement>(".landfall-map")!.onclick = () => this.actions.chart();
    this.digButton.onclick = () => this.actions.dig();
    this.dialog.querySelector<HTMLButtonElement>(".landfall-stay")!.onclick = () => this.dismiss();
    this.dialog.querySelector<HTMLButtonElement>(".landfall-confirm")!.onclick = () => {
      this.dialog.close();
      this.actions.leave();
    };
    this.dialog.oncancel = event => {
      event.preventDefault();
      this.dismiss();
    };
    this.dialog.onkeydown = event => event.stopPropagation();
    this.dialog.onclick = event => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom) this.dismiss();
    };
    this.pad.onpointerdown = event => {
      if (this.pointer !== null || event.button !== 0) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      this.pad.setPointerCapture(event.pointerId);
      this.moveStick(event);
    };
    this.pad.onpointermove = event => {
      if (this.pointer === event.pointerId) this.moveStick(event);
    };
    this.pad.onpointerup = this.pad.onpointercancel = this.pad.onlostpointercapture = event => {
      if (this.pointer === event.pointerId) this.releaseStick();
    };
    const options = { signal: this.lifetime.signal };
    window.addEventListener("blur", () => this.releaseStick(), options);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.releaseStick();
    }, options);
  }

  show(packName: string, islandName: string): void {
    this.pack.textContent = packName;
    this.island.textContent = islandName;
    this.clue.textContent = "";
    this.digButton.hidden = true;
    this.root.hidden = false;
  }

  update(clue: string, canDig: boolean, strokes: number, treasure: string, feedback: string): void {
    let hint = clue;
    if (strokes >= 3) hint = `You found ${treasure.replace(/^The /, "the ")}!`;
    else if (feedback) hint = feedback;
    else if (canDig) hint = [
      "The ground feels loose. Dig here!",
      "The shovel struck wood. Dig again!",
      "There’s a chest! One more dig.",
    ][strokes] ?? clue;
    if (this.clue.textContent !== hint) this.clue.textContent = hint;
    const hideDig = strokes >= 3;
    if (this.digButton.hidden !== hideDig) this.digButton.hidden = hideDig;
  }

  get confirmingLeave(): boolean { return this.dialog.open; }

  requestLeave(): void {
    if (this.root.hidden || this.dialog.open) return;
    this.releaseStick();
    this.actions.pauseInputs();
    this.dialog.showModal();
  }

  hide(): void {
    if (this.dialog.open) this.dialog.close();
    this.releaseStick();
    this.root.hidden = true;
  }

  dispose(): void {
    this.hide();
    this.lifetime.abort();
    this.root.remove();
  }

  private dismiss(): void {
    this.dialog.close();
    this.leaveButton.focus({ preventScroll: true });
  }

  private moveStick(event: PointerEvent): void {
    const rect = this.pad.getBoundingClientRect();
    const radius = (rect.width - this.thumb.offsetWidth) / 2;
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.max(radius, Math.hypot(dx, dy), 1);
    const right = dx / length, forward = -dy / length;
    this.actions.move(right, forward);
    this.thumb.style.transform = `translate(${right * radius}px, ${-forward * radius}px)`;
  }

  releaseStick(): void {
    const id = this.pointer;
    if (id === null) return;
    this.pointer = null;
    if (this.pad.hasPointerCapture(id)) this.pad.releasePointerCapture(id);
    this.actions.move(0, 0);
    this.thumb.style.transform = "";
  }
}
