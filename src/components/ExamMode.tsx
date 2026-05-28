import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList, Timer, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, AlertTriangle, RotateCcw, Sparkles,
  Loader2, FileText, BookOpen
} from 'lucide-react';
import type { DocumentData, ExamQuestion } from '../services/db';

interface ExamModeProps {
  allDocs: DocumentData[];
  examQuestions: ExamQuestion[] | null;
  isGenerating: boolean;
  geminiApiKeyExists: boolean;
  onGenerate: (
    contentDocs: Array<{ name: string; content: string }>,
    examDocs: Array<{ name: string; content: string }>,
    count: number
  ) => void;
  onOpenSettings: () => void;
}

type Phase = 'setup' | 'exam' | 'results';
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// ─── Small helpers ─────────────────────────────────────────────────────────────

function DocCheckbox({
  doc, checked, onToggle,
}: { doc: DocumentData; checked: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
        borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s',
        border: `1px solid ${checked ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
        background: checked ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.01)',
      }}
    >
      <div style={{
        width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
        border: `2px solid ${checked ? 'var(--accent-primary)' : 'rgba(255,255,255,0.2)'}`,
        background: checked ? 'var(--accent-primary)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
      }}>
        {checked && <span style={{ color: '#fff', fontSize: '10px', lineHeight: 1 }}>✓</span>}
      </div>
      <span style={{ fontSize: '0.85rem', color: checked ? '#fff' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {doc.name}
      </span>
      <span style={{
        fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', flexShrink: 0,
        color: doc.isExam ? '#fbbf24' : doc.type === 'pdf' ? '#ef4444' : doc.type === 'md' ? '#60a5fa' : 'var(--text-muted)',
        background: doc.isExam ? 'rgba(251,191,36,0.1)' : doc.type === 'pdf' ? 'rgba(239,68,68,0.1)' : doc.type === 'md' ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.05)',
        border: doc.isExam ? '1px solid rgba(251,191,36,0.2)' : '1px solid transparent',
      }}>
        {doc.isExam ? 'EXAM' : doc.type.toUpperCase()}
      </span>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export const ExamMode: React.FC<ExamModeProps> = ({
  allDocs,
  examQuestions,
  isGenerating,
  geminiApiKeyExists,
  onGenerate,
  onOpenSettings,
}) => {
  const studyDocs = allDocs.filter((d) => !d.isExam);
  const examPapers = allDocs.filter((d) => d.isExam);

  const [phase, setPhase] = useState<Phase>('setup');
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0);
  const [selectedStudyIds, setSelectedStudyIds] = useState<Set<string>>(new Set());
  const [selectedExamIds, setSelectedExamIds] = useState<Set<string>>(new Set());
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const examStartRef = useRef(0);

  // Auto-select all docs on mount
  useEffect(() => {
    setSelectedStudyIds(new Set(studyDocs.map((d) => d.id)));
    setSelectedExamIds(new Set(examPapers.map((d) => d.id)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to setup when notebook-level docs list changes significantly
  useEffect(() => {
    setPhase('setup');
    setAnswers([]);
    setCurrentQ(0);
  }, [allDocs.length]);

  // Countdown interval
  useEffect(() => {
    if (phase !== 'exam' || timeLimitMinutes === 0) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setTimeout(() => {
            setTimeTaken(Math.round((Date.now() - examStartRef.current) / 1000));
            setPhase('results');
          }, 0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, timeLimitMinutes]);

  const toggleStudy = (id: string) =>
    setSelectedStudyIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleExam = (id: string) =>
    setSelectedExamIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleGenerate = () => {
    if (!geminiApiKeyExists) { onOpenSettings(); return; }
    const content = studyDocs.filter((d) => selectedStudyIds.has(d.id)).map((d) => ({ name: d.name, content: d.content }));
    const style = examPapers.filter((d) => selectedExamIds.has(d.id)).map((d) => ({ name: d.name, content: d.content }));
    onGenerate(content, style, questionCount);
  };

  const startExam = () => {
    if (!examQuestions?.length) return;
    setAnswers(new Array(examQuestions.length).fill(null));
    setCurrentQ(0);
    setTimeLeft(timeLimitMinutes * 60);
    examStartRef.current = Date.now();
    setPhase('exam');
  };

  const submitExam = () => {
    setTimeTaken(Math.round((Date.now() - examStartRef.current) / 1000));
    setPhase('results');
  };

  const retakeExam = () => {
    if (!examQuestions?.length) return;
    setAnswers(new Array(examQuestions.length).fill(null));
    setCurrentQ(0);
    setTimeLeft(timeLimitMinutes * 60);
    examStartRef.current = Date.now();
    setPhase('exam');
  };

  const canGenerate = selectedStudyIds.size > 0;

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (isGenerating) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '14px' }}>
        <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>Writing your exam questions...</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Analysing {selectedStudyIds.size} source{selectedStudyIds.size !== 1 ? 's' : ''}
          {selectedExamIds.size > 0 ? ` · matching style from ${selectedExamIds.size} exam paper${selectedExamIds.size !== 1 ? 's' : ''}` : ''}
        </span>
      </div>
    );
  }

  // ─── Setup phase ────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '100%', maxWidth: '580px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', paddingBottom: '8px' }}>
            <div style={{ display: 'inline-flex', padding: '14px', borderRadius: '50%', background: 'rgba(139,92,246,0.1)', marginBottom: '10px' }}>
              <ClipboardList size={32} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Configure Your Exam</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Select your study sources and (optionally) past exam papers to calibrate question style.
            </p>
          </div>

          {/* Study content selection */}
          <div className="glass" style={{ padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                <BookOpen size={15} style={{ color: 'var(--accent-primary)' }} />
                Study Content
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>— Gemini will ask about this</span>
              </h3>
              {studyDocs.length > 1 && (
                <button
                  onClick={() => {
                    if (selectedStudyIds.size === studyDocs.length) setSelectedStudyIds(new Set());
                    else setSelectedStudyIds(new Set(studyDocs.map((d) => d.id)));
                  }}
                  style={{ fontSize: '0.72rem', background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer' }}
                >
                  {selectedStudyIds.size === studyDocs.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            {studyDocs.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                No study documents in this notebook yet. Upload PDFs, notes, or markdown files via the sidebar.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {studyDocs.map((doc) => (
                  <DocCheckbox key={doc.id} doc={doc} checked={selectedStudyIds.has(doc.id)} onToggle={() => toggleStudy(doc.id)} />
                ))}
              </div>
            )}
            {selectedStudyIds.size === 0 && studyDocs.length > 0 && (
              <p style={{ marginTop: '8px', fontSize: '0.78rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⚠️ Select at least one source to generate questions.
              </p>
            )}
          </div>

          {/* Exam style reference */}
          <div className="glass" style={{ padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                <FileText size={15} style={{ color: '#fbbf24' }} />
                Exam Style Reference
                <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>— optional, guides question style</span>
              </h3>
              {examPapers.length > 1 && (
                <button
                  onClick={() => {
                    if (selectedExamIds.size === examPapers.length) setSelectedExamIds(new Set());
                    else setSelectedExamIds(new Set(examPapers.map((d) => d.id)));
                  }}
                  style={{ fontSize: '0.72rem', background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer' }}
                >
                  {selectedExamIds.size === examPapers.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            {examPapers.length === 0 ? (
              <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.55' }}>
                No exam papers uploaded yet. Click the{' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#fbbf24', fontWeight: 700 }}>
                  <ClipboardList size={12} /> Upload Exam
                </span>{' '}
                button in the Sources header to add past papers — Gemini will then match their question style.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {examPapers.map((doc) => (
                  <DocCheckbox key={doc.id} doc={doc} checked={selectedExamIds.has(doc.id)} onToggle={() => toggleExam(doc.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Settings row */}
          <div className="glass" style={{ padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
                Questions
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[5, 10, 15, 20].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: '7px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.15s',
                      border: `2px solid ${questionCount === n ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                      background: questionCount === n ? 'rgba(139,92,246,0.15)' : 'transparent',
                      color: questionCount === n ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
                Time Limit <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(0 = none)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number" min={0} max={240}
                  value={timeLimitMinutes === 0 ? '' : timeLimitMinutes}
                  placeholder="0"
                  onChange={(e) => setTimeLimitMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width: '70px', fontSize: '0.95rem', padding: '7px 10px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>min</span>
                {timeLimitMinutes > 0 && (
                  <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>
                    <Timer size={11} style={{ display: 'inline', marginRight: '2px', verticalAlign: 'middle' }} />
                    {timeLimitMinutes}:00
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {examQuestions && examQuestions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={startExam} className="btn-primary" style={{ padding: '13px', fontSize: '0.98rem', justifyContent: 'center', gap: '8px' }}>
                <ClipboardList size={17} /> Start Exam ({examQuestions.length} questions ready)
              </button>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="btn-secondary"
                style={{ padding: '10px', fontSize: '0.85rem', justifyContent: 'center', gap: '6px' }}
              >
                <Sparkles size={14} /> Regenerate Questions
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="btn-primary"
              style={{ padding: '14px', fontSize: '0.98rem', justifyContent: 'center', gap: '8px' }}
            >
              <Sparkles size={17} /> Generate Exam Questions
            </button>
          )}
        </div>
      </div>
    );
  }

  const questions = examQuestions ?? [];

  // ─── Exam phase ─────────────────────────────────────────────────────────────
  if (phase === 'exam') {
    const q = questions[currentQ];
    const answered = answers.filter((a) => a !== null).length;
    const timerMinutes = Math.floor(timeLeft / 60);
    const timerSeconds = timeLeft % 60;
    const timerCritical = timeLimitMinutes > 0 && timeLeft < 30;
    const timerWarning = timeLimitMinutes > 0 && timeLeft < 90;
    const timerColor = timerCritical ? '#ef4444' : timerWarning ? '#f59e0b' : 'var(--text-secondary)';

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header bar */}
        <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
              Q {currentQ + 1} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {questions.length}</span>
            </span>
            <div style={{ position: 'relative', width: '100px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${(answered / questions.length) * 100}%`, background: 'var(--accent-gradient)', transition: 'width 0.3s', borderRadius: '2px' }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{answered}/{questions.length} answered</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {timeLimitMinutes > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: timerColor, fontWeight: 700, fontSize: '1.05rem', fontFamily: 'monospace', transition: 'color 0.3s' }}>
                <Timer size={15} />
                {`${timerMinutes}:${timerSeconds.toString().padStart(2, '0')}`}
              </div>
            )}
            <button
              onClick={() => { if (window.confirm('Submit your exam now?')) submitExam(); }}
              className="btn-primary"
              style={{ padding: '6px 16px', fontSize: '0.82rem' }}
            >
              Submit Exam
            </button>
          </div>
        </div>

        {/* Question area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 24px', display: 'flex', flexDirection: 'column', gap: '28px', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: '660px' }}>
            {q.topic && (
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                {q.topic}
              </div>
            )}
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', lineHeight: '1.65', marginBottom: '22px' }}>
              {q.question}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {q.options.map((opt, idx) => {
                const selected = answers[currentQ] === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setAnswers((prev) => { const next = [...prev]; next[currentQ] = idx; return next; });
                    }}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '13px 16px', borderRadius: '10px', textAlign: 'left', width: '100%', cursor: 'pointer', transition: 'all 0.15s', fontSize: '0.9rem', lineHeight: '1.5',
                      border: `2px solid ${selected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.07)'}`,
                      background: selected ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.015)',
                      color: selected ? '#fff' : 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#fff'; } }}
                    onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                  >
                    <span style={{ minWidth: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0, background: selected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.07)', color: '#fff' }}>
                      {OPTION_LABELS[idx]}
                    </span>
                    <span style={{ paddingTop: '2px' }}>{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question navigator */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '660px', width: '100%' }}>
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentQ(i)}
                style={{
                  width: '30px', height: '30px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s',
                  border: `1.5px solid ${i === currentQ ? 'var(--accent-primary)' : answers[i] !== null ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  background: i === currentQ ? 'rgba(139,92,246,0.25)' : answers[i] !== null ? 'rgba(139,92,246,0.08)' : 'transparent',
                  color: i === currentQ ? '#fff' : answers[i] !== null ? '#a78bfa' : 'var(--text-muted)',
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Prev / Next */}
          <div style={{ display: 'flex', gap: '10px', maxWidth: '660px', width: '100%' }}>
            <button onClick={() => setCurrentQ((q) => Math.max(0, q - 1))} disabled={currentQ === 0} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: '6px' }}>
              <ChevronLeft size={15} /> Previous
            </button>
            <button onClick={() => setCurrentQ((q) => Math.min(questions.length - 1, q + 1))} disabled={currentQ === questions.length - 1} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: '6px' }}>
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Results phase ───────────────────────────────────────────────────────────
  const score = answers.filter((a, i) => a === questions[i]?.correctIndex).length;
  const total = questions.length;
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = pct >= 60;

  const wrongByTopic = new Map<string, number>();
  answers.forEach((a, i) => {
    if (a !== questions[i]?.correctIndex) {
      const topic = questions[i]?.topic || 'General';
      wrongByTopic.set(topic, (wrongByTopic.get(topic) ?? 0) + 1);
    }
  });
  const focusAreas = Array.from(wrongByTopic.entries()).sort((a, b) => b[1] - a[1]);
  const timeTakenDisplay = timeTaken > 0 ? `${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s` : null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Score card */}
      <div className="glass animate-fade" style={{ padding: '28px', borderRadius: '16px', border: '1px solid var(--border-color)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <div style={{ fontSize: '3rem', lineHeight: 1 }}>{pct >= 80 ? '🏆' : pct >= 60 ? '✅' : '📚'}</div>
        <div style={{ fontSize: '2.8rem', fontWeight: 800, color: passed ? '#10b981' : '#ef4444', lineHeight: 1, marginTop: '6px' }}>
          {score}/{total}
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>{pct}%</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {passed ? 'Well done! Keep it up.' : "Keep studying — you'll get there."}
          {timeTakenDisplay && <span style={{ marginLeft: '8px' }}>· {timeTakenDisplay}</span>}
        </div>
      </div>

      {/* Focus areas */}
      {focusAreas.length > 0 && (
        <div className="glass" style={{ padding: '18px 20px', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 700, color: '#fbbf24', marginBottom: '12px' }}>
            <AlertTriangle size={15} /> Areas to Focus On
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {focusAreas.map(([topic, count]) => (
              <div key={topic} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '4px 6px', borderRadius: '6px' }}>
                <span>{topic}</span>
                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.78rem', background: 'rgba(239,68,68,0.1)', padding: '1px 8px', borderRadius: '8px' }}>
                  {count} wrong
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retake / New */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={retakeExam} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: '6px' }}>
          <RotateCcw size={14} /> Retake
        </button>
        <button onClick={() => setPhase('setup')} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: '6px' }}>
          <Sparkles size={14} /> New Exam
        </button>
      </div>

      {/* Question review */}
      <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>
        Review All Questions
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {questions.map((q, i) => {
          const userAnswer = answers[i];
          const isCorrect = userAnswer === q.correctIndex;
          const isUnanswered = userAnswer === null;
          return (
            <div key={i} className="glass" style={{ padding: '16px', borderRadius: '10px', border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, background: isCorrect ? 'rgba(16,185,129,0.03)' : 'rgba(239,68,68,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: isCorrect ? 0 : '10px' }}>
                {isCorrect
                  ? <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                  : <XCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                }
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.87rem', fontWeight: 600, color: '#fff', lineHeight: '1.5', marginBottom: '3px' }}>Q{i + 1}. {q.question}</p>
                  {q.topic && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{q.topic}</span>}
                </div>
              </div>
              {!isCorrect && (
                <div style={{ paddingLeft: '26px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {!isUnanswered && (
                    <div style={{ fontSize: '0.82rem', color: '#f87171' }}>
                      Your answer: <strong>{OPTION_LABELS[userAnswer!]}.</strong> {q.options[userAnswer!]}
                    </div>
                  )}
                  {isUnanswered && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Not answered</div>}
                  <div style={{ fontSize: '0.82rem', color: '#34d399' }}>
                    Correct: <strong>{OPTION_LABELS[q.correctIndex]}.</strong> {q.options[q.correctIndex]}
                  </div>
                  {q.explanation && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', lineHeight: '1.55', borderLeft: '2px solid var(--accent-primary)' }}>
                      💡 {q.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
