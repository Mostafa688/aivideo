// ── w3d/choreo.js ── "مخرج الحركة" (LLM): بيحوّل فكرة المشهد لعالم 3D (بيئة + شخصيات + مسارات + أغراض + كاميرا) كـ JSON، والكود بيتحقق منه ويحرّكه
// + مصمم كاست الـ3D (شخصيات بشر/حيوانات بملابس وألوان) على مقاس القصة. أي فشل → عالم افتراضي سليم (مش بيرجع لـ2D).
import { llmJson } from '../../documentary/llm.js';
import { ACTS } from './anim.js';
import { ENVS, ENV_NAMES, getEnv } from './envs.js';
import { PROP_TYPES } from './props.js';
import { HAIR_STYLES, ACCESSORIES } from './rig.js';
import { sanitizeWorld, sanitizeLook, ANIMALS, DEFAULT_HUMAN } from './world.js';

const clean = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

const ACT_DOC = { idle: 'stand', walk: 'walk (use "to")', run: 'run (use "to")', jog: 'jog (use "to")', kick: 'kick the ball (one swing, dur 0.1-0.25)', pass: 'short pass', throw: 'throw something', celebrate: 'jump with arms up (goal/win)', cheer: 'arms up cheering', dive: 'goalkeeper dive sideways (dir 1 or -1)', fall: 'trip and fall down', lie: 'lie on the ground', sit: 'sit down', stir: 'cook: stir a pot/pan', chop: 'cook: chop on a board', wave: 'wave hello', point: 'point forward', talk: 'talk with gestures (mouth moves with the voice)', dance: 'dance', carry: 'carry something with both hands', hold: 'hold something in the right hand', sad: 'sad', angry: 'angry', swing: 'swing a sword/bat', jump: 'jump', pickup: 'bend and pick up', ready: 'ready stance (goalkeeper)', eat: 'eat/drink', clap: 'clap' };

function envDoc() {
  return ENV_NAMES.map(n => { const e = getEnv(n); return `- ${n}: anchors ${Object.entries(e.anchors).map(([k, v]) => `${k}[${v[0]},${v[1]}]`).join(' ')}`; }).join('\n');
}

