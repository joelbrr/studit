import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, BookOpen, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ChatMessage, geminiService } from '../services/gemini';
import { MarkdownRenderer } from './DocViewer';
import { type DocumentData } from '../services/db';

interface AICopilotProps {
  notebookName: string;
  activeDoc: DocumentData | null;
  allDocs: DocumentData[];
  geminiApiKeyExists: boolean;
  onOpenSettings: () => void;
  notebookNotes?: string;
  collapsed: boolean;
  onToggle: () => void;
}

export const AICopilot: React.FC<AICopilotProps> = ({
  notebookName,
  activeDoc,
  allDocs,
  geminiApiKeyExists,
  onOpenSettings,
  notebookNotes,
  collapsed,
  onToggle,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Reset chat history when document changes
  useEffect(() => {
    setMessages([
      {
        role: 'model',
        parts: [{ text: `Hi! I'm Studit, your study assistant. Ask me anything about your active document **${activeDoc ? activeDoc.name : 'No active file'}** or click **Generate Study Guide** to look at everything in this notebook.` }]
      }
    ]);
  }, [activeDoc?.id]);

  const getSourcesContext = (): string => {
    const notesSection = notebookNotes?.trim()
      ? `\n\n=====\n\nNotebook Scratchpad Notes (written by the student):\n${notebookNotes}`
      : '';

    if (activeDoc) {
      return `Document Title: ${activeDoc.name}\nContent:\n${activeDoc.content}${notesSection}`;
    }
    if (allDocs.length > 0) {
      return allDocs.map(doc => `Document Title: ${doc.name}\nContent:\n${doc.content}`).join('\n\n=====\n\n') + notesSection;
    }
    return notesSection.trim();
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isSending) return;
    if (!geminiApiKeyExists) {
      onOpenSettings();
      return;
    }

    const userMsg: ChatMessage = {
      role: 'user',
      parts: [{ text: text.trim() }]
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsSending(true);

    try {
      const sourcesContext = getSourcesContext();
      // Exclude greeting message from historical API context to save tokens and keep it focused
      const historyContext = messages.slice(1); 
      
      const response = await geminiService.chatWithContext(
        sourcesContext,
        [...historyContext, userMsg],
        text.trim()
      );

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: response }]
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: `❌ **Error:** ${err.message || 'Failed to reach Gemini API. Please make sure your API key is correct and valid.'}` }]
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerateStudyGuide = async () => {
    if (allDocs.length === 0) return;
    if (!geminiApiKeyExists) {
      onOpenSettings();
      return;
    }

    setIsGeneratingGuide(true);
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        parts: [{ text: 'Generate a comprehensive study guide for this notebook.' }]
      }
    ]);

    try {
      const notesSection = notebookNotes?.trim()
        ? `\n\n=====\n\nNotebook Scratchpad Notes (written by the student):\n${notebookNotes}`
        : '';
      const sourcesContext = allDocs.map(doc => `Document Name: ${doc.name}\nContent:\n${doc.content}`).join('\n\n=====\n\n') + notesSection;
      const response = await geminiService.generateStudyGuide(notebookName, sourcesContext);

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: response }]
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          parts: [{ text: `❌ **Error:** Failed to generate study guide. ${err.message || ''}` }]
        }
      ]);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const suggestions = [
    'Explain the core concept in 3 bullet points.',
    'Create 3 quiz questions about this document.',
    'What are the key terms and their definitions?',
    "Explain this like I'm a beginner."
  ];

  return (
    <div className="glass" style={{ width: collapsed ? '48px' : 'var(--ai-panel-width)', height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-color)', zIndex: 10, transition: 'width 0.25s ease', overflow: 'hidden', flexShrink: 0 }}>
      {/* Collapsed strip */}
      {collapsed ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '14px', gap: '12px' }}>
          <button onClick={onToggle} className="btn-icon" title="Expand AI Copilot" style={{ width: '32px', height: '32px' }}>
            <ChevronLeft size={16} />
          </button>
          <Sparkles size={16} style={{ color: 'var(--accent-primary)', opacity: 0.7 }} />
        </div>
      ) : (
      <>
      {/* Copilot Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.01)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>AI Study Copilot</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {allDocs.length > 0 && (
            <button
              onClick={handleGenerateStudyGuide}
              disabled={isGeneratingGuide || !geminiApiKeyExists}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', gap: '6px', alignItems: 'center' }}
            >
              {isGeneratingGuide ? <Loader2 className="animate-spin" size={12} /> : <BookOpen size={12} />}
              Study Guide
            </button>
          )}
          <button onClick={onToggle} className="btn-icon" title="Collapse AI Copilot" style={{ width: '28px', height: '28px', flexShrink: 0 }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.map((msg, index) => (
          <div 
            key={index}
            className="animate-fade"
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              borderBottomRightRadius: msg.role === 'user' ? '2px' : '12px',
              borderBottomLeftRadius: msg.role === 'model' ? '2px' : '12px',
              backgroundColor: msg.role === 'user' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.04)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
              color: '#fff',
              fontSize: '0.92rem',
              boxShadow: msg.role === 'user' ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none'
            }}>
              <MarkdownRenderer content={msg.parts[0].text} />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', padding: '0 4px' }}>
              {msg.role === 'user' ? 'You' : 'Studit AI'}
            </span>
          </div>
        ))}
        {isSending && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-secondary)', padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span>Studit is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Pills */}
      {messages.length === 1 && !isSending && (
        <div style={{ padding: '0 20px', display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(s)}
              className="glass"
              style={{
                padding: '6px 12px',
                borderRadius: '20px',
                border: '1px solid var(--border-color)',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input Tray */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputValue);
          }}
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <input 
            type="text" 
            placeholder={activeDoc ? "Ask about this document..." : "Select a document to chat..."}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isSending}
            style={{ flex: 1, fontSize: '0.9rem' }}
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isSending}
            className="btn-primary" 
            style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center', borderRadius: '8px', flexShrink: 0 }}
          >
            <Send size={16} />
          </button>
        </form>
        {!geminiApiKeyExists && (
          <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ API key not configured</span>
            <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem' }}>Configure Now</button>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};
