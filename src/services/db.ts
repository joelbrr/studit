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
}

// ─── Flashcard types ─────────────────────────────────────────────────────────

export interface Flashcard {
  id: string;
  front: string;       // term / question
  back: string;        // definition / answer
  // Spaced-repetition fields (simplified SM-2)
  interval: number;    // days until next review
  easeFactor: number;  // multiplier (1.3 – 2.5)
  nextReview: number;  // timestamp (ms)
  reviewCount: number;
}

export interface FlashcardDeck {
  id: string;          // same as docId for simplicity (one deck per doc)
  docId: string;
  notebookId: string;
  cards: Flashcard[];
  createdAt: number;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'studit_db';
const DB_VERSION = 2; // bumped to add flashcard_decks store

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains('notebooks')) {
        db.createObjectStore('notebooks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('notebookId', 'notebookId', { unique: false });
      }
      // New in v2
      if (!db.objectStoreNames.contains('flashcard_decks')) {
        const deckStore = db.createObjectStore('flashcard_decks', { keyPath: 'id' });
        deckStore.createIndex('docId', 'docId', { unique: true });
        deckStore.createIndex('notebookId', 'notebookId', { unique: false });
      }

      // Suppress unused-variable warning
      void event;
    };
  });
}

export const dbService = {
  // ── Notebooks CRUD ──────────────────────────────────────────────────────────
  async getNotebooks(): Promise<Notebook[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('notebooks', 'readonly');
      const store = transaction.objectStore('notebooks');
      const request = store.getAll();

      request.onsuccess = () => {
        const list = request.result as Notebook[];
        resolve(list.sort((a, b) => b.createdAt - a.createdAt));
      };
      request.onerror = () => reject(request.error);
    });
  },

  async saveNotebook(notebook: Notebook): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('notebooks', 'readwrite');
      const store = transaction.objectStore('notebooks');
      const request = store.put(notebook);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteNotebook(id: string): Promise<void> {
    const db = await openDB();
    const docs = await this.getDocumentsByNotebook(id);
    for (const doc of docs) {
      await this.deleteDocument(doc.id);
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('notebooks', 'readwrite');
      const store = transaction.objectStore('notebooks');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // ── Documents CRUD ──────────────────────────────────────────────────────────
  async getDocumentsByNotebook(notebookId: string): Promise<DocumentData[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readonly');
      const store = transaction.objectStore('documents');
      const index = store.index('notebookId');
      const request = index.getAll(notebookId);

      request.onsuccess = () => {
        const list = request.result as DocumentData[];
        resolve(list.sort((a, b) => b.createdAt - a.createdAt));
      };
      request.onerror = () => reject(request.error);
    });
  },

  async saveDocument(doc: DocumentData): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.put(doc);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAllDocuments(): Promise<DocumentData[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readonly');
      const store = transaction.objectStore('documents');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as DocumentData[]);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteDocument(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // ── Flashcard Decks CRUD ────────────────────────────────────────────────────
  async getDeckByDocId(docId: string): Promise<FlashcardDeck | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('flashcard_decks', 'readonly');
      const store = transaction.objectStore('flashcard_decks');
      const index = store.index('docId');
      const request = index.get(docId);
      request.onsuccess = () => resolve((request.result as FlashcardDeck) ?? null);
      request.onerror = () => reject(request.error);
    });
  },

  async saveDeck(deck: FlashcardDeck): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('flashcard_decks', 'readwrite');
      const store = transaction.objectStore('flashcard_decks');
      const request = store.put(deck);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteDeck(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('flashcard_decks', 'readwrite');
      const store = transaction.objectStore('flashcard_decks');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // ── API Key ─────────────────────────────────────────────────────────────────
  getApiKey(): string {
    return localStorage.getItem('studit_gemini_api_key') || '';
  },

  setApiKey(key: string): void {
    localStorage.setItem('studit_gemini_api_key', key);
  }
};