export const CHOREO_SYSTEM = `You are the 3D animation director of videos made entirely with code: a low-poly 3D world (like a stylised game) with articulated characters, props and a cinematic camera. For ONE scene you receive an idea and the words said; you return ONLY JSON describing what happens. The engine animates it — you never write code.

World: y is up; the ground is the x-z plane; x to the right, z away from the default camera. Units are metres (a person is about 1.8 high, walking ~1.4 m/s, running ~4 m/s). Time inside the scene is a fraction 0..1.
Return {"env":"<env>","time":"day|dusk|night","actors":[...],"props":[...],"custom":[...],"camera":{...},"sfx":[...]}.

Environments and their named anchors (x,z) — use anchor names or [x,z] numbers for positions:
@@ENVS@@
ACTORS: {"id":"short id","look":{...optional overrides},"at":<anchor|[x,z]>,"face":<degrees|anchor|id>,"tracks":[{"at":0-1,"dur":0.05-1,"act":"<act>","to":<anchor|[x,z]|id>,"face":<degrees|anchor|id>,"dir":1|-1}]}
 - "id" is a cast id when you want that cast member (you may also add extra background people/animals with new ids and a "look").
 - Acts: @@ACTS@@
 - A track starts at "at" and lasts "dur" (fractions of the scene). Walking/running tracks need "to"; after a track ends the actor idles (except lie/sit). Keep one actor's tracks in time order without overlap. 2-6 tracks per active actor; background actors can have 1-2.
 - "look": {"skin","hair","hairStyle":"@@HAIR@@","top","bottom","bottomStyle":"shorts|pants|skirt","sleeve":"short|long|none","socks","shoes","height":"kid|adult|tall|big","beard":"none|full|mustache","accessories":["@@ACC@@"],"accColor","hat","gloves"} (all colours "#rrggbb") or an animal: {"animal":"@@ANIMALS@@","color":"#rrggbb","size":1}.
PROPS: {"id","type":"<prop>","at":<anchor|[x,z]>,"y":0,"color":"#hex","scale":1,"yaw":0,"hold":[{"actor":"id","hand":"r|l|foot|head","from":0-1,"to":0-1}],"moves":[{"at":0-1,"dur":0.05-1,"to":<anchor|[x,z]|id>,"arc":height}]}
 - Prop types: @@PROPS@@. "hold" attaches a prop to an actor (a ball at the "foot" while dribbling; a pan/spoon/knife in the hand "r"). "moves" slides it (a kicked ball: hold until the kick then move with arc 1-2).
CUSTOM (for anything not in the prop list; max 24): {"shape":"box|sph|cyl|cone","pos":[x,y,z],"size":[sx,sy,sz],"color":"#hex","ry":degrees} — build novel objects from simple solids (y = centre height).
CAMERA: {"target":"<actor/prop id>|anchor|[x,z]","dist":5-14,"height":1.5-8,"angle":-60..60 (degrees around the target, 0 = from the default side),"sweep":degrees turned over the scene,"dist2":"end distance (push in/out)","height2","fov":30-55,"follow":true}. Action: dist 7-10, height 4-6 (a high game-like view) with a slow sweep and follow on the main actor/ball. Close-ups: dist 4-6, height 1.6-2.5.
SFX (optional extra sounds): {"at":0-1,"type":"hit|whoosh|pop|cheer|boom|ding|splash|sizzle|slam|shimmer"}.

Craft: make the picture match the words (what is being said must be visible as action). Use 2-6 characters (extras fill the scene: teammates, opponents, customers, animals). Give teams/groups matching colours. Leave actors a metre apart. Time the actions so the key moment lands when the important words are said (about 40-70% of the scene). Use the cast ids you are given for the main characters.

Example (a goal): {"env":"pitch","time":"day","actors":[{"id":"ali","at":[-6,-2],"tracks":[{"at":0,"dur":0.35,"act":"run","to":[3,0]},{"at":0.35,"dur":0.18,"act":"kick","face":"goalRight"},{"at":0.56,"dur":0.4,"act":"celebrate"}]},{"id":"keeper","look":{"top":"#fbbf24","bottom":"#111827","bottomStyle":"pants","sleeve":"long","gloves":"#22c55e"},"at":[11.2,0],"tracks":[{"at":0.05,"dur":0.3,"act":"ready"},{"at":0.5,"dur":0.3,"act":"dive","dir":1}]}],"props":[{"id":"ball","type":"ball","at":[-5.2,-1.8],"hold":[{"actor":"ali","hand":"foot","from":0,"to":0.46}],"moves":[{"at":0.46,"dur":0.2,"to":[12.4,0.5],"arc":1.4}]}],"camera":{"target":"ball","dist":9,"height":5.5,"angle":20,"sweep":25},"sfx":[{"at":0.46,"type":"hit"},{"at":0.7,"type":"cheer"}]}
Example (cooking): {"env":"kitchen","actors":[{"id":"chef","at":[0.5,2.2],"tracks":[{"at":0,"dur":0.3,"act":"chop"},{"at":0.3,"dur":0.4,"act":"stir","face":"stove"},{"at":0.75,"dur":0.2,"act":"talk"}]}],"props":[{"id":"board","type":"cuttingboard","at":[-0.5,2.9],"y":0.92},{"id":"tom","type":"tomato","at":[-0.4,2.9],"y":0.95},{"id":"pan","type":"pan","at":[1,2.9],"y":0.95}],"camera":{"target":"chef","dist":5,"height":2.2,"angle":10,"dist2":3.8}}`;

export function worldSystem(castSpecs = {}) {
  const castIds = Object.keys(castSpecs);
  const cast = castIds.length ? `\nCAST (use these ids for the main characters; their looks are fixed): ${castIds.map(id => `${id} (${castSpecs[id].label || id})`).join('; ')}.` : '';
  return CHOREO_SYSTEM.replace('@@ENVS@@', envDoc()).replace('@@ACTS@@', ACTS.map(a => `${a} = ${ACT_DOC[a] || a}`).join('; ')).replace('@@HAIR@@', HAIR_STYLES.join('|')).replace('@@ACC@@', ACCESSORIES.join('|')).replace('@@ANIMALS@@', Object.keys(ANIMALS).join('|')).replace('@@PROPS@@', PROP_TYPES.join(', ')) + cast;
}

/** عالم افتراضي سليم لو الـLLM فشل: المقدّم بيتكلم والكاميرا بتلف حواليه */
export function defaultWorld({ castSpecs, host, env = 'studio', time = 'day' }) {
  const id = castSpecs[host] ? host : Object.keys(castSpecs)[0] || 'host';
  return sanitizeWorld({ env, time, actors: [{ id, at: [0, 0], tracks: [{ at: 0.05, dur: 0.9, act: 'talk' }] }], camera: { target: id, dist: 5, height: 2, angle: 10, sweep: 25, dist2: 4 } }, { castSpecs, envName: env });
}

