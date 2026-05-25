import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbService } from './db';

// Model fallback chain: try primary first, then fall back to lighter models
const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite-preview-06-17',
  'gemini-2.0-flash',
];

function getModel(modelName: string) {
  const apiKey = dbService.getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add your key in settings.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

/** Sleep for `ms` milliseconds */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls `fn` with the model, retrying on 503/429 with exponential backoff.
 * If all retries fail for the primary model, falls through the MODEL_CHAIN.
 */
async function withRetry<T>(
  fn: (model: ReturnType<typeof getModel>) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (const modelName of MODEL_CHAIN) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const model = getModel(modelName);
        return await fn(model);
      } catch (err: any) {
        const msg: string = err?.message ?? '';
        const isTransient = msg.includes('503') || msg.includes('429') || msg.includes('overloaded');

        if (!isTransient) {
          // Non-transient error (e.g. 400 bad request, auth) — re-throw immediately
          throw err;
        }

        lastError = err;
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[Studit] ${modelName} returned ${msg.includes('503') ? '503' : '429'}, retrying in ${backoffMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(backoffMs);
      }
    }
    console.warn(`[Studit] ${modelName} exhausted retries, trying next model in chain...`);
  }

  // All models failed
  throw new Error(
    `All models are temporarily unavailable (high demand). Please try again in a minute.\n\nDetails: ${lastError?.message ?? 'Unknown error'}`
  );
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export const geminiService = {
  async chatWithContext(
    sourcesContext: string,
    history: ChatMessage[],
    message: string
  ): Promise<string> {
    return withRetry(async (model) => {
      const systemInstruction = `You are Studit, a brilliant and supportive AI university study assistant.
Your goal is to help students learn, digest, and master their course materials.

Below is the text content of the student's study materials (documents/notes) that they have uploaded:
-----------------------------------------
${sourcesContext || 'No study materials have been uploaded or selected yet.'}
-----------------------------------------

Guidelines:
1. Ground your answers in the provided study materials as much as possible. Quote or reference specific parts of the source text when helpful.
2. If the user asks about topics NOT mentioned in the study materials, you may answer using your general knowledge, but explicitly state that this information is not in their uploaded notes.
3. Be clear, pedagogical, and encouraging. Use markdown for neat styling, code blocks, lists, and bold text.`;

      const chat = model.startChat({
        history: history.map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: msg.parts
        })),
        systemInstruction
      });

      const result = await chat.sendMessage(message);
      return result.response.text();
    });
  },

  async generateSummary(docTitle: string, docContent: string): Promise<string> {
    return withRetry(async (model) => {
      const prompt = `You are a study expert. Create a clear, high-quality, and comprehensive summary of the document titled "${docTitle}".
Structure your response as follows:
1. **Quick Overview**: A 2-3 sentence high-level summary of the entire document.
2. **Key Themes/Core Topics**: Detail the main topics covered, including definitions of key terms.
3. **Important Takeaways**: A bulleted list of the absolute most important points, principles, or formulas that a student must memorize.
4. **Quick Questions**: 3 short questions based on the summary to test the student's memory (include hidden answers or clues in a collapsible <details> tag).

Use clean markdown, bold headers, and bullet points.
Document content:
${docContent}`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  },

  async generateStudyGuide(notebookName: string, sourcesContext: string): Promise<string> {
    return withRetry(async (model) => {
      const prompt = `You are a professional university tutor. Create a comprehensive, student-friendly Study Guide based on all materials in the Notebook "${notebookName}".

Sources:
-----------------------------------------
${sourcesContext}
-----------------------------------------

Please format the guide with:
1. **Study Syllabus**: A breakdown of the primary topics to master.
2. **Detailed Study Notes**: A well-structured walkthrough of the conceptual topics covered by the sources.
3. **Practice Flashcards**: Generate 5 question-answer pairs for self-testing. Format the answer inside a <details><summary>Reveal Answer</summary>...</details> element.
4. **Exam Preparation Tips**: Advice on how to tackle exams on these topics based on the level of complexity.

Ensure the styling is highly visual and easy to scan. Use emojis, dividers, and bullet lists.`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  },

  async generateFlashcards(docTitle: string, docContent: string): Promise<{ front: string; back: string }[]> {
    return withRetry(async (model) => {
      const prompt = `You are an expert study assistant creating flashcards from an academic document.
Analyze the document titled "${docTitle}" and generate exactly 15 high-quality flashcards.

Rules:
- "front": a concise question, term, or prompt (max 15 words)
- "back": a complete, accurate answer or definition (max 60 words)
- Cover the most important and exam-relevant content
- Vary card types: definitions, explanations, cause-effect, comparisons

Respond ONLY with a valid JSON array. No markdown, no code fences, no extra text:
[{"front":"...","back":"..."},...]

Document:
${docContent.slice(0, 14000)}`;

      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array from Gemini');
      return parsed as { front: string; back: string }[];
    });
  },

  async extractReferenceSheet(docTitle: string, docContent: string): Promise<{ terms: { term: string; definition: string }[]; formulas: { label: string; latex: string; description: string }[] }> {
    return withRetry(async (model) => {
      const prompt = `You are an academic document analyzer. Extract all key terms, definitions, equations, and formulas from the document titled "${docTitle}".

Respond ONLY with a valid JSON object — no markdown fences, no extra text:
{
  "terms": [
    { "term": "...", "definition": "..." }
  ],
  "formulas": [
    { "label": "...", "latex": "...", "description": "..." }
  ]
}

Rules:
- "terms": Extract 10–25 of the most important defined terms, concepts, and vocabulary. Each "definition" must be concise (1–2 sentences max).
- "formulas": Extract ALL mathematical equations or expressions. In "latex", provide the raw LaTeX notation WITHOUT surrounding $ or $$ delimiters (e.g. "F = ma", "\\\\frac{d}{dx}f(x)", "E = mc^2"). "label" is the formula name. "description" explains its meaning or when to use it (1 sentence).
- If there are no formulas, return "formulas": [].
- If there are no defined terms, return "terms": [].

Document content:
${docContent.slice(0, 16000)}`;

      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.terms) || !Array.isArray(parsed.formulas)) {
        throw new Error('Unexpected response format from Gemini');
      }
      return parsed as { terms: { term: string; definition: string }[]; formulas: { label: string; latex: string; description: string }[] };
    });
  },

  async generateStudyPlan(
    notebookName: string,
    examDate: number,
    docs: Array<{ name: string; wordCount: number }>
  ): Promise<string> {
    return withRetry(async (model) => {
      const daysLeft = Math.max(1, Math.ceil((examDate - Date.now()) / (1000 * 60 * 60 * 24)));
      const examDateStr = new Date(examDate).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      const docList = docs
        .map((d) => `- "${d.name}" (~${Math.max(1, Math.ceil(d.wordCount / 200))} min read)`)
        .join('\n');

      const prompt = `You are a professional study coach creating a personalised exam preparation plan.

Notebook: "${notebookName}"
Exam Date: ${examDateStr} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} from today)

Study materials to cover:
${docList}

Create a realistic and motivating ${daysLeft}-day study plan. Structure your response as:

## 📅 ${daysLeft}-Day Study Plan for ${notebookName}

For each day, write **Day N — [short date]** as a heading with:
- Focus topics from the document list above
- Specific tasks (reading, summarising, self-testing, etc.)
- Estimated time commitment

Then add these sections:
### ⚡ Quick Wins
(3-5 things to prioritise first regardless of timeline)

### 📋 Final Day Checklist
(what to do the day before the exam)

### 💡 Study Tips
(3 tailored tips based on these specific materials)

Use emojis, clear markdown, and an encouraging tone!`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  },

  async generateMindMap(docTitle: string, docContent: string): Promise<string> {
    return withRetry(async (model) => {
      const prompt = `You are a concept-map assistant. Your job is to distill a document into a clear, readable concept map that reveals meaningful relationships between ideas.

Analyze the document titled "${docTitle}" and generate a Mermaid.js concept map.

OBJECTIVE: Identify the 5–7 most important concepts. Show how they relate to each other — causal, compositional, sequential, or contrasting links. Prioritise insight and clarity over completeness. A user should be able to grasp the document's core structure at a glance.

STRICT RULES:
1. Layout: use "graph LR" (left-right) only. Never use TD or other layouts.
2. Node count: maximum 25 nodes total.
3. Depth: maximum 5 levels from the root node.
4. Every edge MUST carry a short relationship label using this exact syntax:
   A["Concept X"] -->|"causes"| B["Concept Y"]
   Choose meaningful verbs or short phrases: "causes", "is part of", "leads to", "contrasts with", "enables", "requires", "produces", "defines", "supports", "precedes", etc.
5. Node text: 3–6 words maximum. No colons, quotes, or special characters inside node text.
6. Node IDs: simple alphanumeric only (A, B1, C2, etc.).
7. Do NOT exhaustively list every detail from the document — only include concepts that have a real, meaningful relationship to at least one other concept.
8. Do NOT add style, classDef, or linkStyle blocks.

OUTPUT FORMAT: Respond with ONLY a single markdown code block containing the Mermaid code. No explanations, no commentary.

Document content:
${docContent}`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  }
};
