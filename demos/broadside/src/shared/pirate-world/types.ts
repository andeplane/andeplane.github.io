import type { CoinBankArea } from "./render/coinHoard";

export interface Cargo { readonly id: number; readonly area: number; readonly gold: number; }
export interface TreasureState { readonly bankGold: readonly number[]; readonly relics: readonly number[]; readonly pending: readonly Cargo[]; }
/** Pure backdrop data. No voyage, questions, save schema or reward rules. */
export interface ShipPresentation {
  chapter: number; seed: number;
  island?: { radius: number; kind: "sand" | "rock" | "sea-rock"; props: ("lighthouse" | "palms" | "rocks" | "fort" | "wreck")[] };
}
export interface PosePersistence {
  readonly namespace: string;
  load(area: number, count: number, balance: number): Promise<Float32Array>;
  save(area: number, poses: Float32Array, balance: number): Promise<void>;
  readReserve(area: number, balance: number): number;
  saveReserve(area: number, balance: number, reserve: number): void;
}
export interface PirateConfig {
  readonly gameId: string;
  readonly sound?: boolean;
  readonly roomLabels?: Readonly<Record<string,string>>;
  readonly theme?: { fog:string };
  readonly poses: PosePersistence;
  readonly bankLabels: readonly string[];
  readonly areas: readonly CoinBankArea[];
  readonly relicSlots: readonly number[];
  readonly inspectItems: readonly number[];
}
export interface PirateAdapter {
  readonly config: PirateConfig;
  snapshot(): TreasureState;
  /** Must journal delivery synchronously, idempotently, in the game's own save. */
  deliver(id: number): boolean;
}