/** @returns {object} عالم نضيف (دايمًا — بيرجع الافتراضي لو فشل) */
export async function choreograph({ idea, text, duration = 5, language = 'en', castSpecs = {}, host = null, env = 'studio', time = 'day', portrait = false }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const user = `Scene idea: ${clean(idea, 300)}\nWords said in this scene (${language}, ${duration.toFixed(1)} seconds): "${clean(text, 360)}"\nDefault environment: ${env}. Time of day: ${time}. Video format: ${portrait ? 'vertical 9:16 (keep the action compact and use dist 8-12; the camera sees a narrow width)' : 'horizontal 16:9'}.${host ? ` Main character: ${host}.` : ''}${feedback}`;
      const r = await ask({ system: worldSystem(castSpecs), user, maxTokens: 4500, temperature: attempt ? 0.4 : 0.65 });
      const w = sanitizeWorld(r, { castSpecs, envName: env });
      if (w && (w.actors.some(a => a.tracks.length) || w.props.length)) return w;
      feedback = '\nYour previous answer was unusable (no valid actors/tracks). Return the JSON again with valid acts, anchors or [x,z] numbers.';
    } catch (e) { console.warn('[CodeVideo/choreo] failed:', e.message); }
  }
  return defaultWorld({ castSpecs, host, env, time });
}

// ── مصمم كاست الـ3D ──
const CAST_SYSTEM = `You are the character designer for a low-poly 3D animated video drawn by code. Design 2-4 recurring characters that fit THIS video's story. Return ONLY JSON: {"host":"id of the main character","env":"best default environment: @@ENVNAMES@@","time":"day|dusk|night","characters":[{"id":"lowercase letters only, max 10","name":"display name","gender":"male|female|neutral","description":"6-12 words","look":{...}}]}
"look" for a person: {"skin":"#hex","hair":"#hex","hairStyle":"@@HAIR@@","top":"#hex","bottom":"#hex","bottomStyle":"shorts|pants|skirt","sleeve":"short|long|none","socks":"#hex","shoes":"#hex","height":"kid|adult|tall|big","beard":"none|full|mustache","accessories":["@@ACC@@"],"accColor":"#hex","hat":"#hex"}. For an animal: {"animal":"@@ANIMALS@@","color":"#hex","size":1}.
Rules: dress people for the story (a chef: chef hat + apron + white top; a footballer: jersey, shorts, socks; an explorer: backpack + cap), vary skin tones/hair/heights, distinct colours, and if the narrator voice is male/female pick a human host of that gender. Never design real people or celebrities.`;

export async function designWorldCast({ text = '', topic = '', language = 'en', voiceGender = 'unknown' }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  try {
    const sys = CAST_SYSTEM.replace('@@ENVNAMES@@', ENV_NAMES.join('|')).replace('@@HAIR@@', HAIR_STYLES.join('|')).replace('@@ACC@@', ACCESSORIES.join('|')).replace('@@ANIMALS@@', Object.keys(ANIMALS).join('|'));
    const r = await ask({ system: sys, user: `Narration language: ${language}. Narrator voice: ${voiceGender}. ${topic ? `Topic: ${clean(topic, 200)}. ` : ''}\nNarration excerpt:\n${clean(text, 1600)}`, maxTokens: 1800, temperature: 0.7 });
    const specs = {}; let first = null;
    for (const c of (Array.isArray(r.characters) ? r.characters : []).slice(0, 4)) {
      const id = String(c?.id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10); if (id.length < 2 || specs[id]) continue;
      const spec = sanitizeLook(c.look, DEFAULT_HUMAN); spec.label = `${clean(c.name, 20) || id} — ${clean(c.description, 70) || (spec.kind === 'animal' ? 'animal' : 'person')}`; spec.gender = ['male', 'female', 'neutral'].includes(c.gender) ? c.gender : 'neutral';
      specs[id] = spec; first = first || id;
    }
    if (!first) return { castSpecs: {}, host: null, env: null, time: 'day' };
    const hid = String(r.host || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    return { castSpecs: specs, host: specs[hid] ? hid : first, env: ENV_NAMES.includes(r.env) ? r.env : null, time: ['day', 'dusk', 'night'].includes(r.time) ? r.time : 'day' };
  } catch (e) { console.warn('[CodeVideo/choreo] cast design failed:', e.message); return { castSpecs: {}, host: null, env: null, time: 'day' }; }
}

export const FALLBACK_CAST = { host: { ...DEFAULT_HUMAN, label: 'Host — friendly narrator', gender: 'neutral' } };
