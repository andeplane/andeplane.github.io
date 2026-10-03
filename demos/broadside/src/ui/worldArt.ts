/** Original pirate ship illustration for the title screen. */
const skull = `<g fill="#eeddb8"><path d="M-10-8Q-10-18 0-18T10-8Q10 0 5 2V7H-5V2Q-10 0-10-8"/><ellipse cx="-4" cy="-7" rx="3" ry="4" fill="#17202a"/><ellipse cx="4" cy="-7" rx="3" ry="4" fill="#17202a"/><path d="m-2-1 2-4 2 4" fill="#17202a"/><path d="M-14 11 14 23M-14 23 14 11" stroke="#eeddb8" stroke-width="4" stroke-linecap="round"/></g>`;
export function pirateShipArt(prefix = "hero"): string {
  return `<svg viewBox="0 0 500 430" fill="none" aria-hidden="true"><defs><linearGradient id="${prefix}-hull" x2="0" y2="1"><stop stop-color="#835439"/><stop offset="1" stop-color="#281d23"/></linearGradient><linearGradient id="${prefix}-sail" x2="1" y2="1"><stop stop-color="#3c4350"/><stop offset="1" stop-color="#101b29"/></linearGradient></defs><g stroke="#d5af72" stroke-width="2" opacity=".7"><path d="M55 329 222 70 348 331M222 70 283 340M55 329 130 161 283 340M130 161 50 320"/></g><path d="M36 310q153 16 342-16l-48 61q-143 34-267-3z" fill="url(#${prefix}-hull)" stroke="#d0a05f" stroke-width="4"/><path d="m50 325 311 2M68 342l270 3" stroke="#a67443" stroke-width="3"/><path d="m34 308-24-13 48 5M69 353q114 27 256 0" stroke="#634530" stroke-width="7"/><g fill="#141a22" stroke="#bf9659" stroke-width="2">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${88 + i * 29}" y="327" width="13" height="12" rx="2"/>`).join("")}</g><path d="M217 47v273M126 137v184M303 170v141" stroke="#a17b4c" stroke-width="7"/><path d="M134 83q87 18 159 0l-4 86q-82 25-158-3 12-38 3-83M119 186q99 18 190 0l-9 92q-96 31-194-8 17-39 13-84M82 165q39 8 90 0l-5 74q-42 21-95-4 18-28 10-70M270 203q40 8 88-1l-8 73q-46 17-86-5 14-32 6-67" fill="url(#${prefix}-sail)" stroke="#9b937e" stroke-width="2"/><g transform="translate(215 125) scale(1.15)">${skull}</g><path d="M214 49q27-15 65 0l-7 29q-33-17-58-6z" fill="#9e392f"/><g fill="#ffca65"><rect x="63" y="310" width="6" height="9"/><rect x="337" y="298" width="6" height="10"/></g><path d="M26 375q51-8 85 0t86 0 80 0 84 0M66 394q58-10 112 0t150 0" stroke="#68a7b5" stroke-width="3" opacity=".4"/></svg>`;
}
/** Generated copperplate-and-watercolor islands share the chart's palette. */
const islands = [
  "first-sails",
  "pirate-waters",
  "whirlpool-straits",
  "glowing-deep",
];
export function worldArt(i: number, _prefix = "map"): string {
  return `<img class="world-art" src="${import.meta.env.BASE_URL}assets/map/${islands[i]}.webp" width="1024" height="1024" alt="" draggable="false" decoding="async" />`;
}
