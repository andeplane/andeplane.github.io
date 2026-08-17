/**
 * Web Audio plumbing: one lazily-created AudioContext, a master gain, and a small
 * generated reverb so the notes sit in a room instead of arriving dry against the ear.
 *
 * Two rules the browser imposes and one this site imposes:
 *   - the context can only start from a user gesture, so nothing is created until the
 *     first tap or keypress (`unlock`);
 *   - a suspended context has to be resumed again after tab switches;
 *   - `?mute` prevents the context from ever existing, which is how agent-driven
 *     screenshotting of this page stays silent (same convention as demos/three-lefts).
 */

import { playPianoNote, type Voice } from './piano.ts';
import { storageGet, storageSet } from '../core/storage.ts';

const MUTED_KEY = 'interval-trainer.muted';
const REVERB_SECONDS = 1.8;

function makeImpulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * REVERB_SECONDS);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // Exponentially decaying noise: the cheapest thing that still reads as a room.
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
    }
  }
  return buffer;
}

export class AudioEngine {
  /** True when `?mute` is in the URL: no context is ever created. */
  readonly forcedSilent: boolean;

  private ctx: AudioContext | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private voices: Voice[] = [];
  private mutedByUser: boolean;

  constructor() {
    this.forcedSilent = new URLSearchParams(location.search).has('mute');
    this.mutedByUser = storageGet(MUTED_KEY) === '1';
  }

  get muted(): boolean {
    return this.forcedSilent || this.mutedByUser;
  }

  setMuted(muted: boolean): void {
    this.mutedByUser = muted;
    storageSet(MUTED_KEY, muted ? '1' : '0');
    if (muted) this.stopAll();
  }

  /** Safe to call on every gesture; creating the context is idempotent. */
  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) this.build();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private build(): void {
    const Ctor = window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const dry = ctx.createGain();
    dry.gain.value = 0.82;
    dry.connect(master);

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    wet.connect(convolver).connect(master);

    this.ctx = ctx;
    this.dry = dry;
    this.wet = wet;
  }

  play(midi: number, velocity = 1): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || !this.dry || !this.wet) return;

    const fan = this.ctx.createGain();
    fan.connect(this.dry);
    fan.connect(this.wet);
    this.voices.push(playPianoNote(this.ctx, fan, midi, velocity));
    // Voices retire themselves; keep the list from growing across a long session.
    if (this.voices.length > 24) this.voices = this.voices.slice(-24);
  }

  /** Cut everything currently ringing — used when a new question starts. */
  stopAll(): void {
    if (!this.ctx) return;
    for (const voice of this.voices) voice.release(this.ctx);
    this.voices = [];
  }
}
