/**
 * ViewSwitcher — draggable floating toolbar for switching panel layout.
 *
 * Layout modes:
 *   instructions — left panel only (full width)
 *   split        — left + right panels side by side (default)
 *   tabs         — right panel only (full width)
 *
 * Drag behaviour:
 *   - User grabs the grip handle on the left of the toolbar
 *   - Uses Pointer Capture API so events keep routing to the handle
 *     even if the pointer leaves the browser window mid-drag
 *   - Position is applied via CSS transform (GPU-composited, no layout reflow)
 *   - Final position is saved to localStorage so it survives page reloads
 *   - On window resize, position is re-clamped so the toolbar never goes off-screen
 *
 * localStorage keys:
 *   sr-panel-mode — last selected view mode (instructions | split | tabs)
 *   sr-toolbar-pos — last drag position { x, y } in viewport pixels
 */
import React, { useState, useEffect, useRef } from 'react';

import './view-switcher.css';

export type ViewMode = 'instructions' | 'split' | 'tabs';

type ViewSwitcherProps = {
  defaultMode?: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  /** When true, the ?view= URL param is kept in sync with the active mode */
  persistUrlState?: boolean;
};

// localStorage keys
const STORE_KEY = 'sr-panel-mode';   // persists the selected view mode
const POS_KEY   = 'sr-toolbar-pos';  // persists the drag position { x, y }

type Pos = { x: number; y: number };

// ─── Clamping helpers ────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Approximate toolbar size used for viewport clamping.
 * These don't need to be pixel-perfect — they just keep the toolbar
 * from being dragged entirely off-screen.
 */
const TOOLBAR_W = 280;
const TOOLBAR_H = 44;
const MARGIN    = 8;   // minimum gap from viewport edges

/** Returns a position clamped so the toolbar stays fully within the viewport. */
function clampPos(x: number, y: number): Pos {
  return {
    x: clamp(x, MARGIN, window.innerWidth  - TOOLBAR_W - MARGIN),
    y: clamp(y, MARGIN, window.innerHeight - TOOLBAR_H - MARGIN),
  };
}

/** Default position: bottom-center, 24px above the browser chrome. */
function getDefaultPos(): Pos {
  return clampPos(
    window.innerWidth / 2 - TOOLBAR_W / 2,
    window.innerHeight - TOOLBAR_H - 24,
  );
}

/**
 * Reads the saved position from localStorage and validates it.
 * If the stored position is wildly off-screen (e.g. saved on a larger
 * monitor, or corrupted), it is discarded and null is returned so the
 * caller falls back to the default position.
 */
function getSavedPos(): Pos | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;

    // Clamp and compare — if the stored value needed more than 200px of
    // correction it is from a very different viewport; start fresh instead.
    const clamped = clampPos(p.x, p.y);
    if (Math.abs(clamped.x - p.x) > 200 || Math.abs(clamped.y - p.y) > 200) {
      window.localStorage.removeItem(POS_KEY);
      return null;
    }
    return clamped;
  } catch (_e) {}
  return null;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

/** Instructions mode — document icon */
const IcoDoc = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
  </svg>
);

/** Split mode — two-column icon */
const IcoSplit = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 3h8v18H3V3zm10 0h8v18h-8V3zM5 5v14h4V5H5zm10 0v14h4V5h-4z" />
  </svg>
);

/** Tabs mode — tabbed panel icon */
const IcoTabs = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10zM15 5h2v2h-2V5zm4 0h2v2h-2V5z" />
  </svg>
);

/** Six-dot grip — drag handle visual indicator */
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

