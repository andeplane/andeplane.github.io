import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'teslacode',
  title: 'teslacode.dev',
  description: 'Share your Mac screen in your Tesla\'s browser over WebRTC — built for coding with Claude Code from the car while parked or charging.',
  tags: ['TypeScript', 'WebRTC', 'Hono', 'SaaS', 'Claude Code'],
  liveUrl: 'https://teslacode.dev',
  screenshot: '/projects/teslacode/preview.png',
  longDescription: `
Real-time screen sharing from a Mac to a Tesla's built-in browser. The goal: keep working — primarily **coding with Claude Code** — from the car while parked or charging, eyes-up and hands-free.

## The Tesla constraint

Tesla blocks \`<video>\` playback in its browser while the car is in use, so a normal WebRTC video stream is a dead end. Instead, the Mac captures the screen with \`getDisplayMedia()\`, draws each frame to an offscreen canvas, encodes it as a JPEG, and ships the raw bytes over a WebRTC DataChannel. The Tesla renders each frame into an \`<img>\` element — which Tesla doesn't block. Frame rate adapts to connection quality.

\`\`\`
Mac → getDisplayMedia() → canvas → JPEG → DataChannel → Tesla <img>
                              ↕ signaling only
                           Server (Hono/WS)
\`\`\`

The server only brokers the WebRTC handshake; once connected, frames flow peer-to-peer (or via a TURN relay when the car's network requires it — Tesla's in-car connectivity always does).

## Hands-free controls

Mic and Send buttons on the Tesla viewer send keystrokes back to the Mac, so you can drive a voice-mode Claude Code session entirely from the car's touchscreen. A small local daemon (\`npx teslacode.dev\`) receives the commands and synthesises the keystrokes — key events travel Tesla → DataChannel → share page → local daemon, never through the server.

## Product

A freemium SaaS: anonymous sessions work out of the box, Google sign-in unlocks more weekly minutes, and paid plans (Stripe billing) add 1080p streaming and faster refresh. Runs on Railway with Postgres, Firebase Authentication, and Metered TURN infrastructure.

## Stack

Vite + TypeScript SPA on the client, Hono + Node.js + WebSocket signaling on the server, WebRTC DataChannel transport, Stripe for billing, Firebase for auth.
  `.trim(),
}

export default project
