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
export const PARTNER_DISTANCE: readonly Keyframe[] = [[26, 22], [30, 26], [31, 28], [34, 65], [38, 100], [43, 110], [47, 85], [51, 50], [56, 26], [85, 24]]

// These describe shared presence each year. A parent pair stays paired while
// the narrator's distance from the pair changes; parenting can stretch a
// marriage without making either partner look like a departing friendship.
export function relationshipX(id: string, age: number): number | undefined {
  const me = 440 + Math.sin(age * .055) * 5
  const parents = me + curve(age, PARENT_DISTANCE)
  const partner = me + curve(age, PARTNER_DISTANCE)
  const son = curve(age, [[32, (me + partner) / 2], [38, 462], [44, 480], [50, 570], [56, 590], [72, 610], [100, 600]])
  const sonPartner = son + curve(age, [[56, 12], [60, 32], [100, 30]])
  const daughter = curve(age, [[35, (me + partner) / 2 + 20], [43, 530], [48, 565], [55, 710], [70, 720], [100, 700]])
  const positions: Record<string, number> = {
    self: me,
    mom: parents - 16,
    dad: parents + 16,
    grandma: 145 + Math.sin(age * .07) * 4,
    grandpa: 181 + Math.sin(age * .07) * 4,
    brother: me + curve(age, [[-2, -68], [8, -68], [16, -105], [25, -140], [32, -100], [38, -70]]),
    sister: me + curve(age, [[8, 70], [14, 90], [23, 200], [33, 205], [40, 155], [55, 145], [100, 140]]),
    partner,
    child: son,
    daughter,
    'child-partner': sonPartner,
    'grandchild-1': (son + sonPartner) / 2 + curve(age, [[62, -5], [68, -25], [74, -25], [82, -70], [100, -100]]),
    'grandchild-2': (son + sonPartner) / 2 + curve(age, [[68, 5], [74, 18], [82, 35], [90, 85], [100, 100]]),
    'childhood-friend': me - curve(age, [[5, 65], [12, 68], [20, 74], [28, 80]]),
    'first-love': me + curve(age, [[15, 38], [17, 28], [19, 42], [21, 65]]),
    'college-friends': me + curve(age, [[18, 95], [22, 85], [30, 90], [35, 105], [44, 105], [50, 90], [85, 95]]),
  }
  return id in positions ? clamp(positions[id], 120, 755) : undefined
}
