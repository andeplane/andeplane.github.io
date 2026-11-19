import { icon } from "./icons";
import "./lanternHome.css";

/** Broadside’s selected Lantern Grotto home. Shared Calculus menus are independent. */
export function lanternHome(): string {
  const glints = [[.13,.535,.495,.58,0],[.274,.625,.593,.706,3.9],[.363,.635,.60,.687,7.1],[.355,.66,.629,.736,1.8],[.42,.676,.66,.761,5.7],[.29,.684,.621,.784,9.3],[.482,.661,.716,.792,11.6],[.585,.689,.577,.777,14.2]];
  return `<div class="lantern-home">
    <div class="lantern-scene" aria-hidden="true">
      <picture><source media="(min-width: 601px), (orientation: landscape)" srcset="${import.meta.env.BASE_URL}assets/menu/lantern-grotto-wide.webp" /><img class="lantern-plate" src="${import.meta.env.BASE_URL}assets/menu/lantern-grotto.webp" width="851" height="1847" alt="" fetchpriority="high" decoding="async" /></picture>
      <div class="lantern-water"></div><div class="lantern-light"></div>
      ${glints.map(([x,y,wideX,wideY,delay])=>`<span class="lantern-glint" style="--x:${x! * 100}%;--y:${y! * 100}%;--wide-x:${wideX! * 100}%;--wide-y:${wideY! * 100}%;--delay:-${delay}s"><svg viewBox="0 0 20 20"><path d="M10 0 11.4 8.6 20 10 11.4 11.4 10 20 8.6 11.4 0 10 8.6 8.6Z"/></svg></span>`).join("")}
    </div>
    <h1 class="lantern-title">Broadside</h1>
    <nav class="lantern-actions" aria-label="Main menu">
      <button id="menu-play" class="lantern-play"><span class="lantern-play-arrow" aria-hidden="true">${icon("play")}</span><span>Play</span></button>
      <button id="home-ship" data-home-destination="ship"><span class="lantern-action-title">Your ship</span><strong>No chests aboard</strong><small>Your next reward goes here</small></button>
      <button id="menu-cave" data-home-destination="chest"><span class="lantern-action-title">Your cave</span><strong>0 gold saved</strong><small>Explore your treasure</small></button>
      <div class="home-utilities"><button id="menu-settings" class="lantern-settings">Settings</button><button id="menu-language" aria-haspopup="dialog">Language</button></div>
    </nav>
    <p class="pirate-home-description lantern-message">Brave the seas. Bring home the treasure.</p>
  </div>`;
}
