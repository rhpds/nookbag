/**
 * ViewSwitcher — right-edge popout panel for switching panel layout.
 *
 * Layout modes:
 *   instructions — left panel only (full width)
 *   split        — left + right panels side by side (default)
 *   tabs         — right panel only (full width)
 *
 * Collapsed: a thin tab on the right viewport edge.
 * Expanded:  slides left to reveal vertically stacked mode buttons.
 *
 * Interaction:
 *   - Hover (with 150ms enter delay) or click to expand
 *   - Mouse-leave (with 400ms delay) or mode selection to collapse
 *   - Keyboard: Enter/Space toggles, Tab navigates, Escape closes
 *
 * localStorage keys:
 *   sr-panel-mode  — last selected view mode (instructions | split | tabs)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';

import './view-switcher.css';

export type ViewMode = 'instructions' | 'split' | 'tabs';

type ViewSwitcherProps = {
  defaultMode?: ViewMode;
  /**
   * Called whenever the active mode changes. Internally stabilised via a ref
   * so consumers do not need to wrap this in useCallback — passing an inline
   * arrow or a state setter directly is safe and will not cause extra renders.
   */
  onModeChange: (mode: ViewMode) => void;
  /** When true, the ?view= URL param is kept in sync with the active mode */
  persistUrlState?: boolean;
};

const STORE_KEY = 'sr-panel-mode';
const FIRST_VISIT_KEY = 'sr-visited';
const YPOS_KEY = 'sr-ypos';

const DRAG_THRESHOLD = 5;
const CLAMP_MARGIN = 40;

// ─── Icons ───────────────────────────────────────────────────────────────────

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

/** Left-pointing chevron for the collapsed trigger tab */
const IcoChevron = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
  </svg>
);

// ─── Mode helpers ─────────────────────────────────────────────────────────────

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

/**
 * Priority order for initial mode:
 *   1. ?view= URL param (shareable link, deeplink support)
 *   2. localStorage (user's last choice)
 *   3. defaultMode prop (catalog-configured default)
 */
function getInitialMode(defaultMode: ViewMode): ViewMode {
  const fromUrl = getUrlViewParam();
  if (fromUrl) return fromUrl;
  try {
    const fromStore = window.localStorage.getItem(STORE_KEY);
    if (isViewMode(fromStore)) return fromStore;
  } catch (_e) {}
  return defaultMode;
}

function getSavedYPercent(): number {
  try {
    const raw = window.localStorage.getItem(YPOS_KEY);
    if (raw) {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    }
  } catch (_e) {}
  return 50;
}

function isFirstVisit(): boolean {
  try {
    return !window.localStorage.getItem(FIRST_VISIT_KEY);
  } catch (_e) {
    return false;
  }
}

function markVisited() {
  try { window.localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch (_e) {}
}

const buttons: { mode: ViewMode; Icon: React.FC; label: string; title: string }[] = [
  { mode: 'instructions', Icon: IcoDoc,   label: 'Instructions', title: 'Full-width instructions' },
  { mode: 'split',        Icon: IcoSplit, label: 'Split',        title: 'Side by side' },
  { mode: 'tabs',         Icon: IcoTabs,  label: 'Tabs',         title: 'Full-width tabs' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ViewSwitcher({ defaultMode = 'split', onModeChange, persistUrlState }: ViewSwitcherProps) {
  const [mode, setMode] = useState<ViewMode>(() => getInitialMode(defaultMode));
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [yPercent, setYPercent] = useState(getSavedYPercent);

  const popoutRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const drag = useRef<{
    startPointerY: number;
    startTopPx: number;
    didDrag: boolean;
  } | null>(null);

  // Stabilise the onModeChange callback
  const onModeChangeRef = useRef(onModeChange);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
  const stableOnModeChange = useCallback((m: ViewMode) => onModeChangeRef.current(m), []);

  // ── Re-clamp position when viewport height changes ─────────────────────
  useEffect(() => {
    function onResize() {
      const h = window.innerHeight;
      setYPercent(prev => {
        const px = (prev / 100) * h;
        const clamped = Math.max(CLAMP_MARGIN, Math.min(px, h - CLAMP_MARGIN));
        return (clamped / h) * 100;
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── First-visit pulse ───────────────────────────────────────────────────
  useEffect(() => {
    if (isFirstVisit()) {
      setPulse(true);
      markVisited();
      const t = setTimeout(() => setPulse(false), 4000);
      return () => clearTimeout(t);
    }
  }, []);

  // ── Vertical drag on trigger ───────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const topPx = (yPercent / 100) * window.innerHeight;
    drag.current = {
      startPointerY: e.clientY,
      startTopPx: topPx,
      didDrag: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startPointerY;
    if (!drag.current.didDrag && Math.abs(dy) >= DRAG_THRESHOLD) {
      drag.current.didDrag = true;
      document.body.classList.add('sr-dragging');
    }
    if (drag.current.didDrag) {
      const newPx = drag.current.startTopPx + dy;
      const clamped = Math.max(CLAMP_MARGIN, Math.min(newPx, window.innerHeight - CLAMP_MARGIN));
      const pct = (clamped / window.innerHeight) * 100;
      if (popoutRef.current) {
        popoutRef.current.style.top = `${pct}vh`;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const wasDrag = drag.current.didDrag;
    if (wasDrag) {
      document.body.classList.remove('sr-dragging');
      const dy = e.clientY - drag.current.startPointerY;
      const newPx = drag.current.startTopPx + dy;
      const clamped = Math.max(CLAMP_MARGIN, Math.min(newPx, window.innerHeight - CLAMP_MARGIN));
      const pct = (clamped / window.innerHeight) * 100;
      setYPercent(pct);
      try { window.localStorage.setItem(YPOS_KEY, String(Math.round(pct))); } catch (_e) {}
    }
    drag.current = null;
    if (!wasDrag) {
      setExpanded(prev => !prev);
      setPulse(false);
    }
  }

  function onModeSelect(selected: ViewMode) {
    setMode(selected);
  }

  // ── Keyboard support ───────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && expanded) {
      e.preventDefault();
      setExpanded(false);
    }
  }

  // ── Mode persistence & URL sync ────────────────────────────────────────
  useEffect(() => {
    stableOnModeChange(mode);
    if (mountedRef.current) {
      if (persistUrlState) setUrlViewParam(mode);
      try {
        window.localStorage.setItem(STORE_KEY, mode);
      } catch (_e) {}
    }
    mountedRef.current = true;
  }, [mode, stableOnModeChange, persistUrlState]);

  useEffect(() => {
    if (!persistUrlState) return;
    function handlePopState() {
      const h = getUrlViewParam();
      if (h) setMode(h);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [persistUrlState]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={popoutRef}
      className={`sr-popout${expanded ? ' sr-expanded' : ''}`}
      style={{ top: `${yPercent}vh` }}
      onKeyDown={onKeyDown}
    >
      <button
        className={`sr-trigger${pulse ? ' sr-pulse' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-expanded={expanded}
        aria-label="View mode switcher"
        title="Drag to reposition, click to open"
      >
        <IcoChevron />
      </button>

      <div className="sr-panel" role="toolbar" aria-label="View mode switcher">
        {buttons.map((btn, i) => (
          <React.Fragment key={btn.mode}>
            {i > 0 && <div className="sr-sep" aria-hidden="true" />}
            <button
              className={`sr-mode-btn${mode === btn.mode ? ' sr-active' : ''}`}
              title={btn.title}
              aria-pressed={mode === btn.mode}
              tabIndex={expanded ? 0 : -1}
              onClick={() => onModeSelect(btn.mode)}
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
