import fetch from 'node-fetch';
import { addUserTokens } from './authService.js';

// ══════════════════════════════════════════════════════════════════════════
//  Content Moderation — نقطة فحص موحّدة قبل أي توليد فيديو
// ══════════════════════════════════════════════════════════════════════════
// ✅ بيتفحص فيها أي فكرة/سكريبت/برومبت/اسم منتج قبل ما يوصل لأي موديل توليد،
// ويرفض المحتوى الإباحي، العنصري، أو اللي بيحرض على العنف/القتل. بيتنادى من
// كل route بيستقبل نص من العميل (موديل 1-5، الإعلانات، والإيجنت).
const MODERATION_SYSTEM_PROMPT = `You are a strict content safety classifier for an AI video generation platform. Given a user's video idea/prompt/script/product description, decide if it violates policy.

BLOCK (unsafe=true) if the text requests, describes, or implies any of:
- Sexually explicit, pornographic, or adult content of any kind
- Racist content, or content that promotes hatred/discrimination based on race, ethnicity, religion, nationality, gender, sexual orientation, or disability
- Content that depicts, glorifies, instructs, or incites graphic violence, murder, killing, terrorism, or serious physical harm to real people or groups
- Sexual content involving minors, or minors in any inappropriate/harmful context
- Content designed to harass, threaten, or incite violence against a specific real, identifiable person

ALLOW (unsafe=false) everything else, including: historical war/battle depictions in an educational/documentary tone, fictional action/conflict without gratuitous gore, competitive sports, normal drama/tension, dark historical topics presented respectfully (e.g. religious history, war history).

Respond with ONLY raw JSON, nothing else: {"unsafe": true|false, "category": "porn"|"racism"|"violence"|"none", "reason": "one short sentence"}`;

export async function checkContentSafety(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { unsafe: false, category: 'none', reason: '' };
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return { unsafe: false, category: 'none', reason: '' }; // fail-open only if moderation itself is unavailable

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 100, temperature: 0,
        messages: [
          { role: 'system', content: MODERATION_SYSTEM_PROMPT },
          { role: 'user', content: trimmed.slice(0, 1500) },
        ],
      }),
    });
    if (!res.ok) return { unsafe: false, category: 'none', reason: '' };
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { unsafe: false, category: 'none', reason: '' };
    const parsed = JSON.parse(m[0]);
    return { unsafe: !!parsed.unsafe, category: parsed.category || 'none', reason: parsed.reason || '' };
  } catch (e) {
    console.warn('[Moderation] Check failed, allowing by default:', e.message);
    return { unsafe: false, category: 'none', reason: '' }; // fail-open on moderation-service errors, never block legitimate users due to an outage
  }
}

// رسالة الرفض الموحّدة اللي بترجع للعميل في أي موديل
export const MODERATION_REJECTION_MESSAGE = {
  en: 'This request cannot be processed — it appears to involve sexually explicit, racist, or violent/harmful content, which is not allowed on Erivion. Please revise your idea.',
  ar: 'مينفعش نكمل الطلب ده — يبدو إنه بيتضمن محتوى إباحي أو عنصري أو عنيف/مؤذي، وده غير مسموح به في Erivion. من فضلك عدّل الفكرة.',
};

const TONE_INSTRUCTIONS = {
  motivational: 'Inspiring, energetic, and uplifting.',
  storytelling: 'Narrative-driven, emotionally engaging.',
  educational:  'Clear, informative, simple language.',
};

