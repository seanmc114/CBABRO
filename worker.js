// ============================================================
// THE BROTHER — CBA Prep Worker
// Anthropic Claude powered · Cloudflare Worker
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method === 'GET') return new Response('THE BROTHER is watching...', { headers: CORS });

    let payload;
    try { payload = await request.json(); }
    catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

    const mode = String(payload.mode || '').trim();

    if (mode === 'chat')           return handleChat(payload, env);
    if (mode === 'script_build')   return handleScriptBuild(payload, env);
    if (mode === 'reflect')        return handleReflect(payload, env);
    if (mode === 'mad_fact')       return handleMadFact(payload, env);

    return jsonResponse({ error: 'Unknown mode' }, 400);
  }
};

// ============================================================
// THE BROTHER SYSTEM PROMPT
// ============================================================
function brotherSystem(name, lang, week, unlockedPhrases) {
  const langFull = { es: 'Spanish', fr: 'French', de: 'German' }[lang] || lang;
  const weekGuidance = week === 1
    ? 'It is Week 1. Plenty of time. Focus on getting to know them — what makes them tick, their life, their interests. Keep it relaxed and exploratory. Help them find their story.'
    : week === 2
    ? 'It is Week 2. Time to shape what they have. Push them to build real sentences. The bones of the script should be forming now. Start nudging them toward their presentation format.'
    : 'It is Week 3. This is it. Presentations are coming. Move with purpose. Praise what is ready. Fix what needs fixing. Tell them to hurry up — warmly but firmly. They can do this.';

  return `You are THE BROTHER — a wise, warm, slightly impatient old mentor helping a 15-year-old Irish student prepare for their Junior Cycle MFL Classroom-Based Assessment (CBA 1: Oral Communication) in ${langFull}.

The student's name is ${name || 'friend'}.

THE CBA:
- It is an oral presentation (or interview/roleplay/conversation) in ${langFull}
- Topic: themselves — who they are, their life, family, interests, hobbies, opinions
- It lasts a few minutes and includes a Q&A with the teacher
- They are assessed on: spoken production, spoken interaction, preparation quality
- Marks go to: range of vocabulary, accuracy, fluency, ability to interact

YOUR PERSONALITY:
- Warm, direct, funny, genuinely invested in them doing well
- Like a wise older relative who happens to know languages
- Occasionally impatient in a fond way — "Right, come on now, we haven't all day"
- Drop in a motivational quote or mad fact occasionally — ALWAYS show it in English AND ${langFull}
- Use their name naturally. Make it feel personal.
- NEVER sound like a marking machine or a robot. Sound human.

${weekGuidance}

WHAT YOU DO:
- Ask them questions about themselves (their life, family, hobbies, opinions) to draw out material
- Help them turn their answers into ${langFull} phrases — always keeping their own voice and words
- Explain clearly why certain choices score better (range, connectors, opinions = more marks)
- Suggest their presentation format naturally in conversation — nudge toward visual (slides) but support whatever they choose
- Build their script bit by bit from what they tell you
- Praise genuinely. Correct gently. Always constructive.
- Never write their whole script for them in one go — build it with them

UNLOCKED PHRASES (from Turbo game — weave these in naturally):
${unlockedPhrases && unlockedPhrases.length ? unlockedPhrases.join('\n') : 'None yet — help them build from scratch'}

MARKING (explain this simply when relevant, not all at once):
- Range of vocabulary and phrases = marks
- Using opinions (I think, in my opinion) = marks  
- Using connectors (because, but, also, however) = marks
- Being able to answer follow-up questions = marks
- Fluency and confidence = marks

KEEP RESPONSES:
- Conversational and warm — not bullet-pointed essays
- Reasonably short — this is a chat, not a lecture
- Occasionally end with a question to keep them talking
- Max 3 paragraphs unless building script sections`;
}

// ============================================================
// MODE: CHAT
// Main conversational mode
// ============================================================
async function handleChat(payload, env) {
  const name = String(payload.name || '').trim();
  const lang = String(payload.lang || 'es').trim();
  const week = parseInt(payload.week || '1');
  const history = Array.isArray(payload.history) ? payload.history : [];
  const unlockedPhrases = Array.isArray(payload.unlocked_phrases) ? payload.unlocked_phrases : [];

  const messages = history.map(h => ({
    role: h.role === 'brother' ? 'assistant' : 'user',
    content: String(h.content || '')
  }));

  const response = await callClaude(
    brotherSystem(name, lang, week, unlockedPhrases),
    messages,
    env,
    600
  );

  return jsonResponse({ reply: response });
}

