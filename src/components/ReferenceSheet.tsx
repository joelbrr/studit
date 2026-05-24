import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { BookMarked, Sigma, Loader2, Sparkles } from 'lucide-react';
import type { ReferenceSheetData } from '../services/db';

interface ReferenceSheetProps {
  referenceSheet: ReferenceSheetData | null;
  isGenerating: boolean;
  geminiApiKeyExists: boolean;
  docName: string;
  onGenerate: () => void;
}

const KaTeXBlock: React.FC<{ latex: string }> = ({ latex }) => {
  let html = '';
  try {
    html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
  } catch {
    html = `<code style="font-size:1rem">${latex}</code>`;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
};

export const ReferenceSheet: React.FC<ReferenceSheetProps> = ({
  referenceSheet,
  isGenerating,
  geminiApiKeyExists,
  docName,
  onGenerate,
}) => {
  if (isGenerating) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
        <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Extracting formulas and key terms...</span>
      </div>
    );
  }

  if (!referenceSheet) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ padding: '16px', borderRadius: '50%', backgroundColor: 'rgba(139,92,246,0.08)', color: 'var(--accent-primary)', marginBottom: '16px' }}>
          <BookMarked size={44} />
        </div>
        <h3 style={{ color: '#fff', marginBottom: '8px', fontSize: '1.25rem' }}>Build Your Reference Sheet</h3>
        <p style={{ maxWidth: '400px', fontSize: '0.9rem', marginBottom: '20px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
          Gemini will extract every formula, equation, and key term from{' '}
          <strong style={{ color: '#fff' }}>{docName}</strong> into a clean, scannable cheatsheet with LaTeX rendering.
        </p>
        <button
          onClick={onGenerate}
          disabled={!geminiApiKeyExists}
          className="btn-primary"
        >
          <Sparkles size={16} /> Generate Reference Sheet
        </button>
      </div>
    );
  }

  const { terms, formulas } = referenceSheet;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Regenerate */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onGenerate}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <Sparkles size={12} /> Regenerate
        </button>
      </div>

      {/* Formulas section */}
      {formulas.length > 0 && (
        <section>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
            <Sigma size={18} style={{ color: 'var(--accent-primary)' }} />
            Formulas & Equations
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px', marginLeft: '2px' }}>
              {formulas.length}
            </span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {formulas.map((f, i) => (
              <div
                key={i}
                className="glass"
                style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <div style={{ fontSize: '0.71rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {f.label}
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(139,92,246,0.06)', borderRadius: '6px', overflowX: 'auto', color: '#fff' }}>
                  <KaTeXBlock latex={f.latex} />
                </div>
                {f.description && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {f.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Key Terms section */}
      {terms.length > 0 && (
        <section>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
            <BookMarked size={16} style={{ color: 'var(--accent-primary)' }} />
            Key Terms
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px', marginLeft: '2px' }}>
              {terms.length}
            </span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {terms.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr',
                  gap: '16px',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ fontSize: '0.87rem', fontWeight: 700, color: '#a78bfa', wordBreak: 'break-word', lineHeight: '1.4' }}>
                  {t.term}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.55' }}>
                  {t.definition}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {terms.length === 0 && formulas.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '0.9rem' }}>
          No terms or formulas could be extracted from this document.
        </div>
      )}
    </div>
  );
};