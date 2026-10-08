/** The model modes the water computer can run. Add new ones here. */
import { CalcMode } from './calc/mode.ts';
import { BigMode } from '../big/mode.ts';
import type { ModelMode } from './types.ts';

export const MODES: ModelMode[] = [new CalcMode(), new BigMode('tinystories'), new BigMode('gpt2')];
