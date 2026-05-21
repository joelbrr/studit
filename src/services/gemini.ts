import { GoogleGenerativeAI } from '@google/generative-ai';
import { dbService } from './db';

function getModel(modelName = 'gemini-1.5-flash') {
  const apiKey = dbService.getApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add your key in settings.');
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
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
    const model = getModel();

    // Prepare system instructions and initial context
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
      systemInstruction: systemInstruction
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    return response.text();
  },

  async generateSummary(docTitle: string, docContent: string): Promise<string> {
    const model = getModel();
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
  },

  async generateStudyGuide(notebookName: string, sourcesContext: string): Promise<string> {
    const model = getModel();
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
  },

  async generateMindMap(docTitle: string, docContent: string): Promise<string> {
    const model = getModel();
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
    const responseText = result.response.text();
    return responseText;
  }
};
