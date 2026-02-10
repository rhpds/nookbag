import React, { useState, useEffect, useCallback } from 'react';

import './view-switcher.css';

export type ViewMode = 'instructions' | 'split' | 'tabs';

type ViewSwitcherProps = {
  defaultMode?: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  persistUrlState?: boolean;
};

const STORE_KEY = 'sr-panel-mode';
const HINT_KEY = 'sr-hint-dismissed';

const icoDoc =
  '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>';
const icoSplit =
  '<svg viewBox="0 0 24 24"><path d="M3 3h8v18H3V3zm10 0h8v18h-8V3zM5 5v14h4V5H5zm10 0v14h4V5h-4z"/></svg>';
const icoTabs =
  '<svg viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h10v4h8v10zM15 5h2v2h-2V5zm4 0h2v2h-2V5z"/></svg>';

function getHashViewParam(): ViewMode | null {
  const m = window.location.hash.match(/[#&]view=(instructions|split|tabs)/);
  return m ? (m[1] as ViewMode) : null;
}

function setHashViewParam(mode: ViewMode) {
  window.history.replaceState(null, '', '#view=' + mode);
}

function getInitialMode(defaultMode: ViewMode): ViewMode {
  const fromHash = getHashViewParam();
  if (fromHash) return fromHash;
  try {
    const fromStore = window.localStorage.getItem(STORE_KEY);
    if (fromStore === 'instructions' || fromStore === 'split' || fromStore === 'tabs') {
      return fromStore;
    }
  } catch (_e) {
    // localStorage unavailable
  }
  return defaultMode;
}

export default function ViewSwitcher({ defaultMode = 'instructions', onModeChange, persistUrlState }: ViewSwitcherProps) {
  const [mode, setMode] = useState<ViewMode>(() => getInitialMode(defaultMode));
  const [showHint, setShowHint] = useState(false);

  // Notify parent on mount and mode changes
  useEffect(() => {
    onModeChange(mode);
    if (persistUrlState) setHashViewParam(mode);
    try {
      window.localStorage.setItem(STORE_KEY, mode);
    } catch (_e) {
      // no-op
    }
  }, [mode]);

  // First-visit hint
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HINT_KEY)) {
        setShowHint(true);
        window.localStorage.setItem(HINT_KEY, '1');
        const timer = setTimeout(() => setShowHint(false), 8000);
        return () => clearTimeout(timer);
      }
    } catch (_e) {
      // no-op
    }
  }, []);

  // Keyboard shortcuts: Ctrl+1/2/3
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey) return;
      if (e.key === '1') {
        e.preventDefault();
        setMode('instructions');
      } else if (e.key === '2') {
        e.preventDefault();
        setMode('split');
      } else if (e.key === '3') {
        e.preventDefault();
        setMode('tabs');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle hash changes (back/forward navigation)
  useEffect(() => {
    if (!persistUrlState) return;
    function handleHashChange() {
      const h = getHashViewParam();
      if (h) setMode(h);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [persistUrlState]);

  const handleMouseEnter = useCallback(() => {
    // Refocus parent so keyboard shortcuts work after interacting
    // with a cross-origin iframe
    window.focus();
  }, []);

  const buttons: { mode: ViewMode; icon: string; label: string; title: string }[] = [
    { mode: 'instructions', icon: icoDoc, label: 'Instructions', title: 'Full-width instructions (Ctrl+1)' },
    { mode: 'split', icon: icoSplit, label: 'Split', title: 'Side by side (Ctrl+2)' },
    { mode: 'tabs', icon: icoTabs, label: 'Tabs', title: 'Full-width tabs (Ctrl+3)' },
  ];

  return (
    <>
      <div className="sr-toolbar" onMouseEnter={handleMouseEnter}>
        {buttons.map((btn, i) => (
          <React.Fragment key={btn.mode}>
            {i > 0 && <div className="sr-sep" />}
            <button
              className={`sr-mode-btn${mode === btn.mode ? ' sr-active' : ''}`}
              title={btn.title}
              onClick={() => setMode(btn.mode)}
            >
              <span className="sr-mode-btn__icon" dangerouslySetInnerHTML={{ __html: btn.icon }} />
              <span>{btn.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
      {showHint && (
        <div className="sr-hint">
          Switch views with the toolbar above &bull; Ctrl+1 / Ctrl+2 / Ctrl+3
        </div>
      )}
    </>
  );
}
