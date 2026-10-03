import type { IslandDef } from "./levels";
import type { Vec2 } from "../sim/math";

interface NavigationCourse {
  intro: string;
  start: Vec2;
  heading: number;
  finish: Vec2;
  gems: Vec2[];
  islands: IslandDef[];
}

const beach = (
  x: number,
  z: number,
  radius: number,
  props: IslandDef["props"] = ["palms"],
): IslandDef => ({ pos: { x, z }, radius, kind: "sand", props });
const rock = (x: number, z: number, radius = 4): IslandDef => ({
  pos: { x, z },
  radius,
  kind: radius < 7 ? "sea-rock" : "rock",
  props: radius < 7 ? [] : ["rocks"],
});
const point = (x: number, z: number): Vec2 => ({ x, z });

/** Ten authored sailing lessons. Seeds dress the islands, never shuffle the lesson. */
const COURSES: readonly NavigationCourse[] = [
  {
    intro:
      "Your first short voyage! Steer toward the gold compass. Give the little rocks plenty of room.",
    start: point(0, -70),
    heading: 0,
    finish: point(0, 65),
    gems: [point(0, -30), point(8, 8), point(-10, 42)],
    islands: [
      beach(-48, -20, 19),
      beach(50, 20, 17, ["lighthouse", "palms"]),
      rock(25, -25, 4.5),
    ],
  },
  {
    intro:
      "Sail between the palm islands. Gentle left and right turns will keep you in the open channel.",
    start: point(-20, -85),
    heading: 0,
    finish: point(0, 148),
    gems: [point(-10, -25), point(16, 28), point(-8, 90)],
    islands: [
      beach(-57, -30, 23),
      beach(36, -30, 19),
      beach(-35, 32, 18),
      beach(62, 32, 22),
      beach(-60, 93, 21),
      beach(38, 93, 19),
      rock(55, -72),
    ],
  },
  {
    intro:
      "A headland blocks the way! Make a wide turn around it, then turn back toward the treasure.",
    start: point(-40, -85),
    heading: 0.2,
    finish: point(0, 125),
    gems: [point(-30, -45), point(32, 0), point(10, 87)],
    islands: [
      beach(-10, 0, 27, ["lighthouse", "palms"]),
      beach(62, 58, 18),
      beach(-63, 83, 19),
      rock(-66, -45),
    ],
  },
  {
    intro:
      "A rocky slalom! Turn around each reef in turn. Start turning before your bow reaches the rocks.",
    start: point(28, -95),
    heading: 0,
    finish: point(0, 165),
    gems: [point(24, -35), point(-5, 28), point(17, 96)],
    islands: [
      beach(-65, -50, 20, ["wreck", "palms"]),
      rock(-5, -35, 13),
      rock(25, 28, 13),
      rock(-16, 96, 14),
      rock(56, 65),
      rock(-48, 125),
    ],
  },
  {
    intro:
      "Two paths around one big island! Choose either side; each passage hides a blue gem.",
    start: point(0, -90),
    heading: 0,
    finish: point(0, 158),
    gems: [point(-45, 20), point(45, 20), point(0, 110)],
    islands: [
      beach(0, 25, 29, ["palms", "rocks"]),
      beach(-80, 18, 17),
      beach(80, 18, 17, ["lighthouse", "palms"]),
      rock(-20, -50),
      rock(58, 95),
    ],
  },
  {
    intro:
      "Find the hidden lagoon among the islands. Explore the gaps, then follow the compass out to sea.",
    start: point(-46, -88),
    heading: 0.15,
    finish: point(0, 180),
    gems: [point(-10, 4), point(0, 45), point(-52, 112)],
    islands: [
      beach(-48, 18, 22),
      beach(48, 5, 20, ["wreck", "palms"]),
      beach(-37, 65, 23),
      beach(22, 87, 24, ["palms", "rocks"]),
      beach(64, 50, 18),
      rock(55, 130),
    ],
  },
  {
    intro:
      "The coast bends a long way east. Follow its curve and leave space for the ship to turn.",
    start: point(-55, -100),
    heading: 0.3,
    finish: point(0, 205),
    gems: [point(-27, -38), point(39, 52), point(12, 157)],
    islands: [
      beach(-54, 0, 27, ["palms", "rocks"]),
      beach(-12, 45, 27),
      beach(-35, 106, 26, ["lighthouse", "palms"]),
      beach(70, 108, 20),
      beach(-66, 170, 19),
      rock(24, -72),
      rock(51, 170),
    ],
  },
  {
    intro:
      "Three reef gates! Line up with each gap, then turn gently toward the next one.",
    start: point(20, -95),
    heading: 0,
    finish: point(0, 165),
    gems: [point(5, -35), point(-22, 40), point(19, 110)],
    islands: [
      rock(-30, -35, 18),
      rock(40, -35, 18),
      rock(-55, 40, 19),
      rock(10, 40, 19),
      rock(-12, 110, 14),
      rock(50, 110, 14),
      beach(-76, -85, 18, ["wreck", "palms"]),
    ],
  },
  {
    intro:
      "The secret passage is west of the great islands. It holds extra gems; the wider eastern route is safer.",
    start: point(0, -100),
    heading: 0,
    finish: point(0, 185),
    gems: [point(-49, -20), point(-59, 73), point(0, 151)],
    islands: [
      beach(0, -15, 30, ["lighthouse", "palms"]),
      beach(-20, 75, 25),
      rock(-78, 3, 11),
      rock(-88, 82, 10),
      beach(75, 57, 22, ["wreck", "palms"]),
      rock(37, 125),
    ],
  },
  {
    intro:
      "The captain’s trial! Link wide turns around four headlands. Reach the far sea to earn your world treasure.",
    start: point(40, -115),
    heading: 0,
    finish: point(0, 220),
    gems: [point(28, -55), point(-11, 15), point(14, 91)],
    islands: [
      beach(-5, -55, 20),
      beach(25, 15, 24, ["lighthouse", "palms"]),
      beach(-22, 90, 24, ["palms", "rocks"]),
      beach(20, 160, 20, ["wreck", "palms"]),
      rock(-64, -2),
      rock(62, 72),
      rock(-57, 166),
    ],
  },
];

export function navigationCourse(stage: number): NavigationCourse {
  // Every session owns mutable gem/island state; revisiting a level starts fresh.
  const course = COURSES[stage];
  if (!course) throw new RangeError("Unknown navigation course");
  return {
    ...course,
    start: { ...course.start },
    finish: { ...course.finish },
    gems: course.gems.map((p) => ({ ...p })),
    islands: course.islands.map((i) => ({
      ...i,
      pos: { ...i.pos },
      props: [...i.props],
    })),
  };
}
