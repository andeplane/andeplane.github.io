// Norwegian usually tells time relative to the nearest hour or half hour.
const hourNames = ["tolv", "ett", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti", "elleve"];
const distances = ["", "ett minutt", "to minutter", "tre minutter", "fire minutter", "fem", "seks minutter", "sju minutter", "åtte minutter", "ni minutter", "ti", "elleve minutter", "tolv minutter", "tretten minutter", "fjorten minutter"];

export function spokenTime(time: number): string {
  const hour = Math.floor(time / 60);
  const current = hourNames[hour];
  const next = hourNames[(hour + 1) % 12];
  const minute = time % 60;
  if (!minute) return current!;
  if (minute === 15) return `kvart over ${current}`;
  if (minute === 30) return `halv ${next}`;
  if (minute === 45) return `kvart på ${next}`;
  if (minute < 15) return `${distances[minute]} over ${current}`;
  if (minute < 30) return `${distances[30 - minute]} på halv ${next}`;
  if (minute < 45) return `${distances[minute - 30]} over halv ${next}`;
  return `${distances[60 - minute]} på ${next}`;
}
