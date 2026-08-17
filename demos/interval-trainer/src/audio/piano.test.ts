import { describe, expect, it } from 'vitest';
import { decaySeconds, envelopeAt, midiToHz } from './piano.ts';

describe('midiToHz', () => {
  it('anchors on A4 = 440 and doubles per octave', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 10);
    expect(midiToHz(81)).toBeCloseTo(880, 10);
    expect(midiToHz(57)).toBeCloseTo(220, 10);
  });

  it('gives a fifth the 3:2 ratio equal temperament can manage', () => {
    // Equal temperament's fifth is two cents flat of a pure 3:2 — close enough that the
    // wave field's fringes still lock.
    expect(midiToHz(67) / midiToHz(60)).toBeCloseTo(1.5, 2);
  });
});

describe('decaySeconds', () => {
  it('lets low notes ring longer than high ones', () => {
    expect(decaySeconds(midiToHz(48))).toBeGreaterThan(decaySeconds(midiToHz(84)));
  });

  it('stays inside sane bounds across the keyboard', () => {
    for (let midi = 21; midi <= 108; midi++) {
      const decay = decaySeconds(midiToHz(midi));
      expect(decay).toBeGreaterThanOrEqual(1.1);
      expect(decay).toBeLessThanOrEqual(4);
    }
  });
});

describe('envelopeAt', () => {
  it('is silent before onset, rises through the attack, then decays', () => {
    expect(envelopeAt(-1, 2)).toBe(0);
    expect(envelopeAt(0.003, 2)).toBeCloseTo(0.5, 5);
    expect(envelopeAt(0.006, 2)).toBeCloseTo(1, 5);
    expect(envelopeAt(1, 2)).toBeLessThan(1);
    expect(envelopeAt(2, 2)).toBeLessThan(envelopeAt(1, 2));
  });

  it('is inaudible well before the source is dropped from the field', () => {
    expect(envelopeAt(2.5 * 2, 2)).toBeLessThan(0.01);
  });
});
