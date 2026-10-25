import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'constellation',
  title: 'The light we leave',
  description: 'An interactive short story about the people who become part of our sky. Watch a family’s lifelines turn into a constellation, then make it your own.',
  tags: ['Interactive story', 'SVG', 'Creative coding'],
  liveUrl: '/experiments/constellation',
  screenshot: '/projects/constellation/preview.svg',
  longDescription: `A quiet, six-chapter story about family, time, and the light people leave in our lives. Glowing trails grow through an imagined life, and the people along the way become a constellation.

Play it, pause for a moment, or move through the chapters at your own pace. Personalize the names and the ages at which people enter your story. Your edits stay in your browser. A local audio file can become the soundtrack, with the story adapting to its duration. Save the final sky as an SVG keepsake.

The sample is fictional, not a prediction of anyone’s life. Inspired by the family lifeline animation shared by @creaconbruno on Instagram; this version uses original code, design, and writing.`,
}
export default project
