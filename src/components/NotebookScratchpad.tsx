import React, { useState, useEffect, useRef } from 'react';
import { PenLine, CheckCircle, FilePlus } from 'lucide-react';
import { type Notebook } from '../services/db';
import { MarkdownRenderer } from './DocViewer';

interface NotebookScratchpadProps {
  notebook: Notebook;
  onSave: (notes: string) => void;
  onSaveAsDocument: (content: string) => void;
}

export const NotebookScratchpad: React.FC<NotebookScratchpadProps> = ({ notebook, onSave, onSaveAsDocument }) => {
  const [content, setContent] = useState(notebook.notes ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const isFirstRender = useRef(true);

  // Reset content when switching to a different notebook
  useEffect(() => {
    setContent(notebook.notes ?? '');
    isFirstRender.current = true;
  }, [notebook.id]);

  // Debounced auto-save
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onSave(content);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 600);
    return () => clearTimeout(timer);
  }, [content]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PenLine size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {notebook.name} — Notes
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saveStatus === 'saved' && (
            <span className="animate-fade" style={{ fontSize: '0.78rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={13} /> Saved
            </span>
          )}
          <button
            onClick={() => onSaveAsDocument(content)}
            disabled={!content.trim()}
            className="btn-secondary"
            style={{ padding: '5px 12px', fontSize: '0.78rem', gap: '6px' }}
            title="Save a snapshot of these notes as a document in Sources"
          >
            <FilePlus size={13} />
            Add to Sources
          </button>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-primary)', backgroundColor: 'rgba(139,92,246,0.1)', padding: '3px 9px', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.2)' }}>
            Read by AI
          </span>
        </div>
      </div>

      {/* Split view: Editor | Preview */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — Markdown textarea */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.01)', flexShrink: 0 }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Editor</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`# ${notebook.name}\n\nStart writing your study notes here...\n\nMarkdown is supported:\n- **bold**, _italic_, # headings\n- - bullet lists\n- \`code\`, > blockquotes`}
            spellCheck={false}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '28px 36px',
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '0.9rem',
              lineHeight: '1.75',
              color: 'var(--text-primary)',
              overflowY: 'auto',
            }}
          />
        </div>

        {/* Right — Live preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'rgba(15,19,34,0.35)' }}>
          <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.01)', flexShrink: 0 }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
            {content.trim() ? (
              <MarkdownRenderer content={content} />
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', lineHeight: 1.6 }}>
                Your rendered notes will appear here as you type...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};