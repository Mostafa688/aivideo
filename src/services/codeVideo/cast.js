// ── cast.js ── كاست الشخصيات: التحقق من وصف أي شخصية/مخلوق (الـLLM بيبتكرها، والكود بيتحقق ويرسم) + مصمم الكاست حسب قصة الفيديو
import { llmJson } from '../documentary/llm.js';
import { CAST, CAST_IDS } from './characters.js';

const HEX = /^#[0-9a-f]{6}$/i, HEX3 = /^#[0-9a-f]{3}$/i;
const col = (v, d) => { const s = String(v ?? '').trim(); if (HEX.test(s)) return s.toLowerCase(); if (HEX3.test(s)) return '#' + s.slice(1).split('').map(x => x + x).join('').toLowerCase(); return d; };
const one = (v, list, d) => (list.includes(v) ? v : d);
const cleanTxt = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

export const HUMAN_HAIR = ['short', 'long', 'bun', 'cap', 'bald', 'hijab', 'curly', 'ponytail', 'afro', 'mohawk'];
const EARS = ['none', 'round', 'pointy', 'long', 'floppy'], SNOUT = ['none', 'short', 'long', 'pig'], PATTERN = ['none', 'stripes', 'spots', 'mask'];
const EYES = ['normal', 'big', 'dots', 'sleepy', 'cyclops', 'three'], OUTFIT = ['none', 'tee', 'suit', 'hoodie', 'apron', 'labcoat'];
const EXTRAS = ['crown', 'hat', 'bow', 'horns', 'antenna', 'leaf', 'spikes', 'fin', 'spout', 'halo', 'crest', 'glasses', 'freckles', 'whiskers', 'mane', 'scarf', 'cape', 'bowtie'];
export const CREATURE_NAMES = ['animal', 'bird', 'blob'];

const DEFAULTS = {
  animal: { primary: '#f59e0b', secondary: '#fde68a', accent: '#78350f' },
  bird: { primary: '#38bdf8', secondary: '#e0f2fe', accent: '#fb923c' },
  blob: { primary: '#a78bfa', secondary: '#ede9fe', accent: '#5b21b6' },
};

