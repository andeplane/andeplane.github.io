import configurations from './variants.json'
import type { Part } from './data'

export interface RobotVariant {
  id: string
  number: string
  label: string
  shortLabel: string
  cameraLabel: string
  cameraQuantity: number
  cameraKey: string
  description: string
  capability: string
  limitation: string
  algorithmTitle: string
  algorithmBody: string
  mappingBody: string
  cameraProduct: { name: string; sku: string; price: number; currency: string; url: string; baselineMm?: number; widthMm: number; heightMm: number; depthMm: number }
  items: Part[]
}

export const variants = configurations as RobotVariant[]
export const variantPath = (variant: RobotVariant) => `/hardware/kiwi/${variant.id}/`
export const variantAssets = (variant: RobotVariant) => `/hardware/kiwi/${variant.id}/`
export const variantCad = (variant: RobotVariant) => `/hardware/kiwi/cad/${variant.id}/`
