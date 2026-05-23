import React, { useState, useMemo } from 'react';
import { Sparkles, Loader2, Trophy, RotateCcw, X, Layers } from 'lucide-react';
import { type Flashcard, type FlashcardDeck } from '../services/db';

interface FlashcardViewProps {
  deck: FlashcardDeck | null;
  isGenerating: boolean;
  geminiApiKeyExists: boolean;
  onGenerate: () => void;
  onRateCard: (cardId: string, rating: 'easy' | 'medium' | 'hard') => void;
}

export const FlashcardView: React.FC<FlashcardViewProps> = ({
  deck,
  isGenerating,
  geminiApiKeyExists,
  onGenerate,
  onRateCard,
}) => {
  const [isStudying, setIsStudying] = useState(false);
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  const dueCount = useMemo(() => {
    if (!deck) return 0;
    const now = Date.now();
    return deck.cards.filter((c) => c.nextReview <= now).length;
  }, [deck]);

  const startStudy = () => {
    if (!deck) return;
    const now = Date.now();
    const due = deck.cards.filter((c) => c.nextReview <= now);
    const source = due.length > 0 ? due : [...deck.cards];
    const queue = [...source].sort(() => Math.random() - 0.5);
    setStudyQueue(queue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionCompleted(false);
    setIsStudying(true);
  };

  const handleRate = (rating: 'easy' | 'medium' | 'hard') => {
    onRateCard(studyQueue[currentIndex].id, rating);
    const next = currentIndex + 1;
    if (next >= studyQueue.length) {
      setSessionCompleted(true);
    } else {
      setCurrentIndex(next);
      setIsFlipped(false);
    }
  };

  const styles = `
    .fc-wrapper { perspective: 1200px; width: 100%; max-width: 620px; height: 300px; cursor: pointer; }
    .fc-inner { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(0.16,1,0.3,1); }
    .fc-inner.flipped { transform: rotateY(180deg); }
    .fc-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 16px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 36px; text-align: center; }
    .fc-front { background: var(--bg-card); border: 1px solid var(--border-color); }
    .fc-back { transform: rotateY(180deg); background: rgba(139,92,246,0.07); border: 1px solid var(--border-active); }
    .rating-btn { padding: 10px 28px; border-radius: 8px; border: 1px solid; font-family: var(--font-main); font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.15s ease; }
    .rating-btn:hover { transform: translateY(-2px); filter: brightness(1.15); }
    .rating-hard { background: rgba(244,63,94,0.12); border-color: rgba(244,63,94,0.4); color: #f43f5e; }
    .rating-medium { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.4); color: #f59e0b; }
    .rating-easy { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.4); color: #10b981; }
    .fc-card-item { display: flex; gap: 14px; align-items: flex-start; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; transition: border-color 0.2s; }
    .fc-card-item:hover { border-color: rgba(139,92,246,0.25); }
    @keyframes ratingFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .rating-row { animation: ratingFadeIn 0.2s ease forwards; }
  `;

  if (isGenerating) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
        <style>{styles}</style>
        <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Gemini is crafting your flashcards...</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Extracting key concepts from the document</span>
      </div>
    );
  }

  if (!deck || deck.cards.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <style>{styles}</style>
        <div className="glass-card" style={{ maxWidth: '460px', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '18px', borderRadius: '50%', backgroundColor: 'rgba(139,92,246,0.08)', color: 'var(--accent-primary)' }}>
            <Layers size={44} />
          </div>
          <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 700 }}>Generate Flashcard Deck</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-secondary)', maxWidth: '340px' }}>
            Let Gemini read this document and automatically create a set of study flashcards with spaced repetition tracking.
          </p>
          <button
            onClick={onGenerate}
            disabled={!geminiApiKeyExists}
            className="btn-primary"
            style={{ marginTop: '8px' }}
          >
            <Sparkles size={16} />
            Generate AI Flashcards
          </button>
          {!geminiApiKeyExists && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Add a Gemini API key in settings to get started.</p>
          )}
        </div>
      </div>
    );
  }

  if (isStudying) {
    if (sessionCompleted) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', padding: '40px', textAlign: 'center' }}>
          <style>{styles}</style>
          <div style={{ padding: '20px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <Trophy size={48} />
          </div>
          <div>
            <h3 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>Session Complete!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              You reviewed <strong style={{ color: '#fff' }}>{studyQueue.length}</strong> card{studyQueue.length !== 1 ? 's' : ''}.
            </p>
          </div>
          <button onClick={() => setIsStudying(false)} className="btn-primary" style={{ marginTop: '8px' }}>
            Back to Deck
          </button>
        </div>
      );
    }

    const card = studyQueue[currentIndex];
    const progress = (currentIndex / studyQueue.length) * 100;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 32px', gap: '16px', overflow: 'hidden' }}>
        <style>{styles}</style>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setIsStudying(false)} className="btn-icon" title="Exit study session">
            <X size={16} />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {currentIndex + 1} <span style={{ color: 'var(--text-muted)' }}>/ {studyQueue.length}</span>
          </span>
          <div style={{ width: 36 }} />
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-gradient)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
        </div>

        {/* Card + rating area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '28px' }}>
          {/* Flip card */}
          <div className="fc-wrapper" onClick={() => setIsFlipped((f) => !f)}>
            <div className={`fc-inner${isFlipped ? ' flipped' : ''}`}>
              <div className="fc-face fc-front">
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>Question</span>
                <p style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>{card.front}</p>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '22px' }}>Click to reveal answer</span>
              </div>
              <div className="fc-face fc-back">
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>Answer</span>
                <p style={{ fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.65 }}>{card.back}</p>
              </div>
            </div>
          </div>

          {/* Rating buttons — visible only after flip */}
          {isFlipped && (
            <div className="rating-row" style={{ display: 'flex', gap: '12px' }}>
              <button className="rating-btn rating-hard" onClick={() => handleRate('hard')}>Hard</button>
              <button className="rating-btn rating-medium" onClick={() => handleRate('medium')}>Medium</button>
              <button className="rating-btn rating-easy" onClick={() => handleRate('easy')}>Easy</button>
            </div>
          )}

          {!isFlipped && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Rate your confidence after flipping the card
            </span>
          )}
        </div>
      </div>
    );
  }

  // Deck overview
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{styles}</style>

      {/* Deck header */}
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700, marginBottom: '3px' }}>
            {deck.cards.length} Flashcards
          </h3>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: dueCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {dueCount > 0 ? `${dueCount} due for review` : 'All caught up!'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={onGenerate}
            disabled={!geminiApiKeyExists}
            className="btn-secondary"
            style={{ padding: '7px 14px', fontSize: '0.8rem' }}
          >
            <RotateCcw size={13} />
            Regenerate
          </button>
          <button onClick={startStudy} className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
            Study Now&nbsp;
            <span style={{ opacity: 0.75 }}>({dueCount > 0 ? dueCount : deck.cards.length})</span>
          </button>
        </div>
      </div>

      {/* Card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deck.cards.map((card, i) => {
            const isNew = card.reviewCount === 0;
            const isDue = !isNew && card.nextReview <= Date.now();
            const badgeColor = isNew ? 'var(--accent-primary)' : isDue ? 'var(--warning)' : 'var(--success)';
            const badgeLabel = isNew ? 'New' : isDue ? 'Due' : 'Learned';

            return (
              <div key={card.id} className="fc-card-item">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '20px', paddingTop: '2px', flexShrink: 0 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '4px', lineHeight: 1.4 }}>{card.front}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                    {card.back}
                  </p>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badgeColor, flexShrink: 0, paddingTop: '2px' }}>
                  {badgeLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};