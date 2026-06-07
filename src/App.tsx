import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { DocViewer } from './components/DocViewer';
import { AICopilot } from './components/AICopilot';
import { NotebookScratchpad } from './components/NotebookScratchpad';
import { StudyPlanner } from './components/StudyPlanner';
import { MixedSession } from './components/MixedSession';
import { AuthScreen } from './components/AuthScreen';
import { dbService, type Notebook, type DocumentData, type Flashcard, type FlashcardDeck, type ExamQuestion } from './services/db';
import { geminiService } from './services/gemini';
import { exportNotebook } from './services/export';
import { supabase } from './services/supabase';
import { X, Key, Loader2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

function sm2Update(card: Flashcard, rating: 'easy' | 'medium' | 'hard'): Flashcard {
  const q = rating === 'easy' ? 5 : rating === 'medium' ? 3 : 1;
  let { easeFactor, interval, reviewCount } = card;
  if (q < 3) {
    interval = 1;
  } else {
    if (reviewCount === 0) interval = 1;
    else if (reviewCount === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return {
    ...card,
    interval,
    easeFactor,
    reviewCount: reviewCount + 1,
    nextReview: Date.now() + interval * 24 * 60 * 60 * 1000,
  };
}

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'reader' | 'mindmap' | 'flashcards' | 'reference' | 'exam'>('reader');
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  // Generating states
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingMindMap, setIsGeneratingMindMap] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [isGeneratingReference, setIsGeneratingReference] = useState(false);
  const [isGeneratingExam, setIsGeneratingExam] = useState(false);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[] | null>(null);

  // Flashcard deck for the active document
  const [activeFlashcardDeck, setActiveFlashcardDeck] = useState<FlashcardDeck | null>(null);
  // All decks for the active notebook (used by Mixed Session)
  const [allNotebookDecks, setAllNotebookDecks] = useState<FlashcardDeck[]>([]);

  // Notebook scratchpad
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showMixedSession, setShowMixedSession] = useState(false);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);

  // Study planner
  const [showStudyPlanner, setShowStudyPlanner] = useState(false);
  const [studyPlan, setStudyPlan] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFormattingDoc, setIsFormattingDoc] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const formattingInProgressRef = useRef(false);

  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [externalCopilotMessage, setExternalCopilotMessage] = useState<{ text: string; id: number } | null>(null);
  const [selectionToast, setSelectionToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth state — resolve session on mount, subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      if (u) dbService.setCurrentUser(u.id);
      setUser(u);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      dbService.setCurrentUser(u?.id ?? null);
      setUser(u);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load data once authenticated
  useEffect(() => {
    if (!user) return;
    loadNotebooks();
    const storedKey = dbService.getApiKey();
    setApiKeyInput(storedKey);
    if (!storedKey) setShowSettings(true);
  }, [user]);

  // Reload documents + all decks when active notebook changes
  useEffect(() => {
    loadDocuments();
    loadAllNotebookDecks();
  }, [activeNotebookId]);

  // Auto-dismiss panels when a document is selected
  useEffect(() => {
    if (activeDocId) {
      setShowScratchpad(false);
      setShowStudyPlanner(false);
      setShowMixedSession(false);
    }
  }, [activeDocId]);

  // Reset per-notebook state when switching notebooks
  useEffect(() => {
    setStudyPlan(null);
    setExamQuestions(null);
    setShowMixedSession(false);
  }, [activeNotebookId]);

  // Load flashcard deck when active document changes
  useEffect(() => {
    if (!activeDocId) {
      setActiveFlashcardDeck(null);
      return;
    }
    dbService.getDeckByDocId(activeDocId)
      .then((deck) => setActiveFlashcardDeck(deck))
      .catch((err) => console.error('Failed to load flashcard deck', err));
  }, [activeDocId]);

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

  const loadAllNotebookDecks = async () => {
    if (!activeNotebookId) { setAllNotebookDecks([]); return; }
    try {
      const decks = await dbService.getDecksByNotebook(activeNotebookId);
      setAllNotebookDecks(decks);
    } catch (err) {
      console.error('Failed to load notebook decks', err);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    dbService.setApiKey(apiKeyInput.trim());
    setShowSettings(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setNotebooks([]);
    setDocuments([]);
    setActiveNotebookId(null);
    setActiveDocId(null);
    setStudyPlan(null);
    setExamQuestions(null);
    setApiKeyInput('');
  };

  const activeDoc = documents.find((doc) => doc.id === activeDocId) || null;
  const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId) || null;
  const hasApiKey = !!apiKeyInput.trim();

  const handleExplainSelection = (action: 'explain' | 'simplify' | 'translate', text: string) => {
    const snippet = text.length > 300 ? text.slice(0, 300) + '…' : text;
    const prompts: Record<typeof action, string> = {
      explain:   `Please explain this excerpt:\n\n> "${snippet}"`,
      simplify:  `Please simplify this excerpt into plain, easy-to-understand language:\n\n> "${snippet}"`,
      translate: `Please translate this excerpt to English (if it's already in English, clarify and simplify it):\n\n> "${snippet}"`,
    };
    setCopilotCollapsed(false);
    setExternalCopilotMessage({ text: prompts[action], id: Date.now() });
  };

  const handleAddSelectionToFlashcard = async (text: string) => {
    if (!activeDoc || !activeNotebookId) return;
    const front = text.length > 300 ? text.slice(0, 300) + '…' : text;
    const now = Date.now();
    const newCard: Flashcard = {
      id: `${activeDoc.id}_sel_${now}`,
      front,
      back: '',
      interval: 1,
      easeFactor: 2.5,
      nextReview: now,
      reviewCount: 0,
    };
    const base = activeFlashcardDeck ?? {
      id: activeDoc.id,
      docId: activeDoc.id,
      notebookId: activeNotebookId,
      cards: [],
      createdAt: now,
      updatedAt: now,
    };
    const updatedDeck: FlashcardDeck = { ...base, cards: [...base.cards, newCard], updatedAt: now };
    await dbService.saveDeck(updatedDeck);
    setActiveFlashcardDeck(updatedDeck);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setSelectionToast('✓ Added to flashcards');
    toastTimer.current = setTimeout(() => setSelectionToast(null), 2500);
  };

  const handleScrollProgress = (progress: number) => {
    if (!activeDoc) return;
    const updatedDoc: DocumentData = { ...activeDoc, scrollProgress: progress };
    setDocuments((prev) => prev.map((d) => d.id === activeDoc.id ? updatedDoc : d));
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current);
    scrollSaveTimer.current = setTimeout(() => {
      dbService.saveDocument(updatedDoc).catch(console.error);
    }, 1500);
  };

  // Summary generation action
  const handleGenerateSummary = async () => {
    if (!activeDoc) return;
    setIsGeneratingSummary(true);
    try {
      const summary = await geminiService.generateSummary(activeDoc.name, activeDoc.content);
      const updatedDoc: DocumentData = { ...activeDoc, summary, reviewed: true };
      await dbService.saveDocument(updatedDoc);
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to generate summary: ' + (err as Error).message);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  // Save scratchpad content as a new document in Sources
  // Reformat raw extracted PDF text into clean, structured Markdown for the Reader.
  // Used both as a manual trigger (button) and automatically when a PDF is first opened.
  const handleFormatDocument = async (docOverride?: DocumentData) => {
    const target = docOverride ?? activeDoc;
    if (!target || !hasApiKey) return;
    if (target.formattedContent) return;            // already formatted
    if (formattingInProgressRef.current) return;    // guard against concurrent / StrictMode double-run
    formattingInProgressRef.current = true;
    setFormatError(null);
    setIsFormattingDoc(true);
    try {
      const formatted = await geminiService.reformatDocumentText(target.name, target.content);
      if (!formatted || !formatted.trim()) {
        throw new Error('The model returned an empty response (the document may have been blocked or is too large).');
      }
      const updatedDoc: DocumentData = { ...target, formattedContent: formatted };
      setDocuments((prev) => prev.map((d) => d.id === target.id ? { ...d, formattedContent: formatted } : d));
      await dbService.saveDocument(updatedDoc);
    } catch (err) {
      console.error('Failed to format document', err);
      setFormatError((err as Error).message || 'Unknown error');
    } finally {
      formattingInProgressRef.current = false;
      setIsFormattingDoc(false);
    }
  };

  // Auto-format PDFs the first time they're opened — txt/md are already clean.
  useEffect(() => {
    setFormatError(null); // clear any stale error from a previously opened doc
    if (!activeDoc || activeDoc.type !== 'pdf') return;
    if (activeDoc.formattedContent || !hasApiKey) return;
    handleFormatDocument(activeDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId, hasApiKey]);

  // Save scratchpad content as a new document in Sources
  const handleSaveNotesAsDocument = async (content: string) => {
    if (!activeNotebook) return;
    const timestamp = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newDoc: DocumentData = {
      id: crypto.randomUUID(),
      notebookId: activeNotebook.id,
      name: `${activeNotebook.name} — Scratchpad ${timestamp}.md`,
      content,
      type: 'md',
      createdAt: Date.now(),
    };
    await dbService.saveDocument(newDoc);
    await loadDocuments();
    setActiveDocId(newDoc.id);
    setShowScratchpad(false);
  };

  // Exam date setter
  const handleSetExamDate = async (date: number | null) => {
    if (!activeNotebook) return;
    const updated: Notebook = { ...activeNotebook, examDate: date ?? undefined };
    setNotebooks((prev) => prev.map((nb) => nb.id === updated.id ? updated : nb));
    await dbService.saveNotebook(updated);
  };

  // Notebook export
  const handleExportNotebook = async () => {
    if (!activeNotebook) return;
    setIsExporting(true);
    try {
      await exportNotebook(activeNotebook, documents, hasApiKey);
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  // Study plan generation
  const handleGenerateStudyPlan = async () => {
    if (!activeNotebook?.examDate || documents.length === 0) return;
    setIsGeneratingPlan(true);
    try {
      const docs = documents.map((d) => ({ name: d.name, wordCount: d.content.split(/\s+/).length }));
      const plan = await geminiService.generateStudyPlan(activeNotebook.name, activeNotebook.examDate, docs);
      setStudyPlan(plan);
    } catch (err) {
      console.error(err);
      alert('Failed to generate study plan: ' + (err as Error).message);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Notebook scratchpad save
  const handleSaveNotebookNotes = async (notes: string) => {
    if (!activeNotebook) return;
    const updatedNotebook: Notebook = { ...activeNotebook, notes };
    setNotebooks((prev) => prev.map((nb) => nb.id === updatedNotebook.id ? updatedNotebook : nb));
    await dbService.saveNotebook(updatedNotebook);
  };

  // Flashcard generation action
  const handleGenerateFlashcards = async () => {
    if (!activeDoc || !activeNotebookId) return;
    setIsGeneratingFlashcards(true);
    try {
      const pairs = await geminiService.generateFlashcards(activeDoc.name, activeDoc.content);
      const now = Date.now();
      const cards: Flashcard[] = pairs.map((p, i) => ({
        id: `${activeDoc.id}_card_${i}_${now}`,
        front: p.front,
        back: p.back,
        interval: 1,
        easeFactor: 2.5,
        nextReview: now,
        reviewCount: 0,
      }));
      const deck: FlashcardDeck = {
        id: activeDoc.id,
        docId: activeDoc.id,
        notebookId: activeNotebookId,
        cards,
        createdAt: now,
        updatedAt: now,
      };
      await dbService.saveDeck(deck);
      setActiveFlashcardDeck(deck);
      setAllNotebookDecks((prev) => {
        const exists = prev.find((d) => d.id === deck.id);
        return exists ? prev.map((d) => d.id === deck.id ? deck : d) : [...prev, deck];
      });
    } catch (err) {
      console.error(err);
      alert('Failed to generate flashcards: ' + (err as Error).message);
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  // Spaced-repetition card rating (single-deck, from DocViewer)
  const handleRateCard = async (cardId: string, rating: 'easy' | 'medium' | 'hard') => {
    if (!activeFlashcardDeck) return;
    const updatedCards = activeFlashcardDeck.cards.map((c) =>
      c.id === cardId ? sm2Update(c, rating) : c
    );
    const updatedDeck: FlashcardDeck = { ...activeFlashcardDeck, cards: updatedCards, updatedAt: Date.now() };
    setActiveFlashcardDeck(updatedDeck);
    setAllNotebookDecks((prev) => prev.map((d) => d.id === updatedDeck.id ? updatedDeck : d));
    await dbService.saveDeck(updatedDeck);
  };

  // Spaced-repetition card rating (any deck, from Mixed Session)
  const handleRateAnyCard = async (cardId: string, deckId: string, rating: 'easy' | 'medium' | 'hard') => {
    const deck = allNotebookDecks.find((d) => d.id === deckId);
    if (!deck) return;
    const updatedCards = deck.cards.map((c) => c.id === cardId ? sm2Update(c, rating) : c);
    const updatedDeck: FlashcardDeck = { ...deck, cards: updatedCards, updatedAt: Date.now() };
    setAllNotebookDecks((prev) => prev.map((d) => d.id === deckId ? updatedDeck : d));
    if (activeFlashcardDeck?.id === deckId) setActiveFlashcardDeck(updatedDeck);
    await dbService.saveDeck(updatedDeck);
  };

  // Exam question generation
  const handleGenerateExam = async (
    contentDocs: Array<{ name: string; content: string }>,
    examDocs: Array<{ name: string; content: string }>,
    count: number
  ) => {
    setIsGeneratingExam(true);
    try {
      const questions = await geminiService.generateExamQuestions(contentDocs, examDocs, count);
      setExamQuestions(questions);
    } catch (err) {
      console.error(err);
      alert('Failed to generate exam questions: ' + (err as Error).message);
    } finally {
      setIsGeneratingExam(false);
    }
  };

  // Annotation save / delete
  const handleSaveAnnotation = async (annotation: import('./services/db').Annotation) => {
    if (!activeDoc) return;
    const existing = activeDoc.annotations ?? [];
    const updated = [...existing.filter(a => a.id !== annotation.id), annotation]
      .sort((a, b) => a.offset - b.offset);
    const updatedDoc: DocumentData = { ...activeDoc, annotations: updated };
    setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    await dbService.saveDocument(updatedDoc);
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    if (!activeDoc) return;
    const updated = (activeDoc.annotations ?? []).filter(a => a.id !== annotationId);
    const updatedDoc: DocumentData = { ...activeDoc, annotations: updated };
    setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    await dbService.saveDocument(updatedDoc);
  };

  // Reference sheet extraction
  const handleGenerateReference = async () => {
    if (!activeDoc) return;
    setIsGeneratingReference(true);
    try {
      const data = await geminiService.extractReferenceSheet(activeDoc.name, activeDoc.content);
      const updatedDoc: DocumentData = { ...activeDoc, referenceSheet: data };
      await dbService.saveDocument(updatedDoc);
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to extract reference sheet: ' + (err as Error).message);
    } finally {
      setIsGeneratingReference(false);
    }
  };

  // Mind map generation action
  const handleGenerateMindMap = async () => {
    if (!activeDoc) return;
    setIsGeneratingMindMap(true);
    try {
      const mindmap = await geminiService.generateMindMap(activeDoc.name, activeDoc.content);
      const updatedDoc: DocumentData = { ...activeDoc, mindmap, reviewed: true };
      await dbService.saveDocument(updatedDoc);
      await loadDocuments();
    } catch (err) {
      console.error(err);
      alert('Failed to generate concept map: ' + (err as Error).message);
    } finally {
      setIsGeneratingMindMap(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={() => {/* auth state change fires automatically */}} />;
  }

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
          isScratchpadOpen={showScratchpad}
          onOpenScratchpad={() => { setShowScratchpad(true); setShowStudyPlanner(false); setActiveDocId(null); }}
          isStudyPlannerOpen={showStudyPlanner}
          onOpenStudyPlanner={() => { setShowStudyPlanner(true); setShowScratchpad(false); setShowMixedSession(false); setActiveDocId(null); }}
          isMixedSessionOpen={showMixedSession}
          onOpenMixedSession={() => { setShowMixedSession(true); setShowStudyPlanner(false); setShowScratchpad(false); setActiveDocId(null); }}
          userEmail={user.email ?? ''}
          onSignOut={handleSignOut}
        />

        {/* Workspace Central Canvas */}
        <div className="workspace-container">
          {showMixedSession && activeNotebook ? (
            <MixedSession
              key={activeNotebook.id}
              notebookName={activeNotebook.name}
              allDecks={allNotebookDecks}
              documents={documents}
              geminiApiKeyExists={hasApiKey}
              onRateCard={handleRateAnyCard}
            />
          ) : showStudyPlanner && activeNotebook ? (
            <StudyPlanner
              key={activeNotebook.id}
              notebook={activeNotebook}
              documents={documents}
              geminiApiKeyExists={hasApiKey}
              onSetExamDate={handleSetExamDate}
              onGeneratePlan={handleGenerateStudyPlan}
              isGeneratingPlan={isGeneratingPlan}
              studyPlan={studyPlan}
              onOpenSettings={() => setShowSettings(true)}
              onExport={handleExportNotebook}
              isExporting={isExporting}
            />
          ) : showScratchpad && activeNotebook ? (
            <NotebookScratchpad
              notebook={activeNotebook}
              onSave={handleSaveNotebookNotes}
              onSaveAsDocument={handleSaveNotesAsDocument}
            />
          ) : (
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
            flashcardDeck={activeFlashcardDeck}
            isGeneratingFlashcards={isGeneratingFlashcards}
            onGenerateFlashcards={handleGenerateFlashcards}
            onRateCard={handleRateCard}
            referenceSheet={activeDoc?.referenceSheet ?? null}
            isGeneratingReference={isGeneratingReference}
            onGenerateReference={handleGenerateReference}
            allDocs={documents}
            examQuestions={examQuestions}
            isGeneratingExam={isGeneratingExam}
            onGenerateExam={handleGenerateExam}
            onOpenSettings={() => setShowSettings(true)}
            scrollProgress={activeDoc?.scrollProgress}
            onScrollProgress={handleScrollProgress}
            onExplainSelection={handleExplainSelection}
            onAddSelectionToFlashcard={handleAddSelectionToFlashcard}
            selectionToast={selectionToast}
            onSaveAnnotation={handleSaveAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            isFormattingDoc={isFormattingDoc}
            onFormatDocument={handleFormatDocument}
            formatError={formatError}
          />
          )}
        </div>

        {/* AI Sidepanel Right (visible if notebook exists) */}
        {activeNotebook && (
          <AICopilot
            notebookName={activeNotebook.name}
            activeDoc={activeDoc}
            allDocs={documents}
            geminiApiKeyExists={hasApiKey}
            onOpenSettings={() => setShowSettings(true)}
            notebookNotes={activeNotebook.notes}
            collapsed={copilotCollapsed}
            onToggle={() => setCopilotCollapsed((v) => !v)}
            externalMessage={externalCopilotMessage}
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
