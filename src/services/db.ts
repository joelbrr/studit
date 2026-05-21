export interface Notebook {
  id: string;
  name: string;
  createdAt: number;
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
}

const DB_NAME = 'studit_db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('notebooks')) {
        db.createObjectStore('notebooks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('notebookId', 'notebookId', { unique: false });
      }
    };
  });
}

export const dbService = {
  // Notebooks CRUD
  async getNotebooks(): Promise<Notebook[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('notebooks', 'readonly');
      const store = transaction.objectStore('notebooks');
      const request = store.getAll();

      request.onsuccess = () => {
        const list = request.result as Notebook[];
        // Sort by newest
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
    // Also delete all documents under this notebook
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

  // Documents CRUD
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

  // API Key Storage (uses localStorage since it's simple and global)
  getApiKey(): string {
    return localStorage.getItem('studit_gemini_api_key') || '';
  },

  setApiKey(key: string): void {
    localStorage.setItem('studit_gemini_api_key', key);
  }
};
