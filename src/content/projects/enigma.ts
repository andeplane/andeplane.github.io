import type { ProjectMeta } from '@/types'

const project: ProjectMeta = {
  slug: 'enigma',
  title: 'Enigma Emulator',
  description: 'Python Enigma machine emulator with both arithmetic and matrix-algebra implementations.',
  tags: ['Python', 'NumPy', 'Cryptography', 'Education'],
  liveUrl: 'https://andeplane.github.io/enigma.py/',
  repoUrl: 'https://github.com/andeplane/enigma.py',
  screenshot: '/projects/enigma/preview.png',
  longDescription: `
A historically faithful Enigma machine emulator implemented in Python, with two distinct internal approaches that illuminate the mathematics behind the cipher.

## Two implementations, one interface

**Python implementation** (\`enigma_python.py\`) — uses straightforward index arithmetic to simulate rotor wiring and rotation. Each rotor applies a character substitution via lookup, and the notch mechanism advances neighbouring rotors. Clear, readable, and educational.

**Matrix implementation** (\`enigma_matrix.py\`) — represents every rotor, reflector, and plugboard as a 26×26 NumPy permutation matrix. Encryption is a chain of matrix multiplications; rotation is a permutation of rows and columns. This framing makes it obvious why the Enigma is its own inverse (the product of all matrices is an involution).

## Architecture

Abstract base classes define \`Rotor\`, \`Reflector\`, and \`Plugboard\` interfaces, so either implementation can be swapped in without touching the \`EnigmaMachine\` orchestrator. Both implementations produce identical output for the same key settings.

A web interface compiled to WebAssembly is hosted on GitHub Pages — try encrypting a message and then decrypting the ciphertext with the same key to verify the involution property.

## Why it's interesting

The matrix framing makes it easy to see why the Germans believed Enigma was unbreakable (the key space is enormous) and why it had the fatal flaw the Allies exploited (no letter can encrypt to itself, because the diagonal of the combined matrix is always zero).
  `.trim(),
}

export default project
