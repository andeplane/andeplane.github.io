import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'fyrlysar',
  title: 'FyrLysAR',
  description: 'Augmented reality iOS app that overlays real Norwegian lighthouses onto the live camera view.',
  tags: ['Qt', 'QML', 'C++', 'AR', 'iOS', 'OpenGL'],
  repoUrl: 'https://github.com/andeplane/FyrLysAR',
  screenshot: '/projects/fyrlysar/preview.png',
  portrait: true,
  longDescription: `
FyrLysAR ("lighthouse AR" in Norwegian) is an iOS augmented reality app that renders the actual positions of Norwegian lighthouses as 3D markers anchored to the real world through your camera.

Point your phone at the sea and glowing lighthouse icons appear at the correct compass bearing and distance, overlaid on the live camera feed. Tap a marker to see the lighthouse name, its light characteristic (flashing pattern), and distance.

## How it works

The app combines:
- **Device GPS + compass** — current position and heading from CoreLocation
- **Lighthouse database** — all Norwegian lighthouses from the Norwegian Coastal Administration, stored locally
- **3D projection** — lighthouse world coordinates are projected to screen space by combining the device attitude matrix (from CoreMotion) with a perspective projection calibrated to the camera field of view
- **Height data** — 50 m resolution elevation rasters are loaded to correctly offset lighthouse markers above the terrain

## Tech stack

Built with **Qt/QML** for cross-platform UI and OpenGL rendering, with native iOS bridge code for camera access and sensor fusion. The AR rendering loop runs at 60 fps; the compass/GPS pipeline uses a complementary filter to smooth noisy sensor data without introducing latency.

The height data tiles cover Norway's coastline and are compressed as PNG-encoded grayscale images loaded on demand as the user moves.
  `.trim(),
}

export default project
