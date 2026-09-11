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
Enigma replaces each typed letter with another letter, then moves its rotors so the next substitution changes. This Python emulator models that mechanical cipher in two ways, letting the same signal path be followed as wiring or as mathematics.

## Two implementations, one interface

**Python implementation** (\`enigma_python.py\`) — uses straightforward index arithmetic to simulate rotor wiring and rotation. Each rotor applies a character substitution via lookup, and the notch mechanism advances neighbouring rotors. Clear, readable, and educational.

**Matrix implementation** (\`enigma_matrix.py\`) — represents every rotor, reflector, and plugboard as a 26×26 NumPy permutation matrix. Encryption is a chain of matrix multiplications; rotation is a permutation of rows and columns. A permutation matrix rearranges letter positions. At a fixed rotor state, the outgoing path, paired-letter reflector and reversed return path together form an involution: applying that substitution twice gives the original letter.

## Architecture

Abstract base classes define \`Rotor\`, \`Reflector\`, and \`Plugboard\` interfaces, so either implementation can be swapped in without touching the \`EnigmaMachine\` orchestrator. Both implementations produce identical output for the same key settings.

A web interface compiled to WebAssembly is hosted on GitHub Pages — try encrypting a message and then decrypting the ciphertext with the same settings **after resetting the rotors to their starting positions**. This repeats the same sequence of substitutions and recovers the original message.

## Why it's interesting

The reflector makes it impossible for a letter to encrypt to itself. That constraint can reject a guessed plaintext alignment, but it does not recover the key on its own. The accompanying article derives the constraint and explains why changing rotor positions, including the middle rotor’s double-step, must be treated separately from the fixed-state algebra.
  `.trim(),
}

export default project
