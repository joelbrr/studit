import React, { useState, useEffect } from 'react';
import { CalendarDays, GraduationCap, Loader2, Zap, Trash2, PackageOpen, CheckCircle2, Circle } from 'lucide-react';
import { type Notebook, type DocumentData } from '../services/db';
import { MarkdownRenderer } from './DocViewer';

interface StudyPlannerProps {
  notebook: Notebook;
  documents: DocumentData[];
  geminiApiKeyExists: boolean;
  onSetExamDate: (date: number | null) => void;
  onGeneratePlan: () => Promise<void>;
  isGeneratingPlan: boolean;
  studyPlan: string | null;
  onOpenSettings: () => void;
  onExport: () => void;
  isExporting: boolean;
}

function getDaysLeft(examDate: number): number {
  return Math.max(0, Math.ceil((examDate - Date.now()) / (1000 * 60 * 60 * 24)));
}

function estimateReadMinutes(content: string): number {
  return Math.max(1, Math.ceil(content.split(/\s+/).length / 200));
}

function getUrgencyColor(daysLeft: number): string {
  if (daysLeft <= 2) return '#ef4444';
  if (daysLeft <= 7) return '#f59e0b';
  return '#10b981';
}

export const StudyPlanner: React.FC<StudyPlannerProps> = ({
  notebook,
  documents,
  geminiApiKeyExists,
  onSetExamDate,
  onGeneratePlan,
  isGeneratingPlan,
  studyPlan,
  onOpenSettings,
  onExport,
  isExporting,
}) => {
  const [dateInput, setDateInput] = useState(
    notebook.examDate ? new Date(notebook.examDate).toISOString().split('T')[0] : ''
  );

  useEffect(() => {
    setDateInput(notebook.examDate ? new Date(notebook.examDate).toISOString().split('T')[0] : '');
  }, [notebook.id]);

  const daysLeft = notebook.examDate ? getDaysLeft(notebook.examDate) : null;
  const urgencyColor = daysLeft !== null ? getUrgencyColor(daysLeft) : 'var(--accent-primary)';
  const totalReadTime = documents.reduce((sum, d) => sum + estimateReadMinutes(d.content), 0);

  const handleDateChange = (val: string) => {
    setDateInput(val);
    onSetExamDate(val ? new Date(val).getTime() : null);
  };

  const canGenerate = !!notebook.examDate && documents.length > 0 && geminiApiKeyExists;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GraduationCap size={16} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
            {notebook.name} — Study Planner
          </span>
        </div>
        {daysLeft !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px', borderRadius: '20px',
            background: `${urgencyColor}22`, border: `1px solid ${urgencyColor}55`,
            color: urgencyColor, fontSize: '0.82rem', fontWeight: 700, flexShrink: 0
          }}>
            <CalendarDays size={13} />
            {daysLeft === 0 ? 'Exam today!' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Exam date picker */}
        <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CalendarDays size={15} style={{ color: 'var(--accent-primary)' }} />
            Set Exam Date
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => handleDateChange(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{ fontSize: '0.9rem', padding: '8px 12px', flex: 1, maxWidth: '220px' }}
            />
            {notebook.examDate && (
              <button
                onClick={() => handleDateChange('')}
                className="btn-icon"
                title="Remove exam date"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {daysLeft !== null && (
            <p style={{ marginTop: '10px', fontSize: '0.82rem', color: urgencyColor, fontWeight: 600 }}>
              {daysLeft === 0
                ? '🎯 Exam is today — best of luck!'
                : daysLeft === 1
                ? '⚠️ 1 day remaining — focus on essentials only.'
                : daysLeft <= 7
                ? `⏳ ${daysLeft} days left — intensive study mode.`
                : `✅ ${daysLeft} days — plenty of time to build a solid plan.`}
            </p>
          )}
        </div>

        {/* Workload overview */}
        {documents.length > 0 && (
          <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={15} style={{ color: 'var(--accent-primary)' }} />
              Workload Overview
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '14px' }}>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-primary)' }}>{documents.length}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>SOURCES</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{totalReadTime}m</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>EST. READ TIME</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {documents.map((doc) => (
                <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                    {doc.name}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    ~{estimateReadMinutes(doc.content)}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {documents.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Upload documents to this notebook to generate a study plan.
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={geminiApiKeyExists ? onGeneratePlan : onOpenSettings}
          disabled={isGeneratingPlan || !notebook.examDate || documents.length === 0}
          className="btn-primary"
          style={{ padding: '12px 24px', fontSize: '0.9rem', justifyContent: 'center', display: 'flex', gap: '8px', alignItems: 'center', borderRadius: '10px' }}
        >
          {isGeneratingPlan ? (
            <><Loader2 size={16} className="animate-spin" /> Generating your plan...</>
          ) : (
            <><GraduationCap size={16} /> {studyPlan ? 'Regenerate Study Plan' : 'Generate Study Plan'}</>
          )}
        </button>
        {!notebook.examDate && documents.length > 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '-10px' }}>
            Set an exam date above to generate a plan.
          </p>
        )}

        {/* Plan output */}
        {studyPlan && (
          <div className="glass animate-fade" style={{ padding: '28px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <MarkdownRenderer content={studyPlan} />
          </div>
        )}

        {/* Export Study Pack */}
        {documents.length > 0 && (
          <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PackageOpen size={15} style={{ color: 'var(--accent-primary)' }} />
              Export Study Pack
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.5' }}>
              Downloads a <strong style={{ color: 'var(--text-secondary)' }}>.zip</strong> with everything generated so far across all documents, plus a fresh AI study guide.
            </p>

            {/* Content preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '16px' }}>
              {/* Study Guide row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {geminiApiKeyExists
                  ? <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
                  : <Circle size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <span>
                  <strong style={{ color: '#fff' }}>study_guide.md</strong>
                  {geminiApiKeyExists ? ' — generated fresh on export' : ' — requires API key'}
                </span>
              </div>

              {/* Per-doc rows */}
              {documents.map((doc) => {
                const hasSummary = !!doc.summary;
                const hasMindmap = !!doc.mindmap;
                const hasRef = !!(doc.referenceSheet && (doc.referenceSheet.terms.length + doc.referenceSheet.formulas.length) > 0);
                const items = [
                  hasSummary && 'summary',
                  hasMindmap && 'mindmap.svg',
                  hasRef && 'reference',
                ].filter(Boolean) as string[];

                return (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.78rem' }}>
                    {items.length > 0
                      ? <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                      : <Circle size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />}
                    <span>
                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.name.length > 40 ? doc.name.slice(0, 40) + '…' : doc.name}
                      </span>
                      {items.length > 0
                        ? <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({items.join(', ')})</span>
                        : <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>— no content generated yet</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={geminiApiKeyExists ? onExport : onOpenSettings}
              disabled={isExporting}
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center', borderRadius: '8px' }}
            >
              {isExporting ? (
                <><Loader2 size={15} className="animate-spin" /> Generating pack…</>
              ) : (
                <><PackageOpen size={15} /> Download Study Pack (.zip)</>
              )}
            </button>
            {!geminiApiKeyExists && (
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Add an API key to include the AI study guide in the export.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};