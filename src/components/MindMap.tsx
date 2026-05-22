import React, { useEffect, useState, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2,
  RotateCcw, AlertTriangle, RefreshCw,
  Download, Image
} from 'lucide-react';

interface MindMapProps {
  code: string;
  onRegenerate: () => void;
  isGenerating: boolean;
  docTitle?: string;
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

const ZOOM_STEP = 0.12;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;

export const MindMap: React.FC<MindMapProps> = ({ code, onRegenerate, isGenerating, docTitle }) => {
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Zoom & Pan state via refs for performance (avoid re-renders on every mouse move)
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  const [displayScale, setDisplayScale] = useState(1); // mirrors scaleRef for UI display only
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  /** Apply current transform to the inner div without triggering React re-render */
  const applyTransform = useCallback((animated = false) => {
    if (!innerRef.current) return;
    const { x, y } = positionRef.current;
    const s = scaleRef.current;
    innerRef.current.style.transition = animated ? 'transform 0.2s ease-out' : 'none';
    innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    setDisplayScale(Math.round(s * 100));
  }, []);

  /** Auto-fit the SVG inside the container */
  const fitToContainer = useCallback(() => {
    if (!containerRef.current || !innerRef.current) return;
    const svg = innerRef.current.querySelector('svg');
    if (!svg) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    if (!svgRect.width || !svgRect.height) return;

    // Use the natural SVG size before any transforms
    const svgW = svg.scrollWidth || svgRect.width;
    const svgH = svg.scrollHeight || svgRect.height;

    const padding = 80;
    const scaleX = (containerRect.width - padding) / svgW;
    const scaleY = (containerRect.height - padding) / svgH;
    const fitScale = Math.min(scaleX, scaleY, 1); // don't scale up beyond 1x on fit

    const centeredX = (containerRect.width - svgW * fitScale) / 2;
    const centeredY = (containerRect.height - svgH * fitScale) / 2;

    scaleRef.current = fitScale;
    positionRef.current = { x: centeredX, y: centeredY };
    applyTransform(true);
  }, [applyTransform]);

  // Render Mermaid code
  useEffect(() => {
    if (!code) return;

    let cleanedCode = code.trim();
    if (cleanedCode.includes('```mermaid')) {
      cleanedCode = cleanedCode.split('```mermaid')[1].split('```')[0].trim();
    } else if (cleanedCode.includes('```')) {
      cleanedCode = cleanedCode.split('```')[1].split('```')[0].trim();
    }

    const renderId = `mermaid-svg-${Math.floor(Math.random() * 1_000_000)}`;

    const renderGraph = async () => {
      try {
        setError(null);
        const existing = document.getElementById(renderId);
        if (existing) existing.remove();

        const { svg } = await mermaid.render(renderId, cleanedCode);
        setSvgHtml(svg);

        // Reset transform, then auto-fit after the SVG is painted
        scaleRef.current = 1;
        positionRef.current = { x: 0, y: 0 };
        applyTransform(false);

        // Wait a tick for React to inject the SVG, then fit
        requestAnimationFrame(() => setTimeout(fitToContainer, 80));
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setError('The concept map contains syntax errors. You can try regenerating it.');
        const badElement = document.getElementById(renderId);
        if (badElement) badElement.remove();
        const bindElement = document.getElementById(`d${renderId}`);
        if (bindElement) bindElement.remove();
      }
    };

    renderGraph();
  }, [code, applyTransform, fitToContainer]);

  // ─── Mouse Wheel Zoom (cursor-centred) ───────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      // Cursor position relative to container
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scaleRef.current + delta));
      const ratio = newScale / scaleRef.current;

      // Adjust position so that the point under the cursor stays fixed
      positionRef.current = {
        x: cx - ratio * (cx - positionRef.current.x),
        y: cy - ratio * (cy - positionRef.current.y)
      };
      scaleRef.current = newScale;
      applyTransform(false);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [applyTransform]);

  // ─── Button zoom ─────────────────────────────────────────────────────────
  const handleZoomIn = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newScale = Math.min(ZOOM_MAX, scaleRef.current + ZOOM_STEP);
    const ratio = newScale / scaleRef.current;
    positionRef.current = {
      x: cx - ratio * (cx - positionRef.current.x),
      y: cy - ratio * (cy - positionRef.current.y)
    };
    scaleRef.current = newScale;
    applyTransform(true);
  };

  const handleZoomOut = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newScale = Math.max(ZOOM_MIN, scaleRef.current - ZOOM_STEP);
    const ratio = newScale / scaleRef.current;
    positionRef.current = {
      x: cx - ratio * (cx - positionRef.current.x),
      y: cy - ratio * (cy - positionRef.current.y)
    };
    scaleRef.current = newScale;
    applyTransform(true);
  };

  const handleReset = () => fitToContainer();

  // ─── Pan (drag) ──────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y
    };
    if (innerRef.current) innerRef.current.style.transition = 'none';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    positionRef.current = {
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    };
    applyTransform(false);
  };

  const handleMouseUp = () => { isDragging.current = false; };

  // ─── Fullscreen ──────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    // Re-fit after layout change
    setTimeout(fitToContainer, 120);
  };

  // ─── Download as PNG ─────────────────────────────────────────────────────
  const handleDownloadPng = async () => {
    if (!svgHtml || isDownloading) return;
    setIsDownloading(true);
    try {
      // Create a fresh SVG element from the mermaid output
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgHtml, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) return;

      // Force explicit dimensions for Canvas render
      const bbox = svgEl.getBBox ? svgEl.getBBox() : null;
      const w = parseFloat(svgEl.getAttribute('width') || '') || bbox?.width || 1200;
      const h = parseFloat(svgEl.getAttribute('height') || '') || bbox?.height || 900;
      svgEl.setAttribute('width', String(w));
      svgEl.setAttribute('height', String(h));

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      // Draw to canvas at 2× resolution for retina quality
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, w, h);

      await new Promise<void>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
        img.onerror = reject;
        img.src = url;
      });

      URL.revokeObjectURL(url);

      const link = document.createElement('a');
      link.download = `${docTitle ?? 'concept-map'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // ─── Download as SVG ─────────────────────────────────────────────────────
  const handleDownloadSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${docTitle ?? 'concept-map'}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─── Styles ───────────────────────────────────────────────────────────────
  const wrapperStyle: React.CSSProperties = isFullscreen
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#080a10', display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }
    : { flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden' };

  return (
    <div style={wrapperStyle} className="animate-fade">
      {/* ── Control Bar ─────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(15,19,34,0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 5,
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        {/* Left: Zoom controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={handleZoomOut} className="btn-secondary" style={{ padding: '6px 10px' }} title="Zoom Out (or scroll down)">
            <ZoomOut size={14} />
          </button>

          {/* Scale badge */}
          <span style={{
            minWidth: '52px',
            textAlign: 'center',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '6px',
            padding: '4px 8px',
            border: '1px solid var(--border-color)',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {displayScale}%
          </span>

          <button onClick={handleZoomIn} className="btn-secondary" style={{ padding: '6px 10px' }} title="Zoom In (or scroll up)">
            <ZoomIn size={14} />
          </button>

          <button onClick={handleReset} className="btn-secondary" style={{ padding: '6px 10px', marginLeft: '2px' }} title="Fit to screen">
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Center: hint */}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', userSelect: 'none' }}>
          🖱 Scroll to zoom · Drag to pan
        </span>

        {/* Right: actions */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Download PNG */}
          <button
            onClick={handleDownloadPng}
            disabled={!svgHtml || isDownloading}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', gap: '4px', alignItems: 'center' }}
            title="Download as PNG image"
          >
            <Image size={13} />
            {isDownloading ? 'Saving…' : 'PNG'}
          </button>

          {/* Download SVG */}
          <button
            onClick={handleDownloadSvg}
            disabled={!svgHtml}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', gap: '4px', alignItems: 'center' }}
            title="Download as SVG vector"
          >
            <Download size={13} />
            SVG
          </button>

          <button
            onClick={onRegenerate}
            disabled={isGenerating}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', gap: '4px', alignItems: 'center' }}
          >
            <RefreshCw size={12} className={isGenerating ? 'animate-spin' : ''} />
            Regenerate
          </button>

          <button onClick={toggleFullscreen} className="btn-secondary" style={{ padding: '6px 10px' }} title="Fullscreen">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── Map Canvas ──────────────────────────────────────────────── */}
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
          cursor: isDragging.current ? 'grabbing' : 'grab',
          background: 'radial-gradient(circle at 50% 40%, rgba(99,102,241,0.04) 0%, transparent 70%), #0b0f19'
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
            ref={innerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transformOrigin: '0 0',
              willChange: 'transform'
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}
      </div>

      {/* Mermaid node style overrides */}
      <style>{`
        g.node rect, g.node circle, g.node polygon, g.node ellipse {
          fill: var(--bg-card) !important;
          stroke: var(--border-active) !important;
          stroke-width: 1.5px !important;
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35));
        }
        g.node:hover rect, g.node:hover circle, g.node:hover polygon {
          fill: rgba(139, 92, 246, 0.18) !important;
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
        .marker { fill: #6366f1 !important; stroke: none !important; }
      `}</style>
    </div>
  );
};
