/**
 * A piano-ish voice, synthesised. No samples: the whole point of shipping this on a
 * static site is that it loads instantly and works offline.
 *
 * The recipe is additive — a handful of harmonics, each with its own decay, over a
 * slightly inharmonic series. Two details do most of the work of sounding like a struck
 * string rather than an organ: upper partials decay faster than lower ones, and low notes
 * ring longer than high ones.
 */

export const A4_MIDI = 69;
export const A4_HZ = 440;

export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/** Relative level of each harmonic. Rolls off faster than 1/n, which reads as "wooden". */
const PARTIAL_GAINS = [1, 0.42, 0.26, 0.14, 0.08, 0.05];
/**
 * Real strings are stiff, so their overtones sit slightly sharp of exact multiples:
 * f_n = n·f·sqrt(1 + B·n²). Small B, but it is the difference between a piano and a
 * sine stack.
 */
const INHARMONICITY = 0.0004;
const ATTACK_S = 0.006;

/** How long a note takes to fade to silence. Low notes ring, high notes ping. */
export function decaySeconds(hz: number): number {
  return Math.min(4, Math.max(1.1, 3.1 * (A4_HZ / hz) ** 0.35));
}

/**
 * Amplitude envelope in [0,1] at `t` seconds after onset — the same curve the audio
 * follows, so the wave field can be driven from it without an AnalyserNode (and so the
 * visuals still behave when the page is muted).
 */
export function envelopeAt(t: number, decay: number): number {
  if (t < 0) return 0;
  if (t < ATTACK_S) return t / ATTACK_S;
  return Math.exp((-4.2 * (t - ATTACK_S)) / decay);
}

export interface Voice {
  /** Fade out fast rather than cutting, which would click. */
  release(ctx: AudioContext, at?: number): void;
}

export function playPianoNote(
  ctx: AudioContext,
  destination: AudioNode,
  midi: number,
  velocity = 1,
): Voice {
  const hz = midiToHz(midi);
  const decay = decaySeconds(hz);
  const start = ctx.currentTime;

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.22 * velocity;
  voiceGain.connect(destination);

  PARTIAL_GAINS.forEach((level, index) => {
    const n = index + 1;
    const partialHz = n * hz * Math.sqrt(1 + INHARMONICITY * n * n);
    // Above Nyquist an oscillator just aliases into garbage; drop those partials.
    if (partialHz > ctx.sampleRate / 2) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = partialHz;

    const gain = ctx.createGain();
    const peak = level;
    const partialDecay = decay / (1 + 0.55 * index);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + ATTACK_S);
    // exponentialRamp cannot reach 0, so aim at an inaudible floor and stop the node.
    gain.gain.exponentialRampToValueAtTime(peak * 0.0005, start + ATTACK_S + partialDecay);

    osc.connect(gain).connect(voiceGain);
    osc.start(start);
    osc.stop(start + ATTACK_S + partialDecay + 0.05);
    osc.onended = () => {
      gain.disconnect();
      osc.disconnect();
    };
  });

  // Everything is scheduled; the voice node can retire once the longest partial has.
  window.setTimeout(() => voiceGain.disconnect(), (decay + 0.5) * 1000);

  return {
    release(context, at = context.currentTime) {
      voiceGain.gain.cancelScheduledValues(at);
      voiceGain.gain.setValueAtTime(Math.max(0.0001, voiceGain.gain.value), at);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    },
  };
}
