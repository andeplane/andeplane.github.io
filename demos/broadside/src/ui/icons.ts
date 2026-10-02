const paths: Record<string, string> = {
  wheel:
    '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 1v7m0 8v7M1 12h7m8 0h7M4 4l5 5m6 6 5 5M4 20l5-5m6-6 5-5"/>',
  chest:
    '<path d="M3 11V7a9 5 0 0 1 18 0v13H3zM3 11h18M7 4v16m10-16v16"/><rect x="10" y="10" width="4" height="5" rx="1"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16 8-3 5-5 3 3-5z"/>',
  ship: '<path d="M3 16h18l-3 5H6zM12 2v14M10 4v9H3zm4 0v9h7zM2 23c2-2 3 2 5 0s3 2 5 0 3 2 5 0 3 2 5 0"/>',
  anchor:
    '<path d="M12 7v14M6 11h12M3 14v4c2 5 7 5 9 3 2 2 7 2 9-3v-4M1 16l2-2 2 2m14 0 2-2 2 2"/><circle cx="12" cy="4" r="3"/>',
  sound:
    '<path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  map: '<path d="m2 5 6-3 8 3 6-3v17l-6 3-8-3-6 3zm6-3v17m8-14v17M3 12l3-2m5-1 2 2m5 2 2 2"/>',
  cannon:
    '<path d="m4 9 14-5 3 6-14 5zM3 19h18M11 13l4 6"/><circle cx="7" cy="18" r="4"/><path d="m20 2 1-1m2 4h1"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  heart: '<path d="M12 21 3 12C-3 3 9 0 12 7c3-7 15-4 9 5z"/>',
  flag: '<path d="M5 22V2m0 1c6-4 9 5 15 1v10c-6 4-9-5-15-1"/>',
};
export const icon = (name: string, cls = ""): string =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.star}</svg>`;
