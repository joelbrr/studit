import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DocViewer } from './components/DocViewer';
import { AICopilot } from './components/AICopilot';
import { dbService, type Notebook, type DocumentData } from './services/db';
import { geminiService } from './services/gemini';
import { X, Key } from 'lucide-react';

export const App: React.FC = () => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'reader' | 'mindmap'>('reader');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  
  // Generating states
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingMindMap, setIsGeneratingMindMap] = useState(false);

  // Load notebooks on mount
  useEffect(() => {
    loadNotebooks();
    const storedKey = dbService.getApiKey();
    setApiKeyInput(storedKey);
    // If no key is set, prompt settings modal on initial load to guide user
    if (!storedKey) {
      setShowSettings(true);
    }
  }, []);

  // Reload documents when active notebook changes
  useEffect(() => {
    loadDocuments();
  }, [activeNotebookId]);

  const loadNotebooks = async () => {
    try {
      const list = await dbService.getNotebooks();
      setNotebooks(list);
      if (list.length > 0 && !activeNotebookId) {
        setActiveNotebookId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load notebooks', err);
    }
  };

  const loadDocuments = async () => {
    if (!activeNotebookId) {
      setDocuments([]);
      return;
    }
    try {
      const list = await dbService.getDocumentsByNotebook(activeNotebookId);
      setDocuments(list);
    } catch (err) {
      console.error('Failed to load documents', err);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    dbService.setApiKey(apiKeyInput.trim());
    setShowSettings(false);
  };

  const activeDoc = documents.find((doc) => doc.id === activeDocId) || null;
  const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId) || null;
  const hasApiKey = !!apiKeyInput.trim();

  // Summary generation action
  const handleGenerateSummary = async () => {
    if (!activeDoc) return;
    setIsGeneratingSummary(true);
    try {
      const summary = await geminiService.generateSummary(activeDoc.name, activeDoc.content);
      const updatedDoc: DocumentData = {
        ...activeDoc,
        summary
      };
      await dbService.saveDocument(updatedDoc);
      // Refresh documents local state
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to generate summary: ' + (err as Error).message);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Mind map generation action
  const handleGenerateMindMap = async () => {
    if (!activeDoc) return;
    setIsGeneratingMindMap(true);
    try {
      const mindmap = await geminiService.generateMindMap(activeDoc.name, activeDoc.content);
      const updatedDoc: DocumentData = {
        ...activeDoc,
        mindmap
      };
      await dbService.saveDocument(updatedDoc);
      // Refresh documents local state
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to generate concept map: ' + (err as Error).message);
    } finally {
      setIsGeneratingMindMap(false);
    }
  };

  return (
    <div className="app-container">
      <div className="main-layout">
        {/* Sidebar Left */}
        <Sidebar
          activeNotebookId={activeNotebookId}
          setActiveNotebookId={setActiveNotebookId}
          activeDocId={activeDocId}
          setActiveDocId={setActiveDocId}
          notebooks={notebooks}
          onRefreshNotebooks={loadNotebooks}
          documents={documents}
          onRefreshDocuments={loadDocuments}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* Workspace Central Canvas */}
        <div className="workspace-container">
          <DocViewer
            activeDoc={activeDoc}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onGenerateSummary={handleGenerateSummary}
            onGenerateMindMap={handleGenerateMindMap}
            isGeneratingSummary={isGeneratingSummary}
            summaryText={activeDoc?.summary || null}
            isGeneratingMindMap={isGeneratingMindMap}
            mindMapCode={activeDoc?.mindmap || null}
            geminiApiKeyExists={hasApiKey}
          />
        </div>

        {/* AI Sidepanel Right (visible if notebook exists) */}
        {activeNotebook && (
          <AICopilot
            notebookName={activeNotebook.name}
            activeDoc={activeDoc}
            allDocs={documents}
            geminiApiKeyExists={hasApiKey}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </div>

      {/* Settings Modal (API Key Configuration Overlay) */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999
        }} className="animate-fade">
          <div className="glass" style={{
            width: '100%',
            maxWidth: '460px',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-active)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={20} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: '1.2rem', color: '#fff' }}>Gemini API Settings</h3>
              </div>
              <button onClick={() => setShowSettings(false)} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="Paste your AI Studio API key here..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  style={{ width: '100%', padding: '12px' }}
                />
              </div>

              <div style={{
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.5',
                marginBottom: '24px'
              }}>
                <span style={{ fontWeight: 700, color: '#fff', display: 'block', marginBottom: '4px' }}>💡 How to get a free API Key:</span>
                1. Go to the <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>Google AI Studio console</a>.
                <br />
                2. Click **Create API Key** (this is completely free for individual developer tiers).
                <br />
                3. Copy your key, paste it here, and save! All data is stored locally in your browser.
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowSettings(false)} className="btn-secondary" style={{ padding: '8px 16px' }}>
                  Close
                </button>
                <button type="submit" className="btn-primary" style={{ padding: '8px 24px' }}>
                  Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