/** يتحقق من وصف شخصية واحدة ويرجّع { id, spec } أو null. أي قيمة مش معروفة بتتبدّل بافتراضي آمن */
export function sanitizeCharacter(raw, taken = new Set()) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.preset && CAST[raw.preset] && !taken.has(raw.preset)) return { id: raw.preset, spec: CAST[raw.preset] };
  const kind = one(String(raw.kind || '').toLowerCase(), ['human', 'animal', 'bird', 'blob', 'robot'], null);
  if (!kind) return null;
  let id = String(raw.id || raw.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  if (id.length < 2) id = `${kind}${taken.size + 1}`;
  while (taken.has(id) || (CAST[id] && !raw.preset)) id = (id + 'x').slice(0, 12) + taken.size;
  const name = cleanTxt(raw.name, 24) || id, desc = cleanTxt(raw.description, 70);
  const gender = one(raw.gender, ['male', 'female', 'neutral'], 'neutral');
  let spec;
  if (kind === 'human') {
    const hs = one(raw.hairStyle, HUMAN_HAIR, 'short');
    spec = { kind: 'human', skin: col(raw.skin, '#e8b98d'), hair: col(raw.hair, '#3a2a22'), hairStyle: hs, shirt: col(raw.shirt, '#3b82f6'), shirtStyle: one(raw.shirtStyle, ['tee', 'suit'], 'tee'), beard: one(raw.beard, ['none', 'full', 'mustache'], 'none'), glasses: raw.glasses === true, tie: raw.tie ? col(raw.tie, '#b91c1c') : undefined, scarf: hs === 'hijab' ? col(raw.scarf || raw.shirt, '#7c3aed') : undefined, cap: hs === 'cap' ? col(raw.cap || raw.shirt, '#ef4444') : undefined, kid: raw.kid === true };
  } else if (kind === 'robot') {
    spec = { robot: true, kind: 'robot', skin: col(raw.skin || raw.primary, '#cbd5e1'), hair: col(raw.hair || raw.accent, '#0ea5e9'), shirt: col(raw.shirt || raw.secondary, '#475569'), shirtStyle: 'tee', beard: 'none', glasses: false };
  } else {
    const d = DEFAULTS[kind];
    const extras = (Array.isArray(raw.extras) ? raw.extras : []).map(x => String(x).toLowerCase()).filter(x => EXTRAS.includes(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
    spec = { kind, primary: col(raw.primary, d.primary), secondary: col(raw.secondary, d.secondary), accent: col(raw.accent, d.accent), ears: one(raw.ears, EARS, 'none'), snout: kind === 'animal' ? one(raw.snout, SNOUT, 'short') : 'none', pattern: one(raw.pattern, PATTERN, 'none'), eyes: one(raw.eyes, EYES, 'normal'), outfit: kind === 'blob' ? 'none' : one(raw.outfit, OUTFIT, 'none'), outfitColor: col(raw.outfitColor, col(raw.accent, d.accent)), extras, cheeks: raw.cheeks !== false };
  }
  spec.label = `${name}${desc ? ` — ${desc}` : ` — ${kind}`}`; spec.gender = gender; spec.custom = true;
  return { id, spec };
}

export const makeCastMap = (custom = []) => ({ ...CAST, ...Object.fromEntries(custom.map(c => [c.id, c.spec])) });
export const PRESET_GENDER = { sam: 'male', omar: 'male', prof: 'male', lina: 'female', noor: 'female', maya: 'female', kid: 'neutral', robo: 'neutral' };
export const genderOf = (id, map) => map?.[id]?.gender || PRESET_GENDER[id] || 'neutral';

const SYSTEM = `You are the character designer for animated explainer videos that are drawn entirely by code. Design 2-4 characters that fit THIS video's story and topic, so the video feels made for it (a story about whales → a friendly whale; about money → a piggy bank or a banker; about space → an alien or an astronaut robot; about the brain → a quirky brain-like blob...). Keep designs simple, cute and clearly different from each other.

Return ONLY JSON: {"host":"id of the main narrator character","characters":[{"id":"lowercase letters only, max 10","name":"display name","gender":"male|female|neutral","description":"6-12 words","kind":"human|animal|bird|blob|robot", ...fields}]}

Fields by kind (all colours are "#rrggbb"):
- human: skin, hair, hairStyle (short|long|bun|cap|bald|hijab|curly|ponytail|afro|mohawk), shirt, shirtStyle (tee|suit), beard (none|full|mustache), glasses (true|false), tie (optional colour), kid (true|false)
- animal (cat, dog, bear, panda, rabbit, pig, lion, fox, mouse...): primary (fur), secondary (belly + muzzle), accent, ears (round|pointy|long|floppy|none), snout (short|long|pig|none), pattern (none|stripes|spots|mask), eyes (normal|big|dots|sleepy), outfit (none|tee|suit|hoodie|apron|labcoat), outfitColor, extras (up to 4 of: whiskers, mane, hat, crown, bow, bowtie, glasses, scarf, cape, freckles)
- bird (parrot, owl, penguin-like, chicken...): primary, secondary (belly), accent (beak + crest), eyes, outfit, outfitColor, extras (crest, glasses, scarf, hat, crown, bow, bowtie, cape)
- blob = any other creature or object as a rounded body with a face and little arms/fins: monsters, aliens, whales, sea creatures, ghosts, fruit/food, coins, planets, clouds, mascots: primary, secondary (belly), accent, eyes (normal|big|dots|cyclops|three|sleepy), pattern (none|stripes|spots), ears (none|round|pointy), extras (horns, antenna, spikes, leaf, fin, spout, crown, hat, glasses, freckles, halo, bow, cape)
- robot: skin (metal colour), hair (glow colour), shirt (body colour)
You may reuse a plain preset human with {"preset":"sam|lina|omar|noor|kid|prof|maya|robo"}.
Rules: the host narrates most scenes — if the narrator voice is male or female, a human host must match that gender (creatures/robots are fine for any voice). Use colours with good contrast against a light background. Never design real people, celebrities, logos or trademarked characters.`;

/** يصمّم كاست مناسب للقصة. لو فشل/باظ: بيرجّع كاست فاضي (والمخرج بيستخدم الشخصيات الجاهزة) */
export async function designCast({ text = '', topic = '', language = 'en', look = 'cartoon', voiceGender = 'unknown' }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  try {
    const user = `Narration language: ${language}. Style: ${look === 'cartoon3d' ? '3D cartoon' : '2D cartoon'}. Narrator voice: ${voiceGender}. ${topic ? `Topic: ${cleanTxt(topic, 200)}. ` : ''}\nNarration excerpt:\n${cleanTxt(text, 1600)}`;
    const r = await ask({ system: SYSTEM, user, maxTokens: 1800, temperature: 0.7 });
    const taken = new Set(), chars = [];
    for (const raw of (Array.isArray(r.characters) ? r.characters : []).slice(0, 8)) {
      if (chars.length >= 4) break;
      const ch = sanitizeCharacter(raw, taken); if (!ch) continue;
      taken.add(ch.id); chars.push(ch);
    }
    if (!chars.length) return { characters: [], host: null };
    const host = chars.find(c => c.id === String(r.host || '').toLowerCase().replace(/[^a-z0-9]/g, ''))?.id || chars[0].id;
    return { characters: chars, host };
  } catch (e) {
    console.warn('[CodeVideo/cast] design failed:', e.message);
    return { characters: [], host: null };
  }
}
