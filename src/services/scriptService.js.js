import fetch from 'node-fetch';
import { addUserTokens } from './authService.js';

const TONE_INSTRUCTIONS = {
  motivational: 'Inspiring, energetic, and uplifting.',
  storytelling: 'Narrative-driven, emotionally engaging.',
  educational:  'Clear, informative, simple language.',
};

const LANGUAGE_INSTRUCTIONS = {
  en: 'Write all scene text in English.',
  ar: 'Write all scene text in Arabic (العربية). Use natural, flowing Arabic.',
  de: 'Write all scene text in German (Deutsch).',
  fr: 'Write all scene text in French (Français).',
  es: 'Write all scene text in Spanish (Español).',
  ru: 'Write all scene text in Russian (Русский).',
  ja: 'Write all scene text in Japanese (日本語).',
  pt: 'Write all scene text in Portuguese (Português).',
};

export const LANGUAGE_DEFAULT_VOICES = {
  en: { male: 'en-US-EricNeural',       female: 'en-US-JennyNeural'    },
  ar: { male: 'ar-SA-HamedNeural',      female: 'ar-SA-ZariyahNeural'  },
  de: { male: 'de-DE-ConradNeural',     female: 'de-DE-KatjaNeural'    },
  fr: { male: 'fr-FR-HenriNeural',      female: 'fr-FR-DeniseNeural'   },
  es: { male: 'es-ES-AlvaroNeural',     female: 'es-ES-ElviraNeural'   },
  ru: { male: 'ru-RU-DmitryNeural',     female: 'ru-RU-SvetlanaNeural' },
  ja: { male: 'ja-JP-KeitaNeural',      female: 'ja-JP-NanamiNeural'   },
  pt: { male: 'pt-BR-AntonioNeural',    female: 'pt-BR-FranciscaNeural'},
};

const DURATION_SCENES = {
  'auto':  8,
  '30s':   4,
  '1min':  8,
  '2min':  17,
  '3min':  26,
  '4min':  34,
  '5min':  42,
  '8min':  56,
  '10min': 70,
};

