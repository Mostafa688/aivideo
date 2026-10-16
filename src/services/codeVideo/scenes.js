// ── scenes.js ── سجل المشاهد
import * as A from './scenesA.js';
import * as B from './scenesB.js';
import { SCENES_C } from './scenesC.js';
import { SCENES_V } from './scenesV.js';
import { SCENES_MAP } from './scenesMap.js';
import { SCENES_ED } from './scenesEd.js';
import { art } from './art.js';
import { world } from './w3d/scene.js';

export const SCENES = {
  title: A.title, kinetic: A.kinetic, bigword: A.bigword, quote: A.quote, outro: A.outro,
  ...B.SCENES_B,
  ...SCENES_C,
  ...SCENES_V,
  ...SCENES_MAP,
  ...SCENES_ED,
  art,
  world,
};
export const SCENE_TYPES = Object.keys(SCENES);
