import { CAMPAIGN_VERSION, TOTAL_LEVELS, LEVELS_PER_WORLD } from "./campaign";
export interface Progress {
  campaignVersion: number;
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
  campaignVersion: CAMPAIGN_VERSION,
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
    const oldCampaign = p.campaignVersion !== CAMPAIGN_VERSION;
    const voyages = Object.fromEntries(
      Object.entries(
        p.voyages && typeof p.voyages === "object" ? p.voyages : {},
      ).filter(
        ([key, v]) =>
          /^\d+$/.test(key) &&
          Number(key) < (oldCampaign ? 12 : TOTAL_LEVELS) &&
          v &&
          Number.isInteger(v.stars) &&
          v.stars >= 1 &&
          v.stars <= 3 &&
          Number.isInteger(v.gems) &&
          v.gems >= 0 &&
          v.gems <= 3,
      ),
    );
    const mappedVoyages = oldCampaign
      ? Object.fromEntries(
          Object.entries(voyages).map(([key, v]) => {
            const i = Number(key);
            return [Math.floor(i / 3) * LEVELS_PER_WORLD + (i % 3), v];
          }),
        )
      : voyages;
    const relics = Array.isArray(p.relics)
      ? [
          ...new Set(
            p.relics.filter((v) => Number.isInteger(v) && v >= 0 && v < 12),
          ),
        ]
      : [];
    if (oldCampaign)
      for (let w = 0; w < 4; w++)
        if ([0, 1, 2].every((n) => !!voyages[w * 3 + n])) {
          const id = w * 3 + 2;
          if (!relics.includes(id)) relics.push(id);
        }
    return {
      campaignVersion: CAMPAIGN_VERSION,
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
      voyages: mappedVoyages,
      relics,
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
