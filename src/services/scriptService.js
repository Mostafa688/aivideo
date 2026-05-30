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
  ar: { male: 'ar-EG-ShakirNeural',      female: 'ar-EG-SalmaNeural'    },
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

const SCENES_PER_CHUNK = 7;
const MAX_TOKENS_PER_CHUNK = 1800;
const DELAY_BETWEEN_CHUNKS_MS = 8000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// FIX: نقسم الاسكريبت لجمل/فقرات ونرجعها كـ array
// ============================================================
function splitScriptIntoSegments(script, count) {
  // نقسم على سطور فاضية أو نقاط أو فواصل
  let segments = script
    .split(/\n{2,}/)          // فقرات مفصولة بسطر فاضي
    .map(s => s.trim())
    .filter(Boolean);

  // لو الفقرات أقل من المطلوب، نقسم على جمل
  if (segments.length < count) {
    segments = script
      .split(/(?<=[.!?؟])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // لو لسه أقل، نقسم على سطور
  if (segments.length < count) {
    segments = script
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // نوزع الـ segments على عدد المشاهد المطلوب
  const result = [];
  const total = segments.length;

  for (let i = 0; i < count; i++) {
    // نأخذ نسبة متساوية من الـ segments
    const startRatio = i / count;
    const endRatio   = (i + 1) / count;
    const startIdx   = Math.floor(startRatio * total);
    const endIdx     = Math.floor(endRatio * total);
    const chunk      = segments.slice(startIdx, endIdx).join(' ').trim();
    result.push(chunk || segments[Math.min(i, total - 1)]);
  }

  return result;
}

// ============================================================
// fetchChunk للـ IDEA mode فقط (بيكتب محتوى جديد)
// ============================================================
async function fetchChunkIdea({ fromIndex, toIndex, idea, toneGuide, langGuide, totalScenes }) {
  const chunkCount = toIndex - fromIndex + 1;

  // ✅ HOOK في الأول بس، ENDING في الآخر بس، كل الباقي body
  const isFirstScene = fromIndex === 1;
  const isLastScene  = toIndex === totalScenes;

  // نبني قواعد النوع لكل scene في الـ chunk
  const typeRules = [];
  for (let i = fromIndex; i <= toIndex; i++) {
    if (i === 1) {
      typeRules.push(`Scene ${i}: type MUST be "hook"`);
    } else if (i === totalScenes) {
      typeRules.push(`Scene ${i}: type MUST be "ending"`);
    } else {
      typeRules.push(`Scene ${i}: type MUST be "body"`);
    }
  }

  const prompt = `You are a video scriptwriter. Output EXACTLY ${chunkCount} JSON lines, no more, no less.

TONE: ${toneGuide}
LANGUAGE: ${langGuide}
Index range: ${fromIndex} to ${toIndex}
Total scenes in video: ${totalScenes}

TYPE RULES (STRICTLY FOLLOW):
${typeRules.join('\n')}

STORYTELLING RULES - CRITICAL:
- The video tells ONE CONTINUOUS STORY from scene 1 to scene ${totalScenes}
- Each scene MUST continue directly from the previous one - no repetition, no jumps
- Scene ${fromIndex} continues from scene ${fromIndex - 1} (think: chapters of a book)
- "text" is VOICEOVER narration - full natural sentences spoken aloud, NOT titles
- GOOD: "As he stepped into the dark alley, his heart began to race..."
- BAD: "Man in dark alley" or "Step 2: Facing Fear"

General rules:
- ONLY JSON lines, zero extra text, no markdown
- Keywords always in English
- MAXIMUM 15 words per scene text (strictly enforced - never exceed this)
- 1 short sentence only per scene
- Do NOT repeat ideas across scenes
- Do NOT add extra hooks or endings

Format: {"index":N,"type":"hook|body|ending","text":"voiceover narration","keywords":["w1","w2"],"visual":"specific visual description","prompt":"cinematic AI image prompt: subject + action + environment + lighting + camera angle + style. Continuation of scene ${fromIndex - 1}."}

CRITICAL rules:
- keywords MUST be SPECIFIC to the exact scene action (NOT general topic)
- prompt MUST be detailed Stable Diffusion prompt with all visual elements
- Each scene prompt shows DIFFERENT moment progressing the story
- NO generic prompts like "motivational background"

Create a video about:
${idea}

Output ${chunkCount} lines starting at index ${fromIndex}:`;

  return callGroq(prompt);
}

// ============================================================
// fetchChunk للـ SCRIPT mode (بيحافظ على نص الاسكريبت الأصلي)
// ============================================================
async function fetchChunkScript({ fromIndex, toIndex, scriptSegments, toneGuide, langGuide, totalScenes }) {
  const chunkCount = toIndex - fromIndex + 1;

  // نأخذ الـ segments الخاصة بالـ chunk ده
  const segmentsForChunk = scriptSegments.slice(fromIndex - 1, toIndex);

  // نبني الـ scenes مباشرة بدون AI لو الاسكريبت واضح
  // بس بنستخدم AI عشان يعمل keywords بس
  const scenesText = segmentsForChunk
    .map((seg, i) => {
      const sceneIndex = fromIndex + i;
      const type = sceneIndex === 1 ? 'hook' : sceneIndex === totalScenes ? 'ending' : 'body';
      return `Scene ${sceneIndex} (${type}): "${seg}"`;
    })
    .join('\n');

  const prompt = `You are a video keyword extractor. For each scene below, output a JSON line with keywords ONLY in English.
Do NOT change or paraphrase the text. Use the EXACT text provided.

STRICTLY follow these types:
${segmentsForChunk.map((_, i) => {
  const sceneIndex = fromIndex + i;
  const type = sceneIndex === 1 ? 'hook' : sceneIndex === totalScenes ? 'ending' : 'body';
  return `Scene ${sceneIndex}: type="${type}"`;
}).join('\n')}

Format: {"index":N,"type":"hook|body|ending","text":"EXACT scene text","keywords":["w1","w2"],"visual":"specific visual description for this exact scene","prompt":"cinematic image generation prompt: [specific subject] [specific action] [specific setting] [lighting] [camera angle]. Sequential continuation matching the scene text exactly."}

CRITICAL - keywords and prompt rules:
- keywords MUST be SPECIFIC to the exact scene action (NOT general topic)
- Example: "man walking rain street" NOT just "motivation"
- prompt MUST be detailed AI image generation prompt with subject + action + setting + lighting
- Example: "Young woman crying alone in hospital corridor, fluorescent lighting, shallow depth of field, cinematic"
- Each scene prompt MUST show SEQUENTIAL story progression - reference what happened before

Scenes:
${scenesText}

Output EXACTLY ${chunkCount} JSON lines:`;

  return callGroq(prompt);
}

// ============================================================
// الـ Groq API call المشترك
// ============================================================
async function callGroq(prompt) {
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
    if (res.status === 429) {
      console.warn('[Script] Rate limited! Waiting 65s before retry...');
      await sleep(65000);
      return callGroq(prompt);
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

// ============================================================
// Main function
// ============================================================

// ============================================================
// Cinematic Scene Generation - Character & Location Consistency
// ============================================================
export async function generateCinematicScenes({ idea, characterDesc, locationDesc, numScenes = 6, videoLanguage = 'en' }, send) {
  const langGuide = {
    ar: 'Write the "text" field in Arabic (العربية). Use natural, flowing Arabic suitable for voiceover.',
    en: 'Write the "text" field in English.',
    fr: 'Write the "text" field in French.',
    de: 'Write the "text" field in German.',
    es: 'Write the "text" field in Spanish.',
  }[videoLanguage] || 'Write the "text" field in English.';

  const prompt = `You are a professional documentary narrator AND visual director. Generate ${numScenes} scenes for a short film.

STORY TOPIC: ${idea}

CHARACTER (keep EXACTLY consistent across ALL scenes):
${characterDesc || 'A mysterious protagonist, age 30s, wearing dark clothing'}

LOCATION/SETTING (keep EXACTLY consistent):
${locationDesc || 'Urban environment, realistic lighting'}

LANGUAGE FOR NARRATION: ${langGuide}

=== TWO COMPLETELY SEPARATE FIELDS ===

"prompt" = AI IMAGE GENERATION PROMPT (always in English):
- Describe what to DRAW/GENERATE visually
- Include: subject + action + environment + lighting + camera angle + art style
- Example: "Egyptian soldier standing on sand dune at sunset, dramatic golden lighting, wide angle shot, photorealistic, cinematic"

"text" = SPOKEN NARRATION (in ${videoLanguage === 'ar' ? 'Arabic' : 'the specified language'}):
- This is what a NARRATOR SPEAKS OUT LOUD over the video
- Must sound like a TV documentary narrator
- Full natural sentences with emotion and flow
- NEVER describe the image - TELL THE STORY
- GOOD: "في أكتوبر 1973، قرر الجيش المصري تغيير مجرى التاريخ إلى الأبد"
- BAD: "لوحة زيتية تُصوّر انتصار الجيش" (this describes an image, not narration!)
- GOOD EN: "On that cold October morning, everything was about to change forever"
- BAD EN: "Cinematic scene of army victory" (this is an image description!)

STORY FLOW: Each scene must CONTINUE the story from the previous one. Scene 1 starts, scene ${numScenes} concludes.

Output EXACTLY ${numScenes} JSON lines (no extra text):
{"index":N,"prompt":"[English visual prompt for AI image]","text":"[Spoken narration in ${videoLanguage === 'ar' ? 'Arabic' : 'the target language'} - sounds like documentary narrator]"}

Start:`;

  try {
    const { scenes } = await callGroq(prompt);
    for (const scene of scenes) {
      send('scene', { ...scene, type: scene.index === 1 ? 'hook' : scene.index === numScenes ? 'ending' : 'body' });
    }
  } catch (e) {
    console.error('[Cinematic] Scene generation failed:', e.message);
    send('error', { message: e.message });
  }
}

export async function generateScenesStream({ idea, script, tone, duration, mode, userId, videoLanguage }, send) {
  const sceneCount  = DURATION_SCENES[duration] || 8;
  const toneGuide   = TONE_INSTRUCTIONS[tone]  || TONE_INSTRUCTIONS.motivational;
  const langGuide   = LANGUAGE_INSTRUCTIONS[videoLanguage] || LANGUAGE_INSTRUCTIONS.en;

  let totalEmitted  = 0;
  let totalTokens   = 0;
  const totalChunks = Math.ceil(sceneCount / SCENES_PER_CHUNK);

  // ✅ للـ script mode: نقسم الاسكريبت مرة واحدة في الأول
  let scriptSegments = null;
  if (mode === 'script' && script) {
    scriptSegments = splitScriptIntoSegments(script, sceneCount);
    console.log(`[Script] Script mode: split into ${scriptSegments.length} segments for ${sceneCount} scenes`);
  }

  console.log(`[Script] ${mode} mode | ${sceneCount} scenes → ${totalChunks} chunks`);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const fromIndex = chunkIndex * SCENES_PER_CHUNK + 1;
    const toIndex   = Math.min(fromIndex + SCENES_PER_CHUNK - 1, sceneCount);

    send('status', {
      message: `✍️ Generating scenes ${fromIndex}–${toIndex} of ${sceneCount}...`
    });

    try {
      let scenes, tokensUsed;

      if (mode === 'script' && scriptSegments) {
        // ✅ Script mode: نبعت الاسكريبت الأصلي وبس نطلب keywords
        ({ scenes, tokensUsed } = await fetchChunkScript({
          fromIndex, toIndex,
          scriptSegments,
          toneGuide, langGuide,
          totalScenes: sceneCount,
        }));

        // ✅ لو AI عدّل النص، نرجعه للنص الأصلي
        scenes = scenes.map((scene, i) => {
          const originalSegmentIndex = scene.index - 1;
          const originalText = scriptSegments[originalSegmentIndex];
          if (originalText) {
            scene.text = originalText;
          }
          // ✅ نتأكد من النوع الصح
          if (scene.index === 1) scene.type = 'hook';
          else if (scene.index === sceneCount) scene.type = 'ending';
          else scene.type = 'body';
          return scene;
        });

      } else {
        // ✅ Idea mode: نكتب محتوى جديد
        ({ scenes, tokensUsed } = await fetchChunkIdea({
          fromIndex, toIndex,
          idea,
          toneGuide, langGuide,
          totalScenes: sceneCount,
        }));

        // ✅ نتأكد من النوع الصح بعد رجوع الـ AI
        scenes = scenes.map(scene => {
          if (scene.index === 1) scene.type = 'hook';
          else if (scene.index === sceneCount) scene.type = 'ending';
          else scene.type = 'body';
          return scene;
        });
      }

      totalTokens += tokensUsed;
      console.log(`[Script] Chunk ${chunkIndex + 1}/${totalChunks}: got ${scenes.length}/${toIndex - fromIndex + 1} | ${tokensUsed} tokens`);

      // ✅ نبعت المشاهد للـ frontend
      for (const scene of scenes) {
        send('scene', scene);
        totalEmitted++;
      }

      // ✅ لو الـ chunk ناقص في الـ idea mode، نعيد مرة واحدة بس
      const expected = toIndex - fromIndex + 1;
      if (scenes.length < expected && mode !== 'script') {
        const missingFrom = fromIndex + scenes.length;
        const missingTo   = toIndex;
        if (missingFrom <= missingTo) {
          console.warn(`[Script] Missing ${missingFrom}-${missingTo}, retrying after 5s...`);
          await sleep(5000);
          try {
            const { scenes: retryScenes, tokensUsed: rt } = await fetchChunkIdea({
              fromIndex: missingFrom, toIndex: missingTo,
              idea, toneGuide, langGuide, totalScenes: sceneCount,
            });
            const fixedRetry = retryScenes.map(scene => {
              if (scene.index === 1) scene.type = 'hook';
              else if (scene.index === sceneCount) scene.type = 'ending';
              else scene.type = 'body';
              return scene;
            });
            totalTokens += rt;
            for (const scene of fixedRetry) {
              send('scene', scene);
              totalEmitted++;
            }
          } catch (e) {
            console.warn('[Script] Retry failed:', e.message);
          }
        }
      }

      // ✅ للـ script mode لو مشاهد ناقصة، نعملها manually من الـ segments
      if (scenes.length < expected && mode === 'script' && scriptSegments) {
        for (let idx = fromIndex + scenes.length; idx <= toIndex; idx++) {
          const originalText = scriptSegments[idx - 1];
          if (originalText) {
            const type = idx === 1 ? 'hook' : idx === sceneCount ? 'ending' : 'body';
            const fallbackScene = {
              index: idx,
              type,
              text: originalText,
              keywords: (originalText || '').split(/\s+/).filter(w => w.length > 3).slice(0, 4),
              visual: originalText ? originalText.slice(0, 80) : '',
            };
            send('scene', fallbackScene);
            totalEmitted++;
          }
        }
      }

    } catch (err) {
      console.error(`[Script] Chunk ${chunkIndex + 1} failed:`, err.message);
      send('status', { message: `⚠️ Chunk ${chunkIndex + 1} failed, skipping...` });

      // ✅ للـ script mode، لو الـ chunk فشل خالص، نعمل fallback من الـ segments
      if (mode === 'script' && scriptSegments) {
        for (let idx = fromIndex; idx <= toIndex; idx++) {
          const originalText = scriptSegments[idx - 1];
          if (originalText) {
            const type = idx === 1 ? 'hook' : idx === sceneCount ? 'ending' : 'body';
            send('scene', { index: idx, type, text: originalText, keywords: (originalText || '').split(/\s+/).filter(w => w.length > 3).slice(0, 4), visual: originalText ? originalText.slice(0, 80) : '' });
            totalEmitted++;
          }
        }
      }
    }

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