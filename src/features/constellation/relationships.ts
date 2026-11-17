import { clamp, smooth } from './clock.ts'
export type Keyframe = readonly [number, number]
export function curve(age: number, keys: readonly Keyframe[]) {
  if (age <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) if (age <= keys[i][0]) {
    const [year, value] = keys[i - 1]
    return value + (keys[i][1] - value) * smooth((age - year) / (keys[i][0] - year))
  }
  return keys[keys.length - 1][1]
}
// Distance belongs to the person making the journey. Parents keep a steady
// paired course; the narrator leaves home and later comes back toward them.
export const PARENT_DISTANCE: readonly Keyframe[] = [[-2,0],[8,0],[12,55],[17,170],[23,230],[30,205],[35,160],[38,125],[43,75],[50,65],[55,55],[62,35],[66,28],[100,28]]
export const PARTNER_DISTANCE: readonly Keyframe[] = [[26,24],[29,26],[30,60],[32,90],[36,92],[40,90],[43,88],[47,68],[51,44],[56,28],[85,26]]

export function relationshipX(id: string, age: number): number | undefined {
  const parents=440+Math.sin(age*.055)*3
  // Households have shared centers. A couple must not be separated simply to
  // fill the canvas; the younger generations move relative to their family.
  const grandparents=parents-160
  const me=parents+curve(age,PARENT_DISTANCE)*.60
  const partner=me+curve(age,PARTNER_DISTANCE)
  const home=(me+partner)/2
  // Young children move with their household. As teenagers they are the ones
  // who curve outward, while their parents keep their own adult course.
  const son=home-12+.65*curve(age,[[30,0],[40,0],[44,20],[48,100],[53,190],[56,200],[62,110],[68,110],[70,150],[73,250],[77,300],[100,300]])
  const sonPartner=son+curve(age,[[56,30],[60,32],[62,72],[100,72]])
  const positions:Record<string,number>={
    self:me,
    mom:parents-22,
    dad:parents-50,
    grandma:grandparents-16,
    grandpa:grandparents+16,
    brother:parents+.85*curve(age,[[-2,-105],[8,-105],[14,-120],[23,-125],[28,-105],[33,-95],[38,-90]]),
    sister:parents+.85*curve(age,[[8,-45],[14,-70],[23,-135],[33,-100],[40,-20],[55,-25],[100,-30]]),
    partner,child:son,'child-partner':sonPartner,
    'grandchild-1':son-curve(age,[[62,24],[68,26],[74,32],[82,70],[100,100]]),
    'grandchild-2':sonPartner+curve(age,[[68,24],[74,26],[82,35],[90,85],[100,100]]),
    // Childhood companionship is intimate. As college friendship grows on
    // the other side, the childhood friend gradually takes their own course.
    'childhood-friend':me+curve(age,[[5,42],[12,44],[17,48],[19,58],[22,75],[25,78],[26,82],[28,95]]),
    'college-friends':me+curve(age,[[18,-85],[21,-65],[23,-38],[28,-40],[31,-45],[34,-65]]),
    // First love is across the narrator from Childhood friend, and is nearer
    // to Me than to any friend during their relationship.
    'first-love':me+curve(age,[[15,-22],[17,-20],[19,-20],[21,-22]]),
  }
  return id in positions?clamp(positions[id],120,755):undefined
}
