import React, { useRef, useState, useEffect } from 'react';
import { FileText, BrainCircuit, Sparkles, BookOpen, Loader2, Layers, BookMarked, HelpCircle, Zap, Languages, Plus } from 'lucide-react';
import { type DocumentData, type FlashcardDeck, type ReferenceSheetData } from '../services/db';
import { MindMap } from './MindMap';
import { FlashcardView } from './FlashcardView';
import { ReferenceSheet } from './ReferenceSheet';

interface DocViewerProps {
  activeDoc: DocumentData | null;
  activeTab: 'reader' | 'mindmap' | 'flashcards' | 'reference';
  setActiveTab: (tab: 'reader' | 'mindmap' | 'flashcards' | 'reference') => void;
  onGenerateSummary: () => void;
  onGenerateMindMap: () => void;
  isGeneratingSummary: boolean;
  summaryText: string | null;
  isGeneratingMindMap: boolean;
  mindMapCode: string | null;
  geminiApiKeyExists: boolean;
  flashcardDeck: FlashcardDeck | null;
  isGeneratingFlashcards: boolean;
  onGenerateFlashcards: () => void;
  onRateCard: (cardId: string, rating: 'easy' | 'medium' | 'hard') => void;
  referenceSheet: ReferenceSheetData | null;
  isGeneratingReference: boolean;
  onGenerateReference: () => void;
  scrollProgress?: number;
  onScrollProgress: (progress: number) => void;
  onExplainSelection: (action: 'explain' | 'simplify' | 'translate', text: string) => void;
  onAddSelectionToFlashcard: (text: string) => void;
  selectionToast: string | null;
}

// Simple custom Markdown parser/renderer to display AI responses and formatted text neatly
export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  const lines = content.split('\n');

  return (
    <div className="markdown-body" style={{ lineHeight: '1.7', fontSize: '0.98rem', color: 'var(--text-primary)' }}>
      {lines.map((line, idx) => {
        // Headers
        if (line.startsWith('# ')) {
          return <h1 key={idx} style={{ margin: '24px 0 12px 0', fontSize: '1.6rem', fontWeight: 800, color: '#fff', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>{line.slice(2)}</h1>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} style={{ margin: '20px 0 10px 0', fontSize: '1.35rem', fontWeight: 700, color: '#fff' }}>{line.slice(3)}</h2>;
        }
        if (line.startsWith('### ')) {
          return <h3 key={idx} style={{ margin: '16px 0 8px 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>{line.slice(4)}</h3>;
        }

        // Horizontal Rule
        if (line === '---') {
          return <hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />;
        }

        // Bullet Lists
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const listText = line.trim().substring(2);
          // Inline bold parsing
          const formattedText = parseInlineMarkdown(listText);
          return (
            <li key={idx} style={{ marginLeft: '20px', marginBottom: '6px', listStyleType: 'disc' }}>
              {formattedText}
            </li>
          );
        }

        // Details toggle parser
        if (line.startsWith('<details>')) return null;
        if (line.startsWith('</details>')) return null;
        if (line.startsWith('<summary>')) {
          const summaryText = line.replace('<summary>', '').replace('</summary>', '');
          return <summary key={idx} style={{ fontWeight: 600, color: 'var(--accent-primary)', cursor: 'pointer', margin: '4px 0' }}>{summaryText}</summary>;
        }

        // Bold text inline matching helper
        const formattedLine = parseInlineMarkdown(line);
        
        if (line.trim() === '') {
          return <div key={idx} style={{ height: '12px' }} />;
        }

        return <p key={idx} style={{ marginBottom: '12px' }}>{formattedLine}</p>;
      })}
    </div>
  );
};

// Simple helper to parse **bold** text to HTML elements
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#fff', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    // Simple parsing for details wrapper clues
    return part;
  });
}

