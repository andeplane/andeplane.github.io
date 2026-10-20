import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'kiwi',
  title: 'Kiwi — Home Robot',
  description: 'A 29 cm printed robot with three omni wheels, calibrated stereo depth, and a model decision service. Explore its prototype CAD, parts, and control architecture.',
  tags: ['Hardware', 'Robotics', '3D Printing', 'Computer Vision'],
  liveUrl: '/hardware/kiwi/',
  screenshot: '/hardware/kiwi/concept.webp',
  screenshotAlt: 'AI-generated concept of the Kiwi three-wheel robot',
  repoUrl: 'https://github.com/andeplane/andeplane.github.io/tree/main/hardware/kiwi',
  longDescription: `
Kiwi is a prototype design for a small indoor robot: a printed chassis, three omni wheels, a Raspberry Pi, and a calibrated RGB/stereo camera.

The [project workbench](/hardware/kiwi/) contains an interactive CAD assembly, downloadable parametric source, STEP and STL files, an orderable component list, and the planned sensing and control architecture.

The model chooses among bounded goals. Local navigation estimates the robot’s position, finds a path, and sends velocity commands to an encoder-based motor controller. Immediate stopping remains on the robot.

The hero image is an ImageGen concept. CAD and software demonstrations do not establish physical fit or autonomous performance: the robot has not yet been assembled or commissioned.
`.trim(),
}

export default project
