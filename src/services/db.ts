import { supabase } from './supabase';

export interface Notebook {
  id: string;
  name: string;
  createdAt: number;
  notes?: string;
  examDate?: number;
}

export interface ReferenceSheetData {
  terms: { term: string; definition: string }[];
  formulas: { label: string; latex: string; description: string }[];
}

export interface ExamQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
}

export interface DocumentData {
  id: string;
  notebookId: string;
  name: string;
  content: string;
  type: 'pdf' | 'txt' | 'md';
  createdAt: number;
  summary?: string;
  mindmap?: string;
  tags?: string[];
  referenceSheet?: ReferenceSheetData;
  isExam?: boolean;
  scrollProgress?: number;
  reviewed?: boolean;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  interval: number;
  easeFactor: number;
  nextReview: number;
  reviewCount: number;
}

export interface FlashcardDeck {
  id: string;
  docId: string;
  notebookId: string;
  cards: Flashcard[];
  createdAt: number;
  updatedAt: number;
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow_Notebook(r: any): Notebook {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    ...(r.notes    != null && { notes: r.notes }),
    ...(r.exam_date != null && { examDate: r.exam_date }),
  };
}

function toRow_Notebook(nb: Notebook, userId: string) {
  return {
    id: nb.id,
    user_id: userId,
    name: nb.name,
    created_at: nb.createdAt,
    notes: nb.notes ?? null,
    exam_date: nb.examDate ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow_Document(r: any): DocumentData {
  return {
    id: r.id,
    notebookId: r.notebook_id,
    name: r.name,
    content: r.content,
    type: r.type as 'pdf' | 'txt' | 'md',
    createdAt: r.created_at,
    ...(r.summary         != null && { summary: r.summary }),
    ...(r.mindmap         != null && { mindmap: r.mindmap }),
    ...(r.tags            != null && { tags: r.tags }),
    ...(r.reference_sheet != null && { referenceSheet: r.reference_sheet }),
    isExam:         r.is_exam         ?? false,
    scrollProgress: r.scroll_progress ?? 0,
    reviewed:       r.reviewed        ?? false,
  };
}

function toRow_Document(doc: DocumentData, userId: string) {
  return {
    id: doc.id,
    user_id: userId,
    notebook_id: doc.notebookId,
    name: doc.name,
    content: doc.content,
    type: doc.type,
    created_at: doc.createdAt,
    summary: doc.summary ?? null,
    mindmap: doc.mindmap ?? null,
    tags: doc.tags ?? null,
    reference_sheet: doc.referenceSheet ?? null,
    is_exam: doc.isExam ?? false,
    scroll_progress: doc.scrollProgress ?? 0,
    reviewed: doc.reviewed ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow_Deck(r: any): FlashcardDeck {
  return {
    id: r.id,
    docId: r.doc_id,
    notebookId: r.notebook_id,
    cards: r.cards as Flashcard[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toRow_Deck(deck: FlashcardDeck, userId: string) {
  return {
    id: deck.id,
    user_id: userId,
    doc_id: deck.docId,
    notebook_id: deck.notebookId,
    cards: deck.cards,
    created_at: deck.createdAt,
    updated_at: deck.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

let _userId: string | null = null;

export const dbService = {
  setCurrentUser(id: string | null) {
    _userId = id;
  },

  _uid(): string {
    if (!_userId) throw new Error('Not authenticated');
    return _userId;
  },

  // ── Notebooks ────────────────────────────────────────────────────────────
  async getNotebooks(): Promise<Notebook[]> {
    const { data, error } = await supabase
      .from('notebooks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(fromRow_Notebook);
  },

  async saveNotebook(notebook: Notebook): Promise<void> {
    const { error } = await supabase
      .from('notebooks')
      .upsert(toRow_Notebook(notebook, this._uid()));
    if (error) throw error;
  },

  async deleteNotebook(id: string): Promise<void> {
    // DB CASCADE handles documents → flashcard_decks
    const { error } = await supabase.from('notebooks').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Documents ────────────────────────────────────────────────────────────
  async getDocumentsByNotebook(notebookId: string): Promise<DocumentData[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('notebook_id', notebookId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(fromRow_Document);
  },

  async saveDocument(doc: DocumentData): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .upsert(toRow_Document(doc, this._uid()));
    if (error) throw error;
  },

  async getAllDocuments(): Promise<DocumentData[]> {
    const { data, error } = await supabase.from('documents').select('*');
    if (error) throw error;
    return (data ?? []).map(fromRow_Document);
  },

  async deleteDocument(id: string): Promise<void> {
    // DB CASCADE handles flashcard_decks
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Flashcard Decks ──────────────────────────────────────────────────────
  async getDeckByDocId(docId: string): Promise<FlashcardDeck | null> {
    const { data, error } = await supabase
      .from('flashcard_decks')
      .select('*')
      .eq('doc_id', docId)
      .maybeSingle();
    if (error) throw error;
    return data ? fromRow_Deck(data) : null;
  },

  async saveDeck(deck: FlashcardDeck): Promise<void> {
    const { error } = await supabase
      .from('flashcard_decks')
      .upsert(toRow_Deck(deck, this._uid()));
    if (error) throw error;
  },

  async deleteDeck(id: string): Promise<void> {
    const { error } = await supabase.from('flashcard_decks').delete().eq('id', id);
    if (error) throw error;
  },

  // ── API Key (local, per-user so multiple accounts on same browser work) ──
  getApiKey(): string {
    if (!_userId) return '';
    return localStorage.getItem(`studit_gemini_key_${_userId}`) || '';
  },

  setApiKey(key: string): void {
    if (!_userId) return;
    localStorage.setItem(`studit_gemini_key_${_userId}`, key);
  },
};