export const DocViewer: React.FC<DocViewerProps> = ({
  activeDoc,
  activeTab,
  setActiveTab,
  onGenerateSummary,
  onGenerateMindMap,
  isGeneratingSummary,
  summaryText,
  isGeneratingMindMap,
  mindMapCode,
  geminiApiKeyExists,
  flashcardDeck,
  isGeneratingFlashcards,
  onGenerateFlashcards,
  onRateCard,
  referenceSheet,
  isGeneratingReference,
  onGenerateReference,
  scrollProgress,
  onScrollProgress,
  onExplainSelection,
  onAddSelectionToFlashcard,
  selectionToast,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ x: number; y: number; text: string } | null>(null);

  // Dismiss popup when selection is cleared
  useEffect(() => {
    const onSelectionChange = () => {
      if (!window.getSelection()?.toString().trim()) setPopup(null);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || text.length < 3 || !selection?.rangeCount) { setPopup(null); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    setPopup({ x: rect.left + rect.width / 2, y: rect.top, text });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    onScrollProgress(Math.round((el.scrollTop / max) * 100));
  };
  if (!activeDoc) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
        <div className="glass-card" style={{ maxWidth: '480px', padding: '36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '16px', borderRadius: '50%', backgroundColor: 'rgba(139, 92, 246, 0.08)', color: 'var(--accent-primary)' }}>
            <BookOpen size={48} />
          </div>
          <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>Welcome to your Study Hub</h2>
          <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
            Select a document or copy-pasted note from the sidebar. You can read, view summaries, or visualize complex relationships as a dynamic interactive mind map using Google Gemini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      {/* Workspace Header / Navigation Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
            {activeDoc.name}
          </span>
          {activeTab === 'reader' && (scrollProgress ?? 0) > 0 && (
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: scrollProgress === 100 ? '#10b981' : 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px 7px', flexShrink: 0 }}>
              {scrollProgress === 100 ? '✓ 100% read' : `${scrollProgress}% read`}
            </span>
          )}
        </div>

        {/* Tab Controls */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '3px', borderRadius: '8px' }}>
          {(['reader', 'mindmap', 'flashcards', 'reference'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s',
                backgroundColor: activeTab === tab ? 'var(--bg-secondary)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {tab === 'reader' && 'Reader'}
              {tab === 'mindmap' && 'Concept Map'}
              {tab === 'flashcards' && (
                <>
                  <Layers size={13} />
                  Flashcards
                  {flashcardDeck && flashcardDeck.cards.length > 0 && (
                    <span style={{ background: 'var(--accent-gradient)', color: '#fff', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', lineHeight: '1.4' }}>
                      {flashcardDeck.cards.length}
                    </span>
                  )}
                </>
              )}
              {tab === 'reference' && (
                <>
                  <BookMarked size={13} />
                  Reference
                  {referenceSheet && (referenceSheet.terms.length + referenceSheet.formulas.length) > 0 && (
                    <span style={{ background: 'rgba(139,92,246,0.25)', color: '#a78bfa', fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', lineHeight: '1.4' }}>
                      {referenceSheet.terms.length + referenceSheet.formulas.length}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Reading progress bar — spans full width below header */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
        {activeTab === 'reader' && (scrollProgress ?? 0) > 0 && (
          <div style={{ height: '100%', width: `${scrollProgress}%`, background: scrollProgress === 100 ? '#10b981' : 'var(--accent-gradient, linear-gradient(90deg,#8b5cf6,#6366f1))', borderRadius: '0 2px 2px 0', transition: 'width 0.4s ease' }} />
        )}
      </div>

      {/* Main Panel Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'reference' ? (
          <ReferenceSheet
            referenceSheet={referenceSheet}
            isGenerating={isGeneratingReference}
            geminiApiKeyExists={geminiApiKeyExists}
            docName={activeDoc.name}
            onGenerate={onGenerateReference}
          />
        ) : activeTab === 'flashcards' ? (
          <FlashcardView
            deck={flashcardDeck}
            isGenerating={isGeneratingFlashcards}
            geminiApiKeyExists={geminiApiKeyExists}
            onGenerate={onGenerateFlashcards}
            onRateCard={onRateCard}
          />
        ) : activeTab === 'reader' ? (
          <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Split Screen: Left (Source Text), Right (Summary if generated) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: summaryText ? '1px solid var(--border-color)' : 'none', overflow: 'hidden' }}>
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source Document</span>
                {!summaryText && (
                  <button 
                    onClick={onGenerateSummary} 
                    disabled={isGeneratingSummary || !geminiApiKeyExists}
                    className="btn-primary" 
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    {isGeneratingSummary ? (
                      <>
                        <Loader2 className="animate-spin" size={14} style={{ marginRight: '6px' }} />
                        Summarizing...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} style={{ marginRight: '6px' }} />
                        Summarize Document
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Scrollable Document Text */}
              <div ref={scrollRef} onScroll={handleScroll} onMouseUp={handleMouseUp} style={{ flex: 1, overflowY: 'auto', padding: '30px 40px', lineHeight: '1.8', fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', wordBreak: 'break-word' }}>
                  {activeDoc.content}
                </pre>
              </div>
            </div>

            {/* Split: Right - AI Summary Panel */}
            {summaryText && (
              <div className="animate-slide-right" style={{ width: '45%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'rgba(15,19,34,0.3)' }}>
                <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Summary</span>
                  <button 
                    onClick={onGenerateSummary}
                    disabled={isGeneratingSummary}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Sparkles size={12} /> Regenerate
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '30px' }}>
                  <MarkdownRenderer content={summaryText} />
                </div>
              </div>
            )}

            {/* In-Progress Loading overlay for summary */}
            {isGeneratingSummary && !summaryText && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(8,10,16,0.7)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', zIndex: 5 }}>
                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Gemini is reading and structuring the file...</span>
              </div>
            )}

            {/* Selection popup */}
            {popup && (
              <div
                style={{ position: 'fixed', left: popup.x, top: popup.y - 10, transform: 'translate(-50%, -100%)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '3px', padding: '5px', background: 'var(--bg-primary)', border: '1px solid var(--border-active)', borderRadius: '10px', boxShadow: '0 8px 28px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)' }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {([
                  { action: 'explain',   label: 'Explain',   icon: <HelpCircle size={12} /> },
                  { action: 'simplify',  label: 'Simplify',  icon: <Zap size={12} /> },
                  { action: 'translate', label: 'Translate', icon: <Languages size={12} /> },
                ] as const).map(({ action, label, icon }) => (
                  <button
                    key={action}
                    className="btn-secondary"
                    style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center' }}
                    onClick={() => { onExplainSelection(action, popup.text); setPopup(null); }}
                  >
                    {icon}{label}
                  </button>
                ))}
                <div style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border-color)', margin: '2px 1px' }} />
                <button
                  className="btn-secondary"
                  style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center', color: '#a78bfa' }}
                  onClick={() => { onAddSelectionToFlashcard(popup.text); setPopup(null); }}
                >
                  <Plus size={12} />Flashcard
                </button>
              </div>
            )}

            {/* Flashcard-added toast */}
            {selectionToast && (
              <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: '8px', padding: '8px 18px', fontSize: '0.85rem', fontWeight: 600, zIndex: 1001, pointerEvents: 'none', backdropFilter: 'blur(8px)' }}>
                {selectionToast}
              </div>
            )}
          </div>
        ) : (
          /* Mind Map Visualizer */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
            {!mindMapCode && !isGeneratingMindMap ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <BrainCircuit size={48} style={{ color: 'var(--accent-primary)', marginBottom: '16px', opacity: 0.8 }} />
                <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '1.25rem' }}>Visualize Concept Relationships</h3>
                <p style={{ maxWidth: '400px', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.5' }}>
                  Let Gemini create a clean, connected diagram of all key formulas, terms, and structural details inside this file.
                </p>
                <button 
                  onClick={onGenerateMindMap}
                  disabled={!geminiApiKeyExists}
                  className="btn-primary"
                >
                  <Sparkles size={16} /> Generate Concept Map
                </button>
              </div>
            ) : isGeneratingMindMap ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Gemini is designing your conceptual roadmap...</span>
              </div>
            ) : (
              <MindMap 
                code={mindMapCode || ''} 
                onRegenerate={onGenerateMindMap}
                isGenerating={isGeneratingMindMap}
                docTitle={activeDoc.name}
              />
            )}
          </div>
        )}
      </div>
      <style>{`
        .animate-spin {
          animation: spin 1.2s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
