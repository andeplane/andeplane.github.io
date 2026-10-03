import { describe, expect, it } from "vitest";
import { CaveWalker, type WalkIntent } from "./caveWalk";
import { harbourFloor, harbourWalkable, harbourObstacles, harbourRoom, HARBOUR_BUILDINGS } from "./harbourLayout";
const idle: WalkIntent = { forward:0, right:0, sprint:false, crouch:false, jump:false };
function walker(x: number, z: number) {
  const w=new CaveWalker(harbourObstacles(),harbourFloor,harbourWalkable);
  w.x=x; w.z=z; w.feet=harbourFloor(x,z); w.yaw=0;
  return w;
}
function move(w: CaveWalker, intent: Partial<WalkIntent>, seconds: number) {
  for(let i=0;i<seconds*120;i++) w.step({...idle,...intent},1/120);
}
describe("walkable docked ship", () => {
  it("descends from the quarterdeck and climbs the forecastle without a hidden step", () => {
    const w=walker(2,-19);
    move(w,{forward:1},9.8);
    expect(w.z).toBeGreaterThan(15);
    expect(w.feet).toBeCloseTo(4.8);
    expect(w.grounded).toBe(true);
    move(w,{forward:-1},9.8);
    expect(Math.abs(w.z + 19)).toBeLessThan(.3);
    expect(w.feet).toBeCloseTo(5.4);
  });
  it("crosses the gangplank both ways at the matching ship and quay heights", () => {
    const w=walker(2,-3);
    move(w,{right:1},5);
    expect(w.x).toBeCloseTo(20);
    expect(w.feet).toBeCloseTo(2.4);
    expect(harbourRoom(w.x,w.z)).toBe("The lantern quay");
    move(w,{right:-1},5);
    expect(w.x).toBeCloseTo(2);
    expect(w.feet).toBeCloseTo(3.6);
  });
  it("keeps the player on the ship, and collides with masts, cannons and houses", () => {
    const edge=walker(2,-19); move(edge,{right:1,sprint:true},4);
    expect(edge.x).toBeLessThan(6); expect(harbourWalkable(edge.x,edge.z)).toBe(true);
    const mast=walker(0,-13); move(mast,{forward:1,sprint:true},2);
    expect(mast.z).toBeLessThan(-10.7);
    const cannon=walker(-4.6,-4); move(cannon,{forward:-1,sprint:true},2);
    expect(cannon.z).toBeGreaterThan(-6);
    const town=walker(20,-28); move(town,{right:1,sprint:true},4);
    expect(town.x).toBeLessThan(26.5);
    expect(HARBOUR_BUILDINGS.length).toBe(8);
  });
  it("allows jumping on the deck and returns to its actual floor", () => {
    const w=walker(2,-19); w.step({...idle,jump:true},1/60);
    expect(w.feet).toBeGreaterThan(5.4);
    move(w,{},1); expect(w.feet).toBeCloseTo(5.4); expect(w.grounded).toBe(true);
  });
});
