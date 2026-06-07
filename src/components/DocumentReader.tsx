import React, { useRef, useState, useEffect } from 'react';
import {
  Sparkles, HelpCircle, Zap, Languages, Plus, Trash2, X, Edit2, Highlighter, Loader2
} from 'lucide-react';
import { type DocumentData, type Annotation } from '../services/db';
import { MarkdownRenderer } from './DocViewer';

// ─── Annotation colour palette ────────────────────────────────────────────────

type ColorKey = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

const COLORS: Record<ColorKey, { bg: string; border: string; chip: string; label: string }> = {
  yellow: { bg: 'rgba(253,224,71,0.35)',  border: '#fde047', chip: '#fbbf24', label: 'Yellow' },
  green:  { bg: 'rgba(74,222,128,0.3)',   border: '#4ade80', chip: '#34d399', label: 'Green'  },
  blue:   { bg: 'rgba(96,165,250,0.3)',   border: '#60a5fa', chip: '#60a5fa', label: 'Blue'   },
  pink:   { bg: 'rgba(244,114,182,0.3)',  border: '#f472b6', chip: '#f472b6', label: 'Pink'   },
  orange: { bg: 'rgba(251,146,60,0.3)',   border: '#fb923c', chip: '#fb923c', label: 'Orange' },
};

const COLOR_KEYS: ColorKey[] = ['yellow', 'green', 'blue', 'pink', 'orange'];

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function getSelectionCharOffset(
  container: HTMLElement
): { offset: number; length: number; text: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const text = range.toString();
  if (!text.trim() || text.length < 3) return null;
  if (!container.contains(range.startContainer)) return null;

  const measureRange = document.createRange();
  measureRange.selectNodeContents(container);
  measureRange.setEnd(range.startContainer, range.startOffset);
  const offset = measureRange.toString().length;
  return { offset, length: text.length, text };
}

// ─── Annotated text renderer ──────────────────────────────────────────────────

