import type { LevelSpec } from '../world/types'
import { threeLefts } from './threeLefts'
import { longGallery } from './longGallery'
import { theAscent } from './theAscent'
import { theCloister } from './theCloister'
import { theOrangery } from './theOrangery'
import { theAviary } from './theAviary'
import { theCampanile } from './theCampanile'
import { theHouse } from './theHouse'

export const LEVELS: LevelSpec[] = [
  threeLefts,
  longGallery,
  theAscent,
  theCloister,
  theOrangery,
  theAviary,
  theCampanile,
  theHouse,
]

export function levelById(id: string): LevelSpec | undefined {
  return LEVELS.find((l) => l.id === id)
}
