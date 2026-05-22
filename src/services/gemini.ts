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

  async generateMindMap(docTitle: string, docContent: string): Promise<string> {
    return withRetry(async (model) => {
      const prompt = `You are a mind-mapping assistant that visualizes connections between ideas.
Analyze the document titled "${docTitle}" and generate a hierarchical, conceptual mind map using Mermaid.js syntax.

RULES for the Mermaid diagram:
1. Use 'graph TD' (Top-Down) or 'graph LR' (Left-Right) layout.
2. Structure the map logically: Main Topic at the root, branches for subtopics, and sub-branches for key definitions/concepts.
3. Node IDs must be simple alphanumeric strings (e.g. A, B1, B2, C1).
4. Node text MUST be wrapped in double quotes inside brackets to avoid syntax errors with special characters. Example: A["Main Topic Name"] --> B["Subtopic: Definitions"]
5. Use styling in the Mermaid code if you want, but keep the structure robust and compliant.
6. The entire response must consist of ONLY a markdown code block containing the mermaid code, like this:
\`\`\`mermaid
graph TD
    A["Main Concept"] --> B["Key Point"]
\`\`\`

Here is the document content to map:
${docContent}`;

      const result = await model.generateContent(prompt);
      return result.response.text();
    });
  }
};
