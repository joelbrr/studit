import JSZip from 'jszip';
import mermaid from 'mermaid';
import { geminiService } from './gemini';
import { dbService, type DocumentData, type FlashcardDeck, type Notebook } from './db';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim().slice(0, 80);
}

async function renderMindMapSvg(code: string): Promise<string | null> {
  try {
    let clean = code.trim();
    if (clean.includes('```mermaid')) {
      clean = clean.split('```mermaid')[1].split('```')[0].trim();
    } else if (clean.includes('```')) {
      clean = clean.split('```')[1].split('```')[0].trim();
    }
    const id = `export-mm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { svg } = await mermaid.render(id, clean);
    document.getElementById(id)?.remove();
    return svg;
  } catch {
    return null;
  }
}

function flashcardsToMarkdown(deck: FlashcardDeck, docName: string): string {
  const lines = [`# Flashcards — ${docName}`, ''];
  deck.cards.forEach((card, i) => {
    lines.push(`## Card ${i + 1}`, '', `**Q:** ${card.front}`, '', `**A:** ${card.back}`, '', '---', '');
  });
  return lines.join('\n');
}

function referenceToMarkdown(doc: DocumentData): string {
  if (!doc.referenceSheet) return '';
  const { terms, formulas } = doc.referenceSheet;
  const lines = [`# Reference Sheet — ${doc.name}`, ''];

  if (terms.length > 0) {
    lines.push('## Key Terms', '', '| Term | Definition |', '|------|------------|');
    terms.forEach((t) => lines.push(`| **${t.term}** | ${t.definition} |`));
    lines.push('');
  }

  if (formulas.length > 0) {
    lines.push('## Formulas', '');
    formulas.forEach((f) => {
      lines.push(`### ${f.label}`, '', `**Expression:** \`${f.latex}\``, '', `**Description:** ${f.description}`, '');
    });
  }

  return lines.join('\n');
}

function buildReadme(notebook: Notebook, documents: DocumentData[], hasStudyGuide: boolean): string {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [`# Study Pack — ${notebook.name}`, '', `*Generated on ${date} by Studit*`, '', '## Contents', ''];

  if (hasStudyGuide) {
    lines.push('- `study_guide.md` — AI-generated comprehensive study guide covering all sources', '');
  }

  lines.push('### Per-document files', '');
  documents.forEach((doc) => {
    const hasSummary = !!doc.summary;
    const hasMindmap = !!doc.mindmap;
    const hasRef = !!(doc.referenceSheet && (doc.referenceSheet.terms.length + doc.referenceSheet.formulas.length) > 0);
    lines.push(`**${doc.name}**`);
    if (hasSummary) lines.push('  - `summary.md`');
    if (hasMindmap) lines.push('  - `mindmap.svg`');
    if (hasRef) lines.push('  - `reference.md`');
    lines.push('  - `flashcards.md` *(if a deck was generated)*');
    lines.push('');
  });

  lines.push(
    '## How to use this pack',
    '',
    '1. Start with **study_guide.md** for a high-level overview of all material.',
    '2. Read each **summary.md** before tackling the full source document.',
    '3. Use **flashcards.md** for active recall — cover the answer and test yourself.',
    '4. Open **mindmap.svg** in any browser to explore concept relationships visually.',
    '5. Keep **reference.md** open during practice problems for quick formula/term lookup.',
  );

  return lines.join('\n');
}

export async function exportNotebook(
  notebook: Notebook,
  documents: DocumentData[],
  apiKeyExists: boolean
): Promise<void> {
  const zip = new JSZip();
  const docsFolder = zip.folder('docs')!;

  // 1. Generate study guide (fresh, covers all sources)
  let hasStudyGuide = false;
  if (apiKeyExists && documents.length > 0) {
    try {
      const perDoc = Math.floor(24000 / documents.length);
      const context = documents
        .map((d) => `=== ${d.name} ===\n${d.content.slice(0, perDoc)}`)
        .join('\n\n');
      const guide = await geminiService.generateStudyGuide(notebook.name, context);
      zip.file('study_guide.md', guide);
      hasStudyGuide = true;
    } catch {
      // Non-fatal — pack ships without it
    }
  }

  // 2. Per-document content
  for (const doc of documents) {
    const folderName = sanitizeName(doc.name.replace(/\.[^.]+$/, ''));
    const folder = docsFolder.folder(folderName)!;

    if (doc.summary) {
      folder.file('summary.md', `# Summary — ${doc.name}\n\n${doc.summary}`);
    }

    if (doc.mindmap) {
      const svg = await renderMindMapSvg(doc.mindmap);
      if (svg) folder.file('mindmap.svg', svg);
    }

    const deck = await dbService.getDeckByDocId(doc.id);
    if (deck && deck.cards.length > 0) {
      folder.file('flashcards.md', flashcardsToMarkdown(deck, doc.name));
    }

    if (doc.referenceSheet && (doc.referenceSheet.terms.length + doc.referenceSheet.formulas.length) > 0) {
      folder.file('reference.md', referenceToMarkdown(doc));
    }
  }

  // 3. README
  zip.file('README.md', buildReadme(notebook, documents, hasStudyGuide));

  // 4. Trigger download
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeName(notebook.name)}_study_pack.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
