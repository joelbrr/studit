import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FolderPlus,
  Folder,
  FileText,
  Trash2,
  Settings,
  Upload,
  Plus,
  ChevronRight,
  BookOpen,
  Search,
  X,
  Loader2,
  PenLine,
  Hash,
  ChevronLeft,
  CalendarDays,
  GraduationCap
} from 'lucide-react';
import { dbService, type Notebook, type DocumentData } from '../services/db';
import { extractTextFromPdf } from '../services/pdfParser';

interface SearchResult {
  doc: DocumentData;
  notebookName: string;
  snippet: string;
  matchInName: boolean;
}

function getSnippet(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 110) + '…';
  const start = Math.max(0, idx - 35);
  const end = Math.min(content.length, idx + query.length + 75);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(139,92,246,0.35)', color: '#fff', borderRadius: '2px', padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const TAG_COLORS = [
  { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)', text: '#a78bfa' },
  { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', text: '#60a5fa' },
  { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', text: '#34d399' },
  { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24' },
  { bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.4)', text: '#fb7185' },
  { bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.4)', text: '#22d3ee' },
];

function getTagColor(tag: string) {
  let hash = 0;
  for (const ch of tag) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

interface SidebarProps {
  activeNotebookId: string | null;
  setActiveNotebookId: (id: string | null) => void;
  activeDocId: string | null;
  setActiveDocId: (id: string | null) => void;
  notebooks: Notebook[];
  onRefreshNotebooks: () => void;
  documents: DocumentData[];
  onRefreshDocuments: () => void;
  onOpenSettings: () => void;
  isScratchpadOpen: boolean;
  onOpenScratchpad: () => void;
  isStudyPlannerOpen: boolean;
  onOpenStudyPlanner: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNotebookId,
  setActiveNotebookId,
  activeDocId,
  setActiveDocId,
  notebooks,
  onRefreshNotebooks,
  documents,
  onRefreshDocuments,
  onOpenSettings,
  isScratchpadOpen,
  onOpenScratchpad,
  isStudyPlannerOpen,
  onOpenStudyPlanner,
}) => {
  const [newNotebookName, setNewNotebookName] = useState('');
  const [isAddingNotebook, setIsAddingNotebook] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [editingTagsDocId, setEditingTagsDocId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tagScrollRef = useRef<HTMLDivElement>(null);

  // Debounced full-text search across all notebooks
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const allDocs = await dbService.getAllDocuments();
        const q = query.toLowerCase();
        const results: SearchResult[] = [];
        for (const doc of allDocs) {
          const nameMatch = doc.name.toLowerCase().includes(q);
          const contentMatch = doc.content.toLowerCase().includes(q);
          if (nameMatch || contentMatch) {
            const nb = notebooks.find((n) => n.id === doc.notebookId);
            results.push({
              doc,
              notebookName: nb?.name ?? 'Unknown Notebook',
              snippet: contentMatch ? getSnippet(doc.content, query) : doc.name,
              matchInName: nameMatch,
            });
          }
          if (results.length >= 20) break;
        }
        setSearchResults(results);
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, notebooks]);

  const handleSearchResultClick = (result: SearchResult) => {
    setActiveNotebookId(result.doc.notebookId);
    setActiveDocId(result.doc.id);
    setSearchQuery('');
  };

  // All unique tags across current notebook's documents
  const allTags = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((doc) => doc.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [documents]);

  // Documents filtered by active tag chips (OR logic)
  const filteredDocuments = useMemo(() => {
    if (activeTagFilters.length === 0) return documents;
    return documents.filter((doc) =>
      activeTagFilters.some((t) => doc.tags?.includes(t))
    );
  }, [documents, activeTagFilters]);

  // Clear tag filters when switching notebooks
  useEffect(() => {
    setActiveTagFilters([]);
    setEditingTagsDocId(null);
  }, [activeNotebookId]);

  const handleAddTag = async (doc: DocumentData, raw: string) => {
    const tag = raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 24);
    if (!tag || doc.tags?.includes(tag)) return;
    const updated = { ...doc, tags: [...(doc.tags ?? []), tag] };
    await dbService.saveDocument(updated);
    onRefreshDocuments();
  };

  const handleRemoveTag = async (doc: DocumentData, tag: string) => {
    const updated = { ...doc, tags: (doc.tags ?? []).filter((t) => t !== tag) };
    await dbService.saveDocument(updated);
    onRefreshDocuments();
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleCreateNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotebookName.trim()) return;

    const newNb: Notebook = {
      id: crypto.randomUUID(),
      name: newNotebookName.trim(),
      createdAt: Date.now()
    };

    try {
      await dbService.saveNotebook(newNb);
      setNewNotebookName('');
      setIsAddingNotebook(false);
      onRefreshNotebooks();
      setActiveNotebookId(newNb.id);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to create notebook.');
    }
  };

  const handleDeleteNotebook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this notebook and all its files?')) return;
    
    try {
      await dbService.deleteNotebook(id);
      if (activeNotebookId === id) {
        setActiveNotebookId(null);
        setActiveDocId(null);
      }
      onRefreshNotebooks();
      onRefreshDocuments();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to delete notebook.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeNotebookId) return;

    setIsUploading(true);
    setErrorMsg('');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = file.name.endsWith('.pdf') 
        ? 'pdf' 
        : file.name.endsWith('.md') 
          ? 'md' 
          : 'txt';
      
      try {
        let content = '';
        if (type === 'pdf') {
          content = await extractTextFromPdf(file);
        } else {
          content = await file.text();
        }

        const newDoc: DocumentData = {
          id: crypto.randomUUID(),
          notebookId: activeNotebookId,
          name: file.name,
          content: content,
          type: type as 'pdf' | 'md' | 'txt',
          createdAt: Date.now()
        };

        await dbService.saveDocument(newDoc);
      } catch (err) {
        console.error(err);
        setErrorMsg(`Failed to parse: ${file.name}`);
      }
    }

    setIsUploading(false);
    onRefreshDocuments();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim() || !activeNotebookId) return;

    const newDoc: DocumentData = {
      id: crypto.randomUUID(),
      notebookId: activeNotebookId,
      name: noteTitle.trim(),
      content: noteContent.trim(),
      type: 'txt',
      createdAt: Date.now()
    };

    try {
      await dbService.saveDocument(newDoc);
      setNoteTitle('');
      setNoteContent('');
      setIsCreatingNote(false);
      onRefreshDocuments();
      setActiveDocId(newDoc.id);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save note.');
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await dbService.deleteDocument(id);
      if (activeDocId === id) {
        setActiveDocId(null);
      }
      onRefreshDocuments();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to delete document.');
    }
  };

  return (
    <aside className="glass" style={{ width: 'var(--sidebar-width)', height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)', zIndex: 10 }}>
      {/* Sidebar Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={22} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Studit</h2>
        </div>
        <button onClick={onOpenSettings} className="btn-icon" title="Settings">
          <Settings size={18} />
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search all documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '32px', paddingRight: searchQuery ? '30px' : '10px', fontSize: '0.82rem', padding: '8px 10px 8px 32px' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="btn-icon"
              style={{ position: 'absolute', right: '2px', width: '26px', height: '26px' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {searchQuery.trim().length >= 2 ? (
        /* ── Search Results ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 16px 8px' }}>
          {isSearching ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '28px' }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            </div>
          ) : searchResults.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No results for <strong style={{ color: 'var(--text-secondary)' }}>"{searchQuery}"</strong>
            </div>
          ) : (
            <>
              <div style={{ padding: '6px 12px 2px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.map((result) => (
                <div
                  key={result.doc.id}
                  onClick={() => handleSearchResultClick(result)}
                  style={{ padding: '9px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', transition: 'background 0.15s ease' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <FileText size={12} style={{ color: result.doc.type === 'pdf' ? '#ef4444' : result.doc.type === 'md' ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.83rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      <HighlightedText text={result.doc.name} query={searchQuery.trim()} />
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '3px', paddingLeft: '18px' }}>
                    {result.notebookName}
                  </div>
                  {!result.matchInName && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45, paddingLeft: '18px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      <HighlightedText text={result.snippet} query={searchQuery.trim()} />
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <>

      {/* Notebook Section */}
      <div style={{ padding: '16px 16px 8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Notebooks</span>
        <button 
          onClick={() => setIsAddingNotebook(!isAddingNotebook)} 
          className="btn-icon" 
          style={{ width: '24px', height: '24px' }}
          title="New Notebook"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {isAddingNotebook && (
        <form onSubmit={handleCreateNotebook} style={{ padding: '0 16px 12px 16px' }} className="animate-fade">
          <input 
            type="text" 
            placeholder="Notebook Name..." 
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            style={{ fontSize: '0.85rem', marginBottom: '8px' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" className="btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem', flex: 1, justifyContent: 'center' }}>Create</button>
            <button type="button" onClick={() => setIsAddingNotebook(false)} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Notebooks List */}
      <div className="no-scrollbar" style={{ flex: '0 0 160px', overflowY: 'auto', padding: '0 8px 12px 8px', borderBottom: '1px solid var(--border-color)' }}>
        {notebooks.length === 0 ? (
          <div style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            No notebooks. Add one to start.
          </div>
        ) : (
          notebooks.map((nb) => (
            <div 
              key={nb.id}
              onClick={() => {
                setActiveNotebookId(nb.id);
                setActiveDocId(null); // Reset doc selection on notebook swap
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '4px',
                fontSize: '0.9rem',
                fontWeight: activeNotebookId === nb.id ? 600 : 400,
                backgroundColor: activeNotebookId === nb.id ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                color: activeNotebookId === nb.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: activeNotebookId === nb.id ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                <Folder size={16} style={{ color: activeNotebookId === nb.id ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nb.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '2px', flexShrink: 0, alignItems: 'center' }}>
                {nb.examDate && (() => {
                  const dl = Math.max(0, Math.ceil((nb.examDate! - Date.now()) / 86400000));
                  const clr = dl <= 2 ? '#ef4444' : dl <= 7 ? '#f59e0b' : '#10b981';
                  return (
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: clr, background: `${clr}22`, border: `1px solid ${clr}55`, borderRadius: '8px', padding: '1px 5px', flexShrink: 0 }}>
                      {dl === 0 ? 'Today' : `${dl}d`}
                    </span>
                  );
                })()}
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveNotebookId(nb.id); setActiveDocId(null); onOpenStudyPlanner(); }}
                  className="btn-icon"
                  style={{ width: '20px', height: '20px', padding: 0, color: isStudyPlannerOpen && activeNotebookId === nb.id ? 'var(--accent-primary)' : undefined }}
                  title="Study Planner"
                >
                  <CalendarDays size={12} />
                </button>
                <button
                  onClick={(e) => handleDeleteNotebook(e, nb.id)}
                  className="btn-icon"
                  style={{ width: '20px', height: '20px', padding: 0 }}
                  title="Delete Notebook"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sources List for Selected Notebook */}
      {activeNotebookId && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 16px 8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sources</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={onOpenStudyPlanner}
                className="btn-icon"
                style={{ width: '24px', height: '24px', color: isStudyPlannerOpen ? 'var(--accent-primary)' : undefined }}
                title="Study Planner & Exam Countdown"
              >
                <GraduationCap size={15} />
              </button>
              <button
                onClick={onOpenScratchpad}
                className="btn-icon"
                style={{ width: '24px', height: '24px', color: isScratchpadOpen ? 'var(--accent-primary)' : undefined }}
                title="Open Notebook Notes (Scratchpad)"
              >
                <PenLine size={15} />
              </button>
              <button
                onClick={() => setIsCreatingNote(!isCreatingNote)}
                className="btn-icon"
                style={{ width: '24px', height: '24px' }}
                title="Create Note"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-icon"
                style={{ width: '24px', height: '24px' }}
                title="Upload PDF/Text/MD"
              >
                <Upload size={16} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                multiple
                accept=".pdf,.txt,.md" 
                style={{ display: 'none' }} 
              />
            </div>
          </div>

          {errorMsg && (
            <div style={{ margin: '0 16px 10px 16px', padding: '6px 10px', fontSize: '0.75rem', borderRadius: '4px', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: 'var(--error)' }}>
              {errorMsg}
            </div>
          )}

          {isCreatingNote && (
            <form onSubmit={handleCreateNote} style={{ padding: '0 16px 12px 16px' }} className="animate-fade">
              <input 
                type="text" 
                placeholder="Note Title..." 
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                style={{ fontSize: '0.85rem', marginBottom: '8px' }}
                required
              />
              <textarea 
                placeholder="Write your study notes here..." 
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={4}
                style={{ fontSize: '0.85rem', marginBottom: '8px', resize: 'vertical' }}
                required
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" className="btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem', flex: 1, justifyContent: 'center' }}>Save Note</button>
                <button type="button" onClick={() => setIsCreatingNote(false)} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Cancel</button>
              </div>
            </form>
          )}

          {isUploading && (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <span style={{ fontSize: '0.8rem' }}>Reading & parsing documents...</span>
            </div>
          )}

          {/* Tag filter chips — shown when current notebook has any tagged docs */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              {allTags.length > 3 && (
                <button
                  onClick={() => tagScrollRef.current?.scrollBy({ left: -110, behavior: 'smooth' })}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', flexShrink: 0, marginLeft: '4px' }}
                  title="Scroll left"
                >
                  <ChevronLeft size={13} />
                </button>
              )}
              <div
                ref={tagScrollRef}
                className="no-scrollbar"
                style={{ display: 'flex', gap: '5px', padding: '7px 6px', overflowX: 'auto', flex: 1, alignItems: 'center' }}
              >
                {allTags.map((tag) => {
                  const active = activeTagFilters.includes(tag);
                  const c = getTagColor(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTagFilter(tag)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        border: `1px solid ${active ? c.border : 'rgba(255,255,255,0.1)'}`,
                        background: active ? c.bg : 'transparent',
                        color: active ? c.text : 'var(--text-muted)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.15s',
                      }}
                    >
                      #{tag}
                    </button>
                  );
                })}
                {activeTagFilters.length > 0 && (
                  <button
                    onClick={() => setActiveTagFilters([])}
                    style={{ padding: '2px 8px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Clear ×
                  </button>
                )}
              </div>
              {allTags.length > 3 && (
                <button
                  onClick={() => tagScrollRef.current?.scrollBy({ left: 110, behavior: 'smooth' })}
                  className="btn-icon"
                  style={{ width: '22px', height: '22px', flexShrink: 0, marginRight: '4px' }}
                  title="Scroll right"
                >
                  <ChevronRight size={13} />
                </button>
              )}
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px 8px' }}>
            {documents.length === 0 ? (
              <div style={{ padding: '24px 12px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <FileText size={24} style={{ opacity: 0.5 }} />
                <span>No sources uploaded yet. Add a PDF, notes, or markdown to analyze!</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div style={{ padding: '20px 12px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                No documents match the selected tags.{' '}
                <button onClick={() => setActiveTagFilters([])} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}>
                  Clear filters
                </button>
              </div>
            ) : (
              filteredDocuments.map((doc) => (
                <div key={doc.id} style={{ marginBottom: '4px' }}>
                  {/* Main row */}
                  <div
                    onClick={() => { setActiveDocId(doc.id); setEditingTagsDocId(null); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: editingTagsDocId === doc.id ? '8px 8px 0 0' : '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      backgroundColor: activeDocId === doc.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: activeDocId === doc.id ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
                      color: activeDocId === doc.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                      <FileText size={14} style={{ color: doc.type === 'pdf' ? '#ef4444' : doc.type === 'md' ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{doc.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingTagsDocId(editingTagsDocId === doc.id ? null : doc.id); setTagInput(''); }}
                        className="btn-icon"
                        style={{ width: '20px', height: '20px', padding: 0, color: (doc.tags?.length ?? 0) > 0 || editingTagsDocId === doc.id ? 'var(--accent-primary)' : undefined }}
                        title="Manage tags"
                      >
                        <Hash size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteDocument(e, doc.id)}
                        className="btn-icon"
                        style={{ width: '20px', height: '20px', padding: 0 }}
                        title="Delete Document"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Tags display (collapsed, not editing) */}
                  {(doc.tags?.length ?? 0) > 0 && editingTagsDocId !== doc.id && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', padding: '2px 12px 6px 34px' }}>
                      {doc.tags!.slice(0, 3).map((tag) => {
                        const c = getTagColor(tag);
                        return (
                          <span key={tag} style={{ fontSize: '0.67rem', fontWeight: 600, padding: '1px 6px', borderRadius: '8px', background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                            #{tag}
                          </span>
                        );
                      })}
                      {doc.tags!.length > 3 && (
                        <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>+{doc.tags!.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Inline tag editor */}
                  {editingTagsDocId === doc.id && (
                    <div className="animate-fade" style={{ padding: '8px 10px', border: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid var(--border-color)', borderRadius: '0 0 8px 8px', background: 'rgba(255,255,255,0.02)' }}>
                      {/* Existing tags with × remove */}
                      {(doc.tags?.length ?? 0) > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '7px' }}>
                          {doc.tags!.map((tag) => {
                            const c = getTagColor(tag);
                            return (
                              <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 600, padding: '2px 5px 2px 7px', borderRadius: '8px', background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                                #{tag}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveTag(doc, tag); }}
                                  style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', padding: 0, fontSize: '0.85rem', lineHeight: 1, opacity: 0.8 }}
                                >×</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="#tag — Enter to add"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                            e.preventDefault();
                            handleAddTag(doc, tagInput);
                            setTagInput('');
                          }
                          if (e.key === 'Escape') setEditingTagsDocId(null);
                        }}
                        style={{ fontSize: '0.78rem', padding: '5px 8px', width: '100%' }}
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!activeNotebookId && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', gap: '10px' }}>
          <ChevronRight size={24} style={{ opacity: 0.5 }} />
          <span style={{ fontSize: '0.85rem' }}>Select or create a notebook to begin importing study materials.</span>
        </div>
      )}
        </>
      )}
    </aside>
  );
};
