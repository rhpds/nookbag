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

function getDefaultPos(): Pos {
  // Bottom-center, 16px from bottom edge
  return {
    x: Math.max(0, window.innerWidth / 2 - 150),
    y: Math.max(0, window.innerHeight - 56),
  };
}

function getSavedPos(): Pos | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
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
  } catch (_e) {
    // localStorage unavailable
  }
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

  // posRef lets the document-level mouseup handler read current position
  // without a stale closure (handlers are registered once with empty deps).
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{ mouseX: number; mouseY: number; elemX: number; elemY: number } | null>(null);

  // Register drag handlers on document so dragging outside the element works
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragOrigin.current || !wrapperRef.current) return;
      const dx = e.clientX - dragOrigin.current.mouseX;
      const dy = e.clientY - dragOrigin.current.mouseY;
      // Apply directly to DOM — bypasses React re-render per frame for smoothness
      wrapperRef.current.style.left = `${dragOrigin.current.elemX + dx}px`;
      wrapperRef.current.style.top  = `${dragOrigin.current.elemY + dy}px`;
    }

    function onMouseUp(e: MouseEvent) {
      if (!dragOrigin.current) return;
      const dx = e.clientX - dragOrigin.current.mouseX;
      const dy = e.clientY - dragOrigin.current.mouseY;
      const newX = clamp(dragOrigin.current.elemX + dx, 0, window.innerWidth  - 80);
      const newY = clamp(dragOrigin.current.elemY + dy, 0, window.innerHeight - 40);
      dragOrigin.current = null;
      document.body.classList.remove('sr-dragging');
      const newPos = { x: newX, y: newY };
      setPos(newPos);
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(newPos));
      } catch (_e) {}
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    document.body.classList.add('sr-dragging');
    dragOrigin.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elemX:  posRef.current.x,
      elemY:  posRef.current.y,
    };
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
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="sr-toolbar" onClick={() => window.focus()} role="toolbar" aria-label="View mode switcher">
        <div
          className="sr-drag-handle"
          onMouseDown={onDragHandleMouseDown}
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
