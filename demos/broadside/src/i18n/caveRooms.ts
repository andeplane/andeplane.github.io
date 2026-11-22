import type { CommonLocale } from "./locale";

const roomMessages = {
  "The treasure cave": "roomTreasure",
  "The glowing grotto": "roomGrotto",
  "Smuggler’s passage": "roomSmuggler",
  "The king’s vault": "roomKing",
  "The lantern passage": "roomLantern",
} as const;

export function caveRoomLabel(room: string, t: CommonLocale["t"]): string {
  const message = roomMessages[room as keyof typeof roomMessages];
  return message ? t(message) : room;
}
