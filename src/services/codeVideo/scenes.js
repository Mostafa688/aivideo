// ── scenes.js ── سجل المشاهد
import * as A from './scenesA.js';
import * as B from './scenesB.js';
import { SCENES_C } from './scenesC.js';
import { SCENES_V } from './scenesV.js';

export const SCENES = {
  title: A.title, kinetic: A.kinetic, bigword: A.bigword, quote: A.quote, outro: A.outro,
  ...B.SCENES_B,
  ...SCENES_C,
  ...SCENES_V,
};
export const SCENE_TYPES = Object.keys(SCENES);
