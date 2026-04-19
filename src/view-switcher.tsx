/**
 * ViewSwitcher — edge-snapping floating toolbar for switching panel layout.
 *
 * Layout modes:
 *   instructions — left panel only (full width)
 *   split        — left + right panels side by side (default)
 *   tabs         — right panel only (full width)
 *
 * Positioning:
 *   The toolbar snaps to one of 6 anchor points along the top and bottom
 *   viewport edges (top-left, top-center, top-right, bottom-left,
 *   bottom-center, bottom-right). Dragging moves it freely; on release it
 *   snaps to the nearest anchor with a short ease-out animation.
 *
 * Drag behaviour:
 *   - User grabs the grip handle on the left of the toolbar
 *   - Uses Pointer Capture API so events keep routing to the handle
 *     even if the pointer leaves the browser window mid-drag
 *   - Position is applied via CSS transform (GPU-composited, no layout reflow)
 *   - On release, findNearestAnchor() picks the closest snap point
 *   - The sr-snapping CSS class enables a transition for the snap animation
 *
 * localStorage keys:
 *   sr-panel-mode      — last selected view mode (instructions | split | tabs)
 *   sr-toolbar-anchor  — last snap anchor name (e.g. "bottom-center")
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';

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

// localStorage keys
const STORE_KEY  = 'sr-panel-mode';
const ANCHOR_KEY = 'sr-toolbar-anchor';

type Pos = { x: number; y: number };

// ─── Anchor system ────────────────────────────────────────────────────────────

type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

const ALL_ANCHORS: Anchor[] = [
  'top-left', 'top-center', 'top-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const FALLBACK_W = 280;
const FALLBACK_H = 44;
const MARGIN     = 8;

/** Compute pixel position for a named anchor given current viewport + toolbar size. */
function anchorToPos(anchor: Anchor, tw: number, th: number): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  switch (anchor) {
    case 'top-left':      return { x: MARGIN,              y: MARGIN };
    case 'top-center':    return { x: vw / 2 - tw / 2,    y: MARGIN };
    case 'top-right':     return { x: vw - tw - MARGIN,    y: MARGIN };
    case 'bottom-left':   return { x: MARGIN,              y: vh - th - MARGIN };
    case 'bottom-center': return { x: vw / 2 - tw / 2,    y: vh - th - MARGIN };
    case 'bottom-right':  return { x: vw - tw - MARGIN,    y: vh - th - MARGIN };
  }
}

