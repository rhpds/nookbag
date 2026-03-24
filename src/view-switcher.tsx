import React, { useState, useEffect, useRef } from 'react';

import './view-switcher.css';

export type ViewMode = 'instructions' | 'split' | 'tabs';

type ViewSwitcherProps = {
  defaultMode?: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  persistUrlState?: boolean;
};

const STORE_KEY = 'sr-panel-mode';
const POS_KEY = 'sr-toolbar-pos';

type Pos = { x: number; y: number };

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// Toolbar approximate dimensions for clamping
const TOOLBAR_W = 280;
const TOOLBAR_H = 44;
const MARGIN = 8;

function clampPos(x: number, y: number): Pos {
  return {
    x: clamp(x, MARGIN, window.innerWidth  - TOOLBAR_W - MARGIN),
    y: clamp(y, MARGIN, window.innerHeight - TOOLBAR_H - MARGIN),
  };
}

function getDefaultPos(): Pos {
  // Bottom-center, just above the browser chrome
  return clampPos(
    window.innerWidth / 2 - TOOLBAR_W / 2,
    window.innerHeight - TOOLBAR_H - 24,
  );
}

function getSavedPos(): Pos | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    // Validate against current viewport — discard if out of bounds
    const clamped = clampPos(p.x, p.y);
    if (Math.abs(clamped.x - p.x) > 200 || Math.abs(clamped.y - p.y) > 200) {
      // Position is wildly off-screen — discard it
      window.localStorage.removeItem(POS_KEY);
      return null;
    }
    return clamped;
  } catch (_e) {}
  return null;
}

const IcoDoc = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
  </svg>
);

const IcoSplit = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 3h8v18H3V3zm10 0h8v18h-8V3zM5 5v14h4V5H5zm10 0v14h4V5h-4z" />
  </svg>
);

const IcoTabs = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10zM15 5h2v2h-2V5zm4 0h2v2h-2V5z" />
  </svg>
);

// Six-dot grip icon for the drag handle
const IcoDrag = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="9"  cy="7"  r="1.5" fill="currentColor" />
    <circle cx="15" cy="7"  r="1.5" fill="currentColor" />
    <circle cx="9"  cy="12" r="1.5" fill="currentColor" />
    <circle cx="15" cy="12" r="1.5" fill="currentColor" />
    <circle cx="9"  cy="17" r="1.5" fill="currentColor" />
    <circle cx="15" cy="17" r="1.5" fill="currentColor" />
  </svg>
);

const VALID_MODES: ViewMode[] = ['instructions', 'split', 'tabs'];

function isViewMode(value: string | null): value is ViewMode {
  return value !== null && VALID_MODES.includes(value as ViewMode);
}

function getUrlViewParam(): ViewMode | null {
  const value = new URLSearchParams(window.location.search).get('view');
  return isViewMode(value) ? value : null;
}

function setUrlViewParam(mode: ViewMode) {
  const url = new URL(window.location.href);
  url.searchParams.set('view', mode);
  window.history.replaceState(null, '', url.toString());
}

function getInitialMode(defaultMode: ViewMode): ViewMode {
  const fromUrl = getUrlViewParam();
  if (fromUrl) return fromUrl;
  try {
    const fromStore = window.localStorage.getItem(STORE_KEY);
    if (isViewMode(fromStore)) return fromStore;
  } catch (_e) {}
  return defaultMode;
}

const buttons: { mode: ViewMode; Icon: React.FC; label: string; title: string }[] = [
  { mode: 'instructions', Icon: IcoDoc,   label: 'Instructions', title: 'Full-width instructions' },
  { mode: 'split',        Icon: IcoSplit, label: 'Split',        title: 'Side by side' },
  { mode: 'tabs',         Icon: IcoTabs,  label: 'Tabs',         title: 'Full-width tabs' },
];

export default function ViewSwitcher({ defaultMode = 'split', onModeChange, persistUrlState }: ViewSwitcherProps) {
  const [mode, setMode] = useState<ViewMode>(() => getInitialMode(defaultMode));
  const [pos, setPos] = useState<Pos>(() => getSavedPos() ?? getDefaultPos());

  const wrapperRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  // Re-clamp position when the window is resized so the toolbar never goes off-screen
  useEffect(() => {
    function onResize() {
      const clamped = clampPos(posRef.current.x, posRef.current.y);
      setPos(clamped);
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(clamped));
      } catch (_e) {}
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Drag state held in a ref — avoids stale closures and skips React re-renders during drag
  const drag = useRef<{
    pointerId: number;
    startPointerX: number;
    startPointerY: number;
    startElemX: number;
    startElemY: number;
  } | null>(null);

  // Apply transform directly — GPU-composited, no layout reflow
  function applyTransform(x: number, y: number) {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // Sync transform whenever pos state changes
  useEffect(() => {
    applyTransform(pos.x, pos.y);
  }, [pos]);

  // Pointer capture approach — no document-level listeners needed.
  // All pointer events (move, up, cancel) are automatically routed to the
  // capturing element even if the pointer leaves the window.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    document.body.classList.add('sr-dragging');
    drag.current = {
      pointerId:     e.pointerId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startElemX:    pos.x,
      startElemY:    pos.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startPointerX;
    const dy = e.clientY - drag.current.startPointerY;
    const { x, y } = clampPos(drag.current.startElemX + dx, drag.current.startElemY + dy);
    // Direct DOM update — smooth, no React re-render per frame
    applyTransform(x, y);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    document.body.classList.remove('sr-dragging');
    const dx = e.clientX - drag.current.startPointerX;
    const dy = e.clientY - drag.current.startPointerY;
    drag.current = null;
    const newPos = clampPos(
      pos.x + dx,
      pos.y + dy,
    );
    setPos(newPos);
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(newPos));
    } catch (_e) {}
  }

  useEffect(() => {
    onModeChange(mode);
    if (persistUrlState) setUrlViewParam(mode);
    try {
      window.localStorage.setItem(STORE_KEY, mode);
    } catch (_e) {}
  }, [mode, onModeChange, persistUrlState]);

  useEffect(() => {
    if (!persistUrlState) return;
    function handlePopState() {
      const h = getUrlViewParam();
      if (h) setMode(h);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [persistUrlState]);

  return (
    <div
      ref={wrapperRef}
      className="sr-toolbar-wrapper"
    >
      <div className="sr-toolbar" role="toolbar" aria-label="View mode switcher">
        <div
          className="sr-drag-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title="Drag to reposition"
        >
          <IcoDrag />
        </div>
        {buttons.map((btn, i) => (
          <React.Fragment key={btn.mode}>
            {i > 0 && <div className="sr-sep" aria-hidden="true" />}
            <button
              className={`sr-mode-btn${mode === btn.mode ? ' sr-active' : ''}`}
              title={btn.title}
              aria-pressed={mode === btn.mode}
              onClick={() => setMode(btn.mode)}
            >
              <span className="sr-mode-btn__icon" aria-hidden="true"><btn.Icon /></span>
              <span className="sr-mode-btn__label">{btn.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