// Button definitions — order controls left-to-right rendering
const buttons: { mode: ViewMode; Icon: React.FC; label: string; title: string }[] = [
  { mode: 'instructions', Icon: IcoDoc,   label: 'Instructions', title: 'Full-width instructions' },
  { mode: 'split',        Icon: IcoSplit, label: 'Split',        title: 'Side by side' },
  { mode: 'tabs',         Icon: IcoTabs,  label: 'Tabs',         title: 'Full-width tabs' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ViewSwitcher({ defaultMode = 'split', onModeChange, persistUrlState }: ViewSwitcherProps) {
  const [mode, setMode] = useState<ViewMode>(() => getInitialMode(defaultMode));

  // pos drives the CSS transform that positions the toolbar.
  // Initialised from localStorage if valid, otherwise default (bottom-center).
  const [pos, setPos] = useState<Pos>(() => getSavedPos() ?? getDefaultPos());

  const wrapperRef = useRef<HTMLDivElement>(null);

  // posRef mirrors pos state so the resize handler always reads the latest
  // value without being re-registered every time pos changes.
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  // ── Resize handling ──────────────────────────────────────────────────────
  // When the viewport shrinks, a previously valid position might be off-screen.
  // Re-clamp on every resize and persist the corrected value.
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

  // ── Drag state ───────────────────────────────────────────────────────────
  // Stored in a ref rather than state — we don't want React re-renders during
  // drag; position updates go directly to the DOM via applyTransform().
  const drag = useRef<{
    pointerId:     number;  // identifies which pointer is dragging (multi-touch safety)
    startPointerX: number;  // pointer position at drag start
    startPointerY: number;
    startElemX:    number;  // toolbar position at drag start
    startElemY:    number;
  } | null>(null);

  // ── Transform helper ─────────────────────────────────────────────────────
  // Writes directly to the DOM style — GPU-composited via CSS transform,
  // does not trigger layout or paint on the main thread.
  function applyTransform(x: number, y: number) {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // Sync transform whenever pos state changes (initial render + after drag/resize)
  useEffect(() => {
    applyTransform(pos.x, pos.y);
  }, [pos]);

  // ── Pointer event handlers ───────────────────────────────────────────────
  //
  // We use the Pointer Capture API instead of document-level mousemove/mouseup.
  // setPointerCapture() routes all subsequent pointer events for that pointer ID
  // to this element — even if the cursor leaves the browser window — so the drag
  // cannot get "stuck" when the user releases outside the viewport.

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); // prevent text selection starting during drag
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    document.body.classList.add('sr-dragging'); // enforces grabbing cursor globally
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
    // Clamp during move too — toolbar never leaves the viewport even mid-drag
    const { x, y } = clampPos(drag.current.startElemX + dx, drag.current.startElemY + dy);
    applyTransform(x, y); // direct DOM write — no React re-render per frame
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    document.body.classList.remove('sr-dragging');
    const dx = e.clientX - drag.current.startPointerX;
    const dy = e.clientY - drag.current.startPointerY;
    drag.current = null;

    const newPos = clampPos(pos.x + dx, pos.y + dy);

    // Commit final position to React state (triggers re-render with correct transform)
    // and persist to localStorage for next page load.
    setPos(newPos);
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(newPos));
    } catch (_e) {}
  }

  // ── Mode persistence & URL sync ──────────────────────────────────────────
  useEffect(() => {
    onModeChange(mode);
    if (persistUrlState) setUrlViewParam(mode);
    try {
      window.localStorage.setItem(STORE_KEY, mode);
    } catch (_e) {}
  }, [mode, onModeChange, persistUrlState]);

  // Sync mode from URL when the user navigates back/forward
  useEffect(() => {
    if (!persistUrlState) return;
    function handlePopState() {
      const h = getUrlViewParam();
      if (h) setMode(h);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [persistUrlState]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    // Wrapper is position:fixed at (0,0); actual position comes from the CSS transform.
    // This keeps the stacking context clean and avoids left/top triggering layout.
    <div
      ref={wrapperRef}
      className="sr-toolbar-wrapper"
    >
      <div className="sr-toolbar" role="toolbar" aria-label="View mode switcher">

        {/* Drag handle — the only part of the toolbar that initiates dragging.
            onPointerCancel mirrors onPointerUp so a cancelled pointer (e.g. phone
            call interruption on mobile) still cleans up drag state correctly. */}
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

        {/* Mode buttons — clicking these does NOT start a drag */}
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
