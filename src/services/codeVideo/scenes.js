// ── scenes.js ── سجل المشاهد
import * as A from './scenesA.js';
import * as B from './scenesB.js';

export const SCENES = {
  title: A.title, kinetic: A.kinetic, bigword: A.bigword, quote: A.quote, outro: A.outro,
  ...B.SCENES_B,
};
export const SCENE_TYPES = Object.keys(SCENES);