// ============================================================
// MODE: SCRIPT_BUILD
// Assembles their script from conversation history
// ============================================================
async function handleScriptBuild(payload, env) {
  const name = String(payload.name || '').trim();
  const lang = String(payload.lang || 'es').trim();
  const langFull = { es: 'Spanish', fr: 'French', de: 'German' }[lang] || lang;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const format = String(payload.format || 'presentation').trim();

  const conversationText = history
    .map(h => `${h.role === 'brother' ? 'Brother' : name}: ${h.content}`)
    .join('\n');

  const prompt = `Based on this conversation between The Brother and ${name}, build a CBA presentation script in ${langFull}.

CONVERSATION:
${conversationText}

Build a script that:
- Is written in ${langFull} with English translation underneath each section
- Uses their actual words and answers — do NOT invent information they didn't give
- Has clear sections: Introduction, Family, Hobbies/Interests, School, Opinions/Future
- Includes the phrases and vocabulary they have used or been given
- Is appropriate for a ${format} format
- Is honest about gaps — mark [ADD YOUR OWN DETAIL HERE] where info is missing
- Sounds like them, not like a textbook

Format the output as JSON:
{
  "title": "short title for their presentation",
  "sections": [
    {
      "heading": "section name",
      "target_lang": "the ${langFull} text",
      "english": "English translation",
      "tips": "one short tip for delivering this section"
    }
  ],
  "phrases_used": ["list of key phrases from Turbo they used"],
  "what_to_practice": "one sentence on what to focus on",
  "encouragement": "a genuine encouraging line for ${name}"
}

Return ONLY valid JSON. No preamble.`;

  const raw = await callClaude(
    'You are a helpful MFL CBA script builder. Return ONLY valid JSON as instructed.',
    [{ role: 'user', content: prompt }],
    env,
    1200
  );

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const script = JSON.parse(clean);
    return jsonResponse({ script });
  } catch {
    return jsonResponse({ error: 'Could not build script', raw });
  }
}

// ============================================================
// MODE: REFLECT
// Generates their reflection note
// ============================================================
async function handleReflect(payload, env) {
  const name = String(payload.name || '').trim();
  const lang = String(payload.lang || 'es').trim();
  const langFull = { es: 'Spanish', fr: 'French', de: 'German' }[lang] || lang;
  const history = Array.isArray(payload.history) ? payload.history : [];

  const conversationText = history
    .map(h => `${h.role === 'brother' ? 'Brother' : name}: ${h.content}`)
    .join('\n');

  const prompt = `Based on this CBA prep conversation, help ${name} write their Student Reflection Note for their ${langFull} CBA.

CONVERSATION:
${conversationText}

The Student Reflection Note should:
- Be in the student's own voice (first person, simple, honest)
- Describe what they did to prepare
- Reflect on what went well and what was challenging  
- Be genuine — not too polished, sounds like a 15-year-old
- Be short (150-200 words max)

Return as JSON:
{
  "reflection": "the full reflection note text",
  "prompts": ["3 questions they could add their own thoughts to"]
}

Return ONLY valid JSON.`;

  const raw = await callClaude(
    'You help students write genuine CBA reflection notes. Return ONLY valid JSON.',
    [{ role: 'user', content: prompt }],
    env,
    600
  );

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const reflect = JSON.parse(clean);
    return jsonResponse({ reflect });
  } catch {
    return jsonResponse({ error: 'Could not generate reflection', raw });
  }
}

// ============================================================
// MODE: MAD_FACT
// Returns a mad fact in English + target language
// ============================================================
async function handleMadFact(payload, env) {
  const lang = String(payload.lang || 'es').trim();
  const langFull = { es: 'Spanish', fr: 'French', de: 'German' }[lang] || lang;
  const topic = String(payload.topic || 'anything amazing').trim();

  const prompt = `Give one genuinely surprising, amazing, or funny fact related to: ${topic}.

Return as JSON:
{
  "fact_en": "the fact in English",
  "fact_tl": "the same fact in ${langFull}",
  "why_cool": "one line on why this is amazing"
}

The fact should be genuinely surprising — not boring. Something a 15-year-old would actually find cool.
Return ONLY valid JSON.`;

  const raw = await callClaude(
    'You give genuinely surprising facts. Return ONLY valid JSON.',
    [{ role: 'user', content: prompt }],
    env,
    300
  );

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const fact = JSON.parse(clean);
    return jsonResponse({ fact });
  } catch {
    return jsonResponse({ error: 'Could not generate fact', raw });
  }
}

// ============================================================
// CLAUDE API CALL
// ============================================================
async function callClaude(system, messages, env, maxTokens = 600) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Claude API error');
  return data.content?.[0]?.text || '';
}

// ============================================================
// HELPERS
// ============================================================
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}
