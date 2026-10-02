export interface Progress {
  best: number;
  adventures: number;
  keepsakes: number[];
  paint: string;
  muted: boolean;
  narration: boolean;
  voyages: Record<string, { stars: number; gems: number }>;
  relics: number[];
}
export const PAINTS = ["#fff3d0", "#75ddd4", "#ffad8d"];
const defaults = (): Progress => ({
  best: 0,
  adventures: 0,
  keepsakes: [],
  paint: PAINTS[0]!,
  muted: false,
  narration: true,
  voyages: {},
  relics: [],
});
export function readProgress(storage?: Pick<Storage, "getItem">): Progress {
  try {
    const raw: unknown = JSON.parse(storage?.getItem("broadside.v1") ?? "null");
    if (!raw || typeof raw !== "object") return defaults();
    const p = raw as Partial<Progress>;
    return {
      best:
        typeof p.best === "number" && Number.isFinite(p.best)
          ? Math.max(0, p.best)
          : 0,
      adventures:
        typeof p.adventures === "number" && Number.isFinite(p.adventures)
          ? Math.max(0, Math.floor(p.adventures))
          : 0,
      keepsakes: Array.isArray(p.keepsakes)
        ? [
            ...new Set(
              p.keepsakes.filter((v) => Number.isInteger(v) && v >= 0 && v < 6),
            ),
          ]
        : [],
      paint: PAINTS.includes(p.paint ?? "") ? p.paint! : PAINTS[0]!,
      muted: p.muted === true,
      narration: p.narration !== false,
      voyages: Object.fromEntries(
        Object.entries(
          p.voyages && typeof p.voyages === "object" ? p.voyages : {},
        ).filter(
          ([key, v]) =>
            /^\d+$/.test(key) &&
            Number(key) < 12 &&
            v &&
            Number.isInteger(v.stars) &&
            v.stars >= 1 &&
            v.stars <= 3 &&
            Number.isInteger(v.gems) &&
            v.gems >= 0 &&
            v.gems <= 3,
        ),
      ),
      relics: Array.isArray(p.relics)
        ? [
            ...new Set(
              p.relics.filter((v) => Number.isInteger(v) && v >= 0 && v < 12),
            ),
          ]
        : [],
    };
  } catch {
    return defaults();
  }
}
export function saveProgress(
  p: Progress,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    storage?.setItem("broadside.v1", JSON.stringify(p));
  } catch {
    /* private browsing is fine */
  }
}
