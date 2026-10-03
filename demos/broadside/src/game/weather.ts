import { stageOf, worldOf } from "./campaign";
import { wrapAngle } from "../sim/math";
import type { Wind } from "../sim/wind";

export type WeatherKind = "clear" | "overcast" | "rain" | "storm";
export interface VoyageWeather {
  kind: WeatherKind;
  name: string;
  rain: number;
  /** Metres per second of wind-driven drift at full sail. */
  drift: number;
  turbulence: number;
  waves: number;
  lightning: boolean;
  direction: number;
  phase: number;
}

/** Authored weather beats: learn sailing first, then face occasional squalls. */
export function voyageWeather(index: number): VoyageWeather {
  const pack = worldOf(index), stage = stageOf(index);
  const kind: WeatherKind = pack === 0 ? "clear" : [
    [],
    ["overcast", "overcast", "rain", "overcast", "rain", "storm", "overcast", "rain", "storm", "storm"],
    ["overcast", "rain", "overcast", "storm", "rain", "storm", "overcast", "storm", "storm", "storm"],
    ["overcast", "rain", "storm", "overcast", "storm", "rain", "storm", "storm", "storm", "overcast"],
  ][pack]![stage] as WeatherKind;
  const storm = kind === "storm", rain = kind === "rain";
  return {
    kind,
    name: storm ? "Thunderstorm" : rain ? "Rain squall" : pack === 3 ? "Haunted moonlight" : kind === "overcast" ? "Clouded seas" : "Fair winds",
    rain: storm ? 0.85 + pack * 0.05 : rain ? 0.5 : 0,
    drift: storm ? 1.1 + pack * 0.25 : rain ? 0.65 : 0,
    turbulence: storm ? 0.07 + pack * 0.01 : rain ? 0.035 : 0,
    waves: storm ? 1.65 : rain ? 1.3 : pack === 0 ? 0.8 : 1,
    lightning: storm,
    direction: stage % 2 ? -1.15 : 1.15,
    phase: index * 1.731,
  };
}

/** Smooth seeded gusts; the visuals and the fixed-step simulation share this wind. */
export function weatherWind(weather: VoyageWeather, time: number): Wind {
  if (!weather.drift) return { direction: 1.3 + Math.sin(time * 0.013) * 0.35, strength: 0.9 };
  const t = time + weather.phase;
  const gust = 0.72 + 0.22 * Math.sin(t * 0.6) + 0.12 * Math.sin(t * 1.31);
  return {
    direction: wrapAngle(weather.direction + Math.sin(t * 0.19) * 0.27),
    strength: 0.84 + gust * 0.13,
    drift: weather.drift * gust,
    turbulence: weather.turbulence * gust,
  };
}

/** One broad flash fading away, rather than repeated rapid strobing. */
export function lightningFlash(weather: VoyageWeather, time: number): number {
  if (!weather.lightning || time < 6) return 0;
  const phase = (time + weather.phase) % 18;
  return phase < 0.65 ? (1 - phase / 0.65) ** 3 : 0;
}
