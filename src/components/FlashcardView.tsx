import React, { useState, useMemo } from 'react';
import { Sparkles, Loader2, RotateCcw, Layers } from 'lucide-react';
import { type FlashcardDeck } from '../services/db';
import { StudySession, type SessionCard } from './StudySession';

interface FlashcardViewProps {
  deck: FlashcardDeck | null;
  isGenerating: boolean;
  geminiApiKeyExists: boolean;
  onGenerate: () => void;
  onRateCard: (cardId: string, rating: 'easy' | 'medium' | 'hard') => void;
  docName?: string;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({
  deck, isGenerating, geminiApiKeyExists, onGenerate, onRateCard, docName,
}) => {
  const [isStudying, setIsStudying] = useState(false);
  const [studyQueue, setStudyQueue] = useState<SessionCard[]>([]);

  const dueCount = useMemo(() => {
    if (!deck) return 0;
    return deck.cards.filter(c => c.nextReview <= Date.now()).length;
  }, [deck]);

  const startStudy = () => {
    if (!deck) return;
    const now = Date.now();
    const due = deck.cards.filter(c => c.nextReview <= now);
    const source = due.length > 0 ? due : [...deck.cards];
    setStudyQueue(
      [...source]
        .sort(() => Math.random() - 0.5)
        .map(c => ({ ...c, docName: docName ?? '', deckId: deck.id }))
    );
    setIsStudying(true);
  };

  const styles = `
    .fc-card-item { display: flex; gap: 14px; align-items: flex-start; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; transition: border-color 0.2s; }
    .fc-card-item:hover { border-color: rgba(139,92,246,0.25); }
  `;

  if (isGenerating) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
        <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Gemini is crafting your flashcards...</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Extracting key concepts from the document</span>
      </div>
    );
  }

  if (!deck || deck.cards.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center' }}>
        <div className="glass-card" style={{ maxWidth: '460px', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '18px', borderRadius: '50%', backgroundColor: 'rgba(139,92,246,0.08)', color: 'var(--accent-primary)' }}>
            <Layers size={44} />
          </div>
          <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>Generate Flashcard Deck</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-secondary)', maxWidth: '340px' }}>
            Let Gemini read this document and automatically create a set of study flashcards with spaced repetition tracking.
          </p>
          <button onClick={onGenerate} disabled={!geminiApiKeyExists} className="btn-primary" style={{ marginTop: '8px' }}>
            <Sparkles size={16} /> Generate AI Flashcards
          </button>
          {!geminiApiKeyExists && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Add a Gemini API key in settings to get started.</p>}
        </div>
      </div>
    );
  }

  if (isStudying) {
    return (
      <StudySession
        queue={studyQueue}
        geminiApiKeyExists={geminiApiKeyExists}
        isMixed={false}
        onRate={(_cardId, _deckId, rating) => onRateCard(_cardId, rating)}
        onExit={() => setIsStudying(false)}
      />
    );
  }

  // Deck overview
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{styles}</style>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700, marginBottom: '3px' }}>{deck.cards.length} Flashcards</h3>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: dueCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {dueCount > 0 ? `${dueCount} due for review` : 'All caught up!'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              if (confirm(`Regenerate flashcards?\n\nThis will permanently delete the current ${deck.cards.length} card${deck.cards.length !== 1 ? 's' : ''} (including your review progress) and create a brand-new set.`)) {
                onGenerate();
              }
            }}
            disabled={!geminiApiKeyExists}
            className="btn-secondary"
            style={{ padding: '7px 14px', fontSize: '0.8rem' }}
          >
            <RotateCcw size={13} /> Regenerate
          </button>
          <button onClick={startStudy} className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
            Study Now&nbsp;<span style={{ opacity: 0.75 }}>({dueCount > 0 ? dueCount : deck.cards.length})</span>
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deck.cards.map((card, i) => {
            const isNew = card.reviewCount === 0;
            const isDue = !isNew && card.nextReview <= Date.now();
            const badgeColor = isNew ? 'var(--accent-primary)' : isDue ? 'var(--warning)' : 'var(--success)';
            return (
              <div key={card.id} className="fc-card-item">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '20px', paddingTop: '2px', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '4px', lineHeight: 1.4 }}>{card.front}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{card.back}</p>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badgeColor, flexShrink: 0, paddingTop: '2px' }}>
                  {isNew ? 'New' : isDue ? 'Due' : 'Learned'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};