const LANGUAGE_INSTRUCTIONS = {
  en: 'Write all scene text in English only. No other languages.',
  ar: 'اكتب كل نص المشاهد باللغة العربية فقط. ممنوع استخدام أي كلمة إنجليزية في حقل "text". النص يجب أن يكون عربياً خالصاً بدون أي كلمات أجنبية.',
  de: 'Write all scene text in German (Deutsch) only. No other languages.',
  fr: 'Write all scene text in French (Français) only. No other languages.',
  es: 'Write all scene text in Spanish (Español) only. No other languages.',
  ru: 'Write all scene text in Russian (Русский) only. No other languages.',
  ja: 'Write all scene text in Japanese (日本語) only. No other languages.',
  pt: 'Write all scene text in Portuguese (Português) only. No other languages.',
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
  const clean = script.trim();

  // المرحلة 1: نقسم على فقرات (سطر فاضي)
  let segments = clean.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

  // المرحلة 2: لو ناقص، نقسم على جمل
  if (segments.length < count) {
    segments = clean.split(/(?<=[.!?؟،])\s+/).map(s => s.trim()).filter(Boolean);
  }

  // المرحلة 3: لو ناقص، نقسم على سطور
  if (segments.length < count) {
    segments = clean.split('\n').map(s => s.trim()).filter(Boolean);
  }

  // المرحلة 4: fallback - نقسم على عدد الحروف (voice transcription بدون علامات ترقيم)
  if (segments.length < count) {
    const chunkSize = Math.ceil(clean.length / count);
    segments = [];
    let start = 0;
    while (start < clean.length) {
      let end = start + chunkSize;
      if (end < clean.length) {
        const spaceIdx = clean.lastIndexOf(' ', end);
        if (spaceIdx > start) end = spaceIdx;
      } else {
        end = clean.length;
      }
      segments.push(clean.slice(start, end).trim());
      start = end + 1;
    }
  }

  // نوزع الـ segments على عدد المشاهد بالتساوي
  const result = [];
  const total = segments.length;

  for (let i = 0; i < count; i++) {
    const startRatio = i / count;
    const endRatio   = (i + 1) / count;
    const startIdx   = Math.floor(startRatio * total);
    const endIdx     = Math.max(startIdx + 1, Math.floor(endRatio * total));
    const chunk      = segments.slice(startIdx, endIdx).join(' ').trim();
    result.push(chunk || segments[Math.min(i, total - 1)]);
  }

  return result;
}

// ============================================================
// fetchChunk للـ IDEA mode فقط (بيكتب محتوى جديد)
// ============================================================
async function fetchChunkIdea({ fromIndex, toIndex, idea, toneGuide, langGuide, totalScenes, previousScenes = [] }) {
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

  // بناء تعليمات Hook قوية للـ scene 1 و2
  const hookInstructions = isFirstScene ? `
HOOK WRITING RULES (scene 1 ONLY):
The hook MUST grab the viewer in the first 3 seconds — use ONE of these techniques:
- SHOCKING FACT: Start with a number or stat that surprises: "في 6 ساعات فقط، مات 50,000 إنسان"
- PARADOX: Something that seems impossible: "الرجل الذي أنقذ الملايين لم يعرفه أحد في حياته"
- OPEN LOOP: A question with no answer yet: "كيف استطاع رجل واحد أن يُسقط إمبراطورية بأكملها؟"
- START FROM THE END: Begin at the climax: "كان يعلم أنه سيموت اليوم — لكنه لم يتراجع"
- DIRECT CHALLENGE: Talk to the viewer: "ما ستسمعه الآن لن تصدقه"
NEVER start with "في هذا الفيديو" or "سنتحدث عن" — that kills engagement instantly.
` : '';

  // ✅ FIX: نمرر السياق السردي من المشاهد السابقة عشان القصة تكمل مباشرة، مش تبدأ من جديد كل chunk
  const continuityBlock = previousScenes.length > 0 ? `
STORY SO FAR — DO NOT REPEAT ANY OF THESE IDEAS:
${previousScenes.slice(-6).map(s => `Scene ${s.index}: ${s.text}`).join('\n')}

CONTINUE the story DIRECTLY from scene ${fromIndex - 1}. Each new scene must be a DIRECT continuation of the previous scene's action/event — like the next moment in a film, not a new topic. Cover NEW story events only — never repeat.
` : '';

  const prompt = `You are an elite video scriptwriter specializing in viral documentary content with sequential, connected storytelling — each scene continues directly from the one before it, like chapters in a film. Output EXACTLY ${chunkCount} JSON lines, no more, no less.

TONE: ${toneGuide}
LANGUAGE: ${langGuide}
Index range: ${fromIndex} to ${toIndex}
${hookInstructions}${continuityBlock}
TYPE RULES (STRICTLY FOLLOW):
${typeRules.join('\n')}

Rules:
- ONLY JSON lines, zero extra text, no markdown
- Keywords always in English
- Natural voiceover text - 1-2 sentences per scene, conversational and engaging
- Do NOT repeat the same sentence across scenes
- Do NOT add extra hooks or endings beyond what is specified above
- Each scene must flow as the NEXT moment in one continuous story — never an isolated, generic statement

Format: {"index":N,"type":"hook|body|ending","text":"...","keywords":["w1","w2"],"visual":"specific visual description for this exact scene"}

CRITICAL - keywords rules:
- keywords MUST be a literal Pexels search query for what is VISUALLY HAPPENING in that exact scene
- Think: what would you type in Pexels to find this exact footage?
- If text says "a snake attacking a lion" → keywords: ["snake attacking lion"]
- If text says "man walking alone at night" → keywords: ["man walking night street"]
- If text says "crowd cheering at stadium" → keywords: ["crowd cheering stadium"]
- If text says "soldier crossing a river" → keywords: ["soldier crossing river"]
- NEVER use abstract single words like "motivation", "success", "hope", "journey", "inspiration"
- ALWAYS include: specific subject + specific action (+ setting if relevant)

Create a video about:
${idea}

Output ${chunkCount} lines starting at index ${fromIndex}:`;

  return callGroq(prompt);
}

