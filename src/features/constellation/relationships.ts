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
export const PARENT_DISTANCE: readonly Keyframe[] = [[-2, 0], [8, 0], [12, -55], [17, -170], [23, -230], [30, -205], [35, -160], [38, -125], [43, -75], [50, -65], [55, -55], [62, -35], [66, -28]]
export const PARTNER_DISTANCE: readonly Keyframe[] = [[26, 28], [30, 30], [31, 32], [34, 56], [38, 78], [43, 88], [47, 68], [51, 44], [56, 28], [85, 26]]

// These describe shared presence each year. A parent pair stays paired while
// the narrator's distance from the pair changes; parenting can stretch a
// marriage without making either partner look like a departing friendship.
export function relationshipX(id: string, age: number): number | undefined {
  const me = 440 + Math.sin(age * .055) * 5
  const parents = me + curve(age, PARENT_DISTANCE)
  const partner = me + curve(age, PARTNER_DISTANCE)
  const son = curve(age, [[32, (me + partner) / 2], [38, 470], [44, 490], [50, 565], [56, 600], [72, 610], [100, 620]])
  const sonPartner = son + curve(age, [[56, 12], [60, 32], [100, 30]])
  const daughter = curve(age, [[35, (me + partner) / 2 + 20], [43, 510], [48, 550], [55, 705], [70, 720], [100, 730]])
  const positions: Record<string, number> = {
    self: me,
    mom: parents - 16,
    dad: parents + 16,
    grandma: 145 + Math.sin(age * .07) * 4,
    grandpa: 181 + Math.sin(age * .07) * 4,
    brother: me + curve(age, [[-2, -68], [8, -68], [16, -105], [25, -140], [32, -100], [38, -70]]),
    sister: me + curve(age, [[8, -105], [14, -145], [23, -175], [33, -155], [40, -112], [55, -95], [100, -95]]),
    partner,
    child: son,
    daughter,
    'child-partner': sonPartner,
    'grandchild-1': (son + sonPartner) / 2 + curve(age, [[62, -5], [68, -25], [74, -25], [82, -70], [100, -100]]),
    'grandchild-2': (son + sonPartner) / 2 + curve(age, [[68, 5], [74, 18], [82, 35], [90, 85], [100, 100]]),
    'childhood-friend': me + curve(age, [[5, 95], [12, 100], [20, 105], [28, 110]]),
    'first-love': me + curve(age, [[15, 38], [17, 28], [19, 42], [21, 65]]),
    'college-friends': me + curve(age, [[18, 185], [22, 180], [30, 175], [35, 185], [44, 180], [50, 180], [85, 180]]),
  }
  return id in positions ? clamp(positions[id], 120, 755) : undefined
}
