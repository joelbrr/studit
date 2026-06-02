import React, { useState, useMemo } from 'react';
import { Shuffle, Layers, CheckSquare, Square } from 'lucide-react';
import { type FlashcardDeck, type DocumentData } from '../services/db';
import { StudySession, type SessionCard } from './StudySession';

interface MixedSessionProps {
  notebookName: string;
  allDecks: FlashcardDeck[];
  documents: DocumentData[];
  geminiApiKeyExists: boolean;
  onRateCard: (cardId: string, deckId: string, rating: 'easy' | 'medium' | 'hard') => void;
}

type CardScope = 'due' | 'all';
type CardLimit = 10 | 20 | 30 | 0; // 0 = no limit

const LIMIT_OPTIONS: { label: string; value: CardLimit }[] = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '30', value: 30 },
  { label: 'All', value: 0 },
];

function docNameForDeck(deck: FlashcardDeck, documents: DocumentData[]): string {
  const doc = documents.find(d => d.id === deck.docId);
  return doc?.name.replace(/\.(pdf|txt|md)$/i, '') ?? 'Unknown';
}

export const MixedSession: React.FC<MixedSessionProps> = ({
  notebookName, allDecks, documents, geminiApiKeyExists, onRateCard,
}) => {
  const decksWithCards = useMemo(() => allDecks.filter(d => d.cards.length > 0), [allDecks]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(decksWithCards.map(d => d.id)));
  const [scope, setScope] = useState<CardScope>('due');
  const [limit, setLimit] = useState<CardLimit>(20);
  const [queue, setQueue] = useState<SessionCard[] | null>(null);

  const now = Date.now();

  const toggleDeck = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === decksWithCards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(decksWithCards.map(d => d.id)));
    }
  };

  const { totalSelected, dueSelected } = useMemo(() => {
    let total = 0, due = 0;
    for (const deck of decksWithCards) {
      if (!selectedIds.has(deck.id)) continue;
      total += deck.cards.length;
      due += deck.cards.filter(c => c.nextReview <= now).length;
    }
    return { totalSelected: total, dueSelected: due };
  }, [selectedIds, decksWithCards, now]);

  const effectiveCount = scope === 'due' ? (dueSelected > 0 ? dueSelected : totalSelected) : totalSelected;
  const sessionCount = limit === 0 ? effectiveCount : Math.min(effectiveCount, limit);
  const canStart = selectedIds.size > 0 && effectiveCount > 0;

  const startSession = () => {
    const cards: SessionCard[] = [];
    for (const deck of decksWithCards) {
      if (!selectedIds.has(deck.id)) continue;
      const docName = docNameForDeck(deck, documents);
      let source = deck.cards;
      if (scope === 'due') {
        const due = deck.cards.filter(c => c.nextReview <= now);
        source = due.length > 0 ? due : deck.cards;
      }
      cards.push(...source.map(c => ({ ...c, docName, deckId: deck.id })));
    }
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setQueue(limit === 0 ? shuffled : shuffled.slice(0, limit));
  };

  if (queue) {
    return (
      <StudySession
        queue={queue}
        geminiApiKeyExists={geminiApiKeyExists}
        isMixed={true}
        onRate={onRateCard}
        onExit={() => setQueue(null)}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        <Shuffle size={16} style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>
          {notebookName} — Mixed Session
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

        {/* No decks empty state */}
        {decksWithCards.length === 0 && (
          <div className="glass" style={{ padding: '28px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
            <Layers size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              No flashcard decks found in this notebook.<br />
              Open a document, go to the Flashcards tab, and generate a deck first.
            </p>
          </div>
        )}

        {/* Deck selector */}
        {decksWithCards.length > 0 && (
          <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} style={{ color: 'var(--accent-primary)' }} />
                Select Decks
              </h3>
              <button onClick={toggleAll} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>
                {selectedIds.size === decksWithCards.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {decksWithCards.map(deck => {
                const dueCount = deck.cards.filter(c => c.nextReview <= now).length;
                const isSelected = selectedIds.has(deck.id);
                const name = docNameForDeck(deck, documents);
                return (
                  <button
                    key={deck.id}
                    onClick={() => toggleDeck(deck.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '9px', textAlign: 'left', width: '100%',
                      background: isSelected ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'rgba(139,92,246,0.35)' : 'var(--border-color)'}`,
                      cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {isSelected
                      ? <CheckSquare size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      : <Square size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                    <span style={{ flex: 1, fontSize: '0.88rem', color: isSelected ? '#fff' : 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {deck.cards.length} cards
                    </span>
                    {dueCount > 0 && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', flexShrink: 0 }}>
                        {dueCount} due
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {decksWithCards.length === 1 && (
              <p style={{ marginTop: '10px', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Add flashcard decks to more documents to get the full interleaving benefit.
              </p>
            )}
          </div>
        )}

        {/* Session settings */}
        {decksWithCards.length > 0 && (
          <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Scope */}
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>CARDS TO INCLUDE</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['due', 'all'] as CardScope[]).map(s => (
                  <button key={s} onClick={() => setScope(s)} className={scope === s ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '7px 18px', fontSize: '0.82rem' }}>
                    {s === 'due' ? 'Due cards only' : 'All cards'}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {scope === 'due'
                  ? dueSelected > 0 ? `${dueSelected} due cards across selected decks` : 'No due cards — will fall back to all cards'
                  : `${totalSelected} total cards across selected decks`}
              </p>
            </div>

            {/* Card limit */}
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>SESSION LENGTH</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {LIMIT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setLimit(opt.value)} className={limit === opt.value ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '7px 16px', fontSize: '0.82rem' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Start button */}
        {decksWithCards.length > 0 && (
          <button onClick={startSession} disabled={!canStart} className="btn-primary"
            style={{ padding: '13px 24px', fontSize: '0.92rem', justifyContent: 'center', display: 'flex', gap: '8px', alignItems: 'center', borderRadius: '10px' }}>
            <Shuffle size={16} />
            Start Mixed Session
            {canStart && <span style={{ opacity: 0.75, fontSize: '0.82rem' }}>({sessionCount} cards)</span>}
          </button>
        )}
      </div>
    </div>
  );
};