// ============================================================
// fetchChunk للـ SCRIPT mode (بيحافظ على نص الاسكريبت الأصلي)
// ============================================================
async function fetchChunkScript({ fromIndex, toIndex, scriptSegments, toneGuide, langGuide, totalScenes, fullScript }) {
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

  // ✅ FIX: كان بيبعت لكل chunk جزء الاسكريبت الخاص بيه بس — فلو الجملة في المشهد ده بتتكلم
  // عن "الكائن ده" أو بتستخدم ضمير (كان الاسم الحقيقي اتقال مرة واحدة بس في مشهد سابق)،
  // الـ AI كان يستخرج keywords حرفية من نفس الجملة ("creature big brain") من غير ما يعرف
  // إن الكلام أصلاً عن حوت العنبر مثلاً. دلوقتي بنبعت الاسكريبت الكامل كـ context عشان
  // الـ AI يفهم الموضوع الحقيقي ويحل أي ضمير/إشارة عامة لاسمها الصريح قبل ما يبني الـ keywords.
  const fullScriptContext = fullScript ? `
FULL SCRIPT (context only — read this FIRST to understand the real subject(s) of the whole video. Do NOT use this text as narration, it is only so you can resolve pronouns/vague references in the scenes below):
"""
${fullScript.slice(0, 3000)}
"""
` : '';

  const prompt = `You are a video keyword extractor. For each scene below, output a JSON line with keywords ONLY in English.
Do NOT change or paraphrase the "text" field. Use the EXACT text provided for "text".
${fullScriptContext}
STRICTLY follow these types:
${segmentsForChunk.map((_, i) => {
  const sceneIndex = fromIndex + i;
  const type = sceneIndex === 1 ? 'hook' : sceneIndex === totalScenes ? 'ending' : 'body';
  return `Scene ${sceneIndex}: type="${type}"`;
}).join('\n')}

Format: {"index":N,"type":"hook|body|ending","text":"EXACT scene text","keywords":["w1","w2"],"visual":"specific visual description for this exact scene","prompt":"cinematic image generation prompt: [specific subject] [specific action] [specific setting] [lighting] [camera angle]. Sequential continuation matching the scene text exactly."}

CRITICAL - keywords and prompt rules:
- FIRST, read the FULL SCRIPT above and identify the real, specific subject(s) of the video (e.g. a particular animal species, a historical figure, a place, an object, an event) — even if that subject's name is only mentioned ONCE early in the script and later scenes only refer to it with pronouns ("it", "he") or vague/generic words ("this creature", "the giant", "that thing", "the structure").
- When THIS scene's text uses a pronoun or a generic/descriptive reference instead of the real name, your keywords and visual MUST use the REAL, SPECIFIC subject resolved from the full script — NOT the generic wording of this isolated scene's text.
  - Example: script is about a sperm whale; this scene's text is "a creature with a brain bigger than a bus" → keywords: ["sperm whale head"], NOT ["creature big brain"].
  - Example: script is about the Giza pyramids; this scene's text is "no one truly knows how they built it" → keywords: ["Giza pyramid construction"], NOT ["mystery unknown building"].
  - Example: text says "snake attacking lion" (subject already explicit) → keywords: ["snake attacking lion"].
- keywords MUST still be a literal Pexels search query for what is VISUALLY HAPPENING in that exact scene, but grounded in the real, specific subject — think: what would you type in Pexels to find this exact footage of the ACTUAL subject?
- NEVER use abstract single words like "motivation", "success", "hope" alone
- NEVER use vague placeholder subjects like "creature", "thing", "structure", "it" in keywords when the full script already reveals the specific real name/type — always substitute the real name/type instead
- ALWAYS include: specific real subject + specific action (+ setting if relevant)
- prompt MUST be detailed AI image generation prompt with the real subject + action + setting + lighting
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
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: MAX_TOKENS_PER_CHUNK,
      temperature: 0.7,
      reasoning_effort: 'low',
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
    ar: 'اكتب حقل "text" باللغة العربية فقط. ممنوع أي كلمة إنجليزية في النص. عربي خالص.',
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

export async function generateScenesStream({ idea, script, tone, duration, mode, userId, videoLanguage, structuredScenes }, send) {
  // ══════════════════════════════════════════════════════════════════════
  //  ✅ NEW: STRUCTURED MODE — العميل بيديك سكريبت متقسم بمشاهد جاهزة بالفعل
  //  (زي "Scene 1 / Visual Prompt / Narration" أو جدول توقيتات مشابه). في
  //  الحالة دي مفيش داعي لأي Groq call بيولّد كلام جديد أو يستنتج keywords —
  //  التقسيم والنص والوصف البصري كلهم جايين حرفيًا من العميل نفسه، فبنبعتهم
  //  زي ما هم بالظبط. ده بيحل مشكلتين مرة واحدة: (1) مفيش إعادة صياغة تخرب
  //  السكريبت الأصلي، (2) الـ visual المستخدم لبحث Pexels/AI بقى دقيق ومحدد
  //  زي ما العميل كتبه، مش تخمين عام من نص السرد.
  // ══════════════════════════════════════════════════════════════════════
  if (mode === 'structured' && Array.isArray(structuredScenes) && structuredScenes.length) {
    const total = structuredScenes.length;
    console.log(`[Script] Structured mode: ${total} pre-divided scenes provided by the user — using as-is, no rewriting`);
    structuredScenes.forEach((item, i) => {
      const index = i + 1;
      const type = index === 1 ? 'hook' : index === total ? 'ending' : 'body';
      const text = String(item.text || '').trim();
      // ✅ الـ visual هو المصدر الأساسي للبحث البصري (Pexels/AI image) — لو العميل مديه Visual
      // Prompt واضح بنستخدمه زي ما هو (ده أدق بكتير من أي استنتاج آلي)، ولو مش موجود بنرجع للنص
      const visualRaw = String(item.visual || item.prompt || text).trim();
      // ✅ Keywords بسيطة مشتقة من نفس الـ visual المحدد (مش من النص السردي العام) — كـ fallback
      // إضافي لو الـ visual نفسه طويل أو معقد لـ Pexels
      const keywords = visualRaw
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
        .slice(0, 6);
      send('scene', { index, type, text, keywords, visual: visualRaw.slice(0, 150), prompt: visualRaw });
    });
    console.log(`[Script] Structured mode done: ${total}/${total} scenes emitted as-is`);
    return;
  }

  const sceneCount  = DURATION_SCENES[duration] || 8;
  const toneGuide   = TONE_INSTRUCTIONS[tone]  || TONE_INSTRUCTIONS.motivational;
  const langGuide   = LANGUAGE_INSTRUCTIONS[videoLanguage] || LANGUAGE_INSTRUCTIONS.en;

  let totalEmitted  = 0;
  let totalTokens   = 0;
  const totalChunks = Math.ceil(sceneCount / SCENES_PER_CHUNK);
  const allScenesAccum = []; // ✅ لتمرير سياق القصة السابقة لكل chunk جديد (استمرارية بين الـ batches)

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
          fullScript: script,
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
          previousScenes: allScenesAccum,
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
        allScenesAccum.push(scene);
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
              previousScenes: allScenesAccum,
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
              allScenesAccum.push(scene);
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

  // Note: Groq tokens are NOT deducted from user credits — video credits are deducted after render only
  console.log(`[Script] Done: ${totalEmitted}/${sceneCount} scenes | ${totalTokens} tokens`);
}