// ✅ كل chunk = 7 مشاهد = ~1400 tokens output + ~300 prompt = ~1700 tokens
// الـ 12k TPM limit → نقدر نعمل ~7 chunks في الدقيقة بأمان
// بس نحط 8 ثواني بين كل chunk = مفيش فرصة نضرب الـ limit
const SCENES_PER_CHUNK = 7;
const MAX_TOKENS_PER_CHUNK = 1800;
const DELAY_BETWEEN_CHUNKS_MS = 8000; // 8 ثواني بين كل chunk

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchChunk({ fromIndex, toIndex, idea, script, mode, toneGuide, langGuide, totalScenes }) {
  const chunkCount = toIndex - fromIndex + 1;
  const isFirst = fromIndex === 1;
  const isLast  = toIndex === totalScenes;

  const typeRule = isFirst
    ? `Scene ${fromIndex} MUST have type "hook".`
    : isLast
    ? `Scene ${toIndex} MUST have type "ending".`
    : 'All scenes use type "body".';

  const input = mode === 'script'
    ? 'Split this script:\n' + script
    : 'Create video about:\n' + idea;

  const prompt = `Video scriptwriter. Output EXACTLY ${chunkCount} JSON lines, no more, no less.

TONE: ${toneGuide}
LANGUAGE: ${langGuide}
${typeRule}
Index range: ${fromIndex} to ${toIndex}

Rules:
- ONLY JSON lines, zero extra text
- Keywords always in English
- Short text per scene (1-2 sentences max)

Format: {"index":N,"type":"hook|body|ending","text":"...","keywords":["w1","w2"]}

${input}

Output ${chunkCount} lines starting at index ${fromIndex}:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: MAX_TOKENS_PER_CHUNK,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    // لو rate limit → نستنى 65 ثانية ونحاول تاني
    if (res.status === 429) {
      console.warn('[Script] Rate limited! Waiting 65s before retry...');
      await sleep(65000);
      return fetchChunk({ fromIndex, toIndex, idea, script, mode, toneGuide, langGuide, totalScenes });
    }
    throw new Error('Groq error: ' + errText);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  const scenes = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim().replace(/```json|```/g, '');
    if (!trimmed.startsWith('{')) continue;
    try {
      const scene = JSON.parse(trimmed);
      if (scene.index && scene.text && scene.keywords) scenes.push(scene);
    } catch {}
  }

  return { scenes, tokensUsed };
}

export async function generateScenesStream({ idea, script, tone, duration, mode, userId, videoLanguage }, send) {
  const sceneCount  = DURATION_SCENES[duration] || 8;
  const toneGuide   = TONE_INSTRUCTIONS[tone]  || TONE_INSTRUCTIONS.motivational;
  const langGuide   = LANGUAGE_INSTRUCTIONS[videoLanguage] || LANGUAGE_INSTRUCTIONS.en;

  let totalEmitted  = 0;
  let totalTokens   = 0;
  const totalChunks = Math.ceil(sceneCount / SCENES_PER_CHUNK);

  console.log(`[Script] ${sceneCount} scenes → ${totalChunks} chunks of max ${SCENES_PER_CHUNK}`);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const fromIndex = chunkIndex * SCENES_PER_CHUNK + 1;
    const toIndex   = Math.min(fromIndex + SCENES_PER_CHUNK - 1, sceneCount);

    send('status', {
      message: `✍️ Generating scenes ${fromIndex}–${toIndex} of ${sceneCount}...`
    });

    try {
      const { scenes, tokensUsed } = await fetchChunk({
        fromIndex, toIndex,
        idea, script, mode,
        toneGuide, langGuide,
        totalScenes: sceneCount,
      });

      totalTokens += tokensUsed;
      console.log(`[Script] Chunk ${chunkIndex + 1}/${totalChunks}: got ${scenes.length}/${toIndex - fromIndex + 1} | ${tokensUsed} tokens`);

      // ✅ نبعت المشاهد فوراً للـ frontend
      for (const scene of scenes) {
        send('scene', scene);
        totalEmitted++;
      }

      // ✅ لو الـ chunk ناقص، نعيد مرة واحدة بس
      const expected = toIndex - fromIndex + 1;
      if (scenes.length < expected) {
        const missingFrom = fromIndex + scenes.length;
        const missingTo   = toIndex;
        if (missingFrom <= missingTo) {
          console.warn(`[Script] Missing ${missingFrom}-${missingTo}, retrying after 5s...`);
          await sleep(5000);
          try {
            const { scenes: retryScenes, tokensUsed: rt } = await fetchChunk({
              fromIndex: missingFrom, toIndex: missingTo,
              idea, script, mode, toneGuide, langGuide, totalScenes: sceneCount,
            });
            totalTokens += rt;
            for (const scene of retryScenes) {
              send('scene', scene);
              totalEmitted++;
            }
          } catch (e) {
            console.warn('[Script] Retry failed:', e.message);
          }
        }
      }

    } catch (err) {
      console.error(`[Script] Chunk ${chunkIndex + 1} failed:`, err.message);
      send('status', { message: `⚠️ Chunk ${chunkIndex + 1} failed, skipping...` });
    }

    // ✅ انتظر بين الـ chunks (إلا آخر chunk)
    if (chunkIndex < totalChunks - 1) {
      send('status', { message: `⏳ Waiting to respect rate limits... (${totalEmitted}/${sceneCount} scenes ready)` });
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  if (userId && totalTokens > 0) {
    try { addUserTokens(userId, totalTokens); }
    catch (e) { console.warn('Could not track tokens:', e.message); }
  }

  console.log(`[Script] Done: ${totalEmitted}/${sceneCount} scenes | ${totalTokens} tokens`);
}