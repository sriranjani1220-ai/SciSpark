const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ----------------------------------------------------------------
   POST /api/questions
   Body: { name, subtitle, emoji }
   Returns: { questions: [...] }  — same shape as CATEGORIES[i].questions
---------------------------------------------------------------- */
function ageProfile(age) {
  const n = parseInt(age, 10) || 8;
  if (n <= 6) return {
    range: '4-6',
    vocab: 'Use only the simplest words a 5-year-old knows. Very short sentences. Compare everything to toys, animals, or food kids love.',
    concepts: 'Only the most basic, visible science concepts. Nothing abstract.',
    facts: 'One short, surprising sentence using everyday comparisons (e.g. "as big as a school bus!").'
  };
  if (n <= 9) return {
    range: '7-9',
    vocab: 'Use simple primary-school vocabulary. Friendly, enthusiastic tone.',
    concepts: 'Straightforward science concepts with relatable real-world examples.',
    facts: '1-2 sentences with a fun comparison or surprising number.'
  };
  return {
    range: '10-12',
    vocab: 'Use proper scientific terms but explain them briefly. Engaging and curious tone.',
    concepts: 'Deeper concepts, cause-and-effect reasoning, and some technical detail.',
    facts: '1-2 sentences with a real scientific detail that surprises even adults.'
  };
}

const questionCache = {};

app.post('/api/questions', async (req, res) => {
  const { name, subtitle, emoji, age } = req.body;
  const cacheKey = `${name}-${age}`;

  if (questionCache[cacheKey]) {
    console.log(`Cache hit for ${cacheKey}`);
    return res.json({ questions: questionCache[cacheKey] });
  }

  const profile = ageProfile(age);

  try {
    const t0 = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Generate 5 fun science quiz questions for a ${age}-year-old child about "${name}" (${subtitle}).

The child is age ${age} (age group ${profile.range}):
- Vocabulary: ${profile.vocab}
- Concept depth: ${profile.concepts}
- Fun facts: ${profile.facts}

Return ONLY a valid JSON array — no markdown, no explanation, just the array:
[
  {
    "q": "Question text?",
    "o": ["Option A emoji", "Option B emoji", "Option C emoji", "Option D emoji"],
    "c": 1,
    "f": "An exciting fun fact about the correct answer!"
  }
]

Rules:
- Add a relevant emoji to each option
- "c" is the 0-based index of the correct answer in "o"
- All 5 questions must be different
- Return ONLY the raw JSON array, nothing else`
      }]
    });

    const raw = message.content[0].text.trim().replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
    const questions = JSON.parse(raw);
    console.log(`Questions generated in ${Date.now() - t0}ms — cached as ${cacheKey}`);
    questionCache[cacheKey] = questions;
    res.json({ questions });
  } catch (err) {
    console.error('Error generating questions:', err.message);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

/* ----------------------------------------------------------------
   POST /api/hint
   Body: { question, options }
   Returns: { hint }
---------------------------------------------------------------- */
app.post('/api/hint', async (req, res) => {
  const { question, options, age } = req.body;
  const profile = ageProfile(age);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `A ${age}-year-old child is stuck on this quiz question. Give a helpful clue that guides them WITHOUT revealing the answer.

Question: "${question}"
Options: ${options.join(' | ')}

Use language suitable for age ${age}: ${profile.vocab}
Write exactly 1-2 friendly sentences. Start with an encouraging emoji. Do NOT say the answer.`
      }]
    });

    res.json({ hint: message.content[0].text.trim() });
  } catch (err) {
    console.error('Error generating hint:', err.message);
    res.status(500).json({ error: 'Failed to generate hint' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SciSpark running at http://localhost:${PORT}`);
  console.log('API key:', process.env.ANTHROPIC_API_KEY ? 'loaded' : 'MISSING — set ANTHROPIC_API_KEY');
});