/** Find the anchor closest (Euclidean) to a free-drag position. */
function findNearestAnchor(x: number, y: number, tw: number, th: number): Anchor {
  let best: Anchor = 'bottom-center';
  let bestDist = Infinity;
  for (const a of ALL_ANCHORS) {
    const p = anchorToPos(a, tw, th);
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}

/** Clamp an arbitrary position so the toolbar stays within the viewport during drag. */
function clampToViewport(x: number, y: number, tw: number, th: number): Pos {
  return {
    x: Math.max(MARGIN, Math.min(x, window.innerWidth  - tw - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, window.innerHeight - th - MARGIN)),
  };
}

function getSavedAnchor(): Anchor {
  try {
    const raw = window.localStorage.getItem(ANCHOR_KEY);
    if (raw && ALL_ANCHORS.includes(raw as Anchor)) return raw as Anchor;
  } catch (_e) {}
  return 'bottom-center';
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
  const [anchor, setAnchor] = useState<Anchor>(getSavedAnchor);
  const [pos, setPos] = useState<Pos>(() => anchorToPos(getSavedAnchor(), FALLBACK_W, FALLBACK_H));

  const wrapperRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const isSnapping = useRef(false);

  // anchorRef mirrors anchor state so the resize handler always reads the
  // latest value without being re-registered every time anchor changes.
  const anchorRef = useRef(anchor);
  useEffect(() => { anchorRef.current = anchor; }, [anchor]);

  // Stabilise the onModeChange callback so the persistence effect doesn't
  // re-run when a consumer passes a new arrow function on each render.
  const onModeChangeRef = useRef(onModeChange);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
  const stableOnModeChange = useCallback((m: ViewMode) => onModeChangeRef.current(m), []);

  // ── Toolbar measurement ─────────────────────────────────────────────────
  function getToolbarSize(): { w: number; h: number } {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { w: rect.width, h: rect.height };
    }
    return { w: FALLBACK_W, h: FALLBACK_H };
  }

  // ── Correct position once the real toolbar dimensions are known ─────────
  // The initial pos state uses FALLBACK_W/H which may differ from the
  // actual rendered size, pushing the toolbar off-screen on right anchors.
  useLayoutEffect(() => {
    const size = getToolbarSize();
    setPos(anchorToPos(anchorRef.current, size.w, size.h));
  }, []);

  // ── Resize handling ──────────────────────────────────────────────────────
  useEffect(() => {
    function onResize() {
      const size = getToolbarSize();
      setPos(anchorToPos(anchorRef.current, size.w, size.h));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Drag state ───────────────────────────────────────────────────────────
  const drag = useRef<{
    pointerId:     number;
    startPointerX: number;
    startPointerY: number;
    startElemX:    number;
    startElemY:    number;
  } | null>(null);

  // ── Transform helper ─────────────────────────────────────────────────────
  function applyTransform(x: number, y: number) {
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // Sync transform whenever pos state changes (initial render + after snap/resize)
  useEffect(() => {
    applyTransform(pos.x, pos.y);
  }, [pos]);

  // ── Snap animation cleanup ─────────────────────────────────────────────
  // Remove the sr-snapping class after the CSS transition finishes so it
  // doesn't interfere with the next drag.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    function onTransitionEnd() {
      isSnapping.current = false;
      el!.classList.remove('sr-snapping');
    }
    el.addEventListener('transitionend', onTransitionEnd);
    return () => el.removeEventListener('transitionend', onTransitionEnd);
  }, []);

  // ── Pointer event handlers ───────────────────────────────────────────────

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

    let startX = pos.x;
    let startY = pos.y;

    // Cancel any in-progress snap animation. Read the current visual position
    // from the DOM since pos state already holds the snap *target* which the
    // CSS transition may not have reached yet.
    if (isSnapping.current && wrapperRef.current) {
      isSnapping.current = false;
      wrapperRef.current.classList.remove('sr-snapping');
      const rect = wrapperRef.current.getBoundingClientRect();
      startX = rect.left;
      startY = rect.top;
      applyTransform(startX, startY);
      setPos({ x: startX, y: startY });
    }

    document.body.classList.add('sr-dragging');
    drag.current = {
      pointerId:     e.pointerId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startElemX:    startX,
      startElemY:    startY,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startPointerX;
    const dy = e.clientY - drag.current.startPointerY;
    const size = getToolbarSize();
    const { x, y } = clampToViewport(
      drag.current.startElemX + dx,
      drag.current.startElemY + dy,
      size.w, size.h,
    );
    applyTransform(x, y);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    document.body.classList.remove('sr-dragging');

    const dx = e.clientX - drag.current.startPointerX;
    const dy = e.clientY - drag.current.startPointerY;
    const freeX = drag.current.startElemX + dx;
    const freeY = drag.current.startElemY + dy;
    drag.current = null;

    // Snap to nearest anchor with animated transition
    const size = getToolbarSize();
    const target = findNearestAnchor(freeX, freeY, size.w, size.h);
    const snapPos = anchorToPos(target, size.w, size.h);

    isSnapping.current = true;
    wrapperRef.current?.classList.add('sr-snapping');
    applyTransform(snapPos.x, snapPos.y);

    setAnchor(target);
    setPos(snapPos);
    try { window.localStorage.setItem(ANCHOR_KEY, target); } catch (_e) {}
  }

  // ── Mode persistence & URL sync ──────────────────────────────────────────
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
