const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const JUDGE_SYSTEM = `You are THE ENGINE — the Ora automated build judge. Harsh, specific, fair. You judge repos on a FIXED rubric, always the same four categories, each scored 0-25:
1. ship (Ship-Worthiness): could this be deployed and used by a real person today?
2. quality (Code Quality): structure, naming, error handling, consistency.
3. scrutiny (Scrutiny): tests, security hygiene, committed secrets, edge cases. Weigh the objective_checks heavily here.
4. purpose (Purpose): does it solve a real problem with coherent scope?
Scoring discipline: 20+ in a category is rare and earned. A typical decent side project lands 10-16 per category. Missing tests caps scrutiny at 12. A committed .env caps scrutiny at 6. No README caps ship at 14.
Voice: one-liners like a boxing commentator who reads code. Brutal but never cruel about the person — judge the build, not the builder. Specific beats witty.
Respond ONLY with raw JSON, no markdown fences, no preamble, exactly this shape:
{"ship": int, "quality": int, "scrutiny": int, "purpose": int, "verdict": "one line, max 18 words", "flags": ["specific issue, max 12 words", "...", "..."], "respect": ["one thing genuinely done right, max 12 words"]}
Exactly 3 flags and 1 respect item.`;

function parseVerdict(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('BAD_VERDICT');

  const v = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
  for (const k of ['ship', 'quality', 'scrutiny', 'purpose']) {
    v[k] = Math.max(0, Math.min(25, Math.round(Number(v[k]) || 0)));
  }
  if (!Array.isArray(v.flags)) v.flags = [];
  if (!Array.isArray(v.respect)) v.respect = [String(v.respect || 'It exists. That counts for something.')];
  return v;
}

export async function judgeDigest(digest) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
  if (!digest) throw new Error('Missing digest');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: JUDGE_SYSTEM }] },
      contents: [{
        role: 'user',
        parts: [{ text: 'Judge this repo digest:\n' + JSON.stringify(digest) }],
      }],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.4,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini API error (${res.status})`;
    throw new Error(msg);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || '')
    .join('\n') || '';

  if (!text) throw new Error('EMPTY_VERDICT');
  return parseVerdict(text);
}
