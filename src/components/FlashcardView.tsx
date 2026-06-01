import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Loader2, Trophy, RotateCcw, X, Layers, BrainCircuit, Send } from 'lucide-react';
import { type Flashcard, type FlashcardDeck } from '../services/db';
import { geminiService } from '../services/gemini';

type SocraticPhase = 'idle' | 'loading' | 'challenge' | 'submitting' | 'feedback';

interface SessionResult {
  cardId: string;
  confidence: number; // 1–5
  rating: 'easy' | 'medium' | 'hard';
}

interface FlashcardViewProps {
  deck: FlashcardDeck | null;
  isGenerating: boolean;
  geminiApiKeyExists: boolean;
  onGenerate: () => void;
  onRateCard: (cardId: string, rating: 'easy' | 'medium' | 'hard') => void;
  docName?: string;
}

// ─── Calibration report ───────────────────────────────────────────────────────

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'No idea',
  2: 'Unsure',
  3: 'Maybe',
  4: 'Confident',
  5: 'Certain',
};

const CalibrationReport: React.FC<{ results: SessionResult[] }> = ({ results }) => {
  if (results.length === 0) return null;

  // Group by confidence level
  const byLevel: Record<number, { easy: number; medium: number; hard: number; total: number }> = {};
  for (const r of results) {
    if (!byLevel[r.confidence]) byLevel[r.confidence] = { easy: 0, medium: 0, hard: 0, total: 0 };
    byLevel[r.confidence][r.rating]++;
    byLevel[r.confidence].total++;
  }

  const overconfident = results.filter((r) => r.confidence >= 4 && r.rating === 'hard').length;
  const hiddenGems   = results.filter((r) => r.confidence <= 2 && r.rating === 'easy').length;
  const wellMatched  = results.filter((r) => {
    if (r.confidence >= 4) return r.rating !== 'hard';
    if (r.confidence <= 2) return r.rating !== 'easy';
    return true;
  }).length;
  const calibrationPct = Math.round((wellMatched / results.length) * 100);

  return (
    <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Calibration Report
        </span>
        <span style={{
          fontSize: '0.82rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
          background: calibrationPct >= 70 ? 'rgba(16,185,129,0.15)' : calibrationPct >= 45 ? 'rgba(245,158,11,0.15)' : 'rgba(244,63,94,0.15)',
          color: calibrationPct >= 70 ? '#10b981' : calibrationPct >= 45 ? '#f59e0b' : '#f43f5e',
          border: `1px solid ${calibrationPct >= 70 ? 'rgba(16,185,129,0.3)' : calibrationPct >= 45 ? 'rgba(245,158,11,0.3)' : 'rgba(244,63,94,0.3)'}`,
        }}>
          {calibrationPct}% calibrated
        </span>
      </div>

      {/* Stacked bar chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {/* Legend */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '4px' }}>
          {[['#f43f5e', 'Hard'], ['#f59e0b', 'Medium'], ['#10b981', 'Easy']].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color }} />
              {label}
            </div>
          ))}
        </div>

        {[1, 2, 3, 4, 5].map((level) => {
          const d = byLevel[level];
          if (!d) return null;
          return (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Label */}
              <div style={{ width: '76px', flexShrink: 0, textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {level} — {CONFIDENCE_LABELS[level]}
                </span>
              </div>
              {/* Bar */}
              <div style={{ flex: 1, height: '22px', display: 'flex', borderRadius: '5px', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                {d.hard   > 0 && <div style={{ flex: d.hard,   background: 'rgba(244,63,94,0.7)',  display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', opacity: d.hard >= 2 ? 1 : 0 }}>{d.hard}</span></div>}
                {d.medium > 0 && <div style={{ flex: d.medium, background: 'rgba(245,158,11,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', opacity: d.medium >= 2 ? 1 : 0 }}>{d.medium}</span></div>}
                {d.easy   > 0 && <div style={{ flex: d.easy,   background: 'rgba(16,185,129,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', opacity: d.easy >= 2 ? 1 : 0 }}>{d.easy}</span></div>}
              </div>
              {/* Total count */}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '24px', textAlign: 'right', flexShrink: 0 }}>×{d.total}</span>
            </div>
          );
        })}
      </div>

      {/* Insights */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {overconfident > 0 && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            ⚠️ <strong style={{ color: '#f87171' }}>Overconfident on {overconfident} card{overconfident > 1 ? 's' : ''}</strong> — you felt confident (4–5) but found {overconfident > 1 ? 'them' : 'it'} hard. These are your priority review cards.
          </div>
        )}
        {hiddenGems > 0 && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            💎 <strong style={{ color: '#34d399' }}>Hidden gems: {hiddenGems} card{hiddenGems > 1 ? 's' : ''}</strong> — you felt unsure (1–2) but actually knew {hiddenGems > 1 ? 'them' : 'it'}. Your knowledge is broader than you think.
          </div>
        )}
        {overconfident === 0 && hiddenGems === 0 && (
          <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            ✅ <strong style={{ color: '#a78bfa' }}>Well calibrated</strong> — your confidence aligned closely with your performance. That's a sign of strong metacognitive awareness.
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Confidence button colours ────────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<number, { bg: string; border: string; color: string }> = {
  1: { bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.4)',  color: '#f87171' },
  2: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.4)', color: '#fb923c' },
  3: { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.4)',  color: '#fbbf24' },
  4: { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)',  color: '#4ade80' },
  5: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', color: '#34d399' },
};

// ─── Main component ───────────────────────────────────────────────────────────

export const FlashcardView: React.FC<FlashcardViewProps> = ({
  deck,
  isGenerating,
  geminiApiKeyExists,
  onGenerate,
  onRateCard,
  docName,
}) => {
  const [isStudying, setIsStudying] = useState(false);
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // Confidence tracking
  const [pendingConfidence, setPendingConfidence] = useState<number | null>(null);
  const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);

  // Socratic state
  const [socraticPhase, setSocraticPhase] = useState<SocraticPhase>('idle');
  const [socraticChallenge, setSocraticChallenge] = useState('');
  const [socraticInput, setSocraticInput] = useState('');
  const [socraticFeedback, setSocraticFeedback] = useState('');
  const [socraticError, setSocraticError] = useState('');

  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (socraticPhase === 'feedback') {
      setTimeout(() => feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
  }, [socraticPhase]);

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
    setStudyQueue([...source].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionCompleted(false);
    setPendingConfidence(null);
    setSessionResults([]);
    resetSocratic();
    setIsStudying(true);
  };

  const resetSocratic = () => {
    setSocraticPhase('idle');
    setSocraticChallenge('');
    setSocraticInput('');
    setSocraticFeedback('');
    setSocraticError('');
  };

  const handleConfidence = (level: number) => {
    setPendingConfidence(level);
    setIsFlipped(true);
  };

  const handleRate = (rating: 'easy' | 'medium' | 'hard') => {
    const card = studyQueue[currentIndex];
    onRateCard(card.id, rating);
    if (pendingConfidence !== null) {
      setSessionResults((prev) => [...prev, { cardId: card.id, confidence: pendingConfidence, rating }]);
    }
    resetSocratic();
    setPendingConfidence(null);
    const next = currentIndex + 1;
    if (next >= studyQueue.length) {
      setSessionCompleted(true);
    } else {
      setCurrentIndex(next);
      setIsFlipped(false);
    }
  };

  const handleGoDeeper = async () => {
    const card = studyQueue[currentIndex];
    setSocraticPhase('loading');
    setSocraticError('');
    try {
      const challenge = await geminiService.generateSocraticChallenge(card.front, card.back, docName);
      setSocraticChallenge(challenge);
      setSocraticPhase('challenge');
    } catch {
      setSocraticError('Could not generate a challenge. Try again or rate the card directly.');
      setSocraticPhase('idle');
    }
  };

  const handleSubmitSocratic = async () => {
    if (!socraticInput.trim()) return;
    const card = studyQueue[currentIndex];
    setSocraticPhase('submitting');
    setSocraticError('');
    try {
      const feedback = await geminiService.respondToSocraticAnswer(
        card.front, card.back, socraticChallenge, socraticInput
      );
      setSocraticFeedback(feedback);
      setSocraticPhase('feedback');
    } catch {
      setSocraticError('Could not get feedback. Try submitting again.');
      setSocraticPhase('challenge');
    }
  };

  const styles = `
    .fc-wrapper { perspective: 1200px; width: 100%; max-width: 580px; height: 260px; flex-shrink: 0; }
    .fc-wrapper-compact { height: 150px !important; }
    .fc-wrapper-compact .fc-face { padding: 18px 24px; }
    .fc-wrapper-compact p { font-size: 0.9rem !important; }
    .fc-inner { width: 100%; height: 100%; position: relative; transform-style: preserve-3d; transition: transform 0.55s cubic-bezier(0.16,1,0.3,1); }
    .fc-inner.flipped { transform: rotateY(180deg); }
    .fc-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 16px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 32px; text-align: center; }
    .fc-front { background: var(--bg-card); border: 1px solid var(--border-color); }
    .fc-back { transform: rotateY(180deg); background: rgba(139,92,246,0.07); border: 1px solid var(--border-active); }
    .rating-btn { padding: 10px 28px; border-radius: 8px; border: 1px solid; font-family: var(--font-main); font-weight: 700; font-size: 0.9rem; cursor: pointer; transition: all 0.15s ease; }
    .rating-btn:hover { transform: translateY(-2px); filter: brightness(1.15); }
    .rating-hard   { background: rgba(244,63,94,0.12);  border-color: rgba(244,63,94,0.4);  color: #f43f5e; }
    .rating-medium { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.4); color: #f59e0b; }
    .rating-easy   { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.4); color: #10b981; }
    .conf-btn { padding: 8px 0; border-radius: 8px; border: 1px solid; font-family: var(--font-main); font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.18s ease; width: 68px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .conf-btn:hover { transform: translateY(-2px); filter: brightness(1.2); }
    .fc-card-item { display: flex; gap: 14px; align-items: flex-start; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; transition: border-color 0.2s; }
    .fc-card-item:hover { border-color: rgba(139,92,246,0.25); }
    @keyframes ratingFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .rating-row { animation: ratingFadeIn 0.25s ease forwards; }
    @keyframes socraticFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .socratic-appear { animation: socraticFadeIn 0.3s ease forwards; }
  `;

  // ── Loading ──────────────────────────────────────────────────────────────
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

  // ── Empty state ──────────────────────────────────────────────────────────
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
          <button onClick={onGenerate} disabled={!geminiApiKeyExists} className="btn-primary" style={{ marginTop: '8px' }}>
            <Sparkles size={16} /> Generate AI Flashcards
          </button>
          {!geminiApiKeyExists && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Add a Gemini API key in settings to get started.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Study session ────────────────────────────────────────────────────────
  if (isStudying) {

    // ── Completion + calibration ──
    if (sessionCompleted) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', padding: '36px 24px', gap: '24px' }}>
          <style>{styles}</style>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center' }}>
            <div style={{ padding: '20px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              <Trophy size={44} />
            </div>
            <div>
              <h3 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 700, marginBottom: '6px' }}>Session Complete!</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                You reviewed <strong style={{ color: '#fff' }}>{studyQueue.length}</strong> card{studyQueue.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>

          {sessionResults.length > 0 && (
            <div style={{ width: '100%', maxWidth: '520px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <CalibrationReport results={sessionResults} />
            </div>
          )}

          <button onClick={() => setIsStudying(false)} className="btn-primary" style={{ marginTop: '4px' }}>
            Back to Deck
          </button>
        </div>
      );
    }

    const card = studyQueue[currentIndex];
    const progress = (currentIndex / studyQueue.length) * 100;
    const inSocratic = socraticPhase !== 'idle';

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 28px', gap: '14px', overflow: 'hidden' }}>
        <style>{styles}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => { setIsStudying(false); resetSocratic(); }} className="btn-icon" title="Exit session">
            <X size={16} />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {currentIndex + 1} <span style={{ color: 'var(--text-muted)' }}>/ {studyQueue.length}</span>
          </span>
          <div style={{ width: 36 }} />
        </div>

        {/* Progress bar */}
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent-gradient)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          overflowY: inSocratic ? 'auto' : 'hidden',
          justifyContent: inSocratic ? 'flex-start' : 'center',
          paddingBottom: inSocratic ? '16px' : 0,
        }}>

          {/* Flip card — not clickable until confidence is selected */}
          <div
            className={`fc-wrapper${inSocratic ? ' fc-wrapper-compact' : ''}`}
            style={{ cursor: (!isFlipped && pendingConfidence === null) || inSocratic ? 'default' : 'pointer' }}
            onClick={() => { if (isFlipped && !inSocratic) setIsFlipped(false); }}
          >
            <div className={`fc-inner${isFlipped ? ' flipped' : ''}`}>
              <div className="fc-face fc-front">
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>Question</span>
                <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>{card.front}</p>
              </div>
              <div className="fc-face fc-back">
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>Answer</span>
                <p style={{ fontSize: '1.0rem', color: 'var(--text-primary)', lineHeight: 1.65 }}>{card.back}</p>
              </div>
            </div>
          </div>

          {/* ── PRE-FLIP: Confidence rating ── */}
          {!isFlipped && (
            <div className="rating-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                How confident are you? <span style={{ opacity: 0.6 }}>(tap to reveal)</span>
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((level) => {
                  const c = CONFIDENCE_COLORS[level];
                  return (
                    <button
                      key={level}
                      className="conf-btn"
                      onClick={() => handleConfidence(level)}
                      style={{ background: c.bg, borderColor: c.border, color: c.color }}
                    >
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>{level}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 600, opacity: 0.85 }}>{CONFIDENCE_LABELS[level]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── POST-FLIP IDLE: rating + Go Deeper ── */}
          {isFlipped && socraticPhase === 'idle' && (
            <div className="rating-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%', maxWidth: '580px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="rating-btn rating-hard" onClick={() => handleRate('hard')}>Hard</button>
                <button className="rating-btn rating-medium" onClick={() => handleRate('medium')}>Medium</button>
                <button className="rating-btn rating-easy" onClick={() => handleRate('easy')}>Easy</button>
              </div>
              {geminiApiKeyExists && (
                <button
                  onClick={handleGoDeeper}
                  className="btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '7px 18px', display: 'flex', gap: '7px', alignItems: 'center', borderColor: 'rgba(139,92,246,0.35)', color: '#a78bfa' }}
                >
                  <BrainCircuit size={14} /> Go Deeper
                </button>
              )}
              {socraticError && (
                <p style={{ fontSize: '0.78rem', color: 'var(--error)', textAlign: 'center' }}>{socraticError}</p>
              )}
            </div>
          )}

          {/* ── LOADING challenge ── */}
          {isFlipped && socraticPhase === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: '0.85rem' }}>Preparing your challenge…</span>
            </div>
          )}

          {/* ── CHALLENGE: question + textarea + submit ── */}
          {isFlipped && (socraticPhase === 'challenge' || socraticPhase === 'submitting') && (
            <div className="socratic-appear" style={{ width: '100%', maxWidth: '580px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '16px 18px', borderRadius: '12px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <BrainCircuit size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '3px' }} />
                <p style={{ fontSize: '0.92rem', color: '#e2e8f0', lineHeight: 1.6, fontStyle: 'italic' }}>{socraticChallenge}</p>
              </div>
              <textarea
                value={socraticInput}
                onChange={(e) => setSocraticInput(e.target.value)}
                placeholder="Write your explanation here… think out loud, use analogies, connect ideas."
                rows={4}
                disabled={socraticPhase === 'submitting'}
                style={{ resize: 'vertical', fontSize: '0.9rem', lineHeight: 1.6, minHeight: '100px' }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={resetSocratic} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '7px 14px' }} disabled={socraticPhase === 'submitting'}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmitSocratic}
                  disabled={!socraticInput.trim() || socraticPhase === 'submitting'}
                  className="btn-primary"
                  style={{ fontSize: '0.85rem', padding: '8px 20px', gap: '7px' }}
                >
                  {socraticPhase === 'submitting'
                    ? <><Loader2 size={14} className="animate-spin" /> Analysing…</>
                    : <><Send size={14} /> Submit</>}
                </button>
              </div>
              {socraticError && <p style={{ fontSize: '0.78rem', color: 'var(--error)' }}>{socraticError}</p>}
            </div>
          )}

          {/* ── FEEDBACK: AI response + rating ── */}
          {isFlipped && socraticPhase === 'feedback' && (
            <div ref={feedbackRef} className="socratic-appear" style={{ width: '100%', maxWidth: '580px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '11px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', fontSize: '0.83rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                "{socraticInput}"
              </div>
              <div style={{ padding: '16px 18px', borderRadius: '12px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Sparkles size={15} style={{ color: '#a78bfa', flexShrink: 0, marginTop: '3px' }} />
                <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.7 }}>{socraticFeedback}</p>
              </div>
              <div className="rating-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', paddingTop: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Now that you went deeper — how well did you know this?
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="rating-btn rating-hard" onClick={() => handleRate('hard')}>Hard</button>
                  <button className="rating-btn rating-medium" onClick={() => handleRate('medium')}>Medium</button>
                  <button className="rating-btn rating-easy" onClick={() => handleRate('easy')}>Easy</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Deck overview ────────────────────────────────────────────────────────
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={onGenerate} disabled={!geminiApiKeyExists} className="btn-secondary" style={{ padding: '7px 14px', fontSize: '0.8rem' }}>
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
            const badgeLabel = isNew ? 'New' : isDue ? 'Due' : 'Learned';
            return (
              <div key={card.id} className="fc-card-item">
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, minWidth: '20px', paddingTop: '2px', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '4px', lineHeight: 1.4 }}>{card.front}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{card.back}</p>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badgeColor, flexShrink: 0, paddingTop: '2px' }}>{badgeLabel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};