import React, { useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';

interface MindMapProps {
  code: string;
  onRegenerate: () => void;
  isGenerating: boolean;
}

// Initialize Mermaid with custom styles matching our dark glass theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    background: '#0f1322',
    primaryColor: '#8b5cf6',
    primaryTextColor: '#f3f4f6',
    lineColor: '#6366f1',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f1322'
  },
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    curve: 'basis'
  }
});

export const MindMap: React.FC<MindMapProps> = ({ code, onRegenerate, isGenerating }) => {
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Zoom & Pan state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Render Mermaid code
  useEffect(() => {
    if (!code) return;

    // Parse out raw Mermaid code from code blocks if LLM outputted markdown
    let cleanedCode = code.trim();
    if (cleanedCode.includes('```mermaid')) {
      cleanedCode = cleanedCode.split('```mermaid')[1].split('```')[0].trim();
    } else if (cleanedCode.includes('```')) {
      cleanedCode = cleanedCode.split('```')[1].split('```')[0].trim();
    }

    const renderId = `mermaid-svg-${Math.floor(Math.random() * 1000000)}`;

    const renderGraph = async () => {
      try {
        // Clear previous errors/drawings
        setError(null);
        
        // Remove any element with error id or duplicate render id to avoid conflicts
        const existingNode = document.getElementById(renderId);
        if (existingNode) existingNode.remove();

        const { svg } = await mermaid.render(renderId, cleanedCode);
        setSvgHtml(svg);
        // Reset zoom/pan when a new map loads
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setError('The concept map contains syntax errors. You can try regenerating it.');
        
        // Clean up Mermaid error nodes from DOM
        const badElement = document.getElementById(renderId);
        if (badElement) badElement.remove();
        
        const bindElement = document.getElementById(`d${renderId}`);
        if (bindElement) bindElement.remove();
      }
    };

    renderGraph();
  }, [code]);

  // Zoom helpers
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.15, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.15, 0.4));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only allow left click drag
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Style container based on fullscreen toggle
  const wrapperStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: '#080a10',
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh'
      }
    : {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: '100%',
        overflow: 'hidden'
      };

  return (
    <div style={wrapperStyle} className="animate-fade">
      {/* Control Bar */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(15,19,34,0.4)',
        zIndex: 5
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleZoomIn} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Zoom In">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleZoomOut} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Zoom Out">
            <ZoomOut size={14} />
          </button>
          <button onClick={handleReset} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Reset View">
            <RotateCcw size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>💡 Hold Left-Click & Drag to move map</span>
          <button 
            onClick={onRegenerate} 
            disabled={isGenerating} 
            className="btn-secondary" 
            style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <RefreshCw size={12} className={isGenerating ? 'animate-spin' : ''} /> Regenerate Map
          </button>
          <button onClick={toggleFullscreen} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title="Fullscreen">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Map Display area */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'radial-gradient(circle, rgba(99,102,241,0.02) 0%, transparent 80%), #0b0f19'
        }}
      >
        {error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
            <AlertTriangle size={36} style={{ color: 'var(--error)', marginBottom: '12px' }} />
            <p style={{ fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Rendering Error</p>
            <p style={{ fontSize: '0.85rem', maxWidth: '350px', textAlign: 'center', marginBottom: '16px' }}>{error}</p>
            <button onClick={onRegenerate} className="btn-primary" style={{ fontSize: '0.85rem' }}>Retry Drawing</button>
          </div>
        ) : (
          <div 
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              padding: '40px'
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}
      </div>

      {/* Embedded style override for Mermaid nodes inside our custom container to look premium */}
      <style>{`
        .mermaid svg {
          max-width: 100%;
          height: auto;
        }
        g.node rect, g.node circle, g.node polygon {
          fill: var(--bg-card) !important;
          stroke: var(--border-active) !important;
          stroke-width: 1.5px !important;
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25));
        }
        g.node:hover rect {
          fill: rgba(139, 92, 246, 0.15) !important;
          stroke: #8b5cf6 !important;
        }
        span.nodeLabel {
          color: var(--text-primary) !important;
          font-family: var(--font-main) !important;
          font-size: 0.85rem !important;
          font-weight: 500 !important;
        }
        .edgePath .path {
          stroke: #6366f1 !important;
          stroke-width: 1.8px !important;
          opacity: 0.85;
        }
        .marker {
          fill: #6366f1 !important;
          stroke: none !important;
        }
      `}</style>
    </div>
  );
};