function renderAnnotatedText(
  content: string,
  annotations: Annotation[],
  onClickAnnotation: (ann: Annotation, e: React.MouseEvent) => void
): React.ReactNode[] {
  const sorted = [...annotations]
    .sort((a, b) => a.offset - b.offset)
    .reduce<Annotation[]>((acc, ann) => {
      const last = acc[acc.length - 1];
      if (last && ann.offset < last.offset + last.length) return acc;
      return [...acc, ann];
    }, []);

  const nodes: React.ReactNode[] = [];
  let pos = 0;

  for (const ann of sorted) {
    if (ann.offset > pos) nodes.push(content.slice(pos, ann.offset));
    const c = COLORS[ann.color];
    nodes.push(
      <mark
        key={ann.id}
        onClick={(e) => onClickAnnotation(ann, e)}
        style={{
          background: c.bg,
          borderBottom: `2px solid ${c.border}`,
          cursor: 'pointer',
          borderRadius: '2px',
          padding: '1px 0',
        }}
      >
        {content.slice(ann.offset, ann.offset + ann.length)}
      </mark>
    );
    pos = ann.offset + ann.length;
  }

  if (pos < content.length) nodes.push(content.slice(pos));
  return nodes;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocumentReaderProps {
  doc: DocumentData;
  summaryText: string | null;
  isGeneratingSummary: boolean;
  onGenerateSummary: () => void;
  geminiApiKeyExists: boolean;
  scrollProgress?: number;
  onScrollProgress: (progress: number) => void;
  onExplainSelection: (action: 'explain' | 'simplify' | 'translate', text: string) => void;
  onAddSelectionToFlashcard: (text: string) => void;
  selectionToast: string | null;
  onSaveAnnotation: (annotation: Annotation) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  isFormattingDoc: boolean;
  onFormatDocument: () => void;
  formatError: string | null;
}

export const DocumentReader: React.FC<DocumentReaderProps> = ({
  doc, summaryText, isGeneratingSummary, onGenerateSummary,
  geminiApiKeyExists, onScrollProgress,
  onExplainSelection, onAddSelectionToFlashcard, selectionToast,
  onSaveAnnotation, onDeleteAnnotation,
  isFormattingDoc, onFormatDocument, formatError,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef  = useRef<HTMLDivElement>(null);

  // Start in formatted view if content exists, otherwise raw
  const [showRaw, setShowRaw] = useState(!doc.formattedContent);

  // Auto-switch to formatted view when it first becomes available
  useEffect(() => {
    if (doc.formattedContent) setShowRaw(false);
  }, [!!doc.formattedContent]);

  // Selection popup (explain / flashcard / annotate)
  const [popup, setPopup] = useState<{
    x: number; y: number; text: string; offset: number; length: number;
  } | null>(null);

  // Annotation creation form
  const [annForm, setAnnForm] = useState<{
    x: number; y: number; text: string; offset: number; length: number;
  } | null>(null);
  const [annColor, setAnnColor] = useState<ColorKey>('yellow');
  const [annNote,  setAnnNote]  = useState('');

  // Annotation view / edit popup
  const [viewAnn,     setViewAnn]     = useState<{ ann: Annotation; x: number; y: number } | null>(null);
  const [editingNote, setEditingNote] = useState('');
  const [isEditing,   setIsEditing]   = useState(false);

  // Close view popup on outside click
  useEffect(() => {
    if (!viewAnn) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ann-view-popup')) {
        setViewAnn(null);
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [viewAnn]);

  // Dismiss selection popup when selection is cleared
  useEffect(() => {
    const handler = () => {
      if (!window.getSelection()?.toString().trim()) setPopup(null);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) onScrollProgress(Math.round((el.scrollTop / max) * 100));
  };

  const handleMouseUp = () => {
    if (annForm || !showRaw) return; // annotation form open, or in formatted view
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || text.length < 3 || !sel?.rangeCount) { setPopup(null); return; }
    if (!textRef.current) return;
    const selInfo = getSelectionCharOffset(textRef.current);
    if (!selInfo) { setPopup(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setPopup({ x: rect.left + rect.width / 2, y: rect.top, ...selInfo });
  };

  const openAnnotationForm = () => {
    if (!popup) return;
    setAnnForm({ ...popup });
    setAnnColor('yellow');
    setAnnNote('');
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveAnnotation = () => {
    if (!annForm) return;
    onSaveAnnotation({
      id: crypto.randomUUID(),
      text:      annForm.text,
      note:      annNote.trim(),
      color:     annColor,
      offset:    annForm.offset,
      length:    annForm.length,
      createdAt: Date.now(),
    });
    setAnnForm(null);
    setAnnNote('');
  };

  const handleClickHighlight = (ann: Annotation, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditingNote(ann.note);
    setViewAnn({ ann, x: e.clientX, y: e.clientY });
  };

  const handleClickFlag = (ann: Annotation) => {
    setShowRaw(true); // switch to raw view so offsets match
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop =
          (ann.offset / Math.max(1, doc.content.length)) * scrollRef.current.scrollHeight;
      }
    }, 60);
    setIsEditing(false);
    setEditingNote(ann.note);
    setViewAnn({ ann, x: window.innerWidth / 2 - 150, y: 160 });
  };

  const saveEdit = () => {
    if (!viewAnn) return;
    const updated: Annotation = { ...viewAnn.ann, note: editingNote.trim() };
    onSaveAnnotation(updated);
    setViewAnn({ ...viewAnn, ann: updated });
    setIsEditing(false);
  };

  const annotations = doc.annotations ?? [];

  // Clamp a fixed popup so it stays within the viewport
  const clampPopupX = (x: number, w = 300) =>
    Math.min(Math.max(x - w / 2, 8), window.innerWidth - w - 8);
  const clampPopupY = (y: number, h = 200) =>
    Math.min(Math.max(y, 8), window.innerHeight - h - 8);

  return (
    <div style={{ flex: 1, display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Left column: text + margin strip ─────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        borderRight: summaryText ? '1px solid var(--border-color)' : 'none',
        overflow: 'hidden',
      }}>
        {/* Sub-header */}
        <div style={{
          padding: '10px 24px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.01)', flexShrink: 0, gap: '12px',
        }}>
          {/* Left: title + formatting controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
              Source
            </span>

            {/* Formatting in progress */}
            {isFormattingDoc && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#a78bfa' }}>
                <Loader2 size={12} className="animate-spin" /> Improving readability…
              </span>
            )}

            {/* View toggle — visible once formatted content exists */}
            {doc.formattedContent && !isFormattingDoc && (
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px', gap: '1px', flexShrink: 0 }}>
                {[{ key: false, label: '✨ Formatted' }, { key: true, label: 'Raw' }].map(({ key, label }) => (
                  <button
                    key={String(key)}
                    onClick={() => setShowRaw(key)}
                    style={{
                      padding: '3px 10px', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 600,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: showRaw === key ? 'var(--bg-secondary)' : 'transparent',
                      color: showRaw === key ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Manual trigger — shown when no formatted content yet */}
            {!doc.formattedContent && !isFormattingDoc && geminiApiKeyExists && (
              <button onClick={() => onFormatDocument()} className="btn-secondary"
                style={{ padding: '3px 10px', fontSize: '0.73rem', display: 'flex', gap: '5px', alignItems: 'center', flexShrink: 0 }}>
                <Sparkles size={11} /> {formatError ? 'Retry Formatting' : 'Improve Readability'}
              </button>
            )}

            {/* Formatting error message */}
            {formatError && !isFormattingDoc && (
              <span title={formatError} style={{ fontSize: '0.72rem', color: '#f87171', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
                ⚠ {formatError}
              </span>
            )}

            {/* Annotation count badge */}
            {annotations.length > 0 && showRaw && (
              <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: '8px', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontWeight: 700, flexShrink: 0 }}>
                {annotations.length} note{annotations.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Right: summarise button */}
          {!summaryText && (
            <button
              onClick={onGenerateSummary}
              disabled={isGeneratingSummary || !geminiApiKeyExists}
              className="btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', flexShrink: 0 }}
            >
              {isGeneratingSummary
                ? <><Sparkles size={14} style={{ marginRight: 6 }} />Summarising…</>
                : <><Sparkles size={14} style={{ marginRight: 6 }} />Summarise</>}
            </button>
          )}
        </div>

        {/* Text row: scrollable content + margin strip */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

          {/* Scrollable text */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onMouseUp={handleMouseUp}
            style={{ flex: 1, overflowY: 'auto', padding: showRaw ? '30px 16px 30px 40px' : '28px 36px 32px' }}
          >
            {doc.formattedContent && !showRaw ? (
              /* ── Formatted Markdown view ── */
              <MarkdownRenderer content={doc.formattedContent} />
            ) : (
              /* ── Raw annotatable text ── */
              <div ref={textRef}>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', wordBreak: 'break-word', lineHeight: 1.8, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                  {renderAnnotatedText(doc.content, annotations, handleClickHighlight)}
                </pre>
              </div>
            )}
          </div>

          {/* Margin flag strip — only in raw view (offsets are relative to raw content) */}
          <div style={{
            width: showRaw ? '44px' : '0px', flexShrink: 0,
            position: 'relative',
            borderLeft: showRaw ? '1px solid var(--border-color)' : 'none',
            background: 'rgba(0,0,0,0.06)',
            overflow: 'hidden',
            transition: 'width 0.2s ease',
          }}>
            {annotations.map((ann) => {
              const topPct = (ann.offset / Math.max(1, doc.content.length)) * 100;
              const c = COLORS[ann.color];
              return (
                <div
                  key={ann.id}
                  onClick={() => handleClickFlag(ann)}
                  title={ann.note || ann.text.slice(0, 50)}
                  style={{
                    position: 'absolute',
                    left: '5px',
                    top: `${topPct}%`,
                    transform: 'translateY(-50%)',
                    width: '30px',
                    height: '10px',
                    background: c.chip,
                    borderRadius: '3px 3px 3px 0',
                    cursor: 'pointer',
                    opacity: 0.85,
                    transition: 'opacity 0.15s, width 0.15s',
                    boxShadow: `0 1px 4px ${c.chip}55`,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.width = '36px';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.opacity = '0.85';
                    e.currentTarget.style.width = '30px';
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right: AI summary panel ───────────────────────────────────────── */}
      {summaryText && (
        <div className="animate-slide-right" style={{ width: '45%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'rgba(15,19,34,0.3)' }}>
          <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Summary</span>
            <button onClick={onGenerateSummary} disabled={isGeneratingSummary} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={12} /> Regenerate
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '30px' }}>
            <MarkdownRenderer content={summaryText} />
          </div>
        </div>
      )}

      {/* ── Selection popup ───────────────────────────────────────────────── */}
      {popup && (
        <div
          style={{
            position: 'fixed',
            left: popup.x, top: popup.y - 10,
            transform: 'translate(-50%, -100%)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '3px',
            padding: '5px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-active)',
            borderRadius: '10px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(10px)',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {([
            { action: 'explain',   label: 'Explain',   icon: <HelpCircle size={12} /> },
            { action: 'simplify',  label: 'Simplify',  icon: <Zap size={12} /> },
            { action: 'translate', label: 'Translate', icon: <Languages size={12} /> },
          ] as const).map(({ action, label, icon }) => (
            <button key={action} className="btn-secondary"
              style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center' }}
              onClick={() => { onExplainSelection(action, popup.text); setPopup(null); }}>
              {icon}{label}
            </button>
          ))}
          <div style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border-color)', margin: '2px 1px' }} />
          <button className="btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center', color: '#a78bfa' }}
            onClick={() => { onAddSelectionToFlashcard(popup.text); setPopup(null); }}>
            <Plus size={12} />Flashcard
          </button>
          {/* Annotate — only available in raw text view */}
          {showRaw && (
            <>
              <div style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border-color)', margin: '2px 1px' }} />
              <button className="btn-secondary"
                style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center', color: '#fbbf24' }}
                onClick={openAnnotationForm}>
                <Highlighter size={12} />Annotate
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Annotation creation form ──────────────────────────────────────── */}
      {annForm && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: clampPopupX(annForm.x, 300),
            top: clampPopupY(annForm.y + 14, 220),
            zIndex: 1001,
            width: '300px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-active)',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
            overflow: 'hidden',
          }}
        >
          {/* Colour bar */}
          <div style={{ height: '4px', background: COLORS[annColor].chip }} />
          <div style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              Add Annotation
            </p>
            {/* Highlighted excerpt */}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '10px', lineHeight: 1.4, background: COLORS[annColor].bg, padding: '5px 8px', borderRadius: '5px', borderLeft: `3px solid ${COLORS[annColor].chip}` }}>
              "{annForm.text.length > 80 ? annForm.text.slice(0, 80) + '…' : annForm.text}"
            </p>

            {/* Color chips */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {COLOR_KEYS.map(key => (
                <button
                  key={key}
                  onClick={() => setAnnColor(key)}
                  title={COLORS[key].label}
                  style={{
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: COLORS[key].chip,
                    border: annColor === key ? `3px solid white` : '3px solid transparent',
                    outline: annColor === key ? `2px solid ${COLORS[key].chip}` : 'none',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>

            {/* Note textarea */}
            <textarea
              value={annNote}
              onChange={e => setAnnNote(e.target.value)}
              placeholder="Add a note… (optional)"
              rows={3}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveAnnotation(); }}
              style={{ resize: 'none', width: '100%', fontSize: '0.85rem', marginBottom: '10px' }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={() => { setAnnForm(null); setAnnNote(''); }}>
                Cancel
              </button>
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem', background: COLORS[annColor].chip, boxShadow: 'none' }}
                onClick={saveAnnotation}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Annotation view / edit popup ──────────────────────────────────── */}
      {viewAnn && (
        <div
          className="ann-view-popup"
          style={{
            position: 'fixed',
            left: clampPopupX(viewAnn.x, 320),
            top: clampPopupY(viewAnn.y, 240),
            zIndex: 1001,
            width: '320px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-active)',
            borderRadius: '12px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(12px)',
            overflow: 'hidden',
          }}
        >
          {/* Colour bar */}
          <div style={{ height: '4px', background: COLORS[viewAnn.ann.color].chip }} />
          <div style={{ padding: '14px 16px' }}>
            {/* Excerpt */}
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4, marginBottom: '10px', background: COLORS[viewAnn.ann.color].bg, padding: '5px 8px', borderRadius: '5px', borderLeft: `3px solid ${COLORS[viewAnn.ann.color].chip}` }}>
              "{viewAnn.ann.text.length > 90 ? viewAnn.ann.text.slice(0, 90) + '…' : viewAnn.ann.text}"
            </p>

            {/* Note */}
            {isEditing ? (
              <textarea
                value={editingNote}
                onChange={e => setEditingNote(e.target.value)}
                rows={3}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(); }}
                style={{ resize: 'none', width: '100%', fontSize: '0.88rem', marginBottom: '10px' }}
              />
            ) : (
              <p style={{ fontSize: '0.88rem', color: viewAnn.ann.note ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: viewAnn.ann.note ? 'normal' : 'italic', lineHeight: 1.6, marginBottom: '10px', minHeight: '24px' }}>
                {viewAnn.ann.note || 'No note added'}
              </p>
            )}

            {/* Timestamp */}
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              {new Date(viewAnn.ann.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {isEditing ? (
                <>
                  <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.78rem', flex: 1 }}
                    onClick={() => setIsEditing(false)}>Cancel</button>
                  <button className="btn-primary" style={{ padding: '5px 12px', fontSize: '0.78rem', flex: 1 }}
                    onClick={saveEdit}>Save</button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center', flex: 1, justifyContent: 'center' }}
                    onClick={() => { setIsEditing(true); setEditingNote(viewAnn.ann.note); }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'flex', gap: '5px', alignItems: 'center', flex: 1, justifyContent: 'center', color: 'var(--error)' }}
                    onClick={() => { onDeleteAnnotation(viewAnn.ann.id); setViewAnn(null); }}>
                    <Trash2 size={12} /> Delete
                  </button>
                  <button className="btn-icon" style={{ width: '28px', height: '28px', flexShrink: 0 }}
                    onClick={() => setViewAnn(null)}>
                    <X size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Flashcard-added toast */}
      {selectionToast && (
        <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: '8px', padding: '8px 18px', fontSize: '0.85rem', fontWeight: 600, zIndex: 1001, pointerEvents: 'none', backdropFilter: 'blur(8px)' }}>
          {selectionToast}
        </div>
      )}
    </div>
  );
};