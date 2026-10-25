import type { ProjectMeta } from '../types/index.ts'

export const projectCategories = [
  { id: 'physics', label: 'Physics' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'games', label: 'Games' },
  { id: 'ai-tools', label: 'AI & tools' },
  { id: 'other', label: 'Other' },
] as const

export function matchesCategory(project: ProjectMeta, category: string): boolean {
  const physics = project.tags.some(tag => ['Physics', 'Finite Elements', 'Quantum Computing', 'LAMMPS', 'Fluid Dynamics'].includes(tag))
  const hardware = project.tags.includes('Hardware')
  const games = project.tags.includes('Game') || project.slug === 'lunarlander'
  const tools = project.tags.some(tag => ['AI', 'Machine Learning', 'LLM', 'SaaS'].includes(tag))
  switch (category) {
    case 'physics': return physics
    case 'hardware': return hardware
    case 'games': return games
    case 'ai-tools': return tools
    case 'other': return !physics && !hardware && !games && !tools
    default: return true
  }
}
