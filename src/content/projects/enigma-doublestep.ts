import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'enigma-doublestep',
  title: 'Enigma Doublestep',
  description: 'Building a physical Enigma replica, with 3D-printed rotors, mechanical stepping, and an interactive simulator.',
  tags: ['Hardware', '3D Printing', 'Cryptography'],
  liveUrl: 'https://enigmadoublestep.com/',
  repoUrl: 'https://github.com/andeplane/openenigma',
  screenshot: '/projects/enigma-doublestep/preview.jpg?v=903095da5857',
  screenshotAlt: 'Enigma Doublestep in its oak case with the lid hinged behind the enclosed rotors, keyboard, and lampboard',
  longDescription: `
Enigma Doublestep is a project to build a physical replica of the Enigma cipher machine, exploring its rotor wiring and mechanical double-step along the way.

The [project website](https://enigmadoublestep.com/) brings together the design, interactive simulator, and build progress. The physical build is in development.
  `.trim(),
}

